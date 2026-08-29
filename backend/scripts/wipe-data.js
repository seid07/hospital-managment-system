require("dotenv").config({ path: "./.env" });
const pool = require("../src/config/database");
const bcrypt = require("bcrypt");

async function wipeData() {
  const client = await pool.connect();
  try {
    console.log("Starting comprehensive data wipe of all patients, clinical transactions, reports data, and non-admin staff...");
    await client.query("BEGIN");

    // 1. Delete patient clinical and transactional data
    await client.query("DELETE FROM referral_messages");
    await client.query("DELETE FROM referrals");
    await client.query("DELETE FROM payment_allocations");
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM invoice_items");
    await client.query("DELETE FROM invoices");
    await client.query("DELETE FROM service_orders");
    await client.query("DELETE FROM queue_entries");
    await client.query("DELETE FROM admissions");
    await client.query("DELETE FROM surgery_orders");
    await client.query("DELETE FROM procedure_orders");
    await client.query("DELETE FROM radiology_orders");
    await client.query("DELETE FROM lab_results");
    await client.query("DELETE FROM lab_orders");
    await client.query("DELETE FROM prescriptions");
    await client.query("DELETE FROM diagnoses");
    await client.query("DELETE FROM encounters");
    await client.query("DELETE FROM vitals");
    await client.query("DELETE FROM appointments");
    await client.query("DELETE FROM visits");
    await client.query("DELETE FROM patients");

    // 2. Delete inventory transactions, schedules, password resets, notifications
    await client.query("DELETE FROM inventory_transactions");
    await client.query("DELETE FROM notifications");
    await client.query("DELETE FROM doctor_schedules");
    await client.query("DELETE FROM password_resets");

    // 3. Delete audit logs, users, and staff
    await client.query("DELETE FROM audit_logs");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM staff");

    // 4. Re-seed clean default Administrator so system remains accessible
    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1");
    if (roleResult.rows.length === 0) {
      throw new Error("ADMIN role not found.");
    }
    const adminRoleId = roleResult.rows[0].id;
    const passwordHash = await bcrypt.hash("Admin@12345", 12);

    const staffResult = await client.query(
      `INSERT INTO staff (first_name, last_name, email, phone, department, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ["System", "Administrator", "admin@hospital.local", "0900000000", "Administration", adminRoleId]
    );
    const adminStaffId = staffResult.rows[0].id;

    await client.query(
      `INSERT INTO users (staff_id, username, password_hash)
       VALUES ($1, $2, $3)`,
      [adminStaffId, "admin", passwordHash]
    );

    await client.query("COMMIT");
    console.log("SUCCESS: All patients and transactional data wiped. All admin dashboard boxes, audit logs, and domain reports are now 0. Initialized clean Admin (username: admin, password: Admin@12345).");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED to wipe data:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

wipeData();
