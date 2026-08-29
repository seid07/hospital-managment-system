require("dotenv").config();
const pool = require("../src/config/database");

async function clearPatientsAndFinance() {
  const client = await pool.connect();
  try {
    console.log("Beginning patient, clinical, and financial data reset...");
    await client.query("BEGIN");

    // 1. Delete patient-related transactional and clinical records in foreign-key safe order
    await client.query("DELETE FROM inventory_transactions");
    await client.query("DELETE FROM prescriptions");
    await client.query("DELETE FROM lab_results");
    await client.query("DELETE FROM lab_orders");
    await client.query("DELETE FROM radiology_orders");
    await client.query("DELETE FROM procedure_orders");
    await client.query("DELETE FROM surgery_orders");
    await client.query("DELETE FROM admissions");
    await client.query("DELETE FROM queue_entries");
    await client.query("DELETE FROM payment_allocations");
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM invoice_items");
    await client.query("DELETE FROM invoices");
    await client.query("DELETE FROM service_orders");
    await client.query("DELETE FROM vitals");
    await client.query("DELETE FROM diagnoses");
    await client.query("DELETE FROM encounters");
    await client.query("DELETE FROM visits");
    await client.query("DELETE FROM appointments");
    await client.query("DELETE FROM referral_messages");
    await client.query("DELETE FROM referrals");

    // 2. Delete all patients
    await client.query("DELETE FROM patients");

    // 3. Reset document numbering sequences
    await client.query("CREATE SEQUENCE IF NOT EXISTS seq_appointment_num START 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_appointment_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_payment_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_invoice_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_prescription_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_lab_order_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_patient_num START 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_patient_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_visit_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_order_num RESTART WITH 100");
    await client.query("ALTER SEQUENCE IF EXISTS seq_admission_num RESTART WITH 100");

    await client.query("COMMIT");

    // 4. Verification queries
    const patRes = await pool.query("SELECT COUNT(*) AS count FROM patients");
    const revRes = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments");
    const unpRes = await pool.query("SELECT COALESCE(SUM(balance_amount), 0) AS total FROM invoices WHERE status IN ('PENDING', 'PARTIALLY_PAID')");
    const staffRes = await pool.query("SELECT COUNT(*) AS count FROM staff");
    const userRes = await pool.query("SELECT COUNT(*) AS count FROM users");

    console.log("\n================ RESET COMPLETED ================");
    console.log(`TOTAL PATIENTS:     ${patRes.rows[0].count} (Expected: 0)`);
    console.log(`TOTAL REVENUE:      $${Number(revRes.rows[0].total).toFixed(2)} (Expected: $0.00)`);
    console.log(`UNPAID INVOICES:    $${Number(unpRes.rows[0].total).toFixed(2)} (Expected: $0.00)`);
    console.log(`ACTIVE STAFF:       ${staffRes.rows[0].count} (Preserved)`);
    console.log(`ACTIVE USERS:       ${userRes.rows[0].count} (Preserved)`);
    console.log("=================================================\n");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error clearing patients and financial records:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

clearPatientsAndFinance();
