const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getRadiologyQueue({ status } = {}) {
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
      
      ro.id AS radiology_order_id,
      ro.modality,
      ro.clinical_indication,
      ro.technician_notes,
      ro.findings,
      ro.impression,
      ro.status AS radiology_status
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN radiology_orders ro ON ro.service_order_id = so.id
    WHERE d.code = 'RADIOLOGY'
  `;
  const params = [];

  if (status) {
    params.push(status);
    query += ` AND qe.status = $${params.length}`;
  } else {
    query += ` AND qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS')`;
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

async function recordRadiologyResult(serviceOrderId, data, userId) {
  const { modality, clinicalIndication, technicianNotes, findings, impression } = data;

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
          technician_notes = $3,
          status = 'REPORTED',
          reported_by = $4,
          reported_at = CURRENT_TIMESTAMP,
          performed_by = $4,
          performed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $5
        RETURNING *;
        `,
        [findings, impression, technicianNotes, userId, serviceOrderId]
      );
      radOrder = upRes.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO radiology_orders (
          service_order_id, patient_id, doctor_id, modality,
          clinical_indication, technician_notes, findings, impression,
          status, performed_by, performed_at, reported_by, reported_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'REPORTED', $9, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP)
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
          userId,
        ]
      );
      radOrder = inRes.rows[0];
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
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      u.username AS reported_by_username
    FROM radiology_orders ro
    JOIN patients p ON ro.patient_id = p.id
    LEFT JOIN staff doc ON ro.doctor_id = doc.id
    LEFT JOIN users u ON ro.reported_by = u.id
    WHERE ro.id = $1 OR ro.service_order_id = $1
    `,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  getRadiologyQueue,
  recordRadiologyResult,
  getRadiologyOrder,
};
