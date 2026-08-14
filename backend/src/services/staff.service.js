const bcrypt = require("bcrypt");
const pool = require("../config/database");

async function getRoles() {
  const result = await pool.query(`
    SELECT id, name, description
    FROM roles
    ORDER BY name
  `);

  return result.rows;
}

async function getStaff() {
  const result = await pool.query(`
    SELECT
      s.id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      s.department,
      s.specialty,
      s.is_active,
      s.created_at,
      r.name AS role,
      u.username
    FROM staff s
    INNER JOIN roles r
      ON r.id = s.role_id
    LEFT JOIN users u
      ON u.staff_id = s.id
    ORDER BY s.created_at DESC
  `);

  return result.rows;
}

async function createStaff(data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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

    const passwordHash = await bcrypt.hash(
      data.password,
      12
    );

    const staffResult = await client.query(
      `
        INSERT INTO staff (
          first_name,
          last_name,
          email,
          phone,
          department,
          specialty,
          role_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `,
      [
        data.firstName,
        data.lastName,
        data.email,
        data.phone,
        data.department || null,
        data.specialty || null,
        roleId,
      ]
    );

    const staffId = staffResult.rows[0].id;

    await client.query(
      `
        INSERT INTO users (
          staff_id,
          username,
          password_hash
        )
        VALUES ($1,$2,$3)
      `,
      [
        staffId,
        data.username,
        passwordHash,
      ]
    );

    await client.query("COMMIT");

    return {
      staffId,
      username: data.username,
      role: data.role,
    };
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

async function updateStaffStatus(id, isActive) {
  const result = await pool.query(
    `
      UPDATE staff
      SET
        is_active = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, is_active
    `,
    [isActive, id]
  );

  return result.rows[0] || null;
}

module.exports = {
  getRoles,
  getStaff,
  createStaff,
  updateStaffStatus,
};
