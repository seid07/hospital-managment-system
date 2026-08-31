const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength, normalizeEthiopianPhone, validateEmail, validateOtp } = require("../validators");
const emailService = require("./email.service");

async function checkSystemStatus() {
  const result = await pool.query("SELECT COUNT(*) AS count FROM staff");
  const count = parseInt(result.rows[0].count, 10);
  return {
    isInitialized: count > 0,
    staffCount: count,
  };
}

async function setupInitialAdmin({ firstName, lastName, email, phone, username, password }) {
  const status = await checkSystemStatus();
  if (status.isInitialized) {
    throw new Error("SYSTEM_ALREADY_INITIALIZED: System already has registered staff. Initial setup is disabled.");
  }

  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const roleRes = await client.query("SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1");
    if (roleRes.rows.length === 0) {
      throw new Error("ADMIN role definition not found.");
    }
    const roleId = roleRes.rows[0].id;

    const normalizedPhone = normalizeEthiopianPhone(phone) || phone;
    const passwordHash = await bcrypt.hash(password, 12);

    const staffRes = await client.query(
      `
      INSERT INTO staff (first_name, last_name, email, phone, department, specialty, role_id, is_active)
      VALUES ($1, $2, $3, $4, 'Administration', 'Hospital System Administrator', $5, TRUE)
      RETURNING id, first_name, last_name, email, phone, department;
      `,
      [firstName.trim(), lastName.trim(), email.trim().toLowerCase(), normalizedPhone, roleId]
    );
    const staffId = staffRes.rows[0].id;

    const userRes = await client.query(
      `
      INSERT INTO users (staff_id, username, password_hash, must_change_password)
      VALUES ($1, $2, $3, FALSE)
      RETURNING id, username, must_change_password;
      `,
      [staffId, username.trim().toLowerCase(), passwordHash]
    );
    const user = userRes.rows[0];

    await recordAuditLog(client, {
      userId: user.id,
      action: "INITIAL_ADMIN_SETUP",
      entity: "users",
      entityId: user.id,
      details: { username: user.username, email: staffRes.rows[0].email },
    });

    await client.query("COMMIT");

    return {
      success: true,
      message: "System Administrator account successfully created. You can now sign in.",
      user: {
        id: user.id,
        username: user.username,
        staffId,
        role: "ADMIN",
        must_change_password: false,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function login(username, password) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.password_hash,
      u.must_change_password,
      u.last_login,
      s.id AS staff_id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      s.department,
      s.specialty,
      s.is_active,
      r.name AS role
    FROM users u
    INNER JOIN staff s ON s.id = u.staff_id
    INNER JOIN roles r ON r.id = s.role_id
    WHERE LOWER(u.username) = LOWER($1)
    LIMIT 1
  `;

  const result = await pool.query(query, [username]);

  if (result.rows.length === 0) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new Error("ACCOUNT_INACTIVE");
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const mustChangePassword = Boolean(user.must_change_password);

  const token = jwt.sign(
    {
      id: user.id,
      userId: user.id,
      staff_id: user.staff_id,
      staffId: user.staff_id,
      username: user.username,
      role: user.role,
      must_change_password: mustChangePassword,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );

  await pool.query(
    `
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
    [user.id]
  );

  delete user.password_hash;
  delete user.password_reset_otp_hash;
  user.must_change_password = mustChangePassword;

  return {
    token,
    user,
  };
}

/**
 * Step 1 of Change Password:
 * Verifies current password before unlocking new password fields.
 */
async function verifyCurrentPassword(userId, currentPassword) {
  if (!currentPassword) {
    throw new Error("CURRENT_PASSWORD_REQUIRED: Current password is required.");
  }

  const res = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  if (res.rows.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const isMatch = await bcrypt.compare(currentPassword, res.rows[0].password_hash);
  if (!isMatch) {
    throw new Error("INVALID_CURRENT_PASSWORD: The current password you entered is incorrect.");
  }

  return {
    valid: true,
    message: "Current password verified successfully.",
  };
}

/**
 * Step 2 of Change Password:
 * Changes password, clears must_change_password, updates password_changed_at, and issues fresh token.
 */
async function changePassword(userId, currentPassword, newPassword, confirmNewPassword) {
  if (!currentPassword) {
    throw new Error("CURRENT_PASSWORD_REQUIRED: Current password is required.");
  }
  if (!newPassword) {
    throw new Error("NEW_PASSWORD_REQUIRED: New password is required.");
  }
  if (confirmNewPassword && newPassword !== confirmNewPassword) {
    throw new Error("PASSWORD_MISMATCH: New password and confirmation do not match.");
  }
  if (currentPassword === newPassword) {
    throw new Error("SAME_PASSWORD: New password must be different from your current password.");
  }

  const passwordCheck = validatePasswordStrength(newPassword);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  const userRes = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.staff_id, s.first_name, s.last_name, s.email, r.name AS role
     FROM users u
     JOIN staff s ON u.staff_id = s.id
     JOIN roles r ON s.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const user = userRes.rows[0];
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) {
    throw new Error("INVALID_CURRENT_PASSWORD: The current password you entered is incorrect.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = FALSE,
           password_changed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Invalidate existing password reset tokens for this user
    await client.query(
      "UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL",
      [userId]
    );

    await recordAuditLog(client, {
      userId,
      action: "PASSWORD_CHANGED",
      entity: "users",
      entityId: userId,
      details: { username: user.username },
    });

    await client.query("COMMIT");

    // Generate updated JWT without must_change_password flag
    const newToken = jwt.sign(
      {
        id: user.id,
        userId: user.id,
        staff_id: user.staff_id,
        staffId: user.staff_id,
        username: user.username,
        role: user.role,
        must_change_password: false,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      }
    );

    return {
      success: true,
      message: "Password changed successfully.",
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        staff_id: user.staff_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        must_change_password: false,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Forgot Password Flow — Step 1: Request 6-digit OTP
 * Verifies username + email match an active account, generates secure OTP, hashes it,
 * sends it to the user's email, and applies rate limiting & cooldown.
 */
async function requestPasswordResetOtp({ username, email, lastName, phone, department }) {
  const genericFailureMessage = "If the provided username and email match our active records, a verification code has been sent.";

  if (!username || !email) {
    return {
      success: false,
      message: genericFailureMessage,
    };
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  // Find user by username AND email (both must match same active account)
  let query = `
    SELECT
      u.id AS user_id,
      u.username,
      u.password_reset_last_sent_at,
      s.id AS staff_id,
      s.first_name,
      s.last_name,
      s.email,
      s.is_active
    FROM users u
    JOIN staff s ON u.staff_id = s.id
    WHERE LOWER(u.username) = $1
      AND LOWER(s.email) = $2
      AND s.is_active = TRUE
    LIMIT 1
  `;
  const params = [cleanUsername, cleanEmail];

  // Optional backward compatibility with legacy 5-field test callers
  if (lastName && department) {
    query = `
      SELECT
        u.id AS user_id,
        u.username,
        u.password_reset_last_sent_at,
        s.id AS staff_id,
        s.first_name,
        s.last_name,
        s.email,
        s.is_active
      FROM users u
      JOIN staff s ON u.staff_id = s.id
      WHERE LOWER(u.username) = $1
        AND LOWER(s.email) = $2
        AND LOWER(s.last_name) = $3
        AND LOWER(s.department) = $4
        AND s.is_active = TRUE
      LIMIT 1
    `;
    params.push(lastName.trim().toLowerCase(), department.trim().toLowerCase());
  }

  const userResult = await pool.query(query, params);

  if (userResult.rows.length === 0) {
    // Safe generic response preventing account enumeration
    return {
      success: false,
      message: genericFailureMessage,
    };
  }

  const user = userResult.rows[0];

  // Cooldown check (60 seconds)
  const now = new Date();
  if (user.password_reset_last_sent_at) {
    const lastSent = new Date(user.password_reset_last_sent_at);
    const diffSeconds = Math.floor((now.getTime() - lastSent.getTime()) / 1000);
    if (diffSeconds < 60) {
      const waitSeconds = 60 - diffSeconds;
      throw new Error(`COOLDOWN_ACTIVE: Please wait ${waitSeconds} second${waitSeconds === 1 ? "" : "s"} before requesting a new code.`);
    }
  }

  // Generate cryptographically secure random 6-digit OTP
  const otpNumber = crypto.randomInt(100000, 999999);
  const rawOtp = otpNumber.toString();
  const otpHash = await bcrypt.hash(rawOtp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await pool.query(
    `UPDATE users
     SET password_reset_otp_hash = $1,
         password_reset_otp_expires_at = $2,
         password_reset_attempts = 0,
         password_reset_last_sent_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [otpHash, expiresAt, user.user_id]
  );

  // Send OTP via configured email service
  const emailRes = await emailService.sendPasswordResetOtpEmail({
    to: user.email,
    firstName: user.first_name,
    username: user.username,
    otp: rawOtp,
    expiresInMinutes: 10,
  });

  await recordAuditLog(pool, {
    userId: user.user_id,
    action: "PASSWORD_RESET_OTP_REQUESTED",
    entity: "users",
    entityId: user.user_id,
    details: {
      username: user.username,
      emailDelivered: emailRes.sent,
    },
  });

  return {
    success: true,
    message: "A 6-digit verification code has been sent to your registered email address.",
    expiresInMinutes: 10,
    cooldownSeconds: 60,
    // Return masked email for user confirmation
    maskedEmail: user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${"*".repeat(Math.max(1, b.length))}${c}`),
  };
}

/**
 * Forgot Password Flow — Step 2: Verify 6-digit OTP
 * Validates the single-use OTP, checks expiration & attempts, and returns a secure resetToken.
 */
async function verifyPasswordResetOtp({ username, email, otp }) {
  if (!username || !otp) {
    throw new Error("OTP_FIELDS_REQUIRED: Username and 6-digit verification code are required.");
  }

  const cleanOtp = otp.toString().trim();
  if (!validateOtp(cleanOtp)) {
    throw new Error("INVALID_OTP_FORMAT: Verification code must be exactly 6 digits.");
  }

  const cleanUsername = username.trim().toLowerCase();

  let query = `
    SELECT u.id, u.username, u.password_reset_otp_hash, u.password_reset_otp_expires_at, u.password_reset_attempts, s.email
    FROM users u
    JOIN staff s ON u.staff_id = s.id
    WHERE LOWER(u.username) = $1 AND s.is_active = TRUE
  `;
  const params = [cleanUsername];

  if (email && typeof email === "string" && email.trim()) {
    query += " AND LOWER(s.email) = $2";
    params.push(email.trim().toLowerCase());
  }

  const userRes = await pool.query(query, params);

  if (userRes.rows.length === 0) {
    throw new Error("INVALID_OR_EXPIRED_CODE: Invalid or expired verification code.");
  }


  const user = userRes.rows[0];

  // Check max attempts (limit: 5)
  if ((user.password_reset_attempts || 0) >= 5) {
    // Invalidate OTP on attempt limit exhaustion
    await pool.query(
      "UPDATE users SET password_reset_otp_hash = NULL, password_reset_otp_expires_at = NULL WHERE id = $1",
      [user.id]
    );
    throw new Error("MAX_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Please request a new verification code.");
  }

  // Check expiration
  if (!user.password_reset_otp_hash || !user.password_reset_otp_expires_at || new Date(user.password_reset_otp_expires_at) < new Date()) {
    throw new Error("OTP_EXPIRED: The verification code has expired. Please request a new code.");
  }

  // Compare OTP hash
  const isMatch = await bcrypt.compare(cleanOtp, user.password_reset_otp_hash);

  if (!isMatch) {
    const attempts = (user.password_reset_attempts || 0) + 1;
    await pool.query(
      "UPDATE users SET password_reset_attempts = $1 WHERE id = $2",
      [attempts, user.id]
    );
    const remaining = Math.max(0, 5 - attempts);
    throw new Error(`INVALID_OTP: Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
  }

  // OTP is valid! Single-use: clear OTP from users table to prevent reuse
  const rawResetToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawResetToken, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes to set new password

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE users
       SET password_reset_otp_hash = NULL,
           password_reset_otp_expires_at = NULL,
           password_reset_attempts = 0
       WHERE id = $1`,
      [user.id]
    );

    // Save one-time reset token
    await client.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await recordAuditLog(client, {
      userId: user.id,
      action: "PASSWORD_RESET_OTP_VERIFIED",
      entity: "users",
      entityId: user.id,
      details: { username: user.username },
    });

    await client.query("COMMIT");

    return {
      success: true,
      message: "Verification successful. You can now set your new password.",
      resetToken: rawResetToken,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Forgot Password Flow — Step 3: Reset password using verified resetToken.
 */
async function resetPassword(token, newPassword, confirmPassword) {
  if (!token || typeof token !== "string") {
    throw new Error("INVALID_OR_EXPIRED_TOKEN: A valid reset token is required.");
  }

  if (!newPassword) {
    throw new Error("NEW_PASSWORD_REQUIRED: New password is required.");
  }

  if (confirmPassword && newPassword !== confirmPassword) {
    throw new Error("PASSWORD_MISMATCH: Passwords do not match.");
  }

  const passwordCheck = validatePasswordStrength(newPassword);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

  // Find active, unexpired, unused reset requests from last hour
  const resetsResult = await pool.query(
    `
    SELECT pr.id, pr.user_id, pr.token_hash, pr.expires_at, u.username
    FROM password_resets pr
    JOIN users u ON pr.user_id = u.id
    WHERE pr.expires_at > CURRENT_TIMESTAMP AND pr.used_at IS NULL
    ORDER BY pr.created_at DESC
    LIMIT 50
    `
  );

  let matchedReset = null;
  for (const reset of resetsResult.rows) {
    const isMatch = await bcrypt.compare(token.trim(), reset.token_hash);
    if (isMatch) {
      matchedReset = reset;
      break;
    }
  }

  if (!matchedReset) {
    throw new Error("INVALID_OR_EXPIRED_TOKEN: The password reset link or token is invalid, expired, or has already been used.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update user password and clear must_change_password
    await client.query(
      `
      UPDATE users
      SET password_hash = $1,
          must_change_password = FALSE,
          password_changed_at = CURRENT_TIMESTAMP,
          password_reset_otp_hash = NULL,
          password_reset_otp_expires_at = NULL,
          password_reset_attempts = 0
      WHERE id = $2
      `,
      [newPasswordHash, matchedReset.user_id]
    );

    // Invalidate reset token (one-time use)
    await client.query(
      `
      UPDATE password_resets
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [matchedReset.id]
    );

    await recordAuditLog(client, {
      userId: matchedReset.user_id,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "users",
      entityId: matchedReset.user_id,
      details: { username: matchedReset.username },
    });

    await client.query("COMMIT");

    return {
      success: true,
      message: "Password has been reset successfully. You may now sign in.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Backward compatibility alias for legacy test runners
async function requestPasswordReset(params) {
  const { username, email, lastName, phone, department } = params || {};
  if (!username || !email) {
    return { success: false, message: "Unable to verify your identity with the information provided." };
  }

  // If 5-field legacy identity verification call
  if (lastName || department || phone) {
    const userRes = await pool.query(
      `SELECT u.id, u.username, s.email, s.first_name
       FROM users u
       JOIN staff s ON u.staff_id = s.id
       WHERE LOWER(u.username) = $1
         AND LOWER(s.email) = $2
         AND LOWER(s.last_name) = $3
         AND LOWER(s.department) = $4
         AND s.is_active = TRUE`,
      [
        username.trim().toLowerCase(),
        email.trim().toLowerCase(),
        (lastName || "").trim().toLowerCase(),
        (department || "").trim().toLowerCase(),
      ]
    );

    if (userRes.rows.length === 0) {
      return { success: false, message: "Unable to verify your identity with the information provided." };
    }

    const user = userRes.rows[0];
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawResetToken, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    return {
      success: true,
      message: "Identity verified. Password reset token generated.",
      resetToken: rawResetToken,
    };
  }

  return requestPasswordResetOtp(params);
}


module.exports = {
  checkSystemStatus,
  setupInitialAdmin,
  login,
  verifyCurrentPassword,
  changePassword,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
  requestPasswordReset,
};
