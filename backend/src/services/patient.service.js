const pool = require("../config/database");

function generatePatientNumber() {
  const timestamp = Date.now();

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `PAT-${timestamp}-${random}`;
}

async function createPatient(data, userId) {
  const patientNumber = generatePatientNumber();

  const result = await pool.query(
    `
      INSERT INTO patients (
        patient_number,
        first_name,
        last_name,
        date_of_birth,
        gender,
        phone,
        email,
        address,
        emergency_contact_name,
        emergency_contact_phone,
        created_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      RETURNING *
    `,
    [
      patientNumber,
      data.firstName,
      data.lastName,
      data.dateOfBirth,
      data.gender,
      data.phone,
      data.email || null,
      data.address || null,
      data.emergencyContactName || null,
      data.emergencyContactPhone || null,
      userId,
    ]
  );

  return result.rows[0];
}

async function searchPatients(search) {
  const result = await pool.query(
    `
      SELECT
        id,
        patient_number,
        first_name,
        last_name,
        date_of_birth,
        gender,
        phone,
        email,
        created_at
      FROM patients
      WHERE is_active = TRUE
      AND (
        patient_number ILIKE $1
        OR first_name ILIKE $1
        OR last_name ILIKE $1
        OR phone ILIKE $1
      )
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [`%${search}%`]
  );

  return result.rows;
}

async function getPatientById(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM patients
      WHERE id = $1
      AND is_active = TRUE
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createPatient,
  searchPatients,
  getPatientById,
};
