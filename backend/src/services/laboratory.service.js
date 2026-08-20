const pool = require("../config/database");
const { generateLabOrderNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const { parsePagination } = require("../validators");

async function getTestCatalog(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;
  const category = query.category || null;

  const conditions = ["is_active = TRUE"];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR code ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countResult = await pool.query(`SELECT COUNT(*) AS total FROM lab_test_catalog ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listResult = await pool.query(
    `
    SELECT *
    FROM lab_test_catalog
    ${whereClause}
    ORDER BY category ASC, name ASC
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
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
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

async function createLabOrder({
  encounterId,
  patientId,
  doctorId,
  testId,
  clinicalIndication,
  priority = "ROUTINE",
  createdBy,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const testCheck = await client.query(
      "SELECT id, name, code, price FROM lab_test_catalog WHERE id = $1 AND is_active = TRUE",
      [testId]
    );
    if (testCheck.rows.length === 0) {
      throw new Error("LAB_TEST_NOT_FOUND");
    }

    const test = testCheck.rows[0];
    const orderNumber = await generateLabOrderNumber(client);

    const orderRes = await client.query(
      `
      INSERT INTO lab_orders (
        order_number,
        encounter_id,
        patient_id,
        doctor_id,
        test_id,
        clinical_indication,
        priority,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'ORDERED')
      RETURNING *
      `,
      [
        orderNumber,
        encounterId || null,
        patientId,
        doctorId,
        testId,
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
  const result = await pool.query(
    `
    UPDATE lab_orders
    SET
      status = 'SPECIMEN_COLLECTED',
      specimen_collected_at = CURRENT_TIMESTAMP,
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
        entered_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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
        resulted_by = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [userId, orderId]
    );

    await recordAuditLog(client, {
      userId,
      action: "LAB_RESULT_ENTERED",
      entity: "lab_orders",
      entityId: orderId,
      details: { orderNumber: order.order_number, isAbnormal: Boolean(isAbnormal) },
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

async function getLabOrdersQueue(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const status = query.status || null;
  const priority = query.priority || null;
  const search = query.search ? query.search.trim() : null;

  const conditions = [];
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
      u_ver.username AS verified_by_username
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN patients p ON o.patient_id = p.id
    JOIN staff s ON o.doctor_id = s.id
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

  return {
    orders: result.rows,
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
      u_ver.username AS verified_by_username
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN patients p ON o.patient_id = p.id
    JOIN staff s ON o.doctor_id = s.id
    LEFT JOIN lab_results r ON r.lab_order_id = o.id
    LEFT JOIN users u_ent ON r.entered_by = u_ent.id
    LEFT JOIN users u_ver ON o.verified_by = u_ver.id
    WHERE o.id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  getTestCatalog,
  addCatalogTest,
  createLabOrder,
  collectSpecimen,
  enterResults,
  verifyResults,
  getLabOrdersQueue,
  getLabOrderById,
};
