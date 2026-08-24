const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function createEncounter({
  patientId,
  doctorId,
  appointmentId,
  chiefComplaint,
  clinicalNotes,
  treatmentPlan,
  followUpDate,
  diagnoses = [],
  createdBy,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Validate patient and doctor
    const patientCheck = await client.query(
      "SELECT id, patient_number FROM patients WHERE id = $1 AND is_active = TRUE",
      [patientId]
    );
    if (patientCheck.rows.length === 0) {
      throw new Error("PATIENT_NOT_FOUND");
    }

    const doctorCheck = await client.query(
      `
      SELECT s.id
      FROM staff s
      JOIN roles r ON s.role_id = r.id
      WHERE s.id = $1 AND r.name = 'DOCTOR' AND s.is_active = TRUE
      `,
      [doctorId]
    );
    if (doctorCheck.rows.length === 0) {
      throw new Error("DOCTOR_NOT_FOUND");
    }

    // 2. Insert encounter
    const encounterRes = await client.query(
      `
      INSERT INTO encounters (
        patient_id,
        doctor_id,
        appointment_id,
        status,
        chief_complaint,
        clinical_notes,
        treatment_plan,
        follow_up_date,
        created_by
      )
      VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        patientId,
        doctorId,
        appointmentId || null,
        chiefComplaint || null,
        clinicalNotes || null,
        treatmentPlan || null,
        followUpDate || null,
        createdBy || null,
      ]
    );

    const encounter = encounterRes.rows[0];

    // 3. If appointment linked, set appointment status to IN_PROGRESS
    if (appointmentId) {
      await client.query(
        `
        UPDATE appointments
        SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('SCHEDULED', 'CHECKED_IN')
        `,
        [appointmentId]
      );
    }

    // 4. Insert diagnoses
    const savedDiagnoses = [];
    if (Array.isArray(diagnoses) && diagnoses.length > 0) {
      for (const d of diagnoses) {
        if (d.description && d.description.trim()) {
          const diagRes = await client.query(
            `
            INSERT INTO diagnoses (
              encounter_id,
              patient_id,
              doctor_id,
              code,
              description,
              is_primary,
              severity,
              notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            `,
            [
              encounter.id,
              patientId,
              doctorId,
              d.code ? d.code.trim() : null,
              d.description.trim(),
              Boolean(d.isPrimary),
              d.severity || "MODERATE",
              d.notes ? d.notes.trim() : null,
            ]
          );
          savedDiagnoses.push(diagRes.rows[0]);
        }
      }
    }

    // 5. Audit Log
    await recordAuditLog(client, {
      userId: createdBy,
      action: "ENCOUNTER_CREATED",
      entity: "encounters",
      entityId: encounter.id,
      details: {
        patientId,
        doctorId,
        appointmentId,
        diagnosesCount: savedDiagnoses.length,
      },
    });

    await client.query("COMMIT");

    return {
      ...encounter,
      diagnoses: savedDiagnoses,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateEncounter(id, data, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      "SELECT * FROM encounters WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (currentRes.rows.length === 0) {
      throw new Error("ENCOUNTER_NOT_FOUND");
    }

    const current = currentRes.rows[0];
    if (current.status === "COMPLETED") {
      throw new Error("CANNOT_MODIFY_FINALIZED_ENCOUNTER: Completed encounters cannot be modified.");
    }

    const updateRes = await client.query(
      `
      UPDATE encounters
      SET
        chief_complaint = COALESCE($1, chief_complaint),
        clinical_notes = COALESCE($2, clinical_notes),
        treatment_plan = COALESCE($3, treatment_plan),
        follow_up_date = COALESCE($4, follow_up_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
      `,
      [
        data.chiefComplaint !== undefined ? data.chiefComplaint : current.chief_complaint,
        data.clinicalNotes !== undefined ? data.clinicalNotes : current.clinical_notes,
        data.treatmentPlan !== undefined ? data.treatmentPlan : current.treatment_plan,
        data.followUpDate !== undefined ? data.followUpDate : current.follow_up_date,
        id,
      ]
    );

    const encounter = updateRes.rows[0];

    // If diagnoses were provided, replace or append
    if (Array.isArray(data.diagnoses)) {
      await client.query("DELETE FROM diagnoses WHERE encounter_id = $1", [id]);
      for (const d of data.diagnoses) {
        if (d.description && d.description.trim()) {
          await client.query(
            `
            INSERT INTO diagnoses (
              encounter_id,
              patient_id,
              doctor_id,
              code,
              description,
              is_primary,
              severity,
              notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              id,
              encounter.patient_id,
              encounter.doctor_id,
              d.code ? d.code.trim() : null,
              d.description.trim(),
              Boolean(d.isPrimary),
              d.severity || "MODERATE",
              d.notes ? d.notes.trim() : null,
            ]
          );
        }
      }
    }

    await recordAuditLog(client, {
      userId,
      action: "ENCOUNTER_UPDATED",
      entity: "encounters",
      entityId: id,
      details: { encounterId: id },
    });

    await client.query("COMMIT");
    return encounter;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function completeEncounter(id, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      "SELECT * FROM encounters WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (currentRes.rows.length === 0) {
      throw new Error("ENCOUNTER_NOT_FOUND");
    }

    const current = currentRes.rows[0];

    const updateRes = await client.query(
      `
      UPDATE encounters
      SET
        status = 'COMPLETED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    const completed = updateRes.rows[0];

    // If appointment is linked, mark appointment as COMPLETED as well
    if (current.appointment_id) {
      await client.query(
        `
        UPDATE appointments
        SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [current.appointment_id]
      );
    }

    await recordAuditLog(client, {
      userId,
      action: "ENCOUNTER_COMPLETED",
      entity: "encounters",
      entityId: id,
      details: { encounterId: id, appointmentId: current.appointment_id },
    });

    await client.query("COMMIT");
    return completed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getEncounterById(id) {
  const encRes = await pool.query(
    `
    SELECT
      e.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth AS patient_dob,
      p.gender AS patient_gender,
      p.phone AS patient_phone,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.specialty AS doctor_specialty,
      a.appointment_number
    FROM encounters e
    JOIN patients p ON e.patient_id = p.id
    JOIN staff s ON e.doctor_id = s.id
    LEFT JOIN appointments a ON e.appointment_id = a.id
    WHERE e.id = $1
    `,
    [id]
  );

  if (encRes.rows.length === 0) {
    return null;
  }

  const encounter = encRes.rows[0];

  const diagRes = await pool.query(
    `SELECT * FROM diagnoses WHERE encounter_id = $1 ORDER BY is_primary DESC, created_at ASC`,
    [id]
  );

  const rxRes = await pool.query(
    `SELECT * FROM prescriptions WHERE encounter_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  const labRes = await pool.query(
    `
    SELECT
      o.*,
      t.name AS test_name,
      t.code AS test_code,
      t.category AS test_category,
      r.result_value,
      r.unit AS result_unit,
      r.is_abnormal,
      r.comments AS result_comments
    FROM lab_orders o
    JOIN lab_test_catalog t ON o.test_id = t.id
    LEFT JOIN lab_results r ON r.lab_order_id = o.id
    WHERE o.encounter_id = $1
    ORDER BY o.created_at ASC
    `,
    [id]
  );

  const vitalsRes = await pool.query(
    `SELECT * FROM vitals WHERE encounter_id = $1 OR (patient_id = $2 AND appointment_id = $3) ORDER BY recorded_at DESC`,
    [id, encounter.patient_id, encounter.appointment_id]
  );

  return {
    ...encounter,
    diagnoses: diagRes.rows,
    prescriptions: rxRes.rows,
    labOrders: labRes.rows,
    vitals: vitalsRes.rows,
  };
}

async function getDoctorQueue(doctorId, date = null) {
  const queryDate = date || new Date().toISOString().split("T")[0];

  const result = await pool.query(
    `
    SELECT
      a.id AS appointment_id,
      a.appointment_number,
      a.appointment_date,
      a.start_time,
      a.end_time,
      a.status AS appointment_status,
      a.reason,
      p.id AS patient_id,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.date_of_birth,
      p.gender,
      p.phone,
      e.id AS active_encounter_id,
      e.status AS encounter_status,
      (
        SELECT row_to_json(v)
        FROM (
          SELECT * FROM vitals WHERE patient_id = p.id ORDER BY recorded_at DESC LIMIT 1
        ) v
      ) AS latest_vitals
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    LEFT JOIN encounters e ON e.appointment_id = a.id
    WHERE a.doctor_id = $1
      AND a.appointment_date = $2
      AND p.is_active = TRUE
    ORDER BY
      CASE
        WHEN a.status = 'IN_PROGRESS' THEN 1
        WHEN a.status = 'CHECKED_IN' THEN 2
        WHEN a.status = 'SCHEDULED' THEN 3
        ELSE 4
      END,
      a.start_time ASC
    `,
    [doctorId, queryDate]
  );

  return result.rows;
}

module.exports = {
  createEncounter,
  updateEncounter,
  completeEncounter,
  getEncounterById,
  getDoctorQueue,
};
