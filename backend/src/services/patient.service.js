const pool = require("../config/database");
const { generatePatientNumber } = require("../utils/number-generators");
const { recordAuditLog } = require("../utils/audit");
const {
  parsePagination,
  validateEthiopianPhone,
  normalizeEthiopianPhone,
  calculateDobFromAge,
} = require("../validators");

function formatPatientAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

function attachAgeToPatient(patient) {
  if (!patient) return null;
  return {
    ...patient,
    age: formatPatientAge(patient.date_of_birth),
  };
}

async function createPatient(data, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate phone
    if (!validateEthiopianPhone(data.phone)) {
      throw new Error("INVALID_PHONE_FORMAT");
    }
    const normalizedPhone = normalizeEthiopianPhone(data.phone);

    // Validate emergency phone if provided
    let normalizedEmergencyPhone = null;
    if (data.emergencyContactPhone && data.emergencyContactPhone.trim()) {
      if (!validateEthiopianPhone(data.emergencyContactPhone)) {
        throw new Error("INVALID_EMERGENCY_PHONE_FORMAT");
      }
      normalizedEmergencyPhone = normalizeEthiopianPhone(data.emergencyContactPhone);
    }

    // Determine date_of_birth
    let dob = data.dateOfBirth;
    if (!dob && (data.age !== undefined && data.age !== null && data.age !== "")) {
      dob = calculateDobFromAge(data.age);
    }
    if (!dob) {
      throw new Error("AGE_OR_DOB_REQUIRED");
    }

    const patientNumber = await generatePatientNumber(client);

    const result = await client.query(
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        RETURNING *
      `,
      [
        patientNumber,
        data.firstName.trim(),
        data.lastName.trim(),
        dob,
        data.gender,
        normalizedPhone,
        data.email ? data.email.trim().toLowerCase() : null,
        data.address ? data.address.trim() : null,
        data.emergencyContactName ? data.emergencyContactName.trim() : null,
        normalizedEmergencyPhone,
        userId || null,
      ]
    );

    const patient = attachAgeToPatient(result.rows[0]);

    await recordAuditLog(client, {
      userId,
      action: "PATIENT_CREATED",
      entity: "patients",
      entityId: patient.id,
      details: { patientNumber: patient.patient_number, name: `${patient.first_name} ${patient.last_name}`, age: patient.age },
    });

    await client.query("COMMIT");
    return patient;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updatePatient(id, data, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let normalizedPhone = undefined;
    if (data.phone) {
      if (!validateEthiopianPhone(data.phone)) {
        throw new Error("INVALID_PHONE_FORMAT");
      }
      normalizedPhone = normalizeEthiopianPhone(data.phone);
    }

    let normalizedEmergencyPhone = undefined;
    if (data.emergencyContactPhone) {
      if (!validateEthiopianPhone(data.emergencyContactPhone)) {
        throw new Error("INVALID_EMERGENCY_PHONE_FORMAT");
      }
      normalizedEmergencyPhone = normalizeEthiopianPhone(data.emergencyContactPhone);
    }

    let dob = data.dateOfBirth;
    if (!dob && data.age !== undefined && data.age !== null) {
      dob = calculateDobFromAge(data.age);
    }

    const result = await client.query(
      `
        UPDATE patients
        SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          date_of_birth = COALESCE($3, date_of_birth),
          gender = COALESCE($4, gender),
          phone = COALESCE($5, phone),
          email = COALESCE($6, email),
          address = COALESCE($7, address),
          emergency_contact_name = COALESCE($8, emergency_contact_name),
          emergency_contact_phone = COALESCE($9, emergency_contact_phone),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10 AND is_active = TRUE
        RETURNING *
      `,
      [
        data.firstName ? data.firstName.trim() : null,
        data.lastName ? data.lastName.trim() : null,
        dob || null,
        data.gender || null,
        normalizedPhone || null,
        data.email ? data.email.trim().toLowerCase() : null,
        data.address ? data.address.trim() : null,
        data.emergencyContactName ? data.emergencyContactName.trim() : null,
        normalizedEmergencyPhone || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    const patient = attachAgeToPatient(result.rows[0]);

    await recordAuditLog(client, {
      userId,
      action: "PATIENT_UPDATED",
      entity: "patients",
      entityId: patient.id,
      details: { patientNumber: patient.patient_number },
    });

    await client.query("COMMIT");
    return patient;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deletePatient(id, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE patients
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_active = TRUE
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    const patient = result.rows[0];

    await recordAuditLog(client, {
      userId,
      action: "PATIENT_DELETED",
      entity: "patients",
      entityId: id,
      details: { patientNumber: patient.patient_number, name: `${patient.first_name} ${patient.last_name}` },
    });

    await client.query("COMMIT");
    return patient;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function searchPatients(search, paginationQuery = {}) {
  const { page, limit, offset } = parsePagination(paginationQuery);
  const term = `%${search.trim()}%`;

  const countResult = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM patients
      WHERE is_active = TRUE
      AND (
        patient_number ILIKE $1
        OR first_name ILIKE $1
        OR last_name ILIKE $1
        OR phone ILIKE $1
      )
    `,
    [term]
  );

  const total = parseInt(countResult.rows[0].total, 10);

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
        address,
        emergency_contact_name,
        emergency_contact_phone,
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
      LIMIT $2 OFFSET $3
    `,
    [term, limit, offset]
  );

  return {
    patients: result.rows.map(attachAgeToPatient),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getPatients(query = {}) {
  const { page, limit, offset } = parsePagination(query);
  const search = query.search ? query.search.trim() : null;

  let whereClause = "WHERE is_active = TRUE";
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND (patient_number ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }

  const countQuery = `SELECT COUNT(*) AS total FROM patients ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total, 10);

  params.push(limit);
  params.push(offset);

  const listQuery = `
    SELECT
      id,
      patient_number,
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      created_at
    FROM patients
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(listQuery, params);

  return {
    patients: result.rows.map(attachAgeToPatient),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
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

  return result.rows[0] ? attachAgeToPatient(result.rows[0]) : null;
}

async function getPatientMedicalRecord(patientId) {
  const patient = await getPatientById(patientId);
  if (!patient) {
    return null;
  }

  // 1. Appointments
  const appointmentsResult = await pool.query(
    `
    SELECT
      a.*,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.specialty AS doctor_specialty
    FROM appointments a
    JOIN staff s ON a.doctor_id = s.id
    WHERE a.patient_id = $1
    ORDER BY a.appointment_date DESC, a.start_time DESC
    `,
    [patientId]
  );

  // 2. Vitals
  const vitalsResult = await pool.query(
    `
    SELECT
      v.*,
      u.username AS recorded_by_username
    FROM vitals v
    LEFT JOIN users u ON v.recorded_by = u.id
    WHERE v.patient_id = $1
    ORDER BY v.recorded_at DESC
    LIMIT 50
    `,
    [patientId]
  );

  // 3. Encounters with diagnoses
  const encountersResult = await pool.query(
    `
    SELECT
      e.*,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.specialty AS doctor_specialty
    FROM encounters e
    JOIN staff s ON e.doctor_id = s.id
    WHERE e.patient_id = $1
    ORDER BY e.visit_date DESC, e.created_at DESC
    `,
    [patientId]
  );

  const encounterIds = encountersResult.rows.map((e) => e.id);
  let diagnoses = [];
  if (encounterIds.length > 0) {
    const diagnosesResult = await pool.query(
      `
      SELECT *
      FROM diagnoses
      WHERE encounter_id = ANY($1)
      ORDER BY is_primary DESC, created_at ASC
      `,
      [encounterIds]
    );
    diagnoses = diagnosesResult.rows;
  }

  const encountersWithDiagnoses = encountersResult.rows.map((enc) => ({
    ...enc,
    diagnoses: diagnoses.filter((d) => d.encounter_id === enc.id),
  }));

  // 4. Prescriptions
  const prescriptionsResult = await pool.query(
    `
    SELECT
      p.*,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      u.username AS dispensed_by_username
    FROM prescriptions p
    JOIN staff s ON p.doctor_id = s.id
    LEFT JOIN users u ON p.dispensed_by = u.id
    WHERE p.patient_id = $1
    ORDER BY p.created_at DESC
    `,
    [patientId]
  );

  // 5. Lab Orders & Results
  const labOrdersResult = await pool.query(
    `
    SELECT
      o.*,
      t.name AS test_name,
      t.code AS test_code,
      t.category AS test_category,
      t.reference_range AS standard_ref_range,
      t.unit AS test_unit,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      r.result_value,
      r.unit AS result_unit,
      r.reference_range AS result_reference_range,
      r.is_abnormal,
      r.comments AS result_comments,
      r.entered_at AS result_entered_at,
      u_ver.username AS verified_by_username
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    JOIN staff s ON o.doctor_id = s.id
    LEFT JOIN lab_results r ON r.lab_order_id = o.id
    LEFT JOIN users u_ver ON o.verified_by = u_ver.id
    WHERE o.patient_id = $1
    ORDER BY o.created_at DESC
    `,
    [patientId]
  );

  // 6. Invoices & Payments
  const invoicesResult = await pool.query(
    `
    SELECT
      i.*,
      (
        SELECT json_agg(item)
        FROM (
          SELECT * FROM invoice_items WHERE invoice_id = i.id ORDER BY created_at ASC
        ) item
      ) AS items,
      (
        SELECT json_agg(p)
        FROM (
          SELECT p.*, u.username as received_by_username
          FROM payments p
          JOIN users u ON p.received_by = u.id
          WHERE p.invoice_id = i.id
          ORDER BY p.created_at ASC
        ) p
      ) AS payments
    FROM invoices i
    WHERE i.patient_id = $1
    ORDER BY i.created_at DESC
    `,
    [patientId]
  );

  return {
    patient,
    appointments: appointmentsResult.rows,
    vitals: vitalsResult.rows,
    encounters: encountersWithDiagnoses,
    prescriptions: prescriptionsResult.rows,
    labOrders: labOrdersResult.rows,
    invoices: invoicesResult.rows,
  };
}

module.exports = {
  createPatient,
  updatePatient,
  deletePatient,
  searchPatients,
  getPatients,
  getPatientById,
  getPatientMedicalRecord,
  formatPatientAge,
};
