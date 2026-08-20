const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getSurgeryQueue({ status } = {}) {
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
      
      surg.id AS surgery_order_id,
      surg.surgery_name,
      surg.pre_op_diagnosis,
      surg.post_op_diagnosis,
      surg.pre_op_checklist_complete,
      surg.anesthesia_type,
      surg.operation_notes,
      surg.status AS surgery_status
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN surgery_orders surg ON surg.service_order_id = so.id
    WHERE d.code = 'SURGERY'
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

async function updateSurgeryStatus(serviceOrderId, data, userId) {
  const {
    surgeryName,
    preOpDiagnosis,
    postOpDiagnosis,
    preOpChecklistComplete,
    anesthesiaType,
    operationNotes,
    status = "COMPLETED",
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
      `SELECT id FROM surgery_orders WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    let surgOrder;
    if (existRes.rowCount > 0) {
      const upRes = await client.query(
        `
        UPDATE surgery_orders
        SET
          pre_op_diagnosis = COALESCE($1, pre_op_diagnosis),
          post_op_diagnosis = COALESCE($2, post_op_diagnosis),
          pre_op_checklist_complete = COALESCE($3, pre_op_checklist_complete),
          anesthesia_type = COALESCE($4, anesthesia_type),
          operation_notes = COALESCE($5, operation_notes),
          status = $6,
          performed_by = $7,
          completed_at = CASE WHEN $6 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $8
        RETURNING *;
        `,
        [
          preOpDiagnosis,
          postOpDiagnosis,
          preOpChecklistComplete,
          anesthesiaType,
          operationNotes,
          status,
          userId,
          serviceOrderId,
        ]
      );
      surgOrder = upRes.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO surgery_orders (
          service_order_id, patient_id, surgeon_id, surgery_name,
          pre_op_diagnosis, post_op_diagnosis, pre_op_checklist_complete,
          anesthesia_type, operation_notes, status, performed_by, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $10 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END)
        RETURNING *;
        `,
        [
          serviceOrderId,
          order.patient_id,
          order.doctor_id,
          surgeryName || "Surgical Procedure",
          preOpDiagnosis || null,
          postOpDiagnosis || null,
          Boolean(preOpChecklistComplete),
          anesthesiaType || null,
          operationNotes || null,
          status,
          userId,
        ]
      );
      surgOrder = inRes.rows[0];
    }

    if (status === "COMPLETED") {
      await client.query(
        `UPDATE queue_entries SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE service_order_id = $1`,
        [serviceOrderId]
      );
      await client.query(
        `UPDATE service_orders SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [serviceOrderId]
      );
    } else if (status === "IN_THEATRE") {
      await client.query(
        `UPDATE queue_entries SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP WHERE service_order_id = $1`,
        [serviceOrderId]
      );
      await client.query(
        `UPDATE service_orders SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [serviceOrderId]
      );
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: `SURGERY_${status}`,
        entity: "surgery_orders",
        entityId: surgOrder.id,
        details: { serviceOrderId, status },
      }
    );

    await client.query("COMMIT");
    return surgOrder;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getSurgeryQueue,
  updateSurgeryStatus,
};
