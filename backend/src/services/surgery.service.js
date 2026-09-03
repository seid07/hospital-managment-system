const db = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

async function getSurgeryMetrics() {
  const today = new Date().toISOString().split("T")[0];

  const [
    todayRes,
    schedRes,
    preOpRes,
    anesRes,
    inTheatreRes,
    recoveryRes,
    compRes,
  ] = await Promise.all([
    // 1. Today's surgeries
    db.query(`
      SELECT COUNT(*) as count FROM surgery_orders 
      WHERE DATE(created_at) = $1 OR DATE(scheduled_at) = $1 OR DATE(started_at) = $1
    `, [today]),
    // 2. Scheduled surgeries
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'SCHEDULED'`),
    // 3. Awaiting pre-op checklist
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'SCHEDULED' AND pre_op_checklist_complete = FALSE`),
    // 4. Awaiting anesthesia assessment
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'SCHEDULED' AND (anesthesia_assessment IS NULL OR anesthesia_assessment = '')`),
    // 5. In theatre
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'IN_THEATRE'`),
    // 6. Recovery
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'RECOVERY'`),
    // 7. Completed
    db.query(`SELECT COUNT(*) as count FROM surgery_orders WHERE status = 'COMPLETED'`),
  ]);

  return {
    todaySurgeries: parseInt(todayRes.rows[0]?.count || "0", 10),
    scheduledSurgeries: parseInt(schedRes.rows[0]?.count || "0", 10),
    awaitingPreOp: parseInt(preOpRes.rows[0]?.count || "0", 10),
    awaitingAnesthesia: parseInt(anesRes.rows[0]?.count || "0", 10),
    inTheatre: parseInt(inTheatreRes.rows[0]?.count || "0", 10),
    recovery: parseInt(recoveryRes.rows[0]?.count || "0", 10),
    completed: parseInt(compRes.rows[0]?.count || "0", 10),
  };
}

async function getSurgeryQueue({ status, doctorId } = {}) {
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
      
      surg.id AS surgery_order_id,
      surg.surgery_name,
      surg.theatre_room,
      surg.assistant_name,
      surg.anesthetist_name,
      surg.pre_op_diagnosis,
      surg.post_op_diagnosis,
      surg.pre_op_checklist_complete,
      surg.consent_confirmed,
      surg.allergies_reviewed,
      surg.site_confirmed,
      surg.equipment_confirmed,
      surg.anesthesia_assessment,
      surg.anesthesia_type,
      surg.intra_op_findings,
      surg.specimens,
      surg.complications,
      surg.blood_loss_ml,
      surg.implants_used,
      surg.operation_notes,
      surg.post_op_instructions,
      surg.recovery_destination,
      surg.recovery_status,
      surg.recovery_vitals,
      surg.status AS surgery_status,
      surg.scheduled_at,
      surg.started_at,
      surg.completed_at,
      u.username AS performed_by_username
      
    FROM queue_entries qe
    JOIN departments d ON qe.department_id = d.id
    JOIN service_orders so ON qe.service_order_id = so.id
    JOIN services s ON so.service_id = s.id
    JOIN patients p ON qe.patient_id = p.id
    LEFT JOIN staff doc ON so.doctor_id = doc.id
    LEFT JOIN surgery_orders surg ON surg.service_order_id = so.id
    LEFT JOIN users u ON surg.performed_by = u.id
    WHERE d.code = 'SURGERY' AND p.is_active = TRUE
  `;
  const params = [];

  if (status && status !== "ALL") {
    params.push(status);
    query += ` AND (qe.status = $${params.length} OR surg.status = $${params.length})`;
  } else if (!status) {
    query += ` AND (qe.status IN ('WAITING', 'CALLED', 'IN_PROGRESS') OR surg.status IN ('SCHEDULED', 'IN_THEATRE', 'RECOVERY'))`;
  }

  if (doctorId) {
    params.push(doctorId);
    query += ` AND (
      so.doctor_id = $${params.length}
      OR surg.surgeon_id = $${params.length}
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
    COALESCE(surg.scheduled_at, qe.authorized_at) ASC,
    qe.queued_at ASC`;

  const result = await db.query(query, params);
  return result.rows;
}

async function updateChecklist(serviceOrderId, data, userId) {
  const {
    theatreRoom,
    assistantName,
    anesthetistName,
    anesthesiaAssessment,
    anesthesiaType,
    consentConfirmed,
    allergiesReviewed,
    siteConfirmed,
    equipmentConfirmed,
    preOpChecklistComplete,
    scheduledAt,
  } = data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const soRes = await client.query(`SELECT * FROM service_orders WHERE id = $1`, [serviceOrderId]);
    if (soRes.rowCount === 0) throw new Error("Service order not found.");
    const order = soRes.rows[0];

    const existRes = await client.query(`SELECT id FROM surgery_orders WHERE service_order_id = $1`, [serviceOrderId]);

    let surgOrder;
    if (existRes.rowCount > 0) {
      const up = await client.query(
        `
        UPDATE surgery_orders
        SET
          theatre_room = COALESCE($1, theatre_room),
          assistant_name = COALESCE($2, assistant_name),
          anesthetist_name = COALESCE($3, anesthetist_name),
          anesthesia_assessment = COALESCE($4, anesthesia_assessment),
          anesthesia_type = COALESCE($5, anesthesia_type),
          consent_confirmed = COALESCE($6, consent_confirmed),
          allergies_reviewed = COALESCE($7, allergies_reviewed),
          site_confirmed = COALESCE($8, site_confirmed),
          equipment_confirmed = COALESCE($9, equipment_confirmed),
          pre_op_checklist_complete = COALESCE($10, pre_op_checklist_complete),
          scheduled_at = COALESCE($11, scheduled_at),
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $12
        RETURNING *;
        `,
        [
          theatreRoom,
          assistantName,
          anesthetistName,
          anesthesiaAssessment,
          anesthesiaType,
          consentConfirmed,
          allergiesReviewed,
          siteConfirmed,
          equipmentConfirmed,
          preOpChecklistComplete,
          scheduledAt,
          serviceOrderId,
        ]
      );
      surgOrder = up.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO surgery_orders (
          service_order_id, patient_id, surgeon_id, surgery_name,
          theatre_room, assistant_name, anesthetist_name, anesthesia_assessment,
          anesthesia_type, consent_confirmed, allergies_reviewed, site_confirmed,
          equipment_confirmed, pre_op_checklist_complete, scheduled_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'SCHEDULED')
        RETURNING *;
        `,
        [
          serviceOrderId,
          order.patient_id,
          order.doctor_id,
          order.clinical_notes || "Surgical Procedure",
          theatreRoom || "OT-1",
          assistantName || null,
          anesthetistName || null,
          anesthesiaAssessment || null,
          anesthesiaType || "GENERAL",
          Boolean(consentConfirmed),
          Boolean(allergiesReviewed),
          Boolean(siteConfirmed),
          Boolean(equipmentConfirmed),
          Boolean(preOpChecklistComplete),
          scheduledAt || null,
        ]
      );
      surgOrder = inRes.rows[0];
    }

    await client.query("COMMIT");
    return surgOrder;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function startSurgery(serviceOrderId, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Verify service order payment/authorization
    const soRes = await client.query(`SELECT * FROM service_orders WHERE id = $1`, [serviceOrderId]);
    if (soRes.rowCount === 0) throw new Error("Service order not found.");
    const order = soRes.rows[0];

    if (!["AUTHORIZED", "PAID"].includes(order.status) && !order.emergency_override) {
      throw new Error("PAYMENT_AUTHORIZATION_REQUIRED: Surgery service payment has not been authorized.");
    }

    // Check mandatory safety requirements
    const surgRes = await client.query(`SELECT * FROM surgery_orders WHERE service_order_id = $1`, [serviceOrderId]);
    if (surgRes.rowCount === 0) {
      throw new Error("MANDATORY_SAFETY_CHECKLIST_INCOMPLETE: Pre-operative safety checklist has not been completed.");
    }
    const surg = surgRes.rows[0];

    if (!surg.consent_confirmed || !surg.site_confirmed || !surg.pre_op_checklist_complete) {
      throw new Error(
        "MANDATORY_SAFETY_CHECKLIST_INCOMPLETE: Cannot commence surgery without verified consent, confirmed surgical site, and completed pre-op safety checklist."
      );
    }

    // Update status to IN_THEATRE
    const upSurg = await client.query(
      `UPDATE surgery_orders 
       SET status = 'IN_THEATRE', started_at = CURRENT_TIMESTAMP, performed_by = $1, updated_at = CURRENT_TIMESTAMP
       WHERE service_order_id = $2 RETURNING *`,
      [userId, serviceOrderId]
    );

    await client.query(
      `UPDATE queue_entries 
       SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE service_order_id = $1`,
      [serviceOrderId]
    );

    await client.query(
      `UPDATE service_orders 
       SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [serviceOrderId]
    );

    await recordAuditLog(client, {
      userId,
      action: "SURGERY_COMMENCED_IN_THEATRE",
      entity: "surgery_orders",
      entityId: upSurg.rows[0].id,
      details: { serviceOrderId },
    });

    await client.query("COMMIT");
    return upSurg.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function completeSurgery(serviceOrderId, data, userId) {
  const {
    surgeryName,
    theatreRoom,
    assistantName,
    anesthetistName,
    preOpDiagnosis,
    postOpDiagnosis,
    anesthesiaType,
    intraOpFindings,
    specimens,
    complications,
    bloodLossMl,
    implantsUsed,
    operationNotes,
    postOpInstructions,
    recoveryDestination = "WARD",
    recoveryStatus = "STABLE",
    recoveryVitals,
    status = "COMPLETED",
  } = data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const soRes = await client.query(`SELECT * FROM service_orders WHERE id = $1`, [serviceOrderId]);
    if (soRes.rowCount === 0) throw new Error("Service order not found.");
    const order = soRes.rows[0];

    const existRes = await client.query(`SELECT id FROM surgery_orders WHERE service_order_id = $1`, [serviceOrderId]);

    let surgOrder;
    if (existRes.rowCount > 0) {
      const upRes = await client.query(
        `
        UPDATE surgery_orders
        SET
          surgery_name = COALESCE($1, surgery_name),
          theatre_room = COALESCE($2, theatre_room),
          assistant_name = COALESCE($3, assistant_name),
          anesthetist_name = COALESCE($4, anesthetist_name),
          pre_op_diagnosis = COALESCE($5, pre_op_diagnosis),
          post_op_diagnosis = COALESCE($6, post_op_diagnosis),
          anesthesia_type = COALESCE($7, anesthesia_type),
          intra_op_findings = $8,
          specimens = $9,
          complications = $10,
          blood_loss_ml = COALESCE($11, blood_loss_ml),
          implants_used = $12,
          operation_notes = $13,
          post_op_instructions = $14,
          recovery_destination = $15,
          recovery_status = $16,
          recovery_vitals = $17,
          status = $18,
          performed_by = $19,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE service_order_id = $20
        RETURNING *;
        `,
        [
          surgeryName,
          theatreRoom,
          assistantName,
          anesthetistName,
          preOpDiagnosis,
          postOpDiagnosis,
          anesthesiaType,
          intraOpFindings || null,
          specimens || null,
          complications || null,
          parseInt(bloodLossMl, 10) || 0,
          implantsUsed || null,
          operationNotes || null,
          postOpInstructions || null,
          recoveryDestination,
          recoveryStatus,
          recoveryVitals ? JSON.stringify(recoveryVitals) : null,
          status,
          userId,
          serviceOrderId,
        ]
      );
      surgOrder = upRes.rows[0];
    } else {
      const inRes = await client.query(
        `
        INSERT INTO surgery_orders (
          service_order_id, patient_id, surgeon_id, surgery_name, theatre_room,
          assistant_name, anesthetist_name, pre_op_diagnosis, post_op_diagnosis,
          anesthesia_type, intra_op_findings, specimens, complications, blood_loss_ml,
          implants_used, operation_notes, post_op_instructions, recovery_destination,
          recovery_status, recovery_vitals, status, performed_by, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CURRENT_TIMESTAMP)
        RETURNING *;
        `,
        [
          serviceOrderId,
          order.patient_id,
          order.doctor_id,
          surgeryName || "Surgical Procedure",
          theatreRoom || "OT-1",
          assistantName || null,
          anesthetistName || null,
          preOpDiagnosis || null,
          postOpDiagnosis || null,
          anesthesiaType || "GENERAL",
          intraOpFindings || null,
          specimens || null,
          complications || null,
          parseInt(bloodLossMl, 10) || 0,
          implantsUsed || null,
          operationNotes || null,
          postOpInstructions || null,
          recoveryDestination,
          recoveryStatus,
          recoveryVitals ? JSON.stringify(recoveryVitals) : null,
          status,
          userId,
        ]
      );
      surgOrder = inRes.rows[0];
    }

    if (status === "COMPLETED") {
      await client.query(
        `UPDATE queue_entries SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE service_order_id = $1`,
        [serviceOrderId]
      );
      await client.query(
        `UPDATE service_orders SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [serviceOrderId]
      );
    }

    await recordAuditLog(
      client,
      {
        userId,
        action: `SURGERY_${status}`,
        entity: "surgery_orders",
        entityId: surgOrder.id,
        details: { serviceOrderId, status, recoveryDestination },
      }
    );

    await client.query("COMMIT");
    return surgOrder;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getSurgeryMetrics,
  getSurgeryQueue,
  updateChecklist,
  startSurgery,
  completeSurgery,
};
