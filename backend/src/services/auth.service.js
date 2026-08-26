const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength, normalizeEthiopianPhone } = require("../validators");

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
      INSERT INTO users (staff_id, username, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username;
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

  const token = jwt.sign(
    {
      id: user.id,
      userId: user.id,
      staff_id: user.staff_id,
      staffId: user.staff_id,
      username: user.username,
      role: user.role,
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

  return {
    token,
    user,
  };
}

/**
 * Requirement 17: Multi-Field Identity Verification for Forgot Password
 * Validates that ALL 5 fields match the exact same staff account:
 * - username
 * - lastName
 * - email
 * - phone
 * - department
 */
async function requestPasswordReset({ username, lastName, email, phone, department }) {
  const genericFailureMessage = "Unable to verify your identity with the information provided.";

  if (!username || !lastName || !email || !phone || !department) {
    return {
      success: false,
      message: genericFailureMessage,
    };
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanLastName = lastName.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim().replace(/[\s-]/g, "");
  const cleanDept = department.trim().toLowerCase();

  // Find user by joining users and staff, validating all 5 properties
  const userResult = await pool.query(
    `
    SELECT
      u.id AS user_id,
      u.username,
      s.id AS staff_id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      s.department,
      s.is_active
    FROM users u
    JOIN staff s ON u.staff_id = s.id
    WHERE LOWER(u.username) = $1
      AND LOWER(s.last_name) = $2
      AND LOWER(s.email) = $3
      AND (
        REPLACE(REPLACE(s.phone, ' ', ''), '-', '') ILIKE $4
        OR REPLACE(REPLACE(s.phone, ' ', ''), '-', '') ILIKE '%' || RIGHT($4, 9)
      )
      AND LOWER(s.department) = $5
      AND s.is_active = TRUE
    LIMIT 1
    `,
    [cleanUsername, cleanLastName, cleanEmail, `%${cleanPhone}%`, cleanDept]
  );

  if (userResult.rows.length === 0) {
    // Return generic message to prevent account enumeration / reconnaissance
    return {
      success: false,
      message: genericFailureMessage,
    };
  }

  const user = userResult.rows[0];

  // Generate cryptographically secure one-time reset token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

  await pool.query(
    `
    INSERT INTO password_resets (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [user.user_id, tokenHash, expiresAt]
  );

  await recordAuditLog(pool, {
    userId: user.user_id,
    action: "PASSWORD_RESET_REQUESTED",
    entity: "users",
    entityId: user.user_id,
    details: {
      username: user.username,
      department: user.department,
      verifiedFields: 5,
    },
  });

  return {
    success: true,
    message: "Identity verified successfully. Password reset token generated.",
    resetToken: rawToken,
  };
}

async function resetPassword(token, newPassword) {
  if (!token || typeof token !== "string") {
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
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
    throw new Error("INVALID_OR_EXPIRED_TOKEN");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await client.query(
      `
      UPDATE users
      SET password_hash = $1
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

module.exports = {
  checkSystemStatus,
  setupInitialAdmin,
  login,
  requestPasswordReset,
  resetPassword,
};
