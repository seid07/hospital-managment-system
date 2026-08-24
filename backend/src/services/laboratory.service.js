const pool = require("../config/database");
const { generateLabOrderNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");
const serviceOrderService = require("./serviceOrder.service");
const visitService = require("./visit.service");

/**
 * A lab test can only be ordered if it is billed as PAID (or is
 * explicitly authorized via zero-fee/emergency override). These are the
 * service_order statuses that represent "payment has cleared / order is
 * authorized to proceed" across the whole system (see serviceOrder.service.js).
 */
const PAYMENT_CLEARED_STATUSES = new Set(["AUTHORIZED", "PAID", "QUEUED", "IN_PROGRESS", "COMPLETED"]);

/**
 * Find the patient's current OPEN visit, or create one on the fly.
 * Doctor-initiated mid-consultation orders (e.g. from Clinical Encounter)
 * don't always have a visit already open, unlike the Registrar's front-desk
 * "New Visit" flow, so we transparently open one here rather than failing.
 */
async function findOrCreateOpenVisit(patientId, createdBy) {
  const existing = await pool.query(
    `SELECT id FROM visits WHERE patient_id = $1 AND status = 'OPEN' ORDER BY created_at DESC LIMIT 1`,
    [patientId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const visit = await visitService.createVisit(
    {
      patientId,
      visitType: "OUTPATIENT",
      notes: "Auto-opened for mid-consultation service order",
    },
    createdBy
  );
  return visit.id;
}

function isPaymentCleared(serviceOrderStatus, emergencyOverride) {
  if (emergencyOverride) return true;
  if (!serviceOrderStatus) return false;
  return PAYMENT_CLEARED_STATUSES.has(serviceOrderStatus);
}

function formatElapsedTurnaroundTime(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Math.max(0, parseInt(seconds, 10) || 0);
  if (s < 60) return "< 1 minute";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);

  return parts.join(" ") || "< 1 minute";
}

async function getTestCatalog(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;
  const category = query.category || null;

  const conditions = ["t.is_active = TRUE"];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`t.category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(t.name ILIKE $${params.length} OR t.code ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM lab_test_catalog t ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listResult = await pool.query(
    `
    SELECT
      t.*,
      s.code AS linked_service_code,
      s.name AS linked_service_name,
      s.price AS linked_service_price
    FROM lab_test_catalog t
    LEFT JOIN services s ON t.service_id = s.id
    ${whereClause}
    ORDER BY t.category ASC, t.name ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    catalog: listResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function addCatalogTest(data, userId) {
  const result = await pool.query(
    `
    INSERT INTO lab_test_catalog (
      code,
      name,
      category,
      reference_range,
      unit,
      price,
      turnaround_time_hours,
      service_id,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
    RETURNING *
    `,
    [
      data.code.trim().toUpperCase(),
      data.name.trim(),
      data.category.trim(),
      data.referenceRange || null,
      data.unit || null,
      parseFloat(data.price) || 0,
      parseInt(data.turnaroundTimeHours, 10) || 24,
      data.serviceId || null,
    ]
  );

  const test = result.rows[0];

  await recordAuditLog(pool, {
    userId,
    action: "LAB_TEST_CATALOG_ADDED",
    entity: "lab_test_catalog",
    entityId: test.id,
    details: { code: test.code, name: test.name },
  });

  return test;
}

async function linkCatalogTestService(testId, serviceId, userId) {
  const svcCheck = await pool.query(
    `SELECT id FROM services WHERE id = $1 AND is_active = TRUE`,
    [serviceId]
  );
  if (svcCheck.rows.length === 0) {
    throw new Error("SERVICE_NOT_FOUND");
  }

  const result = await pool.query(
    `UPDATE lab_test_catalog SET service_id = $1 WHERE id = $2 RETURNING *`,
    [serviceId, testId]
  );

  if (result.rows.length === 0) {
    throw new Error("LAB_TEST_NOT_FOUND");
  }

  await recordAuditLog(pool, {
    userId,
    action: "LAB_TEST_LINKED_TO_SERVICE",
    entity: "lab_test_catalog",
    entityId: testId,
    details: { serviceId },
  });

  return result.rows[0];
}

async function createLabOrder({
  encounterId,
  patientId,
  doctorId,
  testId,
  serviceOrderId,
  visitId,
  clinicalIndication,
  priority = "ROUTINE",
  createdBy,
}) {
  const testCheck = await pool.query(
    "SELECT id, name, code, price, service_id FROM lab_test_catalog WHERE id = $1 AND is_active = TRUE",
    [testId]
  );
  if (testCheck.rows.length === 0) {
    throw new Error("LAB_TEST_NOT_FOUND");
  }
  const test = testCheck.rows[0];

  // Requirement 3/4: every billable lab test must be backed by a real
  // service_order so it appears in the Registrar Finance/Payment queue and
  // is subject to the same authorization rules as every other service.
  let resolvedServiceOrderId = serviceOrderId || null;

  if (!resolvedServiceOrderId) {
    if (!test.service_id) {
      throw new Error(
        "LAB_TEST_NOT_LINKED_TO_BILLABLE_SERVICE: This lab test is not linked to a billable service yet. " +
          "An administrator must link it from Laboratory > Catalog before it can be ordered."
      );
    }

    const resolvedVisitId = visitId || (await findOrCreateOpenVisit(patientId, createdBy));

    const { serviceOrders } = await serviceOrderService.createServiceOrders(
      {
        visitId: resolvedVisitId,
        patientId,
        doctorId,
        items: [
          {
            serviceId: test.service_id,
            notes: clinicalIndication || null,
          },
        ],
        generateInvoice: true,
      },
      createdBy
    );
    resolvedServiceOrderId = serviceOrders[0].id;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderNumber = await generateLabOrderNumber(client);

    const orderRes = await client.query(
      `
      INSERT INTO lab_orders (
        order_number,
        encounter_id,
        patient_id,
        doctor_id,
        test_id,
        service_order_id,
        clinical_indication,
        priority,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ORDERED', CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [
        orderNumber,
        encounterId || null,
        patientId,
        doctorId,
        testId,
        resolvedServiceOrderId,
        clinicalIndication || null,
        priority,
      ]
    );

    const order = orderRes.rows[0];

    await recordAuditLog(client, {
      userId: createdBy,
      action: "LAB_ORDER_CREATED",
      entity: "lab_orders",
      entityId: order.id,
      details: {
        orderNumber,
        testName: test.name,
        patientId,
        priority,
        serviceOrderId: resolvedServiceOrderId,
      },
    });

    await client.query("COMMIT");
    return order;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function collectSpecimen(orderId, userId) {
  // Requirement 8/9: a specimen may only be collected once the linked
  // service_order has actually been paid/authorized (or is under an
  // explicit emergency override). Lab staff never bypass the cashier.
  const orderCheck = await pool.query(
    `
    SELECT o.*, so.status AS service_order_status, so.emergency_override AS service_order_emergency
    FROM lab_orders o
    LEFT JOIN service_orders so ON o.service_order_id = so.id
    WHERE o.id = $1
    `,
    [orderId]
  );

  if (orderCheck.rows.length === 0) {
    throw new Error("ORDER_NOT_FOUND_OR_INVALID_STATUS");
  }

  const existing = orderCheck.rows[0];

  if (existing.status !== "ORDERED") {
    throw new Error("ORDER_NOT_FOUND_OR_INVALID_STATUS");
  }

  if (existing.service_order_id && !isPaymentCleared(existing.service_order_status, existing.service_order_emergency)) {
    throw new Error("PAYMENT_REQUIRED: This laboratory test has not been paid for yet. Refer the patient to the cashier.");
  }

  const result = await pool.query(
    `
    UPDATE lab_orders
    SET
      status = 'SPECIMEN_COLLECTED',
      specimen_collected_at = CURRENT_TIMESTAMP,
      sample_collected_at = CURRENT_TIMESTAMP,
      specimen_collected_by = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND status = 'ORDERED'
    RETURNING *
    `,
    [userId, orderId]
  );

  if (result.rows.length === 0) {
    throw new Error("ORDER_NOT_FOUND_OR_INVALID_STATUS");
  }

  await recordAuditLog(pool, {
    userId,
    action: "LAB_SPECIMEN_COLLECTED",
    entity: "lab_orders",
    entityId: orderId,
    details: { orderNumber: result.rows[0].order_number },
  });

  return result.rows[0];
}

async function startProcessing(orderId, userId) {
  const result = await pool.query(
    `
    UPDATE lab_orders
    SET
      status = 'PROCESSING',
      processing_started_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status IN ('SPECIMEN_COLLECTED', 'ORDERED')
    RETURNING *
    `,
    [orderId]
  );

  if (result.rows.length === 0) {
    throw new Error("ORDER_NOT_FOUND_OR_INVALID_STATUS");
  }

  return result.rows[0];
}

/**
 * Requirement 9: Real Laboratory Turnaround Time Calculation
 * Calculates exact elapsed turnaround time between sample collection and result completion.
 */
async function enterResults(orderId, { resultValue, unit, referenceRange, isAbnormal, comments }, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      "SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error("LAB_ORDER_NOT_FOUND");
    }

    const order = orderRes.rows[0];
    const completedAt = new Date();
    const startTime = order.sample_collected_at || order.specimen_collected_at || order.created_at;
    const elapsedSeconds = startTime ? Math.max(0, Math.floor((completedAt - new Date(startTime)) / 1000)) : 0;

    // Insert or update lab result
    await client.query(
      `
      INSERT INTO lab_results (
        lab_order_id,
        result_value,
        unit,
        reference_range,
        is_abnormal,
        comments,
        entered_by,
        entered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (lab_order_id) DO UPDATE SET
        result_value = EXCLUDED.result_value,
        unit = EXCLUDED.unit,
        reference_range = EXCLUDED.reference_range,
        is_abnormal = EXCLUDED.is_abnormal,
        comments = EXCLUDED.comments,
        entered_by = EXCLUDED.entered_by,
        entered_at = CURRENT_TIMESTAMP
      `,
      [
        orderId,
        resultValue,
        unit || null,
        referenceRange || null,
        Boolean(isAbnormal),
        comments || null,
        userId,
      ]
    );

    const updatedOrderRes = await client.query(
      `
      UPDATE lab_orders
      SET
        status = 'RESULTED',
        resulted_at = CURRENT_TIMESTAMP,
        result_completed_at = CURRENT_TIMESTAMP,
        resulted_by = $1,
        actual_turnaround_time_seconds = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [userId, elapsedSeconds, orderId]
    );

    await recordAuditLog(client, {
      userId,
      action: "LAB_RESULT_ENTERED",
      entity: "lab_orders",
      entityId: orderId,
      details: {
        orderNumber: order.order_number,
        isAbnormal: Boolean(isAbnormal),
        actualTurnaroundTimeSeconds: elapsedSeconds,
      },
    });

    await client.query("COMMIT");
    return updatedOrderRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function verifyResults(orderId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      "SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error("LAB_ORDER_NOT_FOUND");
    }

    const order = orderRes.rows[0];
    if (order.status !== "RESULTED") {
      throw new Error("ORDER_NOT_RESULTED: Only resulted lab orders can be verified.");
    }

    const updatedOrderRes = await client.query(
      `
      UPDATE lab_orders
      SET
        status = 'VERIFIED',
        verified_at = CURRENT_TIMESTAMP,
        result_verified_at = CURRENT_TIMESTAMP,
        released_at = CURRENT_TIMESTAMP,
        verified_by = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [userId, orderId]
    );

    await recordAuditLog(client, {
      userId,
      action: "LAB_RESULT_VERIFIED",
      entity: "lab_orders",
      entityId: orderId,
      details: { orderNumber: order.order_number },
    });

    await client.query("COMMIT");
    return updatedOrderRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Requirement 10 & 11: Department-Scoped Payment Visibility for Laboratory
 * Returns lab orders queue with ONLY laboratory-specific payment status and real turnaround time.
 */
async function getLabOrdersQueue(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const status = query.status || null;
  const priority = query.priority || null;
  const search = query.search ? query.search.trim() : null;

  const conditions = ["p.is_active = TRUE"];
  const params = [];

  if (status && status !== "ALL") {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }

  if (priority) {
    params.push(priority);
    conditions.push(`o.priority = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      o.order_number ILIKE $${params.length}
      OR t.name ILIKE $${params.length}
      OR p.first_name ILIKE $${params.length}
      OR p.last_name ILIKE $${params.length}
      OR p.patient_number ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN patients p ON o.patient_id = p.id
    ${whereClause}
    `,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      o.*,
      t.name AS test_name,
      t.code AS test_code,
      t.category AS test_category,
      t.reference_range AS standard_reference_range,
      t.unit AS standard_unit,
      t.turnaround_time_hours AS expected_turnaround_hours,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      r.result_value,
      r.unit AS result_unit,
      r.reference_range AS result_reference_range,
      r.is_abnormal,
      r.comments AS result_comments,
      r.entered_at AS result_entered_at,
      u_ent.username AS entered_by_username,
      u_ver.username AS verified_by_username,
      so.status AS service_payment_status,
      so.authorized_at AS payment_authorized_at
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN patients p ON o.patient_id = p.id
    JOIN staff s ON o.doctor_id = s.id
    LEFT JOIN service_orders so ON o.service_order_id = so.id
    LEFT JOIN lab_results r ON r.lab_order_id = o.id
    LEFT JOIN users u_ent ON r.entered_by = u_ent.id
    LEFT JOIN users u_ver ON o.verified_by = u_ver.id
    ${whereClause}
    ORDER BY
      CASE
        WHEN o.priority = 'STAT' THEN 1
        WHEN o.priority = 'URGENT' THEN 2
        ELSE 3
      END,
      o.created_at ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  const ordersWithFormattedTat = result.rows.map((row) => {
    let tatSeconds = row.actual_turnaround_time_seconds;
    if (!tatSeconds && row.result_completed_at && row.sample_collected_at) {
      tatSeconds = Math.max(0, Math.floor((new Date(row.result_completed_at) - new Date(row.sample_collected_at)) / 1000));
    }
    return {
      ...row,
      actual_turnaround_formatted: formatElapsedTurnaroundTime(tatSeconds),
    };
  });

  return {
    orders: ordersWithFormattedTat,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getLabOrderById(id) {
  const result = await pool.query(
    `
    SELECT
      o.*,
      t.name AS test_name,
      t.code AS test_code,
      t.category AS test_category,
      t.reference_range AS standard_reference_range,
      t.unit AS standard_unit,
      t.turnaround_time_hours AS expected_turnaround_hours,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      r.result_value,
      r.unit AS result_unit,
      r.reference_range AS result_reference_range,
      r.is_abnormal,
      r.comments AS result_comments,
      r.entered_at AS result_entered_at,
      u_ent.username AS entered_by_username,
      u_ver.username AS verified_by_username,
      so.status AS service_payment_status,
      so.authorized_at AS payment_authorized_at
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN patients p ON o.patient_id = p.id
    JOIN staff s ON o.doctor_id = s.id
    LEFT JOIN service_orders so ON o.service_order_id = so.id
    LEFT JOIN lab_results r ON r.lab_order_id = o.id
    LEFT JOIN users u_ent ON r.entered_by = u_ent.id
    LEFT JOIN users u_ver ON o.verified_by = u_ver.id
    WHERE o.id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  let tatSeconds = row.actual_turnaround_time_seconds;
  if (!tatSeconds && row.result_completed_at && row.sample_collected_at) {
    tatSeconds = Math.max(0, Math.floor((new Date(row.result_completed_at) - new Date(row.sample_collected_at)) / 1000));
  }

  return {
    ...row,
    actual_turnaround_formatted: formatElapsedTurnaroundTime(tatSeconds),
  };
}

module.exports = {
  getTestCatalog,
  addCatalogTest,
  linkCatalogTestService,
  createLabOrder,
  collectSpecimen,
  startProcessing,
  enterResults,
  verifyResults,
  getLabOrdersQueue,
  getLabOrderById,
  formatElapsedTurnaroundTime,
};
