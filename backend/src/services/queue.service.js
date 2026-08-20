const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getDepartmentQueue(departmentCode, { status, date } = {}) {
  let query = `
    SELECT 
      qe.id AS queue_entry_id,
      qe.queue_number,
      qe.priority,
      qe.status AS queue_status,
      qe.authorized_at,
      qe.queued_at,
      qe.called_at,
      qe.started_at,
      qe.completed_at,
      qe.notes AS queue_notes,
      
      so.id AS service_order_id,
      so.order_number,
      so.status AS service_status,
      so.status AS payment_status,
      so.emergency_override,
      so.override_reason,
      so.clinical_notes,
      
      s.id AS service_id,
      s.code AS service_code,
      s.name AS service_name,
      s.category AS service_category,
      
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      p.phone AS patient_phone,
      
      v.id AS visit_id,
      v.visit_number,
      v.visit_type,
      
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      doc.specialty AS doctor_specialty
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    JOIN visits v ON qe.visit_id = v.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    WHERE d.code = $1
  `;
  const params = [departmentCode.toUpperCase().trim()];

  if (status) {
    params.push(status);
    query += ` AND qe.status = $${params.length}`;
  } else {
    // By default, exclude CANCELLED and COMPLETED unless requested
    query += ` AND qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS')`;
  }

  if (date) {
    params.push(date);
    query += ` AND DATE(qe.authorized_at) = $${params.length}`;
  }

  // Strictly order by priority DESC (EMERGENCY > URGENT > NORMAL), then authorized_at ASC (first paid/authorized first)
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

async function updateQueueStatus(queueEntryId, newStatus, { staffId, notes, userId } = {}) {
  const allowedStatuses = ["WAITING", "CALLED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"];
  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`Invalid queue status: ${newStatus}`);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const fields = ["status = $1", "updated_at = CURRENT_TIMESTAMP"];
    const params = [newStatus, queueEntryId];

    if (newStatus === "CALLED") {
      fields.push("called_at = CURRENT_TIMESTAMP");
    } else if (newStatus === "IN_PROGRESS") {
      fields.push("started_at = CURRENT_TIMESTAMP");
    } else if (newStatus === "COMPLETED") {
      fields.push("completed_at = CURRENT_TIMESTAMP");
    }

    if (staffId) {
      params.push(staffId);
      fields.push(`assigned_staff_id = $${params.length}`);
    }
    if (notes) {
      params.push(notes);
      fields.push(`notes = $${params.length}`);
    }

    const qRes = await client.query(
      `
      UPDATE queue_entries
      SET ${fields.join(", ")}
      WHERE id = $2
      RETURNING *;
      `,
      params
    );

    if (qRes.rowCount === 0) {
      throw new Error("Queue entry not found.");
    }
    const entry = qRes.rows[0];

    // Update service order status
    let orderStatus = entry.status;
    if (newStatus === "WAITING") orderStatus = "QUEUED";
    else if (newStatus === "CALLED" || newStatus === "IN_PROGRESS") orderStatus = "IN_PROGRESS";
    else if (newStatus === "COMPLETED") orderStatus = "COMPLETED";
    else if (newStatus === "CANCELLED") orderStatus = "CANCELLED";

    await client.query(
      `UPDATE service_orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [orderStatus, entry.service_order_id]
    );

    await recordAuditLog(
      client,
      {
        userId,
        action: `QUEUE_STATUS_${newStatus}`,
        entity: "queue_entries",
        entityId: queueEntryId,
        details: { newStatus, serviceOrderId: entry.service_order_id },
      }
    );

    await client.query("COMMIT");
    return entry;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function callNext(departmentCode, { staffId, userId } = {}) {
  const queue = await getDepartmentQueue(departmentCode, { status: "WAITING" });
  if (queue.length === 0) {
    return null;
  }
  const nextPatient = queue[0];
  return updateQueueStatus(nextPatient.queue_entry_id, "CALLED", { staffId, userId });
}

module.exports = {
  getDepartmentQueue,
  updateQueueStatus,
  callNext,
};
