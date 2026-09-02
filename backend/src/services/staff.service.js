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
 * Check email format and duplicate status in staff records.
 */
async function checkEmailAvailability(email, excludeStaffId = null) {
  if (!email || typeof email !== "string") {
    return {
      available: false,
      reason: "INVALID_FORMAT",
      message: "Enter a valid email address",
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    return {
      available: false,
      reason: "INVALID_FORMAT",
      message: "Enter a valid email address",
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
      reason: "DUPLICATE",
      message: "Email already registered",
    };
  }

  return {
    available: true,
    message: "Valid email format",
  };
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
    const idx = params.length;
    conditions.push(
      `(s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.email ILIKE $${idx} OR s.phone ILIKE $${idx} OR s.department ILIKE $${idx} OR s.specialty ILIKE $${idx} OR u.username ILIKE $${idx})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT
        s.id,
        s.first_name,
        s.last_name,
        s.email,
        s.phone,
        s.department,
        s.specialty,
        s.is_active,
        s.deactivation_reason,
        s.deactivation_start_date,
        s.deactivation_end_date,
        s.email_verified,
        s.email_verified_at,
        r.name AS role,
        r.description AS role_description,
        u.username,
        u.must_change_password,
        u.password_changed_at,
        u.last_login
      FROM staff s
      INNER JOIN roles r
        ON r.id = s.role_id
      LEFT JOIN users u
        ON u.staff_id = s.id
      ${whereClause}
      ORDER BY s.created_at DESC
    `,
    params
  );

  return result.rows;
}

/**
 * Generate cryptographically secure temporary password meeting complexity requirements.
 */
function generateSecureTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const allChars = upper + lower + digits + special;

  // Ensure at least one character from each required category
  let passwordChars = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    special[crypto.randomInt(0, special.length)],
  ];

  // Fill remaining characters up to 12 characters length
  for (let i = passwordChars.length; i < 12; i++) {
    passwordChars.push(allChars[crypto.randomInt(0, allChars.length)]);
  }


  // Shuffle array using Fisher-Yates
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
}

async function createStaff(data, createdByUserId) {
  if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.role || !data.username) {
    throw new Error("FIELD_REQUIRED: First name, last name, email, phone, role, and username are required.");
  }

  if (Array.isArray(data.role)) {
    throw new Error("MULTIPLE_ROLES_NOT_ALLOWED: Each staff member can have only ONE role.");
  }

  const cleanEmail = data.email.trim().toLowerCase();
  if (!validateEmail(cleanEmail)) {
    throw new Error("INVALID_EMAIL_FORMAT: Enter a valid email address.");
  }

  let phone = data.phone.trim();
  if (!validateEthiopianPhone(phone)) {
    throw new Error("INVALID_PHONE_FORMAT");
  }
  phone = normalizeEthiopianPhone(phone);

  const passwordToUse = data.password ? data.password.trim() : generateSecureTemporaryPassword();
  const passwordCheck = validatePasswordStrength(passwordToUse);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check duplicate email
    const existingEmail = await client.query(
      "SELECT id FROM staff WHERE LOWER(email) = $1",
      [cleanEmail]
    );
    if (existingEmail.rows.length > 0) {
      throw new Error("DUPLICATE_EMAIL: A staff account with this email already exists.");
    }

    // Check duplicate username
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

    // Hash temporary password with bcrypt before database storage
    const passwordHash = await bcrypt.hash(passwordToUse, 10);

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
        VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE, CURRENT_TIMESTAMP)
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
      },
    });

    await client.query("COMMIT");

    // Attempt credential email delivery
    const emailResult = await emailService.sendStaffWelcomeEmail({
      to: cleanEmail,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      username: cleanUsername,
      temporaryPassword: passwordToUse,
    });

    if (
      !emailResult.sent &&
      emailResult.method === "SMTP" &&
      process.env.NODE_ENV !== "test" &&
      !cleanEmail.endsWith(".local") &&
      !cleanEmail.endsWith(".test") &&
      !cleanEmail.endsWith(".example.com")
    ) {
      // Rollback staff and user creation if live SMTP rejects delivery
      await pool.query("DELETE FROM users WHERE staff_id = $1", [staffId]);
      await pool.query("DELETE FROM staff WHERE id = $1", [staffId]);
      throw new Error("EMAIL_DELIVERY_FAILED: Unable to deliver staff credentials to this email address. Please verify the email address and try again.");
    }


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

    // Check duplicate email
    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (!validateEmail(cleanEmail)) {
        throw new Error("INVALID_EMAIL_FORMAT");
      }
      const existingEmail = await client.query(
        "SELECT id FROM staff WHERE LOWER(email) = $1 AND id != $2",
        [cleanEmail, id]
      );
      if (existingEmail.rows.length > 0) {
        throw new Error("DUPLICATE_EMAIL");
      }
    }

    // Check duplicate username
    if (data.username) {
      const cleanUsername = data.username.trim().toLowerCase();
      const existingUser = await client.query(
        "SELECT id FROM users WHERE LOWER(username) = $1 AND staff_id != $2",
        [cleanUsername, id]
      );
      if (existingUser.rows.length > 0) {
        throw new Error("DUPLICATE_USERNAME");
      }
    }

    const currentStaff = await client.query(
      `SELECT first_name, last_name, email, phone, department, specialty, role_id
       FROM staff WHERE id = $1`,
      [id]
    );

    if (currentStaff.rows.length === 0) {
      throw new Error("STAFF_NOT_FOUND");
    }

    const current = currentStaff.rows[0];

    const result = await client.query(
      `
        UPDATE staff
        SET
          first_name = $1,
          last_name = $2,
          email = $3,
          phone = $4,
          department = $5,
          specialty = $6,
          role_id = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `,
      [
        data.firstName ? data.firstName.trim() : current.first_name,
        data.lastName ? data.lastName.trim() : current.last_name,
        data.email ? data.email.trim().toLowerCase() : current.email,
        phone || current.phone,
        data.department !== undefined ? (data.department ? data.department.trim() : null) : current.department,
        data.specialty !== undefined ? (data.specialty ? data.specialty.trim() : null) : current.specialty,
        roleId || current.role_id,
        id,
      ]
    );

    // Update username if provided
    if (data.username) {
      const cleanUsername = data.username.trim().toLowerCase();
      await client.query(
        `UPDATE users
         SET username = $1
         WHERE staff_id = $2`,
        [cleanUsername, id]
      );

    }

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
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Permanently delete a staff member and clean up references.
 */
async function deleteStaffPermanently(staffId, requestedByUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const staffRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, r.name as role, u.id as user_id, u.username
       FROM staff s
       JOIN roles r ON s.role_id = r.id
       LEFT JOIN users u ON u.staff_id = s.id
       WHERE s.id = $1`,
      [staffId]
    );

    if (staffRes.rows.length === 0) {
      throw new Error("STAFF_NOT_FOUND");
    }

    const staff = staffRes.rows[0];
    const userId = staff.user_id;

    if (userId) {
      await client.query("UPDATE invoices SET created_by = NULL WHERE created_by = $1", [userId]);
      await client.query("UPDATE payments SET received_by = NULL WHERE received_by = $1", [userId]);
      await client.query("UPDATE prescriptions SET dispensed_by = NULL WHERE dispensed_by = $1", [userId]);
      await client.query("UPDATE lab_orders SET specimen_collected_by = NULL WHERE specimen_collected_by = $1", [userId]);
      await client.query("UPDATE lab_orders SET verified_by = NULL WHERE verified_by = $1", [userId]);
      await client.query("UPDATE audit_logs SET user_id = NULL WHERE user_id = $1", [userId]);

      await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
    }

    await client.query("DELETE FROM doctor_schedules WHERE doctor_id = $1", [staffId]);
    await client.query("UPDATE prescriptions SET doctor_id = NULL WHERE doctor_id = $1", [staffId]);
    await client.query("UPDATE encounters SET doctor_id = NULL WHERE doctor_id = $1", [staffId]);
    await client.query("UPDATE appointments SET doctor_id = NULL WHERE doctor_id = $1", [staffId]);
    await client.query("DELETE FROM staff_email_verifications WHERE LOWER(email) = $1", [staff.email.toLowerCase()]);
    await client.query("DELETE FROM staff WHERE id = $1", [staffId]);


    await recordAuditLog(client, {
      userId: requestedByUserId,
      action: "STAFF_DELETED_PERMANENTLY",
      entity: "staff",
      entityId: staffId,
      details: {
        firstName: staff.first_name,
        lastName: staff.last_name,
        role: staff.role,
        email: staff.email,
        username: staff.username,
      },
    });

    await client.query("COMMIT");

    return {
      success: true,
      message: `Staff member ${staff.first_name} ${staff.last_name} has been permanently deleted.`,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateStaffStatus(id, { isActive, deactivationReason, deactivationStartDate, deactivationEndDate }, updatedByUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reason = !isActive ? (deactivationReason || "Administrative deactivation") : null;
    const start = !isActive ? (deactivationStartDate || new Date().toISOString().split("T")[0]) : null;
    const end = !isActive ? (deactivationEndDate || null) : null;

    const result = await client.query(
      `
        UPDATE staff
        SET
          is_active = $1,
          deactivation_reason = $2,
          deactivation_start_date = $3,
          deactivation_end_date = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `,
      [isActive, reason, start, end, id]
    );

    if (result.rows.length === 0) {
      throw new Error("STAFF_NOT_FOUND");
    }

    await recordAuditLog(client, {
      userId: updatedByUserId,
      action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
      entity: "staff",
      entityId: id,
      details: {
        isActive,
        deactivationReason: reason,
        deactivationStartDate: start,
        deactivationEndDate: end,
      },
    });

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getDoctorScheduledAppointments(doctorId, startDate, endDate) {
  const params = [doctorId];
  let dateFilter = "";

  if (startDate && endDate) {
    params.push(startDate, endDate);
    dateFilter = "AND a.appointment_date >= $2 AND a.appointment_date <= $3";
  } else if (startDate) {
    params.push(startDate);
    dateFilter = "AND a.appointment_date >= $2";
  }

  const result = await pool.query(
    `
      SELECT
        a.id,
        a.appointment_number,
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.status,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.phone AS patient_phone,
        p.patient_number
      FROM appointments a
      INNER JOIN patients p ON p.id = a.patient_id
      WHERE a.doctor_id = $1
        AND a.status IN ('SCHEDULED', 'CONFIRMED')
        ${dateFilter}
      ORDER BY a.appointment_date ASC, a.start_time ASC
    `,
    params
  );

  return result.rows;
}

/**
 * Resend temporary login credentials to staff email.
 * Generates a new secure temporary password, hashes it, sets must_change_password = TRUE,
 * and emails it to the staff member.
 */
async function resendStaffCredentials(staffId, requestedByUserId) {
  const staffRes = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.is_active, r.name AS role, u.id AS user_id, u.username
     FROM staff s
     JOIN roles r ON s.role_id = r.id
     JOIN users u ON u.staff_id = s.id
     WHERE s.id = $1`,
    [staffId]
  );

  if (staffRes.rows.length === 0) {
    throw new Error("STAFF_NOT_FOUND");
  }

  const staff = staffRes.rows[0];
  if (!staff.is_active) {
    throw new Error("CANNOT_RESEND_INACTIVE: Cannot resend credentials to a deactivated staff member.");
  }

  // Generate fresh temporary password
  const tempPassword = generateSecureTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Update user with new hashed temporary password and enforce must_change_password = TRUE
  await pool.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = TRUE
     WHERE id = $2`,
    [passwordHash, staff.user_id]
  );


  // Deliver welcome credentials email
  const emailResult = await emailService.sendStaffWelcomeEmail({
    to: staff.email,
    firstName: staff.first_name,
    lastName: staff.last_name,
    username: staff.username,
    temporaryPassword: tempPassword,
  });

  if (!emailResult.sent && emailResult.method === "SMTP") {
    throw new Error(`EMAIL_DELIVERY_FAILED: Unable to deliver temporary password to ${staff.email}. Please verify the email address and try again.`);
  }

  await recordAuditLog(pool, {
    userId: requestedByUserId,
    action: "STAFF_CREDENTIALS_RESENT",
    entity: "users",
    entityId: staff.user_id,
    details: {
      username: staff.username,
      email: staff.email,
      emailDelivered: emailResult.sent,
    },
  });

  return {
    success: true,
    message: `A new temporary password has been sent to ${staff.email}.`,
    username: staff.username,
    emailDelivered: emailResult.sent,
  };
}

module.exports = {
  getRoles,
  getStaff,
  checkEmailAvailability,
  generateSecureTemporaryPassword,
  createStaff,
  updateStaff,
  deleteStaffPermanently,
  updateStaffStatus,
  getDoctorScheduledAppointments,
  resendStaffCredentials,
};
