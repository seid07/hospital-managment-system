const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function createEncounter({
  patientId,
  doctorId,
  appointmentId,
  visitId,
  chiefComplaint,
  historySymptoms,
  examinationFindings,
  clinicalNotes,
  treatmentPlan,
  followUpDate,
  followUpInstructions,
  priority = "ROUTINE",
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

    // Resolve or verify visitId
    let resolvedVisitId = visitId || null;
    if (!resolvedVisitId) {
      const vRes = await client.query(
        `SELECT id FROM visits WHERE patient_id = $1 AND status = 'OPEN' ORDER BY created_at DESC LIMIT 1`,
        [patientId]
      );
      if (vRes.rows.length > 0) {
        resolvedVisitId = vRes.rows[0].id;
      }
    }

    // 2. Insert encounter
    const encounterRes = await client.query(
      `
      INSERT INTO encounters (
        patient_id,
        doctor_id,
        appointment_id,
        visit_id,
        status,
        chief_complaint,
        history_symptoms,
        examination_findings,
        clinical_notes,
        treatment_plan,
        follow_up_date,
        follow_up_instructions,
        priority,
        created_by
      )
      VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
      `,
      [
        patientId,
        doctorId,
        appointmentId || null,
        resolvedVisitId,
        chiefComplaint || null,
        historySymptoms || null,
        examinationFindings || null,
        clinicalNotes || null,
        treatmentPlan || null,
        followUpDate || null,
        followUpInstructions || null,
        priority || "ROUTINE",
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
        visitId: resolvedVisitId,
        priority,
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
        history_symptoms = COALESCE($2, history_symptoms),
        examination_findings = COALESCE($3, examination_findings),
        clinical_notes = COALESCE($4, clinical_notes),
        treatment_plan = COALESCE($5, treatment_plan),
        follow_up_date = COALESCE($6, follow_up_date),
        follow_up_instructions = COALESCE($7, follow_up_instructions),
        priority = COALESCE($8, priority),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
      `,
      [
        data.chiefComplaint !== undefined ? data.chiefComplaint : current.chief_complaint,
        data.historySymptoms !== undefined ? data.historySymptoms : current.history_symptoms,
        data.examinationFindings !== undefined ? data.examinationFindings : current.examination_findings,
        data.clinicalNotes !== undefined ? data.clinicalNotes : current.clinical_notes,
        data.treatmentPlan !== undefined ? data.treatmentPlan : current.treatment_plan,
        data.followUpDate !== undefined ? data.followUpDate : current.follow_up_date,
        data.followUpInstructions !== undefined ? data.followUpInstructions : current.follow_up_instructions,
        data.priority !== undefined ? data.priority : current.priority,
        id,
      ]
    );

    const encounter = updateRes.rows[0];

    // If diagnoses were provided, replace
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
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS patient_age,
      s.first_name AS doctor_first_name,
      s.last_name AS doctor_last_name,
      s.specialty AS doctor_specialty,
      a.appointment_number,
      v.visit_number
    FROM encounters e
    JOIN patients p ON e.patient_id = p.id
    JOIN staff s ON e.doctor_id = s.id
    LEFT JOIN appointments a ON e.appointment_id = a.id
    LEFT JOIN visits v ON e.visit_id = v.id
    WHERE e.id = $1
    `,
    [id]
  );

  if (encRes.rows.length === 0) {
    return null;
  }

  const encounter = encRes.rows[0];

  const [
    diagRes,
    rxRes,
    soRes,
    labRes,
    radRes,
    procRes,
    surgRes,
    admRes,
    vitalsRes,
    histRes,
  ] = await Promise.all([
    // 1. Diagnoses
    pool.query(
      `SELECT * FROM diagnoses WHERE encounter_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [id]
    ),

    // 2. Prescriptions (Medications)
    pool.query(
      `
      SELECT
        pr.*,
        m.unit_price,
        m.stock_quantity AS current_stock,
        u_disp.username AS dispensed_by_username
      FROM prescriptions pr
      LEFT JOIN medications m ON pr.medication_id = m.id
      LEFT JOIN users u_disp ON pr.dispensed_by = u_disp.id
      WHERE pr.encounter_id = $1 OR (pr.patient_id = $2 AND DATE(pr.created_at) = $3)
      ORDER BY pr.created_at DESC
      `,
      [id, encounter.patient_id, encounter.visit_date]
    ),

    // 3. Central Service Orders with 3-pillar statuses
    pool.query(
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
        doc.first_name AS doctor_first_name,
        doc.last_name AS doctor_last_name,
        qe.queue_number,
        qe.status AS queue_status,
        qe.priority AS queue_priority,
        qe.authorized_at AS queue_authorized_at,
        qe.started_at AS queue_started_at,
        qe.completed_at AS queue_completed_at
      FROM service_orders so
      JOIN services s ON so.service_id = s.id
      JOIN departments d ON so.department_id = d.id
      LEFT JOIN staff doc ON so.doctor_id = doc.id
      LEFT JOIN queue_entries qe ON qe.service_order_id = so.id
      WHERE so.encounter_id = $1 OR (so.visit_id IS NOT NULL AND so.visit_id = $2) OR (so.patient_id = $3 AND DATE(so.created_at) = $4)
      ORDER BY so.created_at DESC
      `,
      [id, encounter.visit_id, encounter.patient_id, encounter.visit_date]
    ),

    // 4. Lab Orders & Results
    pool.query(
      `
      SELECT
        lo.*,
        lt.name AS test_name,
        lt.code AS test_code,
        lt.category AS test_category,
        lt.reference_range AS standard_reference_range,
        lt.unit AS standard_unit,
        lt.turnaround_time_hours,
        lr.result_value,
        lr.unit AS result_unit,
        lr.reference_range AS result_reference_range,
        lr.is_abnormal,
        lr.comments AS result_comments,
        lr.entered_at AS result_entered_at,
        u_ent.username AS entered_by_username,
        u_ver.username AS verified_by_username,
        so.status AS service_order_status,
        so.price AS service_order_price,
        so.authorized_at AS service_order_authorized_at
      FROM lab_orders lo
      JOIN lab_test_catalog lt ON lo.test_id = lt.id
      LEFT JOIN service_orders so ON lo.service_order_id = so.id
      LEFT JOIN lab_results lr ON lr.lab_order_id = lo.id
      LEFT JOIN users u_ent ON lr.entered_by = u_ent.id
      LEFT JOIN users u_ver ON lo.verified_by = u_ver.id
      WHERE lo.encounter_id = $1 OR lo.patient_id = $2
      ORDER BY lo.created_at DESC LIMIT 30
      `,
      [id, encounter.patient_id]
    ),

    // 5. Radiology Orders & Reports
    pool.query(
      `
      SELECT
        ro.*,
        s.code AS service_code,
        s.name AS service_name,
        so.status AS service_order_status,
        so.price AS service_order_price,
        so.authorized_at AS service_order_authorized_at,
        u_perf.username AS performed_by_username,
        u_rep.username AS reported_by_username
      FROM radiology_orders ro
      JOIN service_orders so ON ro.service_order_id = so.id
      JOIN services s ON so.service_id = s.id
      LEFT JOIN users u_perf ON ro.performed_by = u_perf.id
      LEFT JOIN users u_rep ON ro.reported_by = u_rep.id
      WHERE ro.patient_id = $1 OR so.encounter_id = $2
      ORDER BY ro.created_at DESC LIMIT 30
      `,
      [encounter.patient_id, id]
    ),

    // 6. Procedures
    pool.query(
      `
      SELECT
        po.*,
        s.code AS service_code,
        s.name AS service_name,
        so.status AS service_order_status,
        so.price AS service_order_price,
        so.authorized_at AS service_order_authorized_at,
        u.username AS performed_by_username
      FROM procedure_orders po
      JOIN service_orders so ON po.service_order_id = so.id
      JOIN services s ON so.service_id = s.id
      LEFT JOIN users u ON po.performed_by = u.id
      WHERE po.patient_id = $1 OR so.encounter_id = $2
      ORDER BY po.created_at DESC LIMIT 30
      `,
      [encounter.patient_id, id]
    ),

    // 7. Surgeries
    pool.query(
      `
      SELECT
        surg.*,
        s.code AS service_code,
        s.name AS service_name,
        so.status AS service_order_status,
        so.price AS service_order_price,
        so.authorized_at AS service_order_authorized_at,
        u.username AS performed_by_username
      FROM surgery_orders surg
      JOIN service_orders so ON surg.service_order_id = so.id
      JOIN services s ON so.service_id = s.id
      LEFT JOIN users u ON surg.performed_by = u.id
      WHERE surg.patient_id = $1 OR so.encounter_id = $2
      ORDER BY surg.created_at DESC LIMIT 20
      `,
      [encounter.patient_id, id]
    ),

    // 8. Inpatient Admissions & Bed Assignments
    pool.query(
      `
      SELECT
        adm.*,
        b.bed_number,
        b.ward_name,
        b.bed_type,
        b.room_number,
        b.daily_rate,
        b.status AS bed_status,
        doc.first_name AS attending_doctor_first_name,
        doc.last_name AS attending_doctor_last_name
      FROM admissions adm
      LEFT JOIN beds b ON adm.bed_id = b.id
      LEFT JOIN staff doc ON adm.doctor_id = doc.id
      WHERE adm.patient_id = $1 OR adm.visit_id = $2
      ORDER BY adm.admission_date DESC LIMIT 10
      `,
      [encounter.patient_id, encounter.visit_id]
    ),

    // 9. Vitals
    pool.query(
      `
      SELECT *
      FROM vitals
      WHERE encounter_id = $1 OR patient_id = $2
      ORDER BY recorded_at DESC LIMIT 15
      `,
      [id, encounter.patient_id]
    ),

    // 10. Patient Past Clinical History
    pool.query(
      `
      SELECT
        e.id,
        e.visit_date,
        e.status,
        e.chief_complaint,
        e.history_symptoms,
        e.examination_findings,
        e.treatment_plan,
        e.priority,
        s.first_name AS doctor_first_name,
        s.last_name AS doctor_last_name,
        (
          SELECT json_agg(d)
          FROM (
            SELECT code, description, is_primary, severity
            FROM diagnoses
            WHERE encounter_id = e.id
            ORDER BY is_primary DESC
          ) d
        ) AS diagnoses
      FROM encounters e
      JOIN staff s ON e.doctor_id = s.id
      WHERE e.patient_id = $1 AND e.id != $2
      ORDER BY e.visit_date DESC, e.created_at DESC LIMIT 10
      `,
      [encounter.patient_id, id]
    ),
  ]);

  // Compute 3-pillar statuses on service orders
  const formattedServiceOrders = soRes.rows.map((so) => {
    let financialStatus = "UNPAID";
    if (so.status === "PAID" || so.status === "COMPLETED" || parseFloat(so.price) === 0 || so.emergency_override) {
      financialStatus = "PAID";
    } else if (so.status === "PARTIALLY_PAID") {
      financialStatus = "PARTIALLY_PAID";
    } else if (so.status === "CANCELLED" || so.status === "REFUNDED") {
      financialStatus = so.status;
    }

    let authStatus = "NOT_AUTHORIZED";
    if (so.authorized_at || ["AUTHORIZED", "PAID", "QUEUED", "IN_PROGRESS", "COMPLETED"].includes(so.status) || so.emergency_override) {
      authStatus = "AUTHORIZED";
    }

    let execStatus = so.status;
    if (so.status === "WAITING_PAYMENT") {
      execStatus = "WAITING_PAYMENT";
    } else if (so.queue_status) {
      execStatus = so.queue_status === "WAITING" ? "QUEUED" : so.queue_status;
    }

    return {
      ...so,
      financial_status: financialStatus,
      authorization_status: authStatus,
      execution_status: execStatus,
    };
  });

  return {
    ...encounter,
    diagnoses: diagRes.rows,
    prescriptions: rxRes.rows,
    serviceOrders: formattedServiceOrders,
    labOrders: labRes.rows,
    radiologyOrders: radRes.rows,
    procedureOrders: procRes.rows,
    surgeryOrders: surgRes.rows,
    admissions: admRes.rows,
    vitals: vitalsRes.rows,
    history: histRes.rows,
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
    WHERE (
      a.doctor_id = $1
      OR a.patient_id IN (SELECT patient_id FROM referrals WHERE receiving_doctor_id = $1 OR referring_doctor_id = $1)
    )
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
