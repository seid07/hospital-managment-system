const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { recordAuditLog } = require("../utils/audit");
const { validatePasswordStrength, validateEthiopianPhone, normalizeEthiopianPhone } = require("../validators");

async function getRoles() {
  const result = await pool.query(`
    SELECT id, name, description
    FROM roles
    ORDER BY name
  `);

  return result.rows;
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
      s.phone,
      s.department,
      s.specialty,
      s.is_active,
      s.created_at,
      r.name AS role,
      u.username
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
  const passwordCheck = validatePasswordStrength(data.password);
  if (!passwordCheck.isValid) {
    throw new Error(`WEAK_PASSWORD: ${passwordCheck.message}`);
  }

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
          role_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `,
      [
        data.firstName.trim(),
        data.lastName.trim(),
        data.email.trim().toLowerCase(),
        phone,
        data.department ? data.department.trim() : null,
        data.specialty ? data.specialty.trim() : null,
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
      [staffId, data.username.trim().toLowerCase(), passwordHash]
    );

    await recordAuditLog(client, {
      userId: createdByUserId,
      action: "STAFF_CREATED",
      entity: "staff",
      entityId: staffId,
      details: {
        username: data.username,
        role: data.role,
        name: `${data.firstName} ${data.lastName}`,
      },
    });

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

    const staff = result.rows[0];

    await recordAuditLog(client, {
      userId: updatedByUserId,
      action: "STAFF_UPDATED",
      entity: "staff",
      entityId: id,
      details: { name: `${staff.first_name} ${staff.last_name}`, role: data.role },
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

async function updateStaffStatus(id, isActive, updatedByUserId) {
  const result = await pool.query(
    `
      UPDATE staff
      SET
        is_active = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, is_active, first_name, last_name
    `,
    [isActive, id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const staff = result.rows[0];

  await recordAuditLog(pool, {
    userId: updatedByUserId,
    action: isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED",
    entity: "staff",
    entityId: id,
    details: { name: `${staff.first_name} ${staff.last_name}`, isActive },
  });

  return staff;
}

module.exports = {
  getRoles,
  getStaff,
  createStaff,
  updateStaff,
  updateStaffStatus,
};
