const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

const authService = require("../src/services/auth.service");
const patientService = require("../src/services/patient.service");
const visitService = require("../src/services/visit.service");
const serviceCatalog = require("../src/services/serviceCatalog.service");
const serviceOrderService = require("../src/services/serviceOrder.service");
const billingService = require("../src/services/billing.service");
const { ensureTestUsers } = require("./helpers/setup-test-users");

test("Returning Patient Service Workflow Integration Suite", async (t) => {
  await ensureTestUsers();

  let registrarUser;
  let testPatient;
  let generalConsultService;
  const createdPatientIds = [];

  t.after(async () => {
    // CRITICAL: Cleanup all test data generated during this test run
    if (createdPatientIds.length > 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Delete related test records
        await client.query(
          "DELETE FROM queue_entries WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM payment_allocations WHERE service_order_id IN (SELECT id FROM service_orders WHERE patient_id = ANY($1))",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id = ANY($1))",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM invoices WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM service_orders WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM encounters WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM appointments WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM visits WHERE patient_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM audit_logs WHERE entity = 'patients' AND entity_id = ANY($1)",
          [createdPatientIds]
        );
        await client.query(
          "DELETE FROM patients WHERE id = ANY($1)",
          [createdPatientIds]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        console.error("Cleanup error in returning patient test:", e);
      } finally {
        client.release();
      }
    }
  });

  // Setup: Login as registrar
  const registrarLogin = await authService.login("registrar", "Hospital@12345");
  registrarUser = registrarLogin.user;

  // Fetch consultation service
  const allServices = await serviceCatalog.getServices({ activeOnly: true });
  generalConsultService = allServices.find((s) => s.code === "SRV-CONS-GEN" || s.code === "CONSULT-GENERAL") || allServices[0];
  assert.ok(generalConsultService, "Consultation service exists in catalog");

  // Step 1: Create initial patient (First Time Registration)
  testPatient = await patientService.createPatient({
    firstName: "Solomon",
    lastName: "ReturningTest",
    dateOfBirth: "1988-04-15",
    gender: "Male",
    phone: "0911554433",
    email: "solomon.returning@hospital.test",
    address: "Bole Subcity, Woreda 03",
    emergencyContactName: "Almaz Test",
    emergencyContactPhone: "0912443322",
  }, registrarUser.id);

  createdPatientIds.push(testPatient.id);
  assert.ok(testPatient.id, "Patient created with ID");
  assert.ok(testPatient.patient_number.startsWith("PAT-"), "Has permanent MRN");

  await t.test("Search identifies existing patient with visit counters", async () => {
    const searchRes = await patientService.searchPatients("0911554433");
    assert.ok(searchRes.patients.length > 0, "Patient found by phone");
    const found = searchRes.patients.find((p) => p.id === testPatient.id);
    assert.ok(found, "Patient is in search results");
    assert.equal(found.total_visits_count, testPatient.registrationOrderId ? 1 : 0);
  });

  await t.test("Create Visit #1 for returning patient without creating duplicate patient record", async () => {
    // 1. Create Visit 1
    const visit1 = await visitService.createVisit({
      patientId: testPatient.id,
      visitType: "OUTPATIENT",
      notes: "First intake visit",
    }, registrarUser.id);

    assert.ok(visit1.id, "Visit 1 created");
    assert.ok(visit1.visit_number, "Visit has visit number");
    assert.equal(visit1.patient_id, testPatient.id, "Attached to original patient ID");

    // 2. Order consultation service
    const orderRes = await serviceOrderService.createServiceOrders({
      visitId: visit1.id,
      patientId: testPatient.id,
      items: [{ serviceId: generalConsultService.id, price: parseFloat(generalConsultService.price) }],
      generateInvoice: true,
    }, registrarUser.id);

    assert.ok(orderRes.serviceOrders.length > 0, "Service order created");

    // 3. Process payment
    const payment = await billingService.recordPayment({
      invoiceId: orderRes.invoice.id,
      amount: parseFloat(orderRes.invoice.total_amount),
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });
    assert.ok(payment.payment.id, "Payment recorded");
  });

  await t.test("Update Demographics updates existing patient and writes audit log", async () => {
    const updated = await patientService.updatePatient(
      testPatient.id,
      {
        phone: "0922334455",
        address: "Yeka Subcity, Woreda 05",
        emergencyContactName: "Tigist Test",
        emergencyContactPhone: "0933445566",
      },
      registrarUser.id
    );

    assert.ok(updated.phone.includes("922334455"), "Phone updated");
    assert.equal(updated.address, "Yeka Subcity, Woreda 05", "Address updated");

    // Verify Audit log was written
    const auditRes = await pool.query(
      "SELECT * FROM audit_logs WHERE entity = 'patients' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [testPatient.id]
    );
    assert.ok(auditRes.rows.length > 0, "Audit log created");
    assert.equal(auditRes.rows[0].action, "PATIENT_UPDATED");
  });

  await t.test("Returning search reflects incremented visits and updated phone number", async () => {
    const searchRes = await patientService.searchPatients("0922334455");
    const found = searchRes.patients.find((p) => p.id === testPatient.id);
    assert.ok(found, "Found by updated phone");
    const expectedCount = testPatient.registrationOrderId ? 2 : 1;
    assert.equal(found.total_visits_count, expectedCount, "Reflects lifetime visits");
    assert.ok(found.last_visit_date, "Has last visit timestamp");
  });

  await t.test("Create Visit #2 for the same patient (Strict No Duplicate Patient)", async () => {
    // Ensure patient count in DB before creating Visit 2
    const beforeCountRes = await pool.query("SELECT COUNT(*) AS total FROM patients WHERE is_active = TRUE");
    const beforeCount = parseInt(beforeCountRes.rows[0].total, 10);

    // Create Visit 2
    const visit2 = await visitService.createVisit({
      patientId: testPatient.id,
      visitType: "FOLLOW_UP",
      notes: "Follow-up consultation visit",
    }, registrarUser.id);

    assert.ok(visit2.id, "Visit 2 created");
    assert.notEqual(visit2.id, testPatient.id, "Visit ID is distinct from Patient ID");
    assert.equal(visit2.patient_id, testPatient.id, "Visit 2 linked to same patient");

    // Order & Authorize
    const orderRes = await serviceOrderService.createServiceOrders({
      visitId: visit2.id,
      patientId: testPatient.id,
      items: [{ serviceId: generalConsultService.id, price: parseFloat(generalConsultService.price) }],
      generateInvoice: true,
    }, registrarUser.id);

    await billingService.recordPayment({
      invoiceId: orderRes.invoice.id,
      amount: parseFloat(orderRes.invoice.total_amount),
      paymentMethod: "TELEBIRR",
      receivedBy: registrarUser.id,
    });

    // Ensure total patient count in DB did NOT increase
    const afterCountRes = await pool.query("SELECT COUNT(*) AS total FROM patients WHERE is_active = TRUE");
    const afterCount = parseInt(afterCountRes.rows[0].total, 10);
    assert.equal(afterCount, beforeCount, "NO duplicate patient record created");

    // Verify patient's total visits count
    const refreshedPatient = await patientService.getPatientById(testPatient.id);
    const finalExpectedCount = testPatient.registrationOrderId ? 3 : 2;
    assert.equal(refreshedPatient.total_visits_count, finalExpectedCount, "Patient visits count properly incremented");

    // Verify visits list under this patient has visits chronologically
    const patientVisits = await pool.query(
      "SELECT id, visit_number, visit_type, status, created_at FROM visits WHERE patient_id = $1 ORDER BY created_at DESC",
      [testPatient.id]
    );
    assert.equal(patientVisits.rows.length, finalExpectedCount, "All visits linked to same single patient");
    assert.equal(patientVisits.rows[0].visit_type, "FOLLOW_UP", "Most recent visit is FOLLOW_UP");
  });

  await t.test("Duplicate patient creation is strictly blocked and returns existing patient profile", async () => {
    // Attempt 1: Duplicate phone number
    await assert.rejects(
      async () => {
        await patientService.createPatient({
          firstName: "Another",
          lastName: "Person",
          dateOfBirth: "1995-01-01",
          gender: "Female",
          phone: "0922334455", // Same updated phone as testPatient
        }, registrarUser.id);
      },
      (err) => {
        assert.equal(err.code, "DUPLICATE_PATIENT_EXISTS");
        assert.ok(err.existingPatient, "Returns existing patient");
        assert.equal(err.existingPatient.id, testPatient.id);
        return true;
      }
    );

    // Attempt 2: Duplicate First Name + Last Name + Date of Birth
    await assert.rejects(
      async () => {
        await patientService.createPatient({
          firstName: "Solomon",
          lastName: "ReturningTest",
          dateOfBirth: "1988-04-15",
          gender: "Male",
          phone: "0988776655", // Different phone, but same name + DOB
        }, registrarUser.id);
      },
      (err) => {
        assert.equal(err.code, "DUPLICATE_PATIENT_EXISTS");
        assert.ok(err.existingPatient, "Returns existing patient");
        assert.equal(err.existingPatient.patient_number, testPatient.patient_number);
        return true;
      }
    );
  });

  await t.test("Selective payment handles non-existent or stale receivedBy without FK error", async () => {
    // Create an order
    const visit3 = await visitService.createVisit({
      patientId: testPatient.id,
      visitType: "OUTPATIENT",
      notes: "FK Resiliency Visit",
    }, "00000000-0000-0000-0000-000000000000"); // Non-existent user ID

    const orderRes = await serviceOrderService.createServiceOrders({
      visitId: visit3.id,
      patientId: testPatient.id,
      items: [{ serviceId: generalConsultService.id, price: parseFloat(generalConsultService.price) }],
      generateInvoice: true,
    }, registrarUser.id);

    // Process selective payment with non-existent receivedBy
    const payRes = await billingService.recordSelectivePayment({
      patientId: testPatient.id,
      visitId: visit3.id,
      invoiceId: orderRes.invoice.id,
      serviceOrderIds: [orderRes.serviceOrders[0].id],
      paymentMethod: "CASH",
      receivedBy: "00000000-0000-0000-0000-000000000000", // Stale/non-existent user ID
    });

    assert.ok(payRes.payment, "Payment recorded successfully without FK violation");
    assert.equal(payRes.payment.received_by, null, "Sanitized to null");
    assert.equal(payRes.authorizedOrders[0].status, "PAID");
  });
});
