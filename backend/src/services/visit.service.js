const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { generateVisitNumber } = require("../utils/number-generators");

async function createVisit(data, userId) {
  const {
    patientId,
    appointmentId = null,
    visitType = "OUTPATIENT",
    emergencyOverride = false,
    overrideReason = null,
    notes = null,
  } = data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Validate patient
    const patientRes = await client.query(`SELECT id FROM patients WHERE id = $1`, [patientId]);
    if (patientRes.rowCount === 0) {
      throw new Error("Patient not found.");
    }

    const visitNumber = await generateVisitNumber(client);

    const overrideAuthBy = emergencyOverride ? userId : null;
    const overrideAuthAt = emergencyOverride ? new Date() : null;

    const result = await client.query(
      `
      INSERT INTO visits (
        visit_number, patient_id, appointment_id, status, visit_type,
        emergency_override, override_reason, override_authorized_by, override_authorized_at,
        notes, created_by
      )
      VALUES ($1, $2, $3, 'OPEN', $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
      `,
      [
        visitNumber,
        patientId,
        appointmentId,
        visitType,
        emergencyOverride,
        overrideReason || null,
        overrideAuthBy,
        overrideAuthAt,
        notes,
        userId,
      ]
    );

    const visit = result.rows[0];

    // If appointment linked, link back
    if (appointmentId) {
      await client.query(
        `UPDATE appointments SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [appointmentId]
      );
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: emergencyOverride ? "EMERGENCY_VISIT_CREATED" : "VISIT_CREATED",
        entity: "visits",
        entityId: visit.id,
        details: {
          visitNumber: visit.visit_number,
          patientId,
          emergencyOverride,
          overrideReason,
        },
      }
    );

    await client.query("COMMIT");
    return visit;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPatientVisits(patientId) {
  const result = await db.query(
    `
    SELECT 
      v.*,
      u.username AS created_by_username,
      (SELECT COUNT(*) FROM service_orders so WHERE so.visit_id = v.id) AS service_orders_count
    FROM visits v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.patient_id = $1
    ORDER BY v.created_at DESC
    `,
    [patientId]
  );
  return result.rows;
}

async function getVisitById(id) {
  const visitRes = await db.query(
    `
    SELECT 
      v.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      p.phone AS patient_phone,
      u.username AS created_by_username
    FROM visits v
    JOIN patients p ON v.patient_id = p.id
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.id = $1
    `,
    [id]
  );

  if (visitRes.rowCount === 0) {
    return null;
  }

  const visit = visitRes.rows[0];

  // Load service orders
  const ordersRes = await db.query(
    `
    SELECT 
      so.*,
      s.code AS service_code,
      s.name AS service_name,
      s.category AS service_category,
      s.payment_location,
      s.queue_enabled,
      d.code AS department_code,
      d.name AS department_name,
      st.first_name AS doctor_first_name,
      st.last_name AS doctor_last_name,
      qe.queue_number,
      qe.status AS queue_status,
      qe.priority AS queue_priority
    FROM service_orders so
    JOIN services s ON so.service_id = s.id
    JOIN departments d ON so.department_id = d.id
    LEFT JOIN staff st ON so.doctor_id = st.id
    LEFT JOIN queue_entries qe ON qe.service_order_id = so.id
    WHERE so.visit_id = $1
    ORDER BY so.created_at ASC
    `,
    [id]
  );

  // Load invoices
  const invoicesRes = await db.query(
    `
    SELECT id, invoice_number, subtotal, discount_amount, tax_amount, total_amount, paid_amount, balance_amount, status, created_at
    FROM invoices
    WHERE visit_id = $1 OR patient_id = $2
    ORDER BY created_at DESC
    `,
    [id, visit.patient_id]
  );

  visit.serviceOrders = ordersRes.rows;
  visit.invoices = invoicesRes.rows;

  return visit;
}

async function closeVisit(id, userId) {
  const result = await db.query(
    `
    UPDATE visits
    SET status = 'COMPLETED', closed_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  if (result.rowCount > 0) {
    await recordAuditLog(null, {
      userId,
      action: "VISIT_COMPLETED",
      entity: "visits",
      entityId: id,
      details: { status: "COMPLETED" },
    });
  }

  return result.rows[0] || null;
}

module.exports = {
  createVisit,
  getPatientVisits,
  getVisitById,
  closeVisit,
};
