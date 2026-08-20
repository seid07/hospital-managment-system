const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

const authService = require("../src/services/auth.service");
const patientService = require("../src/services/patient.service");
const appointmentService = require("../src/services/appointment.service");
const vitalsService = require("../src/services/vitals.service");
const encounterService = require("../src/services/encounter.service");
const pharmacyService = require("../src/services/pharmacy.service");
const laboratoryService = require("../src/services/laboratory.service");
const billingService = require("../src/services/billing.service");
const reportService = require("../src/services/report.service");

test("End-to-End Hospital Management System Workflow", async (t) => {
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
        emergencyContactName: "Jane Automation",
        emergencyContactPhone: "0911223344",
      },
      registrarUser.id
    );

    assert.ok(testPatient.id);
    assert.ok(testPatient.patient_number.startsWith("PAT-"));

    const searchRes = await patientService.searchPatients("Automation");
    assert.ok(searchRes.patients.length > 0);
    assert.equal(searchRes.patients[0].last_name, "Automation");
  });

  await t.test("3. Scheduling: Check Availability and Book Appointment", async () => {
    // Find next valid scheduled weekday (Monday=1, Wednesday=3, Friday=5)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    while (![1, 3, 5].includes(targetDate.getDay())) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const dateStr = targetDate.toISOString().split("T")[0];

    const slots = await appointmentService.getAvailableSlots(testDoctorStaff.id, dateStr);
    assert.ok(slots.length > 0, "Doctor should have available slots on weekday");

    const availableSlot = slots.find((s) => s.available);
    assert.ok(availableSlot, "Should find at least one available slot");

    testAppointment = await appointmentService.createAppointment({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      appointmentDate: dateStr,
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
    await assert.rejects(
      async () => {
        await appointmentService.createAppointment({
          patientId: testPatient.id,
          doctorId: testDoctorStaff.id,
          appointmentDate: dateStr,
          startTime: availableSlot.startTime,
          endTime: availableSlot.endTime,
          reason: "Double booking test",
          createdBy: registrarUser.id,
        });
      },
      (err) => err.code === "23P01" || err.message.includes("booked")
    );
  });

  await t.test("4. Reception & Triage: Check-In and Record Vitals", async () => {
    // Check in patient
    const checkedIn = await appointmentService.updateAppointmentStatus(
      testAppointment.id,
      "CHECKED_IN",
      registrarUser.id,
      "Patient arrived at reception",
      registrarUser.role
    );
    assert.equal(checkedIn.status, "CHECKED_IN");

    // Nurse records vitals
    const vitals = await vitalsService.recordVitals({
      patientId: testPatient.id,
      appointmentId: testAppointment.id,
      data: {
        temperature: 37.2,
        heartRate: 78,
        respiratoryRate: 16,
        systolicBp: 135,
        diastolicBp: 85,
        oxygenSaturation: 98.5,
        weight: 75.0,
        height: 175.0,
        triageCategory: "NORMAL",
        notes: "Slightly elevated systolic blood pressure.",
      },
      userId: nurseUser.id,
    });

    assert.ok(vitals.id);
    assert.equal(parseFloat(vitals.bmi), 24.5);
    assert.equal(vitals.systolic_bp, 135);
  });

  await t.test("5. Doctor Consultation: Create Encounter, Diagnoses, Prescriptions & Lab Order", async () => {
    // 1. Create Encounter
    testEncounter = await encounterService.createEncounter({
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      appointmentId: testAppointment.id,
      chiefComplaint: "Mild headache and elevated BP check",
      clinicalNotes: "Patient is alert, cardiovascular exam regular rhythm with S1/S2 heard.",
      treatmentPlan: "Prescribe antihypertensive and order Lipid Panel + ECG.",
      followUpDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      diagnoses: [
        { code: "I10", description: "Essential (primary) hypertension", isPrimary: true, severity: "MODERATE" },
      ],
      createdBy: doctorUser.id,
    });

    assert.ok(testEncounter.id);
    assert.equal(testEncounter.status, "DRAFT");
    assert.equal(testEncounter.diagnoses.length, 1);

    // 2. Doctor prescribes medication
    testPrescription = await pharmacyService.createPrescription({
      encounterId: testEncounter.id,
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      medicationName: "Atorvastatin 20mg",
      dosage: "20mg",
      frequency: "Once daily at bedtime",
      route: "Oral",
      duration: "30 days",
      quantity: 30,
      instructions: "Take with water before sleep.",
      createdBy: doctorUser.id,
    });

    assert.ok(testPrescription.id);
    assert.equal(testPrescription.status, "ACTIVE");

    // 3. Doctor orders Lab Test
    const labCatalog = await laboratoryService.getTestCatalog({ search: "Lipid" });
    assert.ok(labCatalog.catalog.length > 0);
    const lipidTest = labCatalog.catalog[0];

    testLabOrder = await laboratoryService.createLabOrder({
      encounterId: testEncounter.id,
      patientId: testPatient.id,
      doctorId: testDoctorStaff.id,
      testId: lipidTest.id,
      clinicalIndication: "Routine cardiovascular risk evaluation",
      priority: "ROUTINE",
      createdBy: doctorUser.id,
    });

    assert.ok(testLabOrder.id);
    assert.equal(testLabOrder.status, "ORDERED");
  });

  await t.test("6. Laboratory Workflow: Specimen Collection -> Results Entry -> Verification", async () => {
    // 1. Collect Specimen
    const collected = await laboratoryService.collectSpecimen(testLabOrder.id, labUser.id);
    assert.equal(collected.status, "SPECIMEN_COLLECTED");

    // 2. Enter Results
    const resulted = await laboratoryService.enterResults(
      testLabOrder.id,
      {
        resultValue: "Total Chol: 215 mg/dL (High), HDL: 45 mg/dL, LDL: 135 mg/dL, Triglycerides: 140 mg/dL",
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
      { dispensedNotes: "Dispensed 1 box (30 tablets) of Atorvastatin 20mg." },
      pharmacistUser.id
    );

    assert.equal(dispensed.status, "DISPENSED");
  });

  await t.test("8. Billing & Payments: Invoice Generation and Payment Receipt", async () => {
    // Generate invoice with Consultation, Lab Test, and Pharmacy Medication
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
      notes: "Invoice for Cardiology visit",
      createdBy: financeUser.id,
    });

    assert.ok(testInvoice.id);
    assert.equal(testInvoice.subtotal, "167.00");
    assert.equal(testInvoice.discount_amount, "10.00");
    assert.equal(testInvoice.total_amount, "157.00");
    assert.equal(testInvoice.balance_amount, "157.00");
    assert.equal(testInvoice.status, "PENDING");

    // Record Partial Payment of $100
    const partialPay = await billingService.recordPayment({
      invoiceId: testInvoice.id,
      amount: 100.0,
      paymentMethod: "CARD",
      transactionReference: "TXN-CARD-00123",
      notes: "Card payment at front desk",
      receivedBy: financeUser.id,
    });

    assert.equal(partialPay.invoice.status, "PARTIALLY_PAID");
    assert.equal(partialPay.invoice.paid_amount, "100.00");
    assert.equal(partialPay.invoice.balance_amount, "57.00");

    // Prevent overpayment
    await assert.rejects(
      async () => {
        await billingService.recordPayment({
          invoiceId: testInvoice.id,
          amount: 100.0,
          paymentMethod: "CASH",
          receivedBy: financeUser.id,
        });
      },
      (err) => err.message.includes("PAYMENT_EXCEEDS_BALANCE")
    );

    // Settle remaining $57.00
    const finalPay = await billingService.recordPayment({
      invoiceId: testInvoice.id,
      amount: 57.0,
      paymentMethod: "CASH",
      notes: "Final cash payment",
      receivedBy: financeUser.id,
    });

    assert.equal(finalPay.invoice.status, "PAID");
    assert.equal(finalPay.invoice.paid_amount, "157.00");
    assert.equal(finalPay.invoice.balance_amount, "0.00");
  });

  await t.test("9. Encounter Completion and Final Patient Chart Audit", async () => {
    // Complete encounter
    const completedEncounter = await encounterService.completeEncounter(testEncounter.id, doctorUser.id);
    assert.equal(completedEncounter.status, "COMPLETED");

    // Check full medical record
    const fullChart = await patientService.getPatientMedicalRecord(testPatient.id);
    assert.ok(fullChart);
    assert.equal(fullChart.patient.id, testPatient.id);
    assert.ok(fullChart.appointments.length > 0);
    assert.ok(fullChart.vitals.length > 0);
    assert.ok(fullChart.encounters.length > 0);
    assert.ok(fullChart.prescriptions.length > 0);
    assert.ok(fullChart.labOrders.length > 0);
    assert.ok(fullChart.invoices.length > 0);

    // Verify Admin Dashboard KPIs
    const adminKPIs = await reportService.getDashboardKPIs("ADMIN", adminUser.staff_id);
    assert.ok(adminKPIs.registeredPatients > 0);
    assert.ok(adminKPIs.totalRevenue > 0);
    assert.ok(adminKPIs.recentAuditLogs.length > 0);
  });
});
