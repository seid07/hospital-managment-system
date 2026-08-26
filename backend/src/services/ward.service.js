const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { generateAdmissionNumber } = require("../utils/number-generators");

async function getBeds({ doctorId } = {}) {
  let query = `
    SELECT b.*,
      p.patient_number AS current_patient_number,
      p.first_name AS current_patient_first_name,
      p.last_name AS current_patient_last_name,
      adm.id AS current_admission_id,
      adm.doctor_id AS admission_doctor_id
    FROM beds b
    LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
    LEFT JOIN patients p ON adm.patient_id = p.id AND p.is_active = TRUE
  `;
  const params = [];
  if (doctorId) {
    params.push(doctorId);
    query += ` WHERE b.status = 'AVAILABLE' OR adm.doctor_id = $1 OR p.id IN (
      SELECT a.patient_id FROM appointments a WHERE a.doctor_id = $1
      UNION
      SELECT r.patient_id FROM referrals r WHERE r.receiving_doctor_id = $1 OR r.referring_doctor_id = $1
      UNION
      SELECT ce.patient_id FROM encounters ce WHERE ce.doctor_id = $1
    )`;
  }
  query += ` ORDER BY b.ward_name ASC, b.bed_number ASC`;

  const result = await db.query(query, params);
  return result.rows;
}

async function getWardQueue({ status, doctorId } = {}) {
  let query = `
    SELECT 
      qe.id AS queue_entry_id,
      qe.queue_number,
      qe.priority,
      qe.status AS queue_status,
      qe.authorized_at,
      qe.queued_at,
      COALESCE(qe.visit_id, so.visit_id) AS visit_id,
      
      so.id AS service_order_id,
      so.order_number,
      so.status AS payment_status,
      so.clinical_notes,
      so.doctor_id AS ordering_doctor_id,
      
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
    LEFT JOIN admissions adm ON (adm.visit_id = COALESCE(qe.visit_id, so.visit_id) OR adm.patient_id = p.id) AND adm.status = 'ADMITTED'
    LEFT JOIN beds b ON adm.bed_id = b.id
    WHERE d.code = 'WARD' AND p.is_active = TRUE
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
      OR adm.doctor_id = $${params.length}
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

async function admitPatient({ visitId, patientId, bedId, doctorId, admissionReason }, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    let resolvedVisitId = visitId;
    if (!resolvedVisitId) {
      const visitRes = await client.query(
        `SELECT id FROM visits WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [patientId]
      );
      if (visitRes.rows.length > 0) {
        resolvedVisitId = visitRes.rows[0].id;
      } else {
        const { generateVisitNumber } = require("../utils/number-generators");
        const vNum = await generateVisitNumber(client);
        const newVisit = await client.query(
          `INSERT INTO visits (visit_number, patient_id, status, visit_type)
           VALUES ($1, $2, 'OPEN', 'INPATIENT') RETURNING id`,
          [vNum, patientId]
        );
        resolvedVisitId = newVisit.rows[0].id;
      }
    }

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
      [admissionNumber, resolvedVisitId, patientId, bedId || null, doctorId || null, admissionReason, userId]
    );

    if (bedId) {
      await client.query(
        `UPDATE beds SET status = 'OCCUPIED' WHERE id = $1`,
        [bedId]
      );
    }

    await client.query(
      `UPDATE queue_entries SET status = 'IN_PROGRESS' WHERE patient_id = $1 AND department_id = (SELECT id FROM departments WHERE code = 'WARD') AND status IN ('WAITING', 'CALLED')`,
      [patientId]
    );

    await recordAuditLog(
      client,
      {
        userId,
        action: "PATIENT_ADMITTED",
        entity: "admissions",
        entityId: admRes.rows[0].id,
        details: { admissionNumber, bedId, visitId: resolvedVisitId },
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
