const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getRadiologyMetrics() {
  const today = new Date().toISOString().split("T")[0];
  const [waitingRes, inProgressRes, completedTodayRes, allTimeRes] = await Promise.all([
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'RADIOLOGY' AND qe.status IN ('WAITING', 'CALLED')
    `),
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'RADIOLOGY' AND qe.status = 'IN_PROGRESS'
    `),
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'RADIOLOGY' AND qe.status = 'COMPLETED' AND DATE(qe.completed_at) = $1
    `, [today]),
    db.query(`
      SELECT COUNT(*) as count 
      FROM service_orders so
      JOIN departments d ON so.department_id = d.id
      WHERE d.code = 'RADIOLOGY'
    `),
  ]);

  return {
    waitingCount: parseInt(waitingRes.rows[0]?.count || "0", 10),
    inProgressCount: parseInt(inProgressRes.rows[0]?.count || "0", 10),
    completedToday: parseInt(completedTodayRes.rows[0]?.count || "0", 10),
    totalOrders: parseInt(allTimeRes.rows[0]?.count || "0", 10),
  };
}

async function getRadiologyQueue({ status, doctorId } = {}) {
  let query = `
    SELECT 
      qe.id AS queue_entry_id,
      qe.queue_number,
      qe.priority,
      qe.status AS queue_status,
      qe.authorized_at,
      qe.queued_at,
      qe.started_at AS exam_started_at,
      
      so.id AS service_order_id,
      so.order_number,
      so.status AS payment_status,
      so.clinical_notes,
      so.created_at AS ordered_time,
      
      s.code AS service_code,
      s.name AS service_name,
      
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS patient_age,
      
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      
      ro.id AS radiology_order_id,
      ro.modality,
      ro.clinical_indication,
      ro.technician_notes,
      ro.findings,
      ro.impression,
      ro.recommendations,
      ro.report_text,
      ro.status AS radiology_status,
      ro.performed_at,
      ro.reported_at,
      u_perf.username AS performed_by_username,
      u_rep.username AS reported_by_username
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN radiology_orders ro ON ro.service_order_id = so.id
    LEFT JOIN users u_perf ON ro.performed_by = u_perf.id
    LEFT JOIN users u_rep ON ro.reported_by = u_rep.id
    WHERE d.code = 'RADIOLOGY' AND p.is_active = TRUE
  `;
  const params = [];

  if (status && status !== "ALL") {
    params.push(status);
    query += ` AND qe.status = $${params.length}`;
  } else if (!status) {
    query += ` AND qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS')`;
  }

  if (doctorId) {
    params.push(doctorId);
    query += ` AND (
      so.doctor_id = $${params.length}
      OR p.id IN (
        SELECT a.patient_id FROM appointments a WHERE a.doctor_id = $${params.length}
        UNION
        SELECT r.patient_id FROM referrals r WHERE r.receiving_doctor_id = $${params.length} OR r.referring_doctor_id = $${params.length}
        UNION
        SELECT ce.patient_id FROM encounters ce WHERE ce.doctor_id = $${params.length}
      )
    )`;
  }

  query += ` ORDER BY 
    CASE qe.priority
      WHEN 'EMERGENCY' THEN 1
      WHEN 'URGENT' THEN 2
      ELSE 3
    END ASC,
    qe.authorized_at ASC,
    qe.queued_at ASC`;

  const result = await db.query(query, params);
  return result.rows;
}

async function startRadiologyExam(serviceOrderId, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const soRes = await client.query(
      `SELECT * FROM service_orders WHERE id = $1`,
      [serviceOrderId]
    );
    if (soRes.rowCount === 0) {
      throw new Error("Service order not found.");
    }
    const order = soRes.rows[0];

    // Check if radiology_order exists
    const existing = await client.query(
      `SELECT id FROM radiology_orders WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE radiology_orders 
         SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, performed_by = $1, updated_at = CURRENT_TIMESTAMP
         WHERE service_order_id = $2`,
        [userId, serviceOrderId]
      );
    } else {
      const modality = order.clinical_notes?.toLowerCase().includes("ultrasound") ? "ULTRASOUND" : "X_RAY";
      await client.query(
        `INSERT INTO radiology_orders (
          service_order_id, patient_id, doctor_id, modality,
          clinical_indication, status, performed_by, started_at
        ) VALUES ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6, CURRENT_TIMESTAMP)`,
        [serviceOrderId, order.patient_id, order.doctor_id, modality, order.clinical_notes, userId]
      );
    }

    // Update queue entry and service order
    await client.query(
      `UPDATE queue_entries 
       SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    await client.query(
      `UPDATE service_orders 
       SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [serviceOrderId]
    );

    await recordAuditLog(client, {
      userId,
      action: "RADIOLOGY_EXAM_STARTED",
      entity: "radiology_orders",
      entityId: serviceOrderId,
      details: { serviceOrderId },
    });

    await client.query("COMMIT");
    return { success: true, serviceOrderId, status: "IN_PROGRESS" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordRadiologyResult(serviceOrderId, data, userId) {
  const {
    modality,
    clinicalIndication,
    technicianNotes,
    findings,
    impression,
    recommendations,
    reportText,
  } = data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const soRes = await client.query(
      `SELECT * FROM service_orders WHERE id = $1`,
      [serviceOrderId]
    );
    if (soRes.rowCount === 0) {
      throw new Error("Service order not found.");
    }
    const order = soRes.rows[0];

    const existingRes = await client.query(
      `SELECT id FROM radiology_orders WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    let radOrder;
    if (existingRes.rowCount > 0) {
      const upRes = await client.query(
        `
        UPDATE radiology_orders
        SET 
          findings = $1,
          impression = $2,
          recommendations = $3,
          report_text = $4,
          technician_notes = $5,
          status = 'REPORTED',
          reported_by = $6,
          reported_at = CURRENT_TIMESTAMP,
          performed_by = COALESCE(performed_by, $6),
          performed_at = COALESCE(performed_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $7
        RETURNING *;
        `,
        [findings, impression, recommendations || null, reportText || null, technicianNotes || null, userId, serviceOrderId]
      );
      radOrder = upRes.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO radiology_orders (
          service_order_id, patient_id, doctor_id, modality,
          clinical_indication, technician_notes, findings, impression,
          recommendations, report_text,
          status, performed_by, performed_at, reported_by, reported_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'REPORTED', $11, CURRENT_TIMESTAMP, $11, CURRENT_TIMESTAMP)
        RETURNING *;
        `,
        [
          serviceOrderId,
          order.patient_id,
          order.doctor_id,
          modality || "X_RAY",
          clinicalIndication || order.clinical_notes,
          technicianNotes || null,
          findings,
          impression,
          recommendations || null,
          reportText || null,
          userId,
        ]
      );
      radOrder = inRes.rows[0];
    }

    // Complete queue entry and service order
    await client.query(
      `UPDATE queue_entries SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE service_order_id = $1`,
      [serviceOrderId]
    );
    await client.query(
      `UPDATE service_orders SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [serviceOrderId]
    );

    await recordAuditLog(
      client,
      {
        userId,
        action: "RADIOLOGY_RESULT_RECORDED",
        entity: "radiology_orders",
        entityId: radOrder.id,
        details: { serviceOrderId, modality },
      }
    );

    await client.query("COMMIT");
    return radOrder;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getRadiologyOrder(id) {
  const result = await db.query(
    `
    SELECT 
      ro.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      u_rep.username AS reported_by_username,
      u_perf.username AS performed_by_username
    FROM radiology_orders ro
    JOIN patients p ON ro.patient_id = p.id
    LEFT JOIN staff doc ON ro.doctor_id = doc.id
    LEFT JOIN users u_rep ON ro.reported_by = u_rep.id
    LEFT JOIN users u_perf ON ro.performed_by = u_perf.id
    WHERE ro.id = $1 OR ro.service_order_id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

async function getPatientRadiologyHistory(patientId) {
  const result = await db.query(
    `
    SELECT 
      ro.*,
      s.name AS service_name,
      s.code AS service_code,
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      u.username AS reported_by_username
    FROM radiology_orders ro
    JOIN service_orders so ON ro.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    LEFT JOIN staff doc ON ro.doctor_id = doc.id
    LEFT JOIN users u ON ro.reported_by = u.id
    WHERE ro.patient_id = $1
    ORDER BY ro.created_at DESC
    `,
    [patientId]
  );
  return result.rows;
}

module.exports = {
  getRadiologyMetrics,
  getRadiologyQueue,
  startRadiologyExam,
  recordRadiologyResult,
  getRadiologyOrder,
  getPatientRadiologyHistory,
};
