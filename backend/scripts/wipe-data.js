require("dotenv").config({ path: "./.env" });
const pool = require("../src/config/database");
const bcrypt = require("bcrypt");

async function wipeData() {
  const client = await pool.connect();
  try {
    console.log("Starting comprehensive hospital database wipe...");
    await client.query("BEGIN");

    // 1. Nursing & Clinical Extensions
    await client.query("DELETE FROM ward_transfers;");
    await client.query("DELETE FROM medication_administrations;");
    await client.query("DELETE FROM nursing_notes;");
    await client.query("DELETE FROM nursing_tasks;");

    // 2. Doctor Referral Chat & Referrals
    await client.query("DELETE FROM referral_messages;");
    await client.query("DELETE FROM referrals;");

    // 3. Payments & Billing
    await client.query("DELETE FROM payment_allocations;");
    await client.query("DELETE FROM payments;");
    await client.query("DELETE FROM invoice_items;");
    await client.query("DELETE FROM invoices;");

    // 4. Clinical Service Orders & Queues
    await client.query("DELETE FROM service_orders;");
    await client.query("DELETE FROM queue_entries;");
    await client.query("DELETE FROM surgery_orders;");
    await client.query("DELETE FROM procedure_orders;");
    await client.query("DELETE FROM radiology_orders;");
    await client.query("DELETE FROM lab_results;");
    await client.query("DELETE FROM lab_orders;");

    // 5. Prescriptions & Inventory Transactions
    await client.query("DELETE FROM prescriptions;");
    await client.query("DELETE FROM inventory_transactions;");

    // 6. Consultations, Vitals, Admissions, Appointments, Visits, Patients
    await client.query("DELETE FROM diagnoses;");
    await client.query("DELETE FROM encounters;");
    await client.query("DELETE FROM vitals;");
    await client.query("DELETE FROM admissions;");
    await client.query("DELETE FROM appointments;");
    await client.query("DELETE FROM visits;");
    await client.query("DELETE FROM patients;");

    // 7. Reset bed occupancy
    await client.query("UPDATE beds SET status = 'AVAILABLE';");

    // 8. Schedules, Tokens, Verifications, Notifications, History
    await client.query("DELETE FROM notifications;");
    await client.query("DELETE FROM doctor_schedules;");
    await client.query("DELETE FROM password_resets;");
    await client.query("DELETE FROM staff_email_verifications;");
    await client.query("DELETE FROM service_price_history;");
    await client.query("DELETE FROM medicine_price_history;");

    // 9. Wipe Audit Logs completely (Count = 0)
    await client.query("DELETE FROM audit_logs;");

    // 10. Delete all users and staff
    await client.query("DELETE FROM users;");
    await client.query("DELETE FROM staff;");

    // 11. Re-seed clean default Administrator (username: admin, password: Admin@12345)
    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'ADMIN' LIMIT 1;");
    if (roleResult.rows.length === 0) {
      throw new Error("ADMIN role not found in database.");
    }
    const adminRoleId = roleResult.rows[0].id;
    const passwordHash = await bcrypt.hash("Admin@12345", 10);

    const staffResult = await client.query(
      `INSERT INTO staff (first_name, last_name, email, phone, department, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id;`,
      ["System", "Administrator", "admin@hospital.local", "0911000000", "Administration", adminRoleId]
    );
    const adminStaffId = staffResult.rows[0].id;

    await client.query(
      `INSERT INTO users (staff_id, username, password_hash, must_change_password)
       VALUES ($1, $2, $3, FALSE);`,
      [adminStaffId, "admin", passwordHash]
    );

    // Double-check audit_logs is 0
    await client.query("DELETE FROM audit_logs;");

    await client.query("COMMIT");
    console.log("===============================================================================");
    console.log("DATABASE RESET SUCCESSFUL:");
    console.log("✓ All patients, encounters, diagnoses, vitals, visits, and appointments: 0");
    console.log("✓ All lab, radiology, procedure, surgery, and inpatient records: 0");
    console.log("✓ All invoices, payments, cashier orders, and ledger transactions: 0");
    console.log("✓ All system audit logs: 0");
    console.log("✓ All non-admin staff and users removed");
    console.log("✓ Clean Admin account ready:");
    console.log("    Username: admin");
    console.log("    Password: Admin@12345");
    console.log("    Role: ADMIN");
    console.log("===============================================================================");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED to wipe data:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

wipeData();
