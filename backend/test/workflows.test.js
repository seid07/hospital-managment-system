const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

const authService = require("../src/services/auth.service");
const patientService = require("../src/services/patient.service");
const appointmentService = require("../src/services/appointment.service");
const scheduleService = require("../src/services/schedule.service");
const vitalsService = require("../src/services/vitals.service");
const encounterService = require("../src/services/encounter.service");
const pharmacyService = require("../src/services/pharmacy.service");
const laboratoryService = require("../src/services/laboratory.service");
const billingService = require("../src/services/billing.service");
const reportService = require("../src/services/report.service");
const { ensureTestUsers } = require("./helpers/setup-test-users");

test("End-to-End Hospital Management System Workflow", async (t) => {
  await ensureTestUsers();

  let adminUser, doctorUser, registrarUser, nurseUser, labUser, pharmacistUser, financeUser;
  let testPatient, testDoctorStaff, testAppointment, testEncounter, testLabOrder, testPrescription, testInvoice;

  await t.test("1. Authentication: Login all roles", async () => {
    const adminRes = await authService.login("admin", "Admin@12345");
    adminUser = adminRes.user;

    const doctorRes = await authService.login("doctor_smith", "Hospital@12345");
    doctorUser = doctorRes.user;
    testDoctorStaff = { id: doctorUser.staff_id };

    const regRes = await authService.login("registrar", "Hospital@12345");
    registrarUser = regRes.user;

    const nurseRes = await authService.login("nurse_emily", "Hospital@12345");
    nurseUser = nurseRes.user;

    const labRes = await authService.login("labtech_kevin", "Hospital@12345");
    labUser = labRes.user;

    const pharmRes = await authService.login("pharmacist_david", "Hospital@12345");
    pharmacistUser = pharmRes.user;

    const finRes = await authService.login("finance_clara", "Hospital@12345");
    financeUser = finRes.user;

    assert.equal(adminUser.role, "ADMIN");
    assert.equal(doctorUser.role, "DOCTOR");
    assert.equal(registrarUser.role, "REGISTRAR");
    assert.equal(nurseUser.role, "NURSE");
    assert.equal(labUser.role, "LAB_TECH");
    assert.equal(pharmacistUser.role, "PHARMACIST");
    assert.equal(financeUser.role, "FINANCE");
  });

  await t.test("2. Patient Management: Register and Search Patient", async () => {
    const uniquePhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    testPatient = await patientService.createPatient(
      {
        firstName: "Test",
        lastName: "Automation",
        age: 34,
        gender: "Male",
        phone: uniquePhone,
        email: `test.${Date.now()}@example.com`,
        address: "Bole Sub-City, Addis Ababa",
        emergencyContactName: "Tadele Automation",
        emergencyContactPhone: "0911223344",
      },
      registrarUser.id
    );

    assert.ok(testPatient.id);
    assert.ok(testPatient.patient_number.startsWith("PAT-"));
    assert.equal(testPatient.first_name, "Test");
    assert.equal(testPatient.last_name, "Automation");

    // Search patient
    const searchResult = await patientService.getPatients({ search: testPatient.patient_number });
    assert.ok(searchResult.patients.length > 0);
    assert.equal(searchResult.patients[0].id, testPatient.id);
  });

  await t.test("3. Scheduling: Check Availability and Book Appointment", async () => {
    // Ensure schedule exists for doctor
    const schedules = await scheduleService.getDoctorSchedules(testDoctorStaff.id);
    if (schedules.length === 0) {
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

    const slots = await appointmentService.getAvailableSlots(testDoctorStaff.id, todayStr);
    assert.ok(slots.length > 0, "Doctor should have available slots");

    const availableSlot = slots.find((s) => s.available);
    assert.ok(availableSlot, "Should find at least one available slot");

    testAppointment = await appointmentService.createAppointment({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      appointmentDate: todayStr,
      startTime: availableSlot.startTime,
      endTime: availableSlot.endTime,
      reason: "Hypertension follow-up and lab tests",
      notes: "Patient reports mild chest discomfort",
      createdBy: registrarUser.id,
    });

    assert.ok(testAppointment.id);
    assert.equal(testAppointment.status, "SCHEDULED");
    assert.ok(testAppointment.appointment_number.startsWith("APT-"));

    // Check double booking prevention
    await assert.rejects(async () => {
      await appointmentService.createAppointment({
        patientId: testPatient.id,
        doctorId: testDoctorStaff.id,
        appointmentDate: todayStr,
        startTime: availableSlot.startTime,
        endTime: availableSlot.endTime,
        reason: "Double booking test",
        createdBy: registrarUser.id,
      });
    });
  });

  await t.test("4. Reception & Triage: Check-In and Record Vitals", async () => {
    // 1. Check in appointment
    const checkedIn = await appointmentService.updateAppointmentStatus(
      testAppointment.id,
      "CHECKED_IN",
      registrarUser.id,
      "Patient arrived at clinic",
      registrarUser.role
    );
    assert.equal(checkedIn.status, "CHECKED_IN");

    // 2. Record Triage Vitals
    const vitals = await vitalsService.recordVitals({
      patientId: testPatient.id,
      appointmentId: testAppointment.id,
      data: {
        systolicBp: 135,
        diastolicBp: 88,
        heartRate: 78,
        respiratoryRate: 18,
        temperature: 36.8,
        oxygenSaturation: 98,
        triageCategory: "NON_URGENT",
        notes: "Slightly elevated BP. Alert and oriented.",
      },
      userId: nurseUser.id,
    });

    assert.ok(vitals.id);
    assert.equal(vitals.patient_id, testPatient.id);
    assert.equal(vitals.systolic_bp, 135);
  });

  await t.test("5. Doctor Consultation: Create Encounter, Diagnoses, Prescriptions & Lab Order", async () => {
    // 1. Create Encounter with Diagnoses
    const encResult = await encounterService.createEncounter({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      appointmentId: testAppointment.id,
      chiefComplaint: "Follow-up for hypertension, occasional headache",
      clinicalNotes: "Patient compliant with lifestyle changes, reports mild morning headache.",
      treatmentPlan: "Order lipid panel, maintain amlodipine, follow-up in 4 weeks.",
      diagnoses: [
        {
          description: "Essential (primary) hypertension",
          isPrimary: true,
          severity: "MODERATE",
        },
      ],
      createdBy: doctorUser.id,
    });

    testEncounter = encResult;

    assert.ok(testEncounter.id);
    assert.ok(testEncounter.status === "DRAFT" || testEncounter.status === "IN_PROGRESS");

    // 2. Create Lab Order
    const catalogRes = await laboratoryService.getTestCatalog();
    assert.ok(catalogRes.catalog.length > 0);
    const testItem = catalogRes.catalog[0];

    testLabOrder = await laboratoryService.createLabOrder({
      encounterId: testEncounter.id,
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      testId: testItem.id,
      clinicalIndication: "Screening for hyperlipidemia and cardiovascular risk",
      priority: "ROUTINE",
      createdBy: doctorUser.id,
    });

    assert.ok(testLabOrder.id);
    assert.ok(testLabOrder.order_number.startsWith("LAB-"));
    assert.equal(testLabOrder.status, "ORDERED");

    // 3. Create Prescription
    const medsRes = await pharmacyService.getMedications({ limit: 10 });
    assert.ok(medsRes.medications.length > 0);
    const med = medsRes.medications.find((m) => m.stock_quantity >= 5) || medsRes.medications[0];
    await pool.query("UPDATE medications SET stock_quantity = stock_quantity + 50 WHERE id = $1", [med.id]);

    testPrescription = await pharmacyService.createPrescription(
      {
        encounterId: testEncounter.id,
        patientId: testPatient.id,
        doctorId: testDoctorStaff.id,
        medicationId: med.id,
        dosage: "20mg",
        frequency: "ONCE_DAILY",
        duration: "30 days",
        quantity: 5,
        instructions: "Take 1 tablet daily at bedtime.",
      },
      doctorUser.id
    );

    assert.ok(testPrescription.id);
    assert.ok(testPrescription.prescription_number.startsWith("RX-"));
  });

  await t.test("6. Laboratory Workflow: Specimen Collection -> Results Entry -> Verification", async () => {
    // 0. Pay for the lab test at the cashier first — specimen collection is
    // blocked until the linked service order is paid/authorized, exactly
    // like the real Registrar Finance workflow (Requirement 9).
    assert.ok(testLabOrder.service_order_id, "Lab order must be linked to a billable service order");
    await billingService.recordSelectivePayment({
      serviceOrderIds: [testLabOrder.service_order_id],
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });

    // 1. Collect Specimen
    const collected = await laboratoryService.collectSpecimen(testLabOrder.id, labUser.id);
    assert.equal(collected.status, "SPECIMEN_COLLECTED");

    // 2. Enter Results
    const resulted = await laboratoryService.enterResults(
      testLabOrder.id,
      {
        resultValue: "Total Chol: 215 mg/dL, HDL: 45 mg/dL, LDL: 135 mg/dL",
        unit: "mg/dL",
        referenceRange: "Total Chol < 200 mg/dL",
        isAbnormal: true,
        comments: "Borderline hypercholesterolemia noted.",
      },
      labUser.id
    );
    assert.equal(resulted.status, "RESULTED");

    // 3. Verify Results
    const verified = await laboratoryService.verifyResults(testLabOrder.id, labUser.id);
    assert.equal(verified.status, "VERIFIED");
  });

  await t.test("7. Pharmacy Workflow: Dispense Prescription", async () => {
    const dispensed = await pharmacyService.dispensePrescription(
      testPrescription.id,
      pharmacistUser.id
    );

    assert.equal(dispensed.status, "DISPENSED");
  });

  await t.test("8. Billing & Payments: Invoice Generation and Payment Receipt", async () => {
    // Generate invoice
    testInvoice = await billingService.createInvoice({
      patientId: testPatient.id,
      encounterId: testEncounter.id,
      items: [
        { itemType: "CONSULTATION", description: "Specialist Consultation (Cardiology)", unitPrice: 100.0, quantity: 1 },
        { itemType: "LAB_TEST", description: "Lipid Panel Test", unitPrice: 45.0, quantity: 1 },
        { itemType: "MEDICATION", description: "Atorvastatin 20mg (30 Tablets)", unitPrice: 22.0, quantity: 1 },
      ],
      discountAmount: 10.0,
      taxAmount: 0.0,
      notes: "Routine cardiology consultation invoice",
      createdBy: financeUser.id,
    });

    assert.ok(testInvoice.id);
    assert.ok(testInvoice.invoice_number.startsWith("INV-"));
    assert.ok(testInvoice.status === "PENDING" || testInvoice.status === "UNPAID");
    assert.equal(parseFloat(testInvoice.subtotal), 167.0);
    assert.equal(parseFloat(testInvoice.total_amount), 157.0);
    assert.equal(parseFloat(testInvoice.balance_amount), 157.0);

    // Record Full Payment
    const paymentResult = await billingService.recordPayment({
      invoiceId: testInvoice.id,
      amount: 157.0,
      paymentMethod: "CASH",
      referenceNumber: "RCPT-AUTO-001",
      notes: "Paid in full at cashier desk",
      receivedBy: financeUser.id,
    });

    assert.ok(paymentResult.payment.id);
    assert.ok(paymentResult.payment.payment_number.startsWith("PAY-"));
    assert.equal(paymentResult.invoice.status, "PAID");
    assert.equal(parseFloat(paymentResult.invoice.balance_amount), 0.0);
  });

  await t.test("9. Encounter Completion and Final Patient Chart Audit", async () => {
    const completedEncounter = await encounterService.completeEncounter(testEncounter.id, doctorUser.id);
    assert.equal(completedEncounter.status, "COMPLETED");

    // Verify Encounter Details
    const loadedEncounter = await encounterService.getEncounterById(testEncounter.id);
    assert.ok(loadedEncounter);
    assert.equal(loadedEncounter.status, "COMPLETED");
  });
});
