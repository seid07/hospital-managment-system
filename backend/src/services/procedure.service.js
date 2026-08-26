const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getProcedureQueue({ status, doctorId } = {}) {
  let query = `
    SELECT 
      qe.id AS queue_entry_id,
      qe.queue_number,
      qe.priority,
      qe.status AS queue_status,
      qe.authorized_at,
      qe.queued_at,
      
      so.id AS service_order_id,
      so.order_number,
      so.status AS payment_status,
      so.clinical_notes,
      
      s.code AS service_code,
      s.name AS service_name,
      
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      
      po.id AS procedure_order_id,
      po.procedure_type,
      po.procedure_name,
      po.procedure_notes,
      po.status AS procedure_status
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN procedure_orders po ON po.service_order_id = so.id
    WHERE d.code = 'PROCEDURE' AND p.is_active = TRUE
  `;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND qe.status = $${params.length}`;
  } else {
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

async function completeProcedure(serviceOrderId, { procedureType, procedureName, procedureNotes }, userId) {
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

    const procRes = await client.query(
      `
      INSERT INTO procedure_orders (
        service_order_id, patient_id, doctor_id, procedure_type,
        procedure_name, procedure_notes, status, performed_by, performed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, CURRENT_TIMESTAMP)
      RETURNING *;
      `,
      [
        serviceOrderId,
        order.patient_id,
        order.doctor_id,
        procedureType || "GENERAL",
        procedureName || "Clinical Procedure",
        procedureNotes || null,
        userId,
      ]
    );

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
        entityId: procRes.rows[0].id,
        details: { serviceOrderId, procedureName },
      }
    );

    await client.query("COMMIT");
    return procRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getProcedureQueue,
  completeProcedure,
};
