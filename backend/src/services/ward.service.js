const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { generateAdmissionNumber } = require("../utils/number-generators");

async function getBeds() {
  const result = await db.query(`
    SELECT b.*,
      p.patient_number AS current_patient_number,
      p.first_name AS current_patient_first_name,
      p.last_name AS current_patient_last_name,
      adm.id AS current_admission_id
    FROM beds b
    LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
    LEFT JOIN patients p ON adm.patient_id = p.id
    ORDER BY b.ward_name ASC, b.bed_number ASC
  `);
  return result.rows;
}

async function getWardQueue({ status } = {}) {
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
      
      adm.id AS admission_id,
      adm.admission_number,
      adm.status AS admission_status,
      b.bed_number,
      b.ward_name
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN admissions adm ON adm.visit_id = qe.visit_id AND adm.status = 'ADMITTED'
    LEFT JOIN beds b ON adm.bed_id = b.id
    WHERE d.code = 'WARD'
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

async function admitPatient({ visitId, patientId, bedId, doctorId, admissionReason }, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const admissionNumber = await generateAdmissionNumber(client);

    const admRes = await client.query(
      `
      INSERT INTO admissions (
        admission_number, visit_id, patient_id, bed_id,
        doctor_id, admission_date, status, admission_reason, created_by
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'ADMITTED', $6, $7)
      RETURNING *;
      `,
      [admissionNumber, visitId, patientId, bedId || null, doctorId || null, admissionReason, userId]
    );

    if (bedId) {
      await client.query(
        `UPDATE beds SET status = 'OCCUPIED' WHERE id = $1`,
        [bedId]
      );
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: "PATIENT_ADMITTED",
        entity: "admissions",
        entityId: admRes.rows[0].id,
        details: { admissionNumber, bedId, visitId },
      }
    );

    await client.query("COMMIT");
    return admRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function dischargePatient(admissionId, { dischargeSummary }, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const admRes = await client.query(
      `SELECT * FROM admissions WHERE id = $1 FOR UPDATE`,
      [admissionId]
    );
    if (admRes.rowCount === 0) {
      throw new Error("Admission record not found.");
    }
    const admission = admRes.rows[0];

    const upRes = await client.query(
      `
      UPDATE admissions
      SET status = 'DISCHARGED', discharge_date = CURRENT_TIMESTAMP, discharge_summary = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
      `,
      [dischargeSummary, admissionId]
    );

    if (admission.bed_id) {
      await client.query(
        `UPDATE beds SET status = 'AVAILABLE' WHERE id = $1`,
        [admission.bed_id]
      );
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: "PATIENT_DISCHARGED",
        entity: "admissions",
        entityId: admissionId,
        details: { admissionNumber: admission.admission_number },
      }
    );

    await client.query("COMMIT");
    return upRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getBeds,
  getWardQueue,
  admitPatient,
  dischargePatient,
};
