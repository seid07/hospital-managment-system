const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

/**
 * Get Nursing Dashboard KPIs for the 7 Cards
 */
async function getNursingMetrics() {
  const today = new Date().toISOString().split("T")[0];

  const [
    underCareRes,
    newAdmRes,
    pendingTasksRes,
    vitalsDueRes,
    medsDueRes,
    criticalRes,
  ] = await Promise.all([
    // 1. Patients currently under care (Active admissions + WAITING/IN_PROGRESS triage/procedure)
    db.query(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM patients p
      LEFT JOIN admissions adm ON adm.patient_id = p.id AND adm.status = 'ADMITTED'
      LEFT JOIN queue_entries qe ON qe.patient_id = p.id AND qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS')
      WHERE p.is_active = TRUE AND (adm.id IS NOT NULL OR qe.id IS NOT NULL)
    `),
    // 2. New admissions today
    db.query(`
      SELECT COUNT(*) as count
      FROM admissions
      WHERE status = 'ADMITTED' AND DATE(admission_date) = $1
    `, [today]),
    // 3. Pending nursing tasks
    db.query(`
      SELECT COUNT(*) as count 
      FROM nursing_tasks 
      WHERE status IN ('PENDING', 'IN_PROGRESS')
    `),
    // 4. Vital signs due today
    db.query(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM patients p
      JOIN admissions adm ON adm.patient_id = p.id AND adm.status = 'ADMITTED'
      WHERE p.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM vitals v 
          WHERE v.patient_id = p.id 
            AND DATE(v.recorded_at) = $1
        )
    `, [today]),
    // 5. Medication tasks due today
    db.query(`
      SELECT COUNT(DISTINCT pr.id) as count
      FROM prescriptions pr
      JOIN patients p ON pr.patient_id = p.id
      WHERE pr.status IN ('ACTIVE', 'DISPENSED')
    `),
    // 6. Critical alerts / requiring attention (High fever, low SpO2, high BP, or emergency queue)
    db.query(`
      SELECT COUNT(DISTINCT v.patient_id) as count
      FROM vitals v
      WHERE (
        v.temperature_celsius >= 38.5 OR v.temperature_celsius <= 35.0
        OR v.oxygen_saturation <= 92
        OR v.pain_score >= 7
        OR split_part(v.blood_pressure, '/', 1)::numeric >= 160
        OR split_part(v.blood_pressure, '/', 1)::numeric <= 90
      ) AND v.recorded_at >= NOW() - INTERVAL '24 hours'
    `),
  ]);

  const underCare = parseInt(underCareRes.rows[0]?.count || "0", 10);
  const newAdmissions = parseInt(newAdmRes.rows[0]?.count || "0", 10);
  const pendingTasks = parseInt(pendingTasksRes.rows[0]?.count || "0", 10);
  const vitalsDue = parseInt(vitalsDueRes.rows[0]?.count || "0", 10);
  const medsDue = parseInt(medsDueRes.rows[0]?.count || "0", 10);
  const criticalCount = parseInt(criticalRes.rows[0]?.count || "0", 10);

  return {
    patientsUnderCare: underCare,
    newAdmissions,
    requiringAttention: criticalCount,
    medicationTasksDue: medsDue,
    vitalSignsDue: vitalsDue,
    pendingNursingTasks: pendingTasks,
    criticalAlerts: criticalCount,
  };
}

/**
 * Get Patients Under Nursing Care with Card-Specific Filtering
 */
async function getNursingPatients({ filter = "ALL", search } = {}) {
  const today = new Date().toISOString().split("T")[0];

  let query = `
    SELECT DISTINCT
      p.id AS patient_id,
      p.patient_number,
      p.first_name,
      p.last_name,
      p.date_of_birth,
      p.gender,
      p.phone,
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
      
      -- Location & Bed
      b.bed_number,
      b.ward_name,
      adm.id AS admission_id,
      adm.admission_number,
      adm.status AS admission_status,
      adm.admission_date,
      adm.admission_reason,
      
      -- Attending Doctor
      doc.first_name AS doctor_first_name,
      doc.last_name AS doctor_last_name,
      
      -- Queue info
      qe.queue_number,
      qe.priority AS queue_priority,
      qe.status AS queue_status,
      d.name AS current_department,
      
      -- Recent vitals
      latest_v.id AS latest_vital_id,
      latest_v.recorded_at AS latest_vital_time,
      latest_v.blood_pressure,
      latest_v.temperature_celsius,
      latest_v.pulse_rate_bpm,
      latest_v.oxygen_saturation,
      latest_v.pain_score,
      
      -- Pending task count
      COALESCE(task_counts.task_count, 0)::int AS pending_task_count,
      -- Active prescription count
      COALESCE(rx_counts.rx_count, 0)::int AS active_rx_count
      
    FROM patients p
    LEFT JOIN admissions adm ON adm.patient_id = p.id AND adm.status = 'ADMITTED'
    LEFT JOIN beds b ON adm.bed_id = b.id
    LEFT JOIN staff doc ON adm.doctor_id = doc.id
    LEFT JOIN queue_entries qe ON qe.patient_id = p.id AND qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS')
    LEFT JOIN departments d ON qe.department_id = d.id
    LEFT JOIN LATERAL (
      SELECT * FROM vitals WHERE patient_id = p.id ORDER BY recorded_at DESC LIMIT 1
    ) latest_v ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as task_count FROM nursing_tasks WHERE patient_id = p.id AND status IN ('PENDING', 'IN_PROGRESS')
    ) task_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as rx_count FROM prescriptions WHERE patient_id = p.id AND status IN ('ACTIVE', 'DISPENSED')
    ) rx_counts ON TRUE
    WHERE p.is_active = TRUE
      AND (adm.id IS NOT NULL OR qe.id IS NOT NULL)
  `;
  const params = [];

  if (search) {
    params.push(`%${search.trim()}%`);
    query += ` AND (
      p.patient_number ILIKE $${params.length}
      OR p.first_name ILIKE $${params.length}
      OR p.last_name ILIKE $${params.length}
      OR p.phone ILIKE $${params.length}
    )`;
  }

  // Filter conditions matching the dashboard cards
  if (filter === "NEW_ADMISSIONS") {
    params.push(today);
    query += ` AND adm.status = 'ADMITTED' AND DATE(adm.admission_date) = $${params.length}`;
  } else if (filter === "ATTENTION" || filter === "CRITICAL") {
    query += ` AND (
      latest_v.temperature_celsius >= 38.5 OR latest_v.temperature_celsius <= 35.0
      OR latest_v.oxygen_saturation <= 92
      OR latest_v.pain_score >= 7
      OR qe.priority IN ('EMERGENCY', 'URGENT')
    )`;
  } else if (filter === "VITALS_DUE") {
    params.push(today);
    query += ` AND (latest_v.recorded_at IS NULL OR DATE(latest_v.recorded_at) != $${params.length})`;
  } else if (filter === "MEDS_DUE") {
    query += ` AND COALESCE(rx_counts.rx_count, 0) > 0`;
  } else if (filter === "PENDING_TASKS") {
    query += ` AND COALESCE(task_counts.task_count, 0) > 0`;
  }

  query += ` ORDER BY 
    CASE 
      WHEN latest_v.pain_score >= 7 OR latest_v.oxygen_saturation <= 92 THEN 1
      WHEN qe.priority = 'EMERGENCY' THEN 2
      WHEN qe.priority = 'URGENT' THEN 3
      ELSE 4
    END ASC,
    adm.admission_date DESC NULLS LAST,
    p.created_at DESC LIMIT 60`;

  const res = await db.query(query, params);
  return res.rows;
}

/**
 * Get Comprehensive Patient Nursing Clinical Overview (Snapshot)
 */
async function getPatientNursingOverview(patientId) {
  const [
    patientRes,
    admissionRes,
    diagnosesRes,
    vitalsRes,
    medsRes,
    tasksRes,
    notesRes,
  ] = await Promise.all([
    // Patient Details
    db.query(`
      SELECT 
        p.*,
        EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age
      FROM patients p 
      WHERE p.id = $1 AND p.is_active = TRUE
    `, [patientId]),
    // Current Active Admission & Bed
    db.query(`
      SELECT 
        adm.*,
        b.bed_number,
        b.ward_name,
        b.bed_type,
        doc.first_name AS doctor_first_name,
        doc.last_name AS doctor_last_name
      FROM admissions adm
      LEFT JOIN beds b ON adm.bed_id = b.id
      LEFT JOIN staff doc ON adm.doctor_id = doc.id
      WHERE adm.patient_id = $1 AND adm.status = 'ADMITTED'
      ORDER BY adm.admission_date DESC LIMIT 1
    `, [patientId]),
    // Diagnoses & Encounters
    db.query(`
      SELECT d.*, e.created_at as encounter_date
      FROM diagnoses d
      JOIN encounters e ON d.encounter_id = e.id
      WHERE e.patient_id = $1
      ORDER BY e.created_at DESC LIMIT 10
    `, [patientId]),
    // Historical Vitals Timeline
    db.query(`
      SELECT 
        v.*,
        s.first_name AS recorded_by_first_name,
        s.last_name AS recorded_by_last_name
      FROM vitals v
      LEFT JOIN staff s ON v.recorded_by_staff_id = s.id
      WHERE v.patient_id = $1
      ORDER BY v.recorded_at DESC LIMIT 20
    `, [patientId]),
    // Active Doctor Prescriptions
    db.query(`
      SELECT 
        pr.*,
        doc.first_name AS doctor_first_name,
        doc.last_name AS doctor_last_name
      FROM prescriptions pr
      LEFT JOIN staff doc ON pr.doctor_id = doc.id
      WHERE pr.patient_id = $1 AND pr.status IN ('ACTIVE', 'DISPENSED', 'PAID')
      ORDER BY pr.created_at DESC
    `, [patientId]),
    // Nursing Tasks
    db.query(`
      SELECT 
        nt.*,
        s.first_name AS nurse_first_name,
        s.last_name AS nurse_last_name
      FROM nursing_tasks nt
      LEFT JOIN staff s ON nt.assigned_nurse_id = s.id
      WHERE nt.patient_id = $1
      ORDER BY nt.created_at DESC
    `, [patientId]),
    // Nursing Notes
    db.query(`
      SELECT 
        nn.*,
        s.first_name AS nurse_first_name,
        s.last_name AS nurse_last_name,
        u.username AS created_by_username
      FROM nursing_notes nn
      LEFT JOIN staff s ON nn.nurse_id = s.id
      LEFT JOIN users u ON nn.created_by = u.id
      WHERE nn.patient_id = $1
      ORDER BY nn.created_at DESC
    `, [patientId]),
  ]);

  if (patientRes.rows.length === 0) {
    throw new Error("Patient not found.");
  }

  return {
    patient: patientRes.rows[0],
    admission: admissionRes.rows[0] || null,
    diagnoses: diagnosesRes.rows,
    vitalsTimeline: vitalsRes.rows,
    prescriptions: medsRes.rows,
    tasks: tasksRes.rows,
    notes: notesRes.rows,
  };
}

/**
 * Nursing Tasks Management
 */
async function getNursingTasks(patientId) {
  const query = `
    SELECT 
      nt.*,
      p.patient_number,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      s.first_name AS nurse_first_name,
      s.last_name AS nurse_last_name,
      u.username AS created_by_username
    FROM nursing_tasks nt
    JOIN patients p ON nt.patient_id = p.id
    LEFT JOIN staff s ON nt.assigned_nurse_id = s.id
    LEFT JOIN users u ON nt.created_by = u.id
    ${patientId ? "WHERE nt.patient_id = $1" : ""}
    ORDER BY 
      CASE nt.priority WHEN 'EMERGENCY' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,
      nt.due_time ASC NULLS LAST,
      nt.created_at DESC
  `;
  const params = patientId ? [patientId] : [];
  const res = await db.query(query, params);
  return res.rows;
}

async function createNursingTask(data, userId) {
  const { patientId, encounterId, visitId, taskType, priority, dueTime, assignedNurseId, notes } = data;
  if (!patientId || !taskType) {
    throw new Error("Patient ID and Task Type are required.");
  }

  const res = await db.query(
    `
    INSERT INTO nursing_tasks (
      patient_id, encounter_id, visit_id, task_type,
      priority, due_time, assigned_nurse_id, notes, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
    `,
    [
      patientId,
      encounterId || null,
      visitId || null,
      taskType,
      priority || "ROUTINE",
      dueTime || null,
      assignedNurseId || null,
      notes || null,
      userId,
    ]
  );
  return res.rows[0];
}

async function updateNursingTaskStatus(taskId, status, notes, userId) {
  const completedAt = status === "COMPLETED" ? new Date() : null;
  const res = await db.query(
    `
    UPDATE nursing_tasks
    SET 
      status = $1,
      completed_at = COALESCE($2, completed_at),
      completed_by = CASE WHEN $1 = 'COMPLETED' THEN $3 ELSE completed_by END,
      notes = COALESCE($4, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *;
    `,
    [status, completedAt, userId, notes || null, taskId]
  );
  if (res.rowCount === 0) {
    throw new Error("Nursing task not found.");
  }
  return res.rows[0];
}

/**
 * Medication Administration Record (MAR)
 */
async function getMedicationAdministrations(patientId) {
  const res = await db.query(
    `
    SELECT 
      ma.*,
      p.patient_number,
      u.username AS administered_by_user,
      s.first_name AS nurse_first_name,
      s.last_name AS nurse_last_name
    FROM medication_administrations ma
    JOIN patients p ON ma.patient_id = p.id
    LEFT JOIN users u ON ma.administered_by = u.id
    LEFT JOIN staff s ON ma.nurse_staff_id = s.id
    WHERE ma.patient_id = $1
    ORDER BY ma.administered_at DESC;
    `,
    [patientId]
  );
  return res.rows;
}

async function recordMedicationAdministration(data, userId) {
  const { prescriptionId, patientId, encounterId, medicationName, dose, route, status, reasonNotAdministered, notes, nurseStaffId } = data;
  if (!patientId || !medicationName || !dose) {
    throw new Error("Patient ID, medication name, and dose are required.");
  }

  const res = await db.query(
    `
    INSERT INTO medication_administrations (
      prescription_id, patient_id, encounter_id, medication_name,
      dose, route, status, administered_at, administered_by,
      nurse_staff_id, reason_not_administered, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9, $10, $11)
    RETURNING *;
    `,
    [
      prescriptionId || null,
      patientId,
      encounterId || null,
      medicationName,
      dose,
      route || "Oral",
      status || "GIVEN",
      userId,
      nurseStaffId || null,
      reasonNotAdministered || null,
      notes || null,
    ]
  );

  return res.rows[0];
}

/**
 * Clinical Nursing Notes
 */
async function getNursingNotes(patientId) {
  const res = await db.query(
    `
    SELECT 
      nn.*,
      s.first_name AS nurse_first_name,
      s.last_name AS nurse_last_name,
      u.username AS created_by_username
    FROM nursing_notes nn
    LEFT JOIN staff s ON nn.nurse_id = s.id
    LEFT JOIN users u ON nn.created_by = u.id
    WHERE nn.patient_id = $1
    ORDER BY nn.created_at DESC;
    `,
    [patientId]
  );
  return res.rows;
}

async function createNursingNote(data, userId) {
  const { patientId, encounterId, visitId, nurseId, category, note } = data;
  if (!patientId || !note) {
    throw new Error("Patient ID and note text are required.");
  }

  const res = await db.query(
    `
    INSERT INTO nursing_notes (
      patient_id, encounter_id, visit_id, nurse_id, category, note, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
    `,
    [
      patientId,
      encounterId || null,
      visitId || null,
      nurseId || null,
      category || "GENERAL",
      note,
      userId,
    ]
  );
  return res.rows[0];
}

/**
 * Escalate Clinical Concern to Attending Doctor
 */
async function escalateToDoctor({ patientId, doctorId, urgency = "URGENT", reason, clinicalNotes }, userId) {
  if (!patientId || !reason) {
    throw new Error("Patient ID and Reason are required for doctor escalation.");
  }

  // Find attending doctor if not specified
  let targetDoctorId = doctorId;
  if (!targetDoctorId) {
    const admDoc = await db.query(
      `SELECT doctor_id FROM admissions WHERE patient_id = $1 AND status = 'ADMITTED' LIMIT 1`,
      [patientId]
    );
    targetDoctorId = admDoc.rows[0]?.doctor_id;
  }

  // Create nursing task with high priority
  const task = await createNursingTask(
    {
      patientId,
      taskType: "OBSERVATION",
      priority: urgency === "EMERGENCY" ? "EMERGENCY" : "URGENT",
      notes: `[ESCALATED TO DOCTOR] ${reason}. Notes: ${clinicalNotes || "None"}`,
    },
    userId
  );

  // Post clinical nursing note
  await createNursingNote(
    {
      patientId,
      category: "INCIDENT",
      note: `🚨 DOCTOR ESCALATION (${urgency}): ${reason}. ${clinicalNotes || ""}`,
    },
    userId
  );

  await recordAuditLog(db, {
    userId,
    action: "NURSING_DOCTOR_ESCALATION",
    entity: "patients",
    entityId: patientId,
    details: { targetDoctorId, urgency, reason },
  });

  return { success: true, taskId: task.id, message: "Doctor notified and escalation logged." };
}

module.exports = {
  getNursingMetrics,
  getNursingPatients,
  getPatientNursingOverview,
  getNursingTasks,
  createNursingTask,
  updateNursingTaskStatus,
  getMedicationAdministrations,
  recordMedicationAdministration,
  getNursingNotes,
  createNursingNote,
  escalateToDoctor,
};
