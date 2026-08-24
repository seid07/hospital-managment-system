require("dotenv").config();
const pool = require("../src/config/database");

async function resetCleanDatabase() {
  const client = await pool.connect();
  try {
    console.log("Starting complete database reset to production-clean state...");
    await client.query("BEGIN");

    // 1. Delete patient-related transactional, clinical, financial, and queue records in foreign-key safe order
    console.log("Cleaning inventory transactions and prescriptions...");
    await client.query("DELETE FROM inventory_transactions");
    await client.query("DELETE FROM prescriptions");

    console.log("Cleaning lab orders and results...");
    await client.query("DELETE FROM lab_results");
    await client.query("DELETE FROM lab_orders");

    console.log("Cleaning specialized clinical modality orders...");
    await client.query("DELETE FROM radiology_orders");
    await client.query("DELETE FROM procedure_orders");
    await client.query("DELETE FROM surgery_orders");
    await client.query("DELETE FROM admissions");

    console.log("Cleaning department queues and financial records...");
    await client.query("DELETE FROM queue_entries");
    await client.query("DELETE FROM payment_allocations");
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM invoice_items");
    await client.query("DELETE FROM invoices");
    await client.query("DELETE FROM service_orders");

    console.log("Cleaning clinical encounters, diagnoses, and vitals...");
    await client.query("DELETE FROM vitals");
    await client.query("DELETE FROM diagnoses");
    await client.query("DELETE FROM encounters");
    await client.query("DELETE FROM visits");
    await client.query("DELETE FROM appointments");
    await client.query("DELETE FROM doctor_schedules");

    console.log("Cleaning notifications, password resets, and audit logs...");
    await client.query("DELETE FROM notifications");
    await client.query("DELETE FROM password_resets");
    await client.query("DELETE FROM audit_logs");

    console.log("Cleaning patient registry...");
    await client.query("DELETE FROM patients");

    console.log("Cleaning user and staff accounts (PATIENTS = 0, STAFF = 0)...");
    await client.query("DELETE FROM users");
    await client.query("DELETE FROM staff");

    // Reset sequences to clean starting points
    console.log("Resetting document number sequences...");
    await client.query("CREATE SEQUENCE IF NOT EXISTS seq_appointment_num START 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_appointment_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_payment_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_invoice_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_prescription_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_lab_order_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_patient_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_visit_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_order_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_admission_num RESTART WITH 100");

    await client.query("COMMIT");

    // Verify final counts
    const patientCount = await pool.query("SELECT COUNT(*) AS count FROM patients");
    const staffCount = await pool.query("SELECT COUNT(*) AS count FROM staff");
    const userCount = await pool.query("SELECT COUNT(*) AS count FROM users");
    const invoiceCount = await pool.query("SELECT COUNT(*) AS count FROM invoices");
    const paymentCount = await pool.query("SELECT COUNT(*) AS count FROM payments");
    const serviceCount = await pool.query("SELECT COUNT(*) AS count FROM services");
    const medCount = await pool.query("SELECT COUNT(*) AS count FROM medications");
    const deptCount = await pool.query("SELECT COUNT(*) AS count FROM departments");
    const roleCount = await pool.query("SELECT COUNT(*) AS count FROM roles");

    console.log("\n================ DATABASE RESET SUMMARY ================");
    console.log(`PATIENTS:         ${patientCount.rows[0].count} (Expected: 0)`);
    console.log(`STAFF MEMBERS:    ${staffCount.rows[0].count} (Expected: 0)`);
    console.log(`USERS:            ${userCount.rows[0].count} (Expected: 0)`);
    console.log(`INVOICES:         ${invoiceCount.rows[0].count} (Expected: 0)`);
    console.log(`PAYMENTS:         ${paymentCount.rows[0].count} (Expected: 0)`);
    console.log("-------------------------------------------------------");
    console.log(`PRESERVED SERVICES:    ${serviceCount.rows[0].count}`);
    console.log(`PRESERVED MEDICATIONS: ${medCount.rows[0].count}`);
    console.log(`PRESERVED DEPARTMENTS: ${deptCount.rows[0].count}`);
    console.log(`PRESERVED ROLES:       ${roleCount.rows[0].count}`);
    console.log("========================================================\n");
    console.log("Database reset complete. Ready for production staff creation.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database reset error:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  resetCleanDatabase();
}

module.exports = { resetCleanDatabase };
