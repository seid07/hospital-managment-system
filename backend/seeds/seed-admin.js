require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../src/config/database");

async function seedAdmin() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleResult = await client.query(
      `
        SELECT id
        FROM roles
        WHERE name = 'ADMIN'
        LIMIT 1
      `
    );

    if (roleResult.rows.length === 0) {
      throw new Error("ADMIN role does not exist.");
    }

    const roleId = roleResult.rows[0].id;

    const password = "Admin@12345";
    const passwordHash = await bcrypt.hash(password, 12);

    const staffResult = await client.query(
      `
        INSERT INTO staff (
          first_name,
          last_name,
          email,
          phone,
          department,
          role_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        ON CONFLICT (email)
        DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `,
      [
        "System",
        "Administrator",
        "admin@hospital.local",
        "0900000000",
        "Administration",
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
        VALUES (
          $1,
          $2,
          $3
        )
        ON CONFLICT (username)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash
      `,
      [
        staffId,
        "admin",
        passwordHash,
      ]
    );

    await client.query("COMMIT");

    console.log("Admin account created successfully.");
    console.log("Username: admin");
    console.log("Password: Admin@12345");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin seed failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin();
