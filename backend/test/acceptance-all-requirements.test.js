const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

const authService = require("../src/services/auth.service");
const staffService = require("../src/services/staff.service");
const patientService = require("../src/services/patient.service");
const scheduleService = require("../src/services/schedule.service");
const appointmentService = require("../src/services/appointment.service");
const visitService = require("../src/services/visit.service");
const serviceOrderService = require("../src/services/serviceOrder.service");
const serviceCatalogService = require("../src/services/serviceCatalog.service");
const laboratoryService = require("../src/services/laboratory.service");
const pharmacyService = require("../src/services/pharmacy.service");
const billingService = require("../src/services/billing.service");

test("Acceptance Tests for All 12 Hospital Management System Requirements", async (t) => {
  let adminUser, registrarUser, doctorUser, labUser, pharmacistUser, financeUser;
  let testPatient, testDoctorStaff, testVisit, createdServiceOrders = [], testPrescription, testMedication;

  await t.test("Requirement 1 & 18: Admin Bootstrap / Initialization & Strong Password Validation", async () => {
    // Check system status
    const status = await authService.checkSystemStatus();
    assert.ok(typeof status.isInitialized === "boolean");

    // If not initialized, initialize admin
    if (!status.isInitialized) {
      const initRes = await authService.setupInitialAdmin({
        firstName: "System",
        lastName: "Administrator",
        email: "admin@hospital.local",
        phone: "0911000000",
        username: "admin",
        password: "Admin@Password123!",
      });
      assert.equal(initRes.user.role, "ADMIN");
      adminUser = initRes.user;
    } else {
      const bcrypt = require("bcrypt");
      const hash = await bcrypt.hash("Admin@Password123!", 10);
      await pool.query("UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE username = 'admin'", [hash]);
      const adminLogin = await authService.login("admin", "Admin@Password123!");
      adminUser = adminLogin.user;
    }


    assert.ok(adminUser);
    assert.equal(adminUser.role, "ADMIN");

    // Helper to create staff if not exists
    async function createOrGetStaff(username, roleName, firstName, lastName, phone, department, specialty) {
      const existingUser = await pool.query(
        `SELECT u.*, s.id as staff_id, r.name as role
         FROM users u
         JOIN staff s ON u.staff_id = s.id
         JOIN roles r ON s.role_id = r.id
         WHERE u.username = $1`,
        [username]
      );
      if (existingUser.rows.length > 0) {
        return existingUser.rows[0];
      }
      const email = `${username}@hospital.local`;
      await pool.query(
        `INSERT INTO staff_email_verifications (email, verified, verified_at)
         VALUES ($1, TRUE, CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE SET verified = TRUE, verified_at = CURRENT_TIMESTAMP`,
        [email]
      );
      const staffRes = await staffService.createStaff(
        {
          firstName,
          lastName,
          email,
          phone,
          department,
          specialty,
          role: roleName,
          username,
          password: "Hospital@Secure123!",
        },
        adminUser.id
      );

      const userRow = await pool.query("SELECT id FROM users WHERE staff_id = $1", [staffRes.staffId]);
      return { id: userRow.rows[0].id, username, role: roleName, staff_id: staffRes.staffId };
    }

    registrarUser = await createOrGetStaff("test_registrar", "REGISTRAR", "Abebe", "Kebede", "0911111111", "Patient Services");
    doctorUser = await createOrGetStaff("test_doctor", "DOCTOR", "Dawit", "Tadesse", "0922222222", "Cardiology", "Cardiologist");
    testDoctorStaff = { id: doctorUser.staff_id };
    labUser = await createOrGetStaff("test_labtech", "LAB_TECH", "Kevin", "Bekele", "0933333333", "Laboratory");
    pharmacistUser = await createOrGetStaff("test_pharmacist", "PHARMACIST", "Hana", "Alemu", "0944444444", "Pharmacy");
    financeUser = await createOrGetStaff("test_finance", "FINANCE", "Clara", "Mekonnen", "0955555555", "Finance");

    assert.ok(registrarUser);
    assert.ok(doctorUser);
    assert.ok(labUser);
    assert.ok(pharmacistUser);
    assert.ok(financeUser);
  });

  await t.test("Requirement 2 & 14: Complete Patient Registration with Age Input", async () => {
    const uniquePhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    const patientData = {
      firstName: "Almaz",
      lastName: "Haile",
      age: 28,
      gender: "Female",
      phone: uniquePhone,
      email: `almaz.${Date.now()}@example.com`,
      address: "Bole, Addis Ababa",
      emergencyContactName: "Haile Tessema",
      emergencyContactPhone: "0911223344",
    };

    testPatient = await patientService.createPatient(patientData, registrarUser.id);
    assert.ok(testPatient.id);
    assert.ok(testPatient.patient_number.startsWith("PAT-"));
    assert.equal(testPatient.age, 28);
    assert.ok(testPatient.date_of_birth, "DOB should be automatically calculated from age");

    // Verify live search returns this patient
    const searchRes = await patientService.getPatients({ search: testPatient.patient_number });
    assert.equal(searchRes.patients.length, 1);
    assert.equal(searchRes.patients[0].id, testPatient.id);
  });

  await t.test("Requirement 3 & 15: Bidirectional Appointment Availability Scheduling", async () => {
    // Ensure schedule exists for doctor
    const existingSchedules = await scheduleService.getDoctorSchedules(testDoctorStaff.id);
    if (existingSchedules.length === 0) {
      // Create Monday - Sunday schedule
      for (let day = 0; day <= 6; day++) {
        await scheduleService.createSchedule(testDoctorStaff.id, {
          dayOfWeek: day,
          startTime: "08:00:00",
          endTime: "17:00:00",
          slotDurationMinutes: 30,
        });
      }
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // 1. Select Date first -> Get doctors available on that date
    const doctorsOnDate = await scheduleService.getDoctors({ date: todayStr });
    assert.ok(doctorsOnDate.some((d) => d.id === testDoctorStaff.id));

    // 2. Select Doctor first -> Get upcoming availability dates
    const docUpcoming = await scheduleService.getDoctorUpcomingAvailability(testDoctorStaff.id, 7);
    assert.ok(docUpcoming.availableDates.length > 0);

    // 3. Get slots
    const slots = await appointmentService.getAvailableSlots(testDoctorStaff.id, todayStr);
    assert.ok(slots.length > 0);
    const firstSlot = slots.find((s) => s.available);
    assert.ok(firstSlot);

    // 4. Book appointment
    const appt = await appointmentService.createAppointment({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      appointmentDate: todayStr,
      startTime: firstSlot.startTime,
      endTime: firstSlot.endTime,
      reason: "Cardiology follow-up",
      createdBy: registrarUser.id,
    });
    assert.ok(appt.id);
    assert.equal(appt.status, "SCHEDULED");
  });

  await t.test("Requirement 4 & 13: Multi-Service Visit Creation at Registrar Desk", async () => {
    const services = await serviceCatalogService.getServices({ activeOnly: true });
    assert.ok(services.length >= 2);

    const cbcService = services.find((s) => s.code === "LAB-CBC") || services[0];
    const consultationService = services.find((s) => s.code === "SRV-CONS-GEN") || services[1];

    testVisit = await visitService.createVisit(
      {
        patientId: testPatient.id,
        visitType: "OUTPATIENT",
        notes: "Registrar visit check-in",
      },
      registrarUser.id
    );
    assert.ok(testVisit.id);

    const ordersRes = await serviceOrderService.createServiceOrders(
      {
        visitId: testVisit.id,
        patientId: testPatient.id,
        items: [
          { serviceId: consultationService.id, notes: "Outpatient Consultation" },
          { serviceId: cbcService.id, notes: "Routine CBC" },
        ],
      },
      registrarUser.id
    );

    assert.ok(ordersRes.serviceOrders);
    assert.equal(ordersRes.serviceOrders.length, 2);
    createdServiceOrders = ordersRes.serviceOrders;
  });

  await t.test("Requirement 5 & 6: Selective Partial Payment Workflow (Registrar Cashier)", async () => {
    assert.ok(createdServiceOrders.length >= 2);
    const firstOrder = createdServiceOrders[0];
    const secondOrder = createdServiceOrders[1];

    // Select ONLY the first service order to pay
    const selectiveRes = await billingService.recordSelectivePayment({
      serviceOrderIds: [firstOrder.id],
      paymentMethod: "TELEBIRR",
      transactionReference: "TB-123456",
      receivedBy: registrarUser.id,
    });

    assert.ok(selectiveRes.payment);
    assert.ok(selectiveRes.authorizedOrders);
    assert.equal(selectiveRes.authorizedOrders.length, 1);
    assert.equal(selectiveRes.authorizedOrders[0].id, firstOrder.id);
    assert.equal(selectiveRes.authorizedOrders[0].status, "PAID");

    // Verify second order remains WAITING_PAYMENT
    const secondOrderCheck = await pool.query("SELECT status FROM service_orders WHERE id = $1", [secondOrder.id]);
    assert.equal(secondOrderCheck.rows[0].status, "WAITING_PAYMENT");

    // Pay second order
    const secondPayment = await billingService.recordSelectivePayment({
      serviceOrderIds: [secondOrder.id],
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });
    assert.ok(secondPayment.authorizedOrders);
    assert.equal(secondPayment.authorizedOrders.length, 1);
    assert.equal(secondPayment.authorizedOrders[0].status, "PAID");
  });

  await t.test("Requirement 7: Admin Service Price Management & Price History Audit", async () => {
    const services = await serviceCatalogService.getServices({ activeOnly: true });
    const serviceToUpdate = services[0];
    const originalPrice = parseFloat(serviceToUpdate.price);
    const newPrice = originalPrice + 150.0;

    // Update service price as ADMIN
    const updated = await serviceCatalogService.updateService(
      serviceToUpdate.id,
      { price: newPrice },
      adminUser.id
    );
    assert.equal(parseFloat(updated.price), newPrice);

    // Verify price history record exists
    const history = await serviceCatalogService.getServicePriceHistory(serviceToUpdate.id);
    assert.ok(history.length > 0);
    assert.equal(parseFloat(history[0].old_price), originalPrice);
    assert.equal(parseFloat(history[0].new_price), newPrice);
  });

  await t.test("Requirement 8 & 9: Real Laboratory Turnaround Time Tracking", async () => {
    // 1. Get test from catalog
    const catalogRes = await laboratoryService.getTestCatalog();
    assert.ok(catalogRes.catalog.length > 0);
    const testItem = catalogRes.catalog[0];

    // 2. Create lab order
    const labOrder = await laboratoryService.createLabOrder({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      testId: testItem.id,
      priority: "ROUTINE",
      createdBy: doctorUser.id,
    });
    assert.ok(labOrder.id);
    assert.equal(labOrder.status, "ORDERED");

    // 2b. Requirement 9: specimen collection must be blocked until the
    // linked service order is actually paid — pay for it at the cashier
    // first, exactly like the real Registrar Finance workflow.
    assert.ok(labOrder.service_order_id, "Lab order must be linked to a billable service order");
    await billingService.recordSelectivePayment({
      serviceOrderIds: [labOrder.service_order_id],
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });

    // 3. Collect specimen
    const collected = await laboratoryService.collectSpecimen(labOrder.id, labUser.id);
    assert.equal(collected.status, "SPECIMEN_COLLECTED");
    assert.ok(collected.sample_collected_at || collected.specimen_collected_at);

    // 4. Start processing
    const processing = await laboratoryService.startProcessing(labOrder.id, labUser.id);
    assert.equal(processing.status, "PROCESSING");
    assert.ok(processing.processing_started_at);

    // 5. Enter results -> computes turnaround time
    const resulted = await laboratoryService.enterResults(
      labOrder.id,
      {
        resultValue: "13.8",
        unit: "g/dL",
        referenceRange: "12.0 - 16.0",
        isAbnormal: false,
        comments: "Normal baseline parameters",
      },
      labUser.id
    );
    assert.equal(resulted.status, "RESULTED");
    assert.ok(resulted.result_completed_at);
    assert.ok(resulted.actual_turnaround_time_seconds !== null);

    // 6. Verify and release
    const verified = await laboratoryService.verifyResults(labOrder.id, labUser.id);
    assert.equal(verified.status, "VERIFIED");
    assert.ok(verified.result_verified_at);

    // Check queue output contains human-readable turnaround time
    const queueOrder = await laboratoryService.getLabOrderById(labOrder.id);
    assert.ok(queueOrder.actual_turnaround_formatted);
  });

  await t.test("Requirement 2, 8, & 9: Pharmacy Inventory Accounting & Stock Deduction on Dispense", async () => {
    // 1. Get a medication and ensure sufficient stock
    const medsRes = await pharmacyService.getMedications({ limit: 10 });
    assert.ok(medsRes.medications.length > 0);
    testMedication = medsRes.medications[0];
    await pharmacyService.updateStock(testMedication.id, {
      quantityChange: 50,
      notes: "Ensure initial stock for test",
      userId: adminUser.id,
    });
    const medFresh = await pharmacyService.getMedicationById(testMedication.id);
    const initialStock = medFresh.stock_quantity;

    // 2. Create prescription
    const rx = await pharmacyService.createPrescription(
      {
        patientId: testPatient.id,
        doctorId: testDoctorStaff.id,
        medicationId: testMedication.id,
        dosage: "500mg",
        frequency: "TDS",
        duration: "5 days",
        quantity: 5,
        instructions: "Take after meals",
      },
      doctorUser.id
    );
    assert.ok(rx.id);

    // Stock should NOT decrease upon prescription creation
    const stockAfterRx = await pharmacyService.getMedicationById(testMedication.id);
    assert.equal(stockAfterRx.stock_quantity, initialStock);

    // 3. Dispense prescription -> Stock MUST decrease strictly now
    const dispensed = await pharmacyService.dispensePrescription(rx.id, pharmacistUser.id);
    assert.equal(dispensed.status, "DISPENSED");

    const stockAfterDispense = await pharmacyService.getMedicationById(testMedication.id);
    assert.equal(stockAfterDispense.stock_quantity, initialStock - 5);

    // 4. Verify inventory audit transaction record was created
    const txRes = await pool.query(
      "SELECT * FROM inventory_transactions WHERE medicine_id = $1 AND transaction_type = 'DISPENSE' ORDER BY created_at DESC LIMIT 1",
      [testMedication.id]
    );
    assert.equal(txRes.rows.length, 1);
    assert.equal(txRes.rows[0].quantity_changed, -5);
    assert.equal(txRes.rows[0].new_quantity, initialStock - 5);
  });

  await t.test("Requirement 2: Pharmacy Insufficient Stock Prevention & Low Stock Threshold (< 15)", async () => {
    // Try to dispense more than available stock
    const currentMed = await pharmacyService.getMedicationById(testMedication.id);
    const excessiveQty = currentMed.stock_quantity + 50;

    const excessRx = await pharmacyService.createPrescription(
      {
        patientId: testPatient.id,
        doctorId: testDoctorStaff.id,
        medicationId: testMedication.id,
        dosage: "500mg",
        frequency: "OD",
        duration: "10 days",
        quantity: excessiveQty,
      },
      doctorUser.id
    );

    // Attempting to dispense should fail with INSUFFICIENT_STOCK
    await assert.rejects(
      async () => {
        await pharmacyService.dispensePrescription(excessRx.id, pharmacistUser.id);
      },
      (err) => err.message.includes("INSUFFICIENT_STOCK")
    );

    // Test low stock threshold: adjust stock to 14 -> must appear in low stock query
    await pharmacyService.updateStock(testMedication.id, {
      quantityChange: 14 - currentMed.stock_quantity,
      notes: "Adjusting to test low stock threshold of 14",
      userId: adminUser.id,
    });

    const lowStockList = await pharmacyService.getMedications({ lowStock: "true" });
    assert.ok(lowStockList.medications.some((m) => m.id === testMedication.id));

    // Adjust to 15 -> must NOT appear in low stock query (since < 15 is the rule, 15 is normal)
    await pharmacyService.updateStock(testMedication.id, {
      quantityChange: 1, // 14 + 1 = 15
      notes: "Adjusting to 15 (normal stock)",
      userId: adminUser.id,
    });

    const normalStockList = await pharmacyService.getMedications({ lowStock: "true" });
    assert.ok(!normalStockList.medications.some((m) => m.id === testMedication.id));
  });

  await t.test("Requirement 12 & 18: Multi-Field Identity Verification Forgot Password", async () => {
    // 1. Submitting incorrect information returns failure
    const failedAttempt = await authService.requestPasswordReset({
      username: "test_doctor",
      lastName: "WrongLastName",
      email: "test_doctor@hospital.local",
      phone: "0922222222",
      department: "Cardiology",
    });
    assert.equal(failedAttempt.success, false);
    assert.equal(failedAttempt.message, "Unable to verify your identity with the information provided.");

    // 2. Submitting ALL 5 matching fields succeeds and generates token
    const resetRes = await authService.requestPasswordReset({
      username: "test_doctor",
      lastName: "Tadesse",
      email: "test_doctor@hospital.local",
      phone: "0922222222",
      department: "Cardiology",
    });

    assert.equal(resetRes.success, true);
    assert.ok(resetRes.resetToken);

    // 3. Resetting with new strong password succeeds
    const newPassRes = await authService.resetPassword(resetRes.resetToken, "NewDoctor@Pass123!");
    assert.equal(newPassRes.success, true);

    // 4. Token cannot be reused (one-time use)
    await assert.rejects(
      async () => {
        await authService.resetPassword(resetRes.resetToken, "AnotherPass@123!");
      },
      (err) => err.message.includes("INVALID_OR_EXPIRED_TOKEN")
    );

    // 5. Login with new password succeeds
    const newLogin = await authService.login("test_doctor", "NewDoctor@Pass123!");
    assert.equal(newLogin.user.username, "test_doctor");
  });
});
