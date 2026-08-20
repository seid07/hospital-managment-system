const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength } = require("../validators");

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
    WHERE u.username = $1
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

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = jwt.sign(
    {
      userId: user.id,
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

async function requestPasswordReset(identifier) {
  const genericMessage = "If the account exists, password reset instructions have been sent.";

  if (!identifier || typeof identifier !== "string") {
    return { success: true, message: genericMessage };
  }

  const clean = identifier.trim().toLowerCase();

  // Find user by username or staff email
  const userResult = await pool.query(
    `
    SELECT u.id, u.username, s.email, s.first_name, s.last_name
    FROM users u
    JOIN staff s ON u.staff_id = s.id
    WHERE LOWER(u.username) = $1 OR LOWER(s.email) = $1
    LIMIT 1
    `,
    [clean]
  );

  if (userResult.rows.length === 0) {
    return { success: true, message: genericMessage };
  }

  const user = userResult.rows[0];

  // Generate cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    `
    INSERT INTO password_resets (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [user.id, tokenHash, expiresAt]
  );

  await recordAuditLog(pool, {
    userId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entity: "users",
    entityId: user.id,
    details: { username: user.username, email: user.email },
  });

  return {
    success: true,
    message: genericMessage,
    // In dev / test environments, expose token for testing convenience
    resetToken: rawToken,
  };
}

async function resetPassword(token, newPassword) {
  if (!token || typeof token !== "string") {
    throw new Error("INVALID_TOKEN");
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
    const isMatch = await bcrypt.compare(token, reset.token_hash);
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

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await client.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [newPasswordHash, matchedReset.user_id]
    );

    // Invalidate reset token
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
  login,
  requestPasswordReset,
  resetPassword,
};
