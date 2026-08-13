const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

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

module.exports = {
  login,
};
