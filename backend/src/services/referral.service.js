const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");

/**
 * Create a doctor-to-doctor referral.
 * The referring doctor's staff_id is derived from req.user inside the controller.
 */
async function createReferral({
  patientId,
  referringDoctorId,
  receivingDoctorId,
  urgency,
  symptoms,
  findings,
  diagnosis,
  investigationInfo,
  treatmentProvided,
  caseNote,
}, createdByUserId) {
  if (!receivingDoctorId) throw new Error("RECEIVING_DOCTOR_REQUIRED");
  if (!caseNote || !caseNote.trim()) throw new Error("CASE_NOTE_REQUIRED: Referral reason/case note must not be empty.");
  if (referringDoctorId === receivingDoctorId) throw new Error("SELF_REFERRAL_NOT_ALLOWED");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify patient exists
    const patRes = await client.query(
      "SELECT id, first_name, last_name, patient_number FROM patients WHERE id = $1 AND is_active = TRUE",
      [patientId]
    );
    if (patRes.rows.length === 0) throw new Error("PATIENT_NOT_FOUND");

    let effectiveReferringDoctorId = referringDoctorId;
    if (!effectiveReferringDoctorId && createdByUserId) {
      const uRes = await client.query("SELECT staff_id FROM users WHERE id = $1", [createdByUserId]);
      if (uRes.rows[0]?.staff_id) effectiveReferringDoctorId = uRes.rows[0].staff_id;
    }

    // Verify referring doctor is an active DOCTOR
    const refDocRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name
       FROM staff s JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1 AND s.is_active = TRUE AND UPPER(r.name) IN ('DOCTOR', 'PHYSICIAN', 'SURGEON')`,
      [effectiveReferringDoctorId]
    );
    if (refDocRes.rows.length === 0) throw new Error("REFERRING_DOCTOR_NOT_FOUND");

    // Verify receiving doctor is an active DOCTOR
    const recDocRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name
       FROM staff s JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1 AND s.is_active = TRUE AND UPPER(r.name) IN ('DOCTOR', 'PHYSICIAN', 'SURGEON')`,
      [receivingDoctorId]
    );
    if (recDocRes.rows.length === 0) throw new Error("RECEIVING_DOCTOR_NOT_FOUND");

    const result = await client.query(
      `INSERT INTO referrals (
        patient_id, referring_doctor_id, receiving_doctor_id,
        urgency, symptoms, findings, diagnosis,
        investigation_info, treatment_provided, case_note, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
      RETURNING *`,
      [
        patientId,
        effectiveReferringDoctorId,
        receivingDoctorId,
        urgency || "ROUTINE",
        symptoms || null,
        findings || null,
        diagnosis || null,
        investigationInfo || null,
        treatmentProvided || null,
        caseNote.trim(),
      ]
    );

    const referral = result.rows[0];

    await recordAuditLog(client, {
      userId: createdByUserId,
      action: "REFERRAL_CREATED",
      entity: "referrals",
      entityId: referral.id,
      details: {
        patientId,
        patientNumber: patRes.rows[0].patient_number,
        referringDoctor: `${refDocRes.rows[0].first_name} ${refDocRes.rows[0].last_name}`,
        receivingDoctor: `${recDocRes.rows[0].first_name} ${recDocRes.rows[0].last_name}`,
        urgency: urgency || "ROUTINE",
      },
    });

    await client.query("COMMIT");
    return referral;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get the referral queue for the receiving doctor.
 * Sorted: EMERGENCY first, then URGENT, then ROUTINE; then newest first.
 */
async function getReferralQueue(receivingDoctorId) {
  const result = await pool.query(
    `SELECT
       r.*,
       p.patient_number,
       p.first_name  AS patient_first_name,
       p.last_name   AS patient_last_name,
       p.date_of_birth AS patient_dob,
       p.gender AS patient_gender,
       p.phone  AS patient_phone,
       ref_doc.first_name AS referring_first_name,
       ref_doc.last_name  AS referring_last_name,
       ref_doc.specialty  AS referring_specialty
     FROM referrals r
     JOIN patients p         ON r.patient_id = p.id
     JOIN staff ref_doc      ON r.referring_doctor_id = ref_doc.id
     WHERE r.receiving_doctor_id = $1
     ORDER BY
       CASE r.urgency
         WHEN 'EMERGENCY' THEN 1
         WHEN 'URGENT'    THEN 2
         WHEN 'ROUTINE'   THEN 3
         ELSE 4
       END ASC,
       r.created_at DESC`,
    [receivingDoctorId]
  );
  return result.rows;
}

/**
 * Get a single referral by ID.
 * Authorization: caller must be referring or receiving doctor (or ADMIN, handled by route).
 */
async function getReferralById(referralId, callerStaffId, callerRole) {
  const result = await pool.query(
    `SELECT
       r.*,
       p.patient_number,
       p.first_name  AS patient_first_name,
       p.last_name   AS patient_last_name,
       p.date_of_birth AS patient_dob,
       p.gender      AS patient_gender,
       p.phone       AS patient_phone,
       p.address     AS patient_address,
       ref_doc.first_name AS referring_first_name,
       ref_doc.last_name  AS referring_last_name,
       ref_doc.specialty  AS referring_specialty,
       ref_doc.department AS referring_department,
       rec_doc.first_name AS receiving_first_name,
       rec_doc.last_name  AS receiving_last_name,
       rec_doc.specialty  AS receiving_specialty
     FROM referrals r
     JOIN patients p         ON r.patient_id = p.id
     JOIN staff ref_doc      ON r.referring_doctor_id = ref_doc.id
     JOIN staff rec_doc      ON r.receiving_doctor_id = rec_doc.id
     WHERE r.id = $1`,
    [referralId]
  );

  if (result.rows.length === 0) throw new Error("REFERRAL_NOT_FOUND");

  const referral = result.rows[0];
  const normalizedRole = callerRole ? callerRole.toUpperCase() : "";

  if (normalizedRole !== "ADMIN") {
    const isParticipant =
      referral.referring_doctor_id === callerStaffId ||
      referral.receiving_doctor_id === callerStaffId;
    if (!isParticipant) throw new Error("REFERRAL_ACCESS_DENIED");
  }

  return referral;
}

/**
 * Mark referral as VIEWED (PENDING → VIEWED).
 * Only the receiving doctor can view a referral.
 */
async function openReferral(referralId, callerStaffId, callerUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      "SELECT * FROM referrals WHERE id = $1 FOR UPDATE",
      [referralId]
    );
    if (res.rows.length === 0) throw new Error("REFERRAL_NOT_FOUND");

    const referral = res.rows[0];

    if (referral.receiving_doctor_id !== callerStaffId) {
      throw new Error("REFERRAL_ACCESS_DENIED: Only the receiving doctor can mark this referral as viewed.");
    }

    if (referral.status !== "PENDING") {
      // Already viewed or responded — return current state without error
      await client.query("ROLLBACK");
      return referral;
    }

    const updated = await client.query(
      `UPDATE referrals
       SET status = 'VIEWED', viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [referralId]
    );

    await recordAuditLog(client, {
      userId: callerUserId,
      action: "REFERRAL_VIEWED",
      entity: "referrals",
      entityId: referralId,
      details: { patientId: referral.patient_id },
    });

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Submit a response to a referral (VIEWED → RESPONDED).
 * Only the receiving doctor can respond.
 */
async function respondToReferral(referralId, responseData, callerStaffId, callerUserId) {
  const { assessment, recommendation, nextStep, treatmentRecommendation, followupRecommendation } = responseData;
  if (!assessment || !assessment.trim()) throw new Error("RESPONSE_ASSESSMENT_REQUIRED");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      "SELECT * FROM referrals WHERE id = $1 FOR UPDATE",
      [referralId]
    );
    if (res.rows.length === 0) throw new Error("REFERRAL_NOT_FOUND");

    const referral = res.rows[0];

    if (referral.receiving_doctor_id !== callerStaffId) {
      throw new Error("REFERRAL_ACCESS_DENIED: Only the receiving doctor can respond.");
    }
    if (referral.status === "PENDING") {
      throw new Error("REFERRAL_NOT_VIEWED: Open the referral first before responding.");
    }
    if (referral.status === "RESPONDED") {
      throw new Error("REFERRAL_ALREADY_RESPONDED: This referral has already been responded to.");
    }

    const updated = await client.query(
      `UPDATE referrals SET
         status = 'RESPONDED',
         response_assessment     = $1,
         response_recommendation = $2,
         response_next_step      = $3,
         response_treatment      = $4,
         response_followup       = $5,
         responded_at = CURRENT_TIMESTAMP,
         updated_at   = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *`,
      [
        assessment.trim(),
        recommendation ? recommendation.trim() : null,
        nextStep ? nextStep.trim() : null,
        treatmentRecommendation ? treatmentRecommendation.trim() : null,
        followupRecommendation ? followupRecommendation.trim() : null,
        referralId,
      ]
    );

    await recordAuditLog(client, {
      userId: callerUserId,
      action: "REFERRAL_RESPONDED",
      entity: "referrals",
      entityId: referralId,
      details: { patientId: referral.patient_id },
    });

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get messages for a referral thread.
 * Only participants (referring or receiving doctor) can access.
 */
async function getReferralMessages(referralId, callerStaffId, callerRole) {
  // Authorization check
  const refRes = await pool.query(
    "SELECT referring_doctor_id, receiving_doctor_id FROM referrals WHERE id = $1",
    [referralId]
  );
  if (refRes.rows.length === 0) throw new Error("REFERRAL_NOT_FOUND");

  const ref = refRes.rows[0];
  const normalizedRole = callerRole ? callerRole.toUpperCase() : "";

  if (normalizedRole !== "ADMIN") {
    const isParticipant =
      ref.referring_doctor_id === callerStaffId ||
      ref.receiving_doctor_id === callerStaffId;
    if (!isParticipant) throw new Error("REFERRAL_ACCESS_DENIED");
  }

  const result = await pool.query(
    `SELECT
       rm.*,
       s.first_name AS sender_first_name,
       s.last_name  AS sender_last_name,
       r.name       AS sender_role
     FROM referral_messages rm
     JOIN staff s ON rm.sender_id = s.id
     JOIN roles r ON s.role_id = r.id
     WHERE rm.referral_id = $1
     ORDER BY rm.created_at ASC`,
    [referralId]
  );
  return result.rows;
}

/**
 * Send a message in the referral thread.
 * Only participants can send messages.
 */
async function sendReferralMessage(referralId, message, callerStaffId, callerUserId, callerRole) {
  if (!message || !message.trim()) throw new Error("MESSAGE_REQUIRED");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const refRes = await client.query(
      "SELECT referring_doctor_id, receiving_doctor_id, patient_id FROM referrals WHERE id = $1",
      [referralId]
    );
    if (refRes.rows.length === 0) throw new Error("REFERRAL_NOT_FOUND");

    const ref = refRes.rows[0];
    const normalizedRole = callerRole ? callerRole.toUpperCase() : "";

    if (normalizedRole !== "ADMIN") {
      const isParticipant =
        ref.referring_doctor_id === callerStaffId ||
        ref.receiving_doctor_id === callerStaffId;
      if (!isParticipant) throw new Error("REFERRAL_ACCESS_DENIED");
    }

    const result = await client.query(
      `INSERT INTO referral_messages (referral_id, sender_id, message)
       VALUES ($1, $2, $3) RETURNING *`,
      [referralId, callerStaffId, message.trim()]
    );

    const msg = result.rows[0];

    // Fetch sender info for response
    const senderRes = await client.query(
      `SELECT s.first_name AS sender_first_name, s.last_name AS sender_last_name, r.name AS sender_role
       FROM staff s JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1`,
      [callerStaffId]
    );

    if (senderRes.rows.length > 0) {
      msg.sender_first_name = senderRes.rows[0].sender_first_name;
      msg.sender_last_name = senderRes.rows[0].sender_last_name;
      msg.sender_role = senderRes.rows[0].sender_role;
    }

    await recordAuditLog(client, {
      userId: callerUserId,
      action: "REFERRAL_MESSAGE_SENT",
      entity: "referral_messages",
      entityId: msg.id,
      details: { referralId, patientId: ref.patient_id },
    });

    await client.query("COMMIT");
    return msg;

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all referrals for a patient (history view).
 */
async function getPatientReferrals(patientId) {
  const result = await pool.query(
    `SELECT
       r.*,
       ref_doc.first_name AS referring_first_name,
       ref_doc.last_name  AS referring_last_name,
       ref_doc.specialty  AS referring_specialty,
       rec_doc.first_name AS receiving_first_name,
       rec_doc.last_name  AS receiving_last_name,
       rec_doc.specialty  AS receiving_specialty
     FROM referrals r
     JOIN staff ref_doc ON r.referring_doctor_id = ref_doc.id
     JOIN staff rec_doc ON r.receiving_doctor_id = rec_doc.id
     WHERE r.patient_id = $1
     ORDER BY r.created_at DESC`,
    [patientId]
  );
  return result.rows;
}

/**
 * Get all referrals sent by this doctor (Outbox).
 */
async function getSentReferrals(referringDoctorId) {
  const result = await pool.query(
    `SELECT
       r.*,
       p.patient_number,
       p.first_name  AS patient_first_name,
       p.last_name   AS patient_last_name,
       p.date_of_birth AS patient_dob,
       p.gender AS patient_gender,
       p.phone  AS patient_phone,
       rec_doc.first_name AS receiving_first_name,
       rec_doc.last_name  AS receiving_last_name,
       rec_doc.specialty  AS receiving_specialty,
       rec_doc.department AS receiving_department
     FROM referrals r
     JOIN patients p         ON r.patient_id = p.id
     JOIN staff rec_doc      ON r.receiving_doctor_id = rec_doc.id
     WHERE r.referring_doctor_id = $1
     ORDER BY r.created_at DESC`,
    [referringDoctorId]
  );
  return result.rows;
}

module.exports = {
  createReferral,
  getReferralQueue,
  getSentReferrals,
  getReferralById,
  openReferral,
  respondToReferral,
  getReferralMessages,
  sendReferralMessage,
  getPatientReferrals,
};
