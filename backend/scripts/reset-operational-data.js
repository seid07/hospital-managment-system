const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const db = require("../src/config/database");

async function resetOperationalData() {
  const client = await db.connect();
  try {
    console.log("Starting operational data reset...");
    await client.query("BEGIN");

    // 1. Nursing, Surgery, Procedures, Radiology, Ward Transfers
    await client.query("DELETE FROM medication_administrations");
    await client.query("DELETE FROM nursing_notes");
    await client.query("DELETE FROM nursing_tasks");
    await client.query("DELETE FROM ward_transfers");
    await client.query("DELETE FROM surgery_orders");
    await client.query("DELETE FROM procedure_orders");
    await client.query("DELETE FROM radiology_orders");

    // 2. Admissions & reset beds to AVAILABLE
    await client.query("DELETE FROM admissions");
    await client.query("UPDATE beds SET status = 'AVAILABLE'");

    // 3. Referrals & Messages
    await client.query("DELETE FROM referral_messages");
    await client.query("DELETE FROM referrals");

    // 4. Lab results & Lab orders
    await client.query("DELETE FROM lab_results");
    await client.query("DELETE FROM lab_orders");

    // 5. Billing & Payments (Must precede encounters & visits)
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM invoice_items");
    await client.query("DELETE FROM invoices");

    // 6. Prescriptions
    await client.query("DELETE FROM prescriptions");

    // 7. Diagnoses & Encounters
    await client.query("DELETE FROM diagnoses");
    await client.query("DELETE FROM encounters");

    // 8. Vitals
    await client.query("DELETE FROM vitals");

    // 9. Queue entries & Service Orders
    await client.query("DELETE FROM queue_entries");
    await client.query("DELETE FROM service_orders");

    // 10. Appointments & Visits
    await client.query("DELETE FROM appointments");
    await client.query("DELETE FROM visits");

    // 11. Patients
    await client.query("DELETE FROM patients");

    // 12. Audit Logs & Notifications
    await client.query("DELETE FROM notifications");
    await client.query("DELETE FROM audit_logs");

    await client.query("COMMIT");
    console.log("✓ Operational data successfully reset to clean slate (all dashboard counters = 0).");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to reset operational data:", error);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

resetOperationalData();
