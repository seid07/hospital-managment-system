const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getProcedureMetrics() {
  const today = new Date().toISOString().split("T")[0];
  const [waitingRes, inProgressRes, completedTodayRes, allTimeRes] = await Promise.all([
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'PROCEDURE' AND qe.status IN ('WAITING', 'CALLED')
    `),
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'PROCEDURE' AND qe.status = 'IN_PROGRESS'
    `),
    db.query(`
      SELECT COUNT(*) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'PROCEDURE' AND qe.status = 'COMPLETED' AND DATE(qe.completed_at) = $1
    `, [today]),
    db.query(`
      SELECT COUNT(*) as count 
      FROM service_orders so
      JOIN departments d ON so.department_id = d.id
      WHERE d.code = 'PROCEDURE'
    `),
  ]);

  return {
    waitingCount: parseInt(waitingRes.rows[0]?.count || "0", 10),
    inProgressCount: parseInt(inProgressRes.rows[0]?.count || "0", 10),
    completedToday: parseInt(completedTodayRes.rows[0]?.count || "0", 10),
    totalOrders: parseInt(allTimeRes.rows[0]?.count || "0", 10),
  };
}

async function getProcedureQueue({ status, doctorId } = {}) {
  let query = `
    SELECT 
      qe.id AS queue_entry_id,
      qe.queue_number,
      qe.priority,
      qe.status AS queue_status,
      qe.authorized_at,
      qe.queued_at,
      qe.started_at,
      
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
      
      po.id AS procedure_order_id,
      po.procedure_type,
      po.procedure_name,
      po.clinical_instructions,
      po.procedure_notes,
      po.findings,
      po.materials_used,
      po.complications,
      po.status AS procedure_status,
      po.performed_at,
      u.username AS performed_by_username
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN procedure_orders po ON po.service_order_id = so.id
    LEFT JOIN users u ON po.performed_by = u.id
    WHERE d.code = 'PROCEDURE' AND p.is_active = TRUE
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

async function startProcedure(serviceOrderId, userId) {
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

    const existing = await client.query(
      `SELECT id FROM procedure_orders WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE procedure_orders 
         SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, performed_by = $1, updated_at = CURRENT_TIMESTAMP
         WHERE service_order_id = $2`,
        [userId, serviceOrderId]
      );
    } else {
      const type = order.clinical_notes?.toLowerCase().includes("dressing") ? "DRESSING" :
                   order.clinical_notes?.toLowerCase().includes("injection") ? "INJECTION" : "GENERAL";
      await client.query(
        `INSERT INTO procedure_orders (
          service_order_id, patient_id, doctor_id, procedure_type,
          procedure_name, clinical_instructions, status, performed_by, started_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_PROGRESS', $7, CURRENT_TIMESTAMP)`,
        [serviceOrderId, order.patient_id, order.doctor_id, type, "Clinical Procedure", order.clinical_notes, userId]
      );
    }

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

    await client.query("COMMIT");
    return { success: true, serviceOrderId, status: "IN_PROGRESS" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function completeProcedure(serviceOrderId, data, userId) {
  const {
    procedureType,
    procedureName,
    procedureNotes,
    findings,
    materialsUsed,
    complications,
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

    const existRes = await client.query(
      `SELECT id FROM procedure_orders WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    let procOrder;
    if (existRes.rowCount > 0) {
      const upRes = await client.query(
        `
        UPDATE procedure_orders
        SET
          procedure_type = COALESCE($1, procedure_type),
          procedure_name = COALESCE($2, procedure_name),
          procedure_notes = COALESCE($3, procedure_notes),
          findings = $4,
          materials_used = $5,
          complications = $6,
          status = 'COMPLETED',
          performed_by = $7,
          performed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $8
        RETURNING *;
        `,
        [
          procedureType,
          procedureName,
          procedureNotes,
          findings || null,
          materialsUsed || null,
          complications || null,
          userId,
          serviceOrderId,
        ]
      );
      procOrder = upRes.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO procedure_orders (
          service_order_id, patient_id, doctor_id, procedure_type,
          procedure_name, procedure_notes, findings, materials_used, complications,
          status, performed_by, performed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10, CURRENT_TIMESTAMP)
        RETURNING *;
        `,
        [
          serviceOrderId,
          order.patient_id,
          order.doctor_id,
          procedureType || "GENERAL",
          procedureName || "Clinical Procedure",
          procedureNotes || null,
          findings || null,
          materialsUsed || null,
          complications || null,
          userId,
        ]
      );
      procOrder = inRes.rows[0];
    }

    // Complete queue entry and service order
    await client.query(
      `UPDATE queue_entries SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE service_order_id = $1`,
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
        action: "PROCEDURE_COMPLETED",
        entity: "procedure_orders",
        entityId: procOrder.id,
        details: { serviceOrderId, procedureName },
      }
    );

    await client.query("COMMIT");
    return procOrder;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getProcedureMetrics,
  getProcedureQueue,
  startProcedure,
  completeProcedure,
};
