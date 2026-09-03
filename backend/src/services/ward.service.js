const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { generateAdmissionNumber } = require("../utils/number-generators");

async function getWardMetrics() {
  const today = new Date().toISOString().split("T")[0];

  const [
    occupiedRes,
    availableRes,
    todayAdmRes,
    todayDisRes,
    awaitingRes,
    transfersRes,
  ] = await Promise.all([
    // 1. Occupied beds
    db.query(`SELECT COUNT(*) as count FROM beds WHERE status = 'OCCUPIED'`),
    // 2. Available beds
    db.query(`SELECT COUNT(*) as count FROM beds WHERE status = 'AVAILABLE'`),
    // 3. Today's admissions
    db.query(`SELECT COUNT(*) as count FROM admissions WHERE status = 'ADMITTED' AND DATE(admission_date) = $1`, [today]),
    // 4. Today's discharges
    db.query(`SELECT COUNT(*) as count FROM admissions WHERE status = 'DISCHARGED' AND DATE(discharge_date) = $1`, [today]),
    // 5. Patients awaiting bed (Pending admissions or authorized ward queue entries without bed)
    db.query(`
      SELECT COUNT(DISTINCT qe.patient_id) as count 
      FROM queue_entries qe
      JOIN departments d ON qe.department_id = d.id
      WHERE d.code = 'WARD' AND qe.status IN ('WAITING', 'CALLED')
        AND NOT EXISTS (
          SELECT 1 FROM admissions adm 
          WHERE adm.patient_id = qe.patient_id AND adm.status = 'ADMITTED' AND adm.bed_id IS NOT NULL
        )
    `),
    // 6. Recent transfers
    db.query(`SELECT COUNT(*) as count FROM ward_transfers WHERE DATE(created_at) = $1`, [today]),
  ]);

  return {
    occupiedBeds: parseInt(occupiedRes.rows[0]?.count || "0", 10),
    availableBeds: parseInt(availableRes.rows[0]?.count || "0", 10),
    todayAdmissions: parseInt(todayAdmRes.rows[0]?.count || "0", 10),
    todayDischarges: parseInt(todayDisRes.rows[0]?.count || "0", 10),
    awaitingBed: parseInt(awaitingRes.rows[0]?.count || "0", 10),
    requiringTransfer: parseInt(transfersRes.rows[0]?.count || "0", 10),
  };
}

async function getBeds({ doctorId } = {}) {
  let query = `
    SELECT b.*,
      p.id AS current_patient_id,
      p.patient_number AS current_patient_number,
      p.first_name AS current_patient_first_name,
      p.last_name AS current_patient_last_name,
      p.gender AS current_patient_gender,
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS current_patient_age,
      adm.id AS current_admission_id,
      adm.admission_number,
      adm.admission_date,
      adm.admission_reason,
      adm.doctor_id AS admission_doctor_id,
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name
    FROM beds b
    LEFT JOIN admissions adm ON adm.bed_id = b.id AND adm.status = 'ADMITTED'
    LEFT JOIN patients p ON adm.patient_id = p.id AND p.is_active = TRUE
    LEFT JOIN staff doc ON adm.doctor_id = doc.id
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

async function createBed({ bedNumber, wardName, bedType = "STANDARD", roomNumber = null, dailyRate = 400.00, status = "AVAILABLE", notes = null }, userId) {
  if (!bedNumber || !wardName) {
    throw new Error("Bed number and Ward name are required.");
  }
  const cleanBedNumber = bedNumber.trim().toUpperCase();
  const cleanWardName = wardName.trim();

  // Check duplicate bed in the same ward
  const existing = await db.query(
    `SELECT id FROM beds WHERE UPPER(bed_number) = UPPER($1) AND UPPER(ward_name) = UPPER($2)`,
    [cleanBedNumber, cleanWardName]
  );
  if (existing.rowCount > 0) {
    const err = new Error(`DUPLICATE_BED_NUMBER: Bed code "${cleanBedNumber}" already exists in ${cleanWardName}.`);
    err.statusCode = 409;
    throw err;
  }

  const validStatuses = ["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"];
  const finalStatus = validStatuses.includes(status) ? status : "AVAILABLE";

  const res = await db.query(
    `INSERT INTO beds (bed_number, ward_name, bed_type, room_number, daily_rate, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      cleanBedNumber,
      cleanWardName,
      bedType || "STANDARD",
      roomNumber ? roomNumber.trim() : null,
      parseFloat(dailyRate) || 400.00,
      finalStatus,
      notes ? notes.trim() : null,
    ]
  );
  await recordAuditLog(db, {
    userId,
    action: "BED_CREATED",
    entity: "beds",
    entityId: res.rows[0].id,
    details: { bedNumber: cleanBedNumber, wardName: cleanWardName, bedType, status: finalStatus },
  });
  return res.rows[0];
}

async function updateBedStatus(bedId, status, userId) {
  const res = await db.query(
    `UPDATE beds SET status = $1 WHERE id = $2 RETURNING *`,
    [status, bedId]
  );
  if (res.rowCount === 0) throw new Error("Bed not found.");
  await recordAuditLog(db, {
    userId,
    action: "BED_STATUS_UPDATED",
    entity: "beds",
    entityId: bedId,
    details: { status },
  });
  return res.rows[0];
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
      
      adm.id AS admission_id,
      adm.admission_number,
      adm.status AS admission_status,
      adm.admission_date,
      adm.admission_reason,
      b.id AS bed_id,
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

    // Verify bed availability if provided
    if (bedId) {
      const bedCheck = await client.query(`SELECT status FROM beds WHERE id = $1 FOR UPDATE`, [bedId]);
      if (bedCheck.rows.length === 0) throw new Error("Bed not found.");
      if (bedCheck.rows[0].status === "OCCUPIED") throw new Error("Selected bed is already occupied.");
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

async function transferBed(admissionId, { toBedId, transferReason }, userId) {
  if (!toBedId) throw new Error("Destination bed (toBedId) is required.");

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const admRes = await client.query(
      `SELECT * FROM admissions WHERE id = $1 AND status = 'ADMITTED' FOR UPDATE`,
      [admissionId]
    );
    if (admRes.rowCount === 0) throw new Error("Active admission record not found.");
    const admission = admRes.rows[0];

    const toBedRes = await client.query(
      `SELECT * FROM beds WHERE id = $1 FOR UPDATE`,
      [toBedId]
    );
    if (toBedRes.rowCount === 0) throw new Error("Destination bed not found.");
    if (toBedRes.rows[0].status === "OCCUPIED") throw new Error("Target bed is already occupied.");

    const fromBedId = admission.bed_id;

    // 1. Log transfer record
    await client.query(
      `INSERT INTO ward_transfers (admission_id, patient_id, from_bed_id, to_bed_id, transfer_reason, transferred_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admissionId, admission.patient_id, fromBedId, toBedId, transferReason || null, userId]
    );

    // 2. Free old bed
    if (fromBedId) {
      await client.query(`UPDATE beds SET status = 'AVAILABLE' WHERE id = $1`, [fromBedId]);
    }

    // 3. Occupy new bed
    await client.query(`UPDATE beds SET status = 'OCCUPIED' WHERE id = $1`, [toBedId]);

    // 4. Update admission
    const upAdm = await client.query(
      `UPDATE admissions SET bed_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [toBedId, admissionId]
    );

    await recordAuditLog(client, {
      userId,
      action: "BED_TRANSFER_COMPLETED",
      entity: "admissions",
      entityId: admissionId,
      details: { fromBedId, toBedId, transferReason },
    });

    await client.query("COMMIT");
    return upAdm.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function dischargePatient(admissionId, data = {}, userId) {
  const {
    dischargeSummary,
    dischargeDiagnosis,
    dischargeMedications,
    dischargeFollowUp,
    dischargeInstructions,
  } = data;

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
      SET 
        status = 'DISCHARGED',
        discharge_date = CURRENT_TIMESTAMP,
        discharge_summary = COALESCE($1, discharge_summary),
        discharge_diagnosis = COALESCE($2, discharge_diagnosis),
        discharge_medications = COALESCE($3, discharge_medications),
        discharge_follow_up = COALESCE($4, discharge_follow_up),
        discharge_instructions = COALESCE($5, discharge_instructions),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *;
      `,
      [
        dischargeSummary || null,
        dischargeDiagnosis || null,
        dischargeMedications || null,
        dischargeFollowUp || null,
        dischargeInstructions || null,
        admissionId,
      ]
    );

    if (admission.bed_id) {
      await client.query(
        `UPDATE beds SET status = 'AVAILABLE' WHERE id = $1`,
        [admission.bed_id]
      );
    }

    // Complete queue entry for this admission if any
    await client.query(
      `UPDATE queue_entries SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE patient_id = $1 AND department_id = (SELECT id FROM departments WHERE code = 'WARD') AND status IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
      [admission.patient_id]
    );

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
  getWardMetrics,
  getBeds,
  createBed,
  updateBedStatus,
  getWardQueue,
  admitPatient,
  transferBed,
  dischargePatient,
};
