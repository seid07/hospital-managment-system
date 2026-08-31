const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength, validateEthiopianPhone, normalizeEthiopianPhone, validateEmail } = require("../validators");
const emailService = require("./email.service");

async function getRoles() {
  const result = await pool.query(`
    SELECT id, name, description
    FROM roles
    ORDER BY name
  `);

  return result.rows;
}

/**
 * Check email format, duplicate status, and real ownership verification status.
 */
async function checkEmailAvailability(email, excludeStaffId = null) {
  if (!email || typeof email !== "string") {
    return {
      available: false,
      verified: false,
      reason: "INVALID_FORMAT",
      message: "Please enter an email address.",
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    return {
      available: false,
      verified: false,
      reason: "INVALID_FORMAT",
      message: "Invalid email format. E.g. name@hospital.local",
    };
  }

  let query = "SELECT id FROM staff WHERE LOWER(email) = $1";
  const params = [cleanEmail];

  if (excludeStaffId) {
    query += " AND id != $2";
    params.push(excludeStaffId);
  }

  const result = await pool.query(query, params);

  if (result.rows.length > 0) {
    return {
      available: false,
      verified: false,
      reason: "DUPLICATE",
      message: "Email already registered in system.",
    };
  }

  // Check verification status in staff_email_verifications
  const verRes = await pool.query(
    "SELECT verified, verified_at FROM staff_email_verifications WHERE LOWER(email) = $1 AND verified = TRUE",
    [cleanEmail]
  );

  const isVerified = verRes.rows.length > 0;

  return {
    available: true,
    verified: isVerified,
    verifiedAt: isVerified ? verRes.rows[0].verified_at : null,
    message: isVerified ? "Email verified and available ✓" : "Email available. Verification required.",
  };
}

/**
 * Send one-time secure email verification link to mailbox owner.
 */
async function sendStaffEmailVerification(email, requestedByUserId) {
  if (!email || typeof email !== "string") {
    throw new Error("INVALID_EMAIL_FORMAT: Please provide a valid email address.");
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    throw new Error("INVALID_EMAIL_FORMAT: Invalid email format. E.g. name@hospital.local");
  }

  // Check if email already belongs to an existing staff member
  const existingStaff = await pool.query(
    "SELECT id FROM staff WHERE LOWER(email) = $1",
    [cleanEmail]
  );
  if (existingStaff.rows.length > 0) {
    throw new Error("DUPLICATE_EMAIL: This email address is already registered to a staff account.");
  }

  // Check 60-second rate-limiting cooldown
  const now = new Date();
  const existingVer = await pool.query(
    "SELECT last_sent_at, verified FROM staff_email_verifications WHERE LOWER(email) = $1",
    [cleanEmail]
  );

  if (existingVer.rows.length > 0 && existingVer.rows[0].last_sent_at) {
    const lastSent = new Date(existingVer.rows[0].last_sent_at);
    const diffSeconds = Math.floor((now.getTime() - lastSent.getTime()) / 1000);
    if (diffSeconds < 60) {
      const waitSeconds = 60 - diffSeconds;
      throw new Error(`COOLDOWN_ACTIVE: Please wait ${waitSeconds} second${waitSeconds === 1 ? "" : "s"} before requesting a new verification link.`);
    }
  }

  // Generate cryptographically secure random 32-byte hex token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await pool.query(
    `INSERT INTO staff_email_verifications (
      email,
      token_hash,
      expires_at,
      verified,
      verified_at,
      last_sent_at,
      updated_at
    )
    VALUES ($1, $2, $3, FALSE, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (email) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        verified = FALSE,
        verified_at = NULL,
        last_sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`,
    [cleanEmail, tokenHash, expiresAt]
  );

  // Send verification link via email service
  const emailRes = await emailService.sendEmailVerificationEmail({
    to: cleanEmail,
    token: rawToken,
    expiresInMinutes: 30,
  });

  if (requestedByUserId) {
    await recordAuditLog(pool, {
      userId: requestedByUserId,
      action: "STAFF_EMAIL_VERIFICATION_SENT",
      entity: "staff_email_verifications",
      entityId: null,
      details: { email: cleanEmail, delivered: emailRes.sent },
    });
  }

  return {
    success: true,
    message: "A secure verification link has been sent to the email address. The recipient must click the link to verify ownership.",
    email: cleanEmail,
    expiresInMinutes: 30,
    cooldownSeconds: 60,
    delivered: emailRes.sent,
  };
}

/**
 * Verify staff email ownership using one-time token from verification link.
 */
async function verifyStaffEmailToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    throw new Error("INVALID_TOKEN: Invalid or missing verification link.");
  }

  const cleanToken = rawToken.trim();
  const tokenHash = crypto.createHash("sha256").update(cleanToken).digest("hex");

  const verRes = await pool.query(
    `SELECT id, email, token_hash, expires_at, verified, verified_at
     FROM staff_email_verifications
     WHERE token_hash = $1`,
    [tokenHash]
  );

  if (verRes.rows.length === 0) {
    throw new Error("INVALID_TOKEN: This verification link is invalid or has already been used.");
  }

  const verRecord = verRes.rows[0];

  // Check expiration
  if (verRecord.expires_at && new Date(verRecord.expires_at) < new Date()) {
    throw new Error("TOKEN_EXPIRED: This verification link has expired. Please request a new verification email.");
  }

  if (verRecord.verified) {
    return {
      success: true,
      alreadyVerified: true,
      email: verRecord.email,
      message: "Email has already been verified.",
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mark verified and invalidate single-use token
    await client.query(
      `UPDATE staff_email_verifications
       SET verified = TRUE,
           verified_at = CURRENT_TIMESTAMP,
           token_hash = NULL,
           expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [verRecord.id]
    );

    // If staff record already exists with this email, update staff table too
    await client.query(
      `UPDATE staff
       SET email_verified = TRUE,
           email_verified_at = CURRENT_TIMESTAMP
       WHERE LOWER(email) = LOWER($1)`,
      [verRecord.email]
    );

    await recordAuditLog(client, {
      userId: null,
      action: "STAFF_EMAIL_VERIFIED",
      entity: "staff_email_verifications",
      entityId: verRecord.id,
      details: { email: verRecord.email },
    });

    await client.query("COMMIT");

    return {
      success: true,
      email: verRecord.email,
      verifiedAt: new Date().toISOString(),
      message: "Email verified successfully. The administrator may now create the staff account.",
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


async function getStaff(query = {}) {
  const role = query.role || null;
  const search = query.search ? query.search.trim() : null;

  const conditions = [];
  const params = [];

  if (role) {
    params.push(role);
    conditions.push(`r.name = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      s.first_name ILIKE $${params.length}
      OR s.last_name ILIKE $${params.length}
      OR s.email ILIKE $${params.length}
      OR u.username ILIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.email,
      COALESCE(s.email_verified, FALSE) AS email_verified,
      s.email_verified_at,
      s.phone,
      s.department,
      s.specialty,
      CASE
        WHEN s.is_active = FALSE AND s.deactivation_end_date IS NOT NULL AND s.deactivation_end_date < CURRENT_DATE THEN TRUE
        ELSE s.is_active
      END AS is_active,
      s.deactivation_reason,
      s.deactivation_start_date,
      s.deactivation_end_date,
      s.created_at,
      r.name AS role,
      u.username,
      u.must_change_password
    FROM staff s
    INNER JOIN roles r ON r.id = s.role_id
    LEFT JOIN users u ON u.staff_id = s.id
    ${whereClause}
    ORDER BY s.created_at DESC
    `,
    params
  );

  return result.rows;
}

async function createStaff(data, createdByUserId) {
  // Validate all required fields
  const requiredFields = [
    { field: "firstName", label: "First name" },
    { field: "lastName", label: "Last name" },
    { field: "username", label: "Username" },
    { field: "email", label: "Email" },
    { field: "phone", label: "Phone" },
    { field: "department", label: "Department" },
    { field: "role", label: "Role" },
    { field: "password", label: "Password" },
  ];

  for (const req of requiredFields) {
    if (!data[req.field] || (typeof data[req.field] === "string" && !data[req.field].trim())) {
      throw new Error(`FIELD_REQUIRED: ${req.label} is required.`);
    }
  }

  // Enforce single role — reject if multiple roles were passed
  if (Array.isArray(data.role)) {
    throw new Error("MULTIPLE_ROLES_NOT_ALLOWED: Each staff member can have only ONE role.");
  }
  if (typeof data.role !== "string") {
    throw new Error("ROLE_REQUIRED: A valid role must be specified.");
  }

  // Validate Email
  const cleanEmail = data.email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    throw new Error("INVALID_EMAIL_FORMAT: Please enter a valid email address.");
  }

  // Validate Password Strength
  const passwordCheck = validatePasswordStrength(data.password);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  // Validate Phone
  let phone = data.phone ? data.phone.trim() : "";
  if (!validateEthiopianPhone(phone)) {
    throw new Error("INVALID_PHONE_FORMAT");
  }
  phone = normalizeEthiopianPhone(phone);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // REQUIREMENT: Strict email ownership verification check
    const verificationRecord = await client.query(
      "SELECT verified, verified_at FROM staff_email_verifications WHERE LOWER(email) = $1 AND verified = TRUE",
      [cleanEmail]
    );

    if (verificationRecord.rows.length === 0) {
      throw new Error("EMAIL_NOT_VERIFIED: Email must be verified before creating the staff account.");
    }

    const verifiedAt = verificationRecord.rows[0].verified_at || new Date();

    // Check email uniqueness explicitly
    const existingEmail = await client.query(
      "SELECT id FROM staff WHERE LOWER(email) = $1",
      [cleanEmail]
    );
    if (existingEmail.rows.length > 0) {
      throw new Error("DUPLICATE_EMAIL: A staff account with this email already exists.");
    }

    // Check username uniqueness explicitly
    const cleanUsername = data.username.trim().toLowerCase();
    const existingUser = await client.query(
      "SELECT id FROM users WHERE LOWER(username) = $1",
      [cleanUsername]
    );
    if (existingUser.rows.length > 0) {
      throw new Error("DUPLICATE_USERNAME: A staff account with this username already exists.");
    }

    const roleResult = await client.query(
      `
        SELECT id, name
        FROM roles
        WHERE name = $1
      `,
      [data.role]
    );

    if (roleResult.rows.length === 0) {
      throw new Error("ROLE_NOT_FOUND");
    }

    const roleId = roleResult.rows[0].id;

    // Hash password with bcrypt before storing
    const passwordHash = await bcrypt.hash(data.password, 10);

    const staffResult = await client.query(
      `
        INSERT INTO staff (
          first_name,
          last_name,
          email,
          phone,
          department,
          specialty,
          role_id,
          email_verified,
          email_verified_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE, $8)
        RETURNING id
      `,
      [
        data.firstName.trim(),
        data.lastName.trim(),
        cleanEmail,
        phone,
        data.department ? data.department.trim() : null,
        data.specialty ? data.specialty.trim() : null,
        roleId,
        verifiedAt,
      ]
    );

    const staffId = staffResult.rows[0].id;

    // Set must_change_password = TRUE for new staff accounts
    await client.query(
      `
        INSERT INTO users (
          staff_id,
          username,
          password_hash,
          must_change_password
        )
        VALUES ($1,$2,$3, TRUE)
      `,
      [staffId, cleanUsername, passwordHash]
    );

    await recordAuditLog(client, {
      userId: createdByUserId,
      action: "STAFF_CREATED",
      entity: "staff",
      entityId: staffId,
      details: {
        username: cleanUsername,
        role: data.role,
        name: `${data.firstName} ${data.lastName}`,
        email: cleanEmail,
        emailVerified: true,
      },
    });

    await client.query("COMMIT");

    // Deliver temporary credentials email
    const emailResult = await emailService.sendStaffWelcomeEmail({
      to: cleanEmail,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      username: cleanUsername,
      temporaryPassword: data.password,
    });

    return {
      staffId,
      username: cleanUsername,
      role: data.role,
      mustChangePassword: true,
      emailDelivered: emailResult.sent,
    };

  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      throw new Error("DUPLICATE_STAFF: A staff account with this email, phone, or username already exists.");
    }
    throw error;
  } finally {
    client.release();
  }
}


async function updateStaff(id, data, updatedByUserId) {
  let phone = data.phone ? data.phone.trim() : "";
  if (phone) {
    if (!validateEthiopianPhone(phone)) {
      throw new Error("INVALID_PHONE_FORMAT");
    }
    phone = normalizeEthiopianPhone(phone);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let roleId = null;
    if (data.role) {
      if (Array.isArray(data.role)) {
        throw new Error("MULTIPLE_ROLES_NOT_ALLOWED: Each staff member can have only ONE role.");
      }
      const roleResult = await client.query(
        `SELECT id FROM roles WHERE name = $1`,
        [data.role]
      );

      if (roleResult.rows.length === 0) {
        throw new Error("ROLE_NOT_FOUND");
      }

      roleId = roleResult.rows[0].id;
    }

    const result = await client.query(
      `
        UPDATE staff
        SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          department = COALESCE($5, department),
          specialty = COALESCE($6, specialty),
          role_id = COALESCE($7, role_id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING id, first_name, last_name, email, phone, department, specialty, is_active
      `,
      [
        data.firstName ? data.firstName.trim() : null,
        data.lastName ? data.lastName.trim() : null,
        data.email ? data.email.trim().toLowerCase() : null,
        phone || null,
        data.department !== undefined ? (data.department ? data.department.trim() : "") : null,
        data.specialty !== undefined ? (data.specialty ? data.specialty.trim() : "") : null,
        roleId,
        id,
      ]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    // Update username if provided
    if (data.username && data.username.trim()) {
      const newUsername = data.username.trim().toLowerCase();
      const uCheck = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = $1 AND staff_id != $2",
        [newUsername, id]
      );
      if (uCheck.rows.length > 0) {
        throw new Error("USERNAME_TAKEN");
      }
      await client.query(
        "UPDATE users SET username = $1 WHERE staff_id = $2",
        [newUsername, id]
      );
    }

    const staff = result.rows[0];

    await recordAuditLog(client, {
      userId: updatedByUserId,
      action: "STAFF_UPDATED",
      entity: "staff",
      entityId: id,
      details: {
        updatedFields: Object.keys(data),
      },
    });

    await client.query("COMMIT");

    return staff;
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw new Error("DUPLICATE_STAFF");
    }

    throw error;
  } finally {
    client.release();
  }
}

async function deleteStaffPermanently(id, deletedByUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Fetch staff info + check if they are an ADMIN
    const staffRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, r.name as role
       FROM staff s
       JOIN roles r ON s.role_id = r.id
       WHERE s.id = $1`,
      [id]
    );

    if (staffRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const staff = staffRes.rows[0];

    // Prevent deleting the last remaining active ADMIN
    if (staff.role === "ADMIN") {
      const adminCountRes = await client.query(
        `SELECT COUNT(*) as count
         FROM staff s
         JOIN roles r ON s.role_id = r.id
         WHERE r.name = 'ADMIN' AND s.is_active = TRUE`
      );
      if (parseInt(adminCountRes.rows[0].count, 10) <= 1) {
        throw new Error("CANNOT_DELETE_LAST_ADMIN");
      }
    }

    // Set foreign keys in child records to NULL or delete dependent records before deleting staff
    await client.query("UPDATE appointments SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("DELETE FROM doctor_schedules WHERE doctor_id = $1", [id]);
    await client.query("UPDATE encounters SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE prescriptions SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE lab_orders SET doctor_id = NULL WHERE doctor_id = $1", [id]);
    await client.query("UPDATE referrals SET referring_doctor_id = NULL WHERE referring_doctor_id = $1", [id]);
    await client.query("UPDATE referrals SET receiving_doctor_id = NULL WHERE receiving_doctor_id = $1", [id]);
    await client.query("UPDATE referral_messages SET sender_id = NULL WHERE sender_id = $1", [id]);

    // Delete user row (cascades or explicit)
    await client.query("DELETE FROM users WHERE staff_id = $1", [id]);

    // Delete the staff record
    await client.query("DELETE FROM staff WHERE id = $1", [id]);

    await recordAuditLog(client, {
      userId: deletedByUserId,
      action: "STAFF_DELETED_PERMANENTLY",
      entity: "staff",
      entityId: id,
      details: { name: `${staff.first_name} ${staff.last_name}`, email: staff.email, role: staff.role },
    });

    await client.query("COMMIT");

    return { id, name: `${staff.first_name} ${staff.last_name}`, success: true };

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateStaffStatus(id, isActive, options = {}, updatedByUserId) {
  const { reason, startDate, endDate } = options;

  let query = "";
  let params = [];

  if (!isActive) {
    query = `
      UPDATE staff
      SET
        is_active = FALSE,
        deactivation_reason = $1,
        deactivation_start_date = $2,
        deactivation_end_date = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, is_active, first_name, last_name, deactivation_reason, deactivation_start_date, deactivation_end_date
    `;
    params = [reason || null, startDate || null, endDate || null, id];
  } else {
    query = `
      UPDATE staff
      SET
        is_active = TRUE,
        deactivation_reason = NULL,
        deactivation_start_date = NULL,
        deactivation_end_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, is_active, first_name, last_name, deactivation_reason, deactivation_start_date, deactivation_end_date
    `;
    params = [id];
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const staff = result.rows[0];

  await recordAuditLog(pool, {
    userId: updatedByUserId,
    action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
    entity: "staff",
    entityId: id,
    details: {
      name: `${staff.first_name} ${staff.last_name}`,
      isActive,
      deactivation_reason: staff.deactivation_reason,
      deactivation_start_date: staff.deactivation_start_date,
      deactivation_end_date: staff.deactivation_end_date,
    },
  });

  return staff;
}

async function getDoctorScheduledAppointments(doctorId, startDate, endDate) {
  const query = `
    SELECT
      a.id,
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
      p.phone AS patient_phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = $1
      AND a.status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN')
      AND (
        ($2::date IS NULL OR a.appointment_date >= $2::date)
        AND ($3::date IS NULL OR a.appointment_date <= $3::date)
      )
    ORDER BY a.appointment_date ASC, a.start_time ASC
  `;

  const result = await pool.query(query, [
    doctorId,
    startDate || null,
    endDate || null,
  ]);

  return result.rows;
}

/**
 * Resend temporary login credentials to verified staff email.
 */
async function resendStaffCredentials(staffId, requestedByUserId) {
  const staffRes = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.is_active, u.id as user_id, u.username
     FROM staff s
     JOIN users u ON u.staff_id = s.id
     WHERE s.id = $1`,
    [staffId]
  );

  if (staffRes.rows.length === 0) {
    throw new Error("STAFF_NOT_FOUND");
  }

  const staff = staffRes.rows[0];
  if (!staff.is_active) {
    throw new Error("CANNOT_RESEND_INACTIVE_STAFF: Cannot send credentials to an inactive staff account.");
  }

  // Generate cryptographically secure temporary password (e.g. 12 chars)
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  let tempPassword = "";
  const randomBytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    tempPassword += charset[randomBytes[i] % charset.length];
  }
  tempPassword += "A1!a";

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = TRUE
       WHERE id = $2`,
      [passwordHash, staff.user_id]
    );

    // Send welcome email with new temporary password
    const emailResult = await emailService.sendStaffWelcomeEmail({
      to: staff.email,
      firstName: staff.first_name,
      lastName: staff.last_name,
      username: staff.username,
      temporaryPassword: tempPassword,
    });

    await recordAuditLog(client, {
      userId: requestedByUserId,
      action: "STAFF_CREDENTIALS_RESENT",
      entity: "staff",
      entityId: staff.id,
      details: { username: staff.username, email: staff.email, emailDelivered: emailResult.sent },
    });

    await client.query("COMMIT");

    return {
      success: true,
      message: `New temporary login credentials have been sent to ${staff.email}.`,
      emailDelivered: emailResult.sent,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getRoles,
  getStaff,
  checkEmailAvailability,
  sendStaffEmailVerification,
  verifyStaffEmailToken,
  resendStaffCredentials,
  createStaff,
  updateStaff,
  deleteStaffPermanently,
  updateStaffStatus,
  getDoctorScheduledAppointments,
};

