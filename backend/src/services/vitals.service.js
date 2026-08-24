const pool = require("../config/database");
const { validateVitals } = require("../validators");
const { recordAuditLog } = require("../utils/audit");

async function recordVitals({
  patientId,
  encounterId,
  appointmentId,
  data,
  userId,
}) {
  const { isValid, errors, sanitized } = validateVitals(data);

  if (!isValid) {
    const err = new Error(errors.join(" "));
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        INSERT INTO vitals (
          patient_id,
          encounter_id,
          appointment_id,
          recorded_by,
          temperature,
          heart_rate,
          respiratory_rate,
          systolic_bp,
          diastolic_bp,
          oxygen_saturation,
          weight,
          height,
          bmi,
          triage_category,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `,
      [
        patientId,
        encounterId || null,
        appointmentId || null,
        userId || null,
        sanitized.temperature,
        sanitized.heartRate,
        sanitized.respiratoryRate,
        sanitized.systolicBp,
        sanitized.diastolicBp,
        sanitized.oxygenSaturation,
        sanitized.weight,
        sanitized.height,
        sanitized.bmi,
        sanitized.triageCategory,
        sanitized.notes,
      ]
    );

    const vitals = result.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "VITALS_RECORDED",
      entity: "vitals",
      entityId: vitals.id,
      details: {
        patientId,
        triageCategory: sanitized.triageCategory,
        bp: `${sanitized.systolicBp}/${sanitized.diastolicBp}`,
      },
    });

    await client.query("COMMIT");
    return vitals;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPatientVitals(patientId) {
  const result = await pool.query(
    `
      SELECT
        v.*,
        u.username AS recorded_by_username,
        s.first_name AS staff_first_name,
        s.last_name AS staff_last_name
      FROM vitals v
      LEFT JOIN users u ON v.recorded_by = u.id
      LEFT JOIN staff s ON u.staff_id = s.id
      WHERE v.patient_id = $1
      ORDER BY v.recorded_at DESC
    `,
    [patientId]
  );

  return result.rows;
}

async function getTriageQueue() {
  const result = await pool.query(`
    SELECT
      a.id AS appointment_id,
      a.appointment_number,
      a.appointment_date,
      a.start_time,
      a.end_time,
      a.status,
      a.reason,
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth,
      p.gender,
      p.phone,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.specialty AS doctor_specialty,
      (
        SELECT row_to_json(v)
        FROM (
          SELECT * FROM vitals WHERE appointment_id = a.id ORDER BY recorded_at DESC LIMIT 1
        ) v
      ) AS latest_vitals
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    JOIN staff s ON a.doctor_id = s.id
    WHERE a.appointment_date = CURRENT_DATE
      AND a.status IN ('CHECKED_IN', 'IN_PROGRESS')
      AND p.is_active = TRUE
    ORDER BY a.start_time ASC
  `);

  return result.rows;
}

module.exports = {
  recordVitals,
  getPatientVitals,
  getTriageQueue,
};
