const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

const authService = require("../src/services/auth.service");
const patientService = require("../src/services/patient.service");
const visitService = require("../src/services/visit.service");
const serviceCatalog = require("../src/services/serviceCatalog.service");
const serviceOrderService = require("../src/services/serviceOrder.service");
const queueService = require("../src/services/queue.service");
const billingService = require("../src/services/billing.service");
const pharmacyService = require("../src/services/pharmacy.service");
const radiologyService = require("../src/services/radiology.service");

const { ensureTestUsers } = require("./helpers/setup-test-users");

test("Service-First Payment & Multi-Department Workflow Integration Suite", async (t) => {
  await ensureTestUsers();

  let adminUser, registrarUser, doctorUser, labUser, radUser, pharmUser;
  let testPatient1, testPatient2, testPatient3, testEmergencyPatient;
  let generalConsultService, cbcService, xrayService, bedService;

  // Setup: Get auth tokens and users
  const adminLogin = await authService.login("admin", "Admin@12345");
  adminUser = adminLogin.user;

  const registrarLogin = await authService.login("registrar", "Hospital@12345");
  registrarUser = registrarLogin.user;

  const doctorLogin = await authService.login("doctor_smith", "Hospital@12345");
  doctorUser = doctorLogin.user;

  const labLogin = await authService.login("labtech_kevin", "Hospital@12345");
  labUser = labLogin.user;

  const radLogin = await authService.login("radiologist_sam", "Hospital@12345");
  radUser = radLogin.user;

  const pharmLogin = await authService.login("pharmacist_david", "Hospital@12345");
  pharmUser = pharmLogin.user;

  // Setup: Fetch Services from Catalog
  const allServices = await serviceCatalog.getServices({ activeOnly: true });
  generalConsultService = allServices.find((s) => s.code === "SRV-CONS-GEN" || s.code === "CONSULT-GENERAL") || allServices[0];
  cbcService = allServices.find((s) => s.code === "LAB-CBC") || allServices[1];
  xrayService = allServices.find((s) => s.code === "RAD-XRAY-CHEST" || s.code === "IMG-XRAY") || allServices[2];
  bedService = allServices.find((s) => s.code === "WARD-BED-GEN" || s.code === "WARD-BED-DAY") || allServices[3];

  assert.ok(generalConsultService, "Consultation service must exist in catalog");
  assert.ok(cbcService, "LAB-CBC service must exist in catalog");
  assert.ok(xrayService, "X-Ray service must exist in catalog");
  assert.ok(bedService, "Ward bed service must exist in catalog");

  // Create test patients
  testPatient1 = await patientService.createPatient({
    firstName: "Test",
    lastName: "WorkflowOne",
    dateOfBirth: "1990-01-01",
    gender: "Male",
    phone: "+251-911-000001",
  }, registrarUser.id);

  testPatient2 = await patientService.createPatient({
    firstName: "Test",
    lastName: "WorkflowTwo",
    dateOfBirth: "1992-02-02",
    gender: "Female",
    phone: "+251-911-000002",
  }, registrarUser.id);

  testPatient3 = await patientService.createPatient({
    firstName: "Test",
    lastName: "WorkflowThree",
    dateOfBirth: "1985-05-05",
    gender: "Male",
    phone: "+251-911-000003",
  }, registrarUser.id);

  testEmergencyPatient = await patientService.createPatient({
    firstName: "Emergency",
    lastName: "Victim",
    dateOfBirth: "1995-07-07",
    gender: "Female",
    phone: "+251-911-000004",
  }, registrarUser.id);

  await t.test("Scenario 1: Patient registration & Visit creation with consultation order (WAITING_PAYMENT)", async () => {
    const visit = await visitService.createVisit({
      patientId: testPatient1.id,
      visitType: "OUTPATIENT",
      notes: "Routine general consultation intake",
    }, registrarUser.id);

    assert.ok(visit.id, "Visit ID created");
    assert.ok(visit.visit_number.startsWith("VIS-"), "Visit number generated");

    const orderResult = await serviceOrderService.createServiceOrders({
      visitId: visit.id,
      patientId: testPatient1.id,
      items: [{ serviceId: generalConsultService.id, notes: "General Checkup" }],
      generateInvoice: true,
    }, registrarUser.id);

    assert.equal(orderResult.serviceOrders.length, 1);
    const consultOrder = orderResult.serviceOrders[0];
    assert.equal(consultOrder.status, "WAITING_PAYMENT", "Order must be WAITING_PAYMENT before cashier payment");
    assert.ok(orderResult.invoice, "Invoice must be generated for payable service");
    assert.equal(parseFloat(orderResult.invoice.total_amount), parseFloat(generalConsultService.price));

    // CRITICAL: Doctor queue must NOT show this unpaid patient
    const doctorQueue = await queueService.getDepartmentQueue("CLINICAL");
    const foundInQueue = doctorQueue.find((q) => q.patient_id === testPatient1.id && q.service_order_id === consultOrder.id);
    assert.equal(foundInQueue, undefined, "Unpaid patient must NOT enter doctor queue");
  });

  await t.test("Scenario 2: Cashier payment authorizes consultation and enters Doctor Queue", async () => {
    const visits = await visitService.getPatientVisits(testPatient1.id);
    const visit = await visitService.getVisitById(visits[0].id);
    const consultOrder = visit.serviceOrders[0];
    const invoice = visit.invoices[0];

    // Cashier records payment
    const payResult = await billingService.recordPayment({
      invoiceId: invoice.id,
      amount: invoice.total_amount,
      paymentMethod: "CASH",
      notes: "Cash payment at front desk",
      receivedBy: registrarUser.id,
    });

    assert.equal(payResult.invoice.status, "PAID");
    assert.ok(payResult.authorizedOrders.includes(consultOrder.id), "Service order must be authorized");

    // Check service order status
    const updatedOrder = await serviceOrderService.getServiceOrderById(consultOrder.id);
    assert.equal(updatedOrder.status, "PAID");
    assert.ok(updatedOrder.queue_number, "Queue number must be generated (DOC-xxx)");

    // Doctor queue must now show patient
    const doctorQueue = await queueService.getDepartmentQueue("CLINICAL");
    const foundInQueue = doctorQueue.find((q) => q.patient_id === testPatient1.id && q.service_order_id === consultOrder.id);
    assert.ok(foundInQueue, "Authorized patient must be in doctor queue");
    assert.equal(foundInQueue.queue_status, "WAITING");
    assert.equal(foundInQueue.payment_status, "PAID");
  });

  await t.test("Scenario 3: Doctor orders CBC test -> WAITING_PAYMENT -> Lab queue does NOT show patient", async () => {
    const visits = await visitService.getPatientVisits(testPatient1.id);
    const visitId = visits[0].id;

    // Doctor creates CBC service order
    const orderResult = await serviceOrderService.createServiceOrders({
      visitId,
      patientId: testPatient1.id,
      doctorId: doctorUser.staff_id,
      items: [{ serviceId: cbcService.id, notes: "Suspected anemia" }],
      generateInvoice: true,
    }, doctorUser.id);

    const cbcOrder = orderResult.serviceOrders[0];
    assert.equal(cbcOrder.status, "WAITING_PAYMENT");

    // Lab queue must NOT show this unpaid lab order
    const labQueue = await queueService.getDepartmentQueue("LABORATORY");
    const foundInLab = labQueue.find((q) => q.service_order_id === cbcOrder.id);
    assert.equal(foundInLab, undefined, "Unpaid CBC must NOT be in Lab queue");
  });

  await t.test("Scenario 4: Registration pays CBC -> CBC AUTHORIZED -> Patient enters Lab Queue", async () => {
    const visits = await visitService.getPatientVisits(testPatient1.id);
    const visit = await visitService.getVisitById(visits[0].id);
    const cbcOrder = visit.serviceOrders.find((o) => o.service_code === "LAB-CBC");
    const cbcInvoice = visit.invoices.find((i) => i.id === cbcOrder.invoice_id);

    // Cashier collects payment for CBC
    await billingService.recordPayment({
      invoiceId: cbcInvoice.id,
      amount: cbcInvoice.total_amount,
      paymentMethod: "TELEBIRR",
      transactionReference: "TB-987654321",
      receivedBy: registrarUser.id,
    });

    // Lab queue must NOW show patient
    const labQueue = await queueService.getDepartmentQueue("LABORATORY");
    const foundInLab = labQueue.find((q) => q.service_order_id === cbcOrder.id);
    assert.ok(foundInLab, "Paid CBC must enter Lab Queue");
    assert.ok(foundInLab.queue_number.startsWith("LAB-"), "Lab queue number generated");
    assert.equal(foundInLab.payment_status, "PAID");
  });

  await t.test("Scenario 5: Multi-Department Ordering and Strict Department Scoping", async () => {
    const visit = await visitService.createVisit({
      patientId: testPatient2.id,
      visitType: "OUTPATIENT",
      notes: "Multi-department assessment",
    }, registrarUser.id);

    // Doctor orders CBC, X-ray, and Bed/day
    const orderResult = await serviceOrderService.createServiceOrders({
      visitId: visit.id,
      patientId: testPatient2.id,
      doctorId: doctorUser.staff_id,
      items: [
        { serviceId: cbcService.id, notes: "Baseline CBC" },
        { serviceId: xrayService.id, notes: "Chest X-Ray PA" },
        { serviceId: bedService.id, notes: "Observation Ward Admission" },
      ],
      generateInvoice: true,
    }, doctorUser.id);

    assert.equal(orderResult.serviceOrders.length, 3);
    const invoice = orderResult.invoice;

    // Pay invoice
    await billingService.recordPayment({
      invoiceId: invoice.id,
      amount: invoice.total_amount,
      paymentMethod: "CBE_BIRR",
      transactionReference: "CBE-11223344",
      receivedBy: registrarUser.id,
    });

    // Check Laboratory Queue: must see CBC, must NOT see X-ray or Bed
    const labQueue = await queueService.getDepartmentQueue("LABORATORY");
    const labItem = labQueue.find((q) => q.patient_id === testPatient2.id);
    assert.ok(labItem, "Lab must see patient's CBC");
    assert.equal(labItem.service_code, "LAB-CBC");

    // Check Radiology Queue: must see X-ray, must NOT see CBC or Bed
    const radQueue = await queueService.getDepartmentQueue("RADIOLOGY");
    const radItem = radQueue.find((q) => q.patient_id === testPatient2.id);
    assert.ok(radItem, "Radiology must see patient's X-Ray");
    assert.equal(radItem.service_code, "IMG-XRAY");

    // Check Ward Queue: must see Bed/day, must NOT see CBC or X-ray
    const wardQueue = await queueService.getDepartmentQueue("WARD");
    const wardItem = wardQueue.find((q) => q.patient_id === testPatient2.id);
    assert.ok(wardItem, "Ward must see patient's Bed/Day order");
    assert.equal(wardItem.service_code, "WARD-BED-DAY");
  });

  await t.test("Scenario 6: Pharmacy Independent Workflow (Prescription -> Pharmacy Payment -> Dispense)", async () => {
    // 1. Doctor prescribes medication
    const prescription = await pharmacyService.createPrescription({
      patientId: testPatient1.id,
      doctorId: doctorUser.staff_id,
      medicationName: "Amoxicillin 500mg",
      dosage: "500mg",
      frequency: "TID",
      route: "Oral",
      quantity: 21,
      instructions: "Take 1 capsule 3 times daily after food for 7 days",
      createdBy: doctorUser.id,
    });

    assert.ok(prescription.id);
    assert.equal(prescription.status, "ACTIVE");

    // 2. Patient presents at Pharmacy counter; Pharmacist collects payment directly
    const payRes = await pharmacyService.recordPharmacyPayment({
      prescriptionId: prescription.id,
      amount: 150.00,
      paymentMethod: "CASH",
      notes: "Collected at pharmacy counter",
      receivedBy: pharmUser.id,
    });

    assert.equal(payRes.prescription.status, "PAID");

    // 3. Pharmacist dispenses medication
    const dispRes = await pharmacyService.dispensePrescription(
      prescription.id,
      { dispensedNotes: "Dispensed 21 capsules with patient counselling" },
      pharmUser.id
    );

    assert.equal(dispRes.status, "DISPENSED");
  });

  await t.test("Scenario 7: Emergency Override Workflow", async () => {
    // Create emergency visit with override
    const emergencyVisit = await visitService.createVisit({
      patientId: testEmergencyPatient.id,
      visitType: "EMERGENCY",
      emergencyOverride: true,
      overrideReason: "Acute chest pain with respiratory distress",
      notes: "Immediate triage to resuscitation bay",
    }, doctorUser.id);

    assert.equal(emergencyVisit.emergency_override, true);
    assert.ok(emergencyVisit.override_authorized_by);

    // Order emergency consultation and ECG without waiting for cashier payment
    const ecgService = allServices.find((s) => s.code === "DIAG-ECG");
    const emergencyConsultService = allServices.find((s) => s.code === "CONSULT-EMERGENCY");

    const ordersRes = await serviceOrderService.createServiceOrders({
      visitId: emergencyVisit.id,
      patientId: testEmergencyPatient.id,
      doctorId: doctorUser.staff_id,
      items: [
        { serviceId: emergencyConsultService.id, notes: "Immediate physician assessment" },
        { serviceId: ecgService.id, notes: "Stat 12-lead ECG" },
      ],
      emergencyOverride: true,
      overrideReason: "Immediate life-saving diagnostic",
    }, doctorUser.id);

    assert.equal(ordersRes.serviceOrders[0].status, "AUTHORIZED");
    assert.equal(ordersRes.serviceOrders[0].authorization_source, "EMERGENCY_OVERRIDE");

    // Immediately appears in Doctor Queue with EMERGENCY priority
    const docQueue = await queueService.getDepartmentQueue("CLINICAL");
    const emergencyDocEntry = docQueue.find((q) => q.patient_id === testEmergencyPatient.id);
    assert.ok(emergencyDocEntry, "Emergency patient must immediately be in Doctor queue");
    assert.equal(emergencyDocEntry.priority, "EMERGENCY");
  });

  await t.test("Scenario 8: Queue Ordering by Authorization Time (Not Order Creation Time)", async () => {
    // Patient A creates order at T1, but does NOT pay yet
    const visitA = await visitService.createVisit({
      patientId: testPatient1.id,
      visitType: "OUTPATIENT",
    }, registrarUser.id);
    const orderARes = await serviceOrderService.createServiceOrders({
      visitId: visitA.id,
      patientId: testPatient1.id,
      items: [{ serviceId: generalConsultService.id, notes: "Patient A" }],
      generateInvoice: true,
    }, registrarUser.id);

    // Patient B creates order at T2 (later), and PAYS IMMEDIATELY
    const visitB = await visitService.createVisit({
      patientId: testPatient3.id,
      visitType: "OUTPATIENT",
    }, registrarUser.id);
    const orderBRes = await serviceOrderService.createServiceOrders({
      visitId: visitB.id,
      patientId: testPatient3.id,
      items: [{ serviceId: generalConsultService.id, notes: "Patient B" }],
      generateInvoice: true,
    }, registrarUser.id);

    // Patient B pays first
    await billingService.recordPayment({
      invoiceId: orderBRes.invoice.id,
      amount: orderBRes.invoice.total_amount,
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });

    // Wait 50ms so timestamps differ
    await new Promise((r) => setTimeout(r, 50));

    // Patient A pays second
    await billingService.recordPayment({
      invoiceId: orderARes.invoice.id,
      amount: orderARes.invoice.total_amount,
      paymentMethod: "CASH",
      receivedBy: registrarUser.id,
    });

    // Check queue order: Patient B must appear BEFORE Patient A because B was authorized earlier!
    const queue = await queueService.getDepartmentQueue("CLINICAL", { status: "WAITING" });
    const normalQueue = queue.filter((q) => q.priority === "NORMAL");
    const indexB = normalQueue.findIndex((q) => q.patient_id === testPatient3.id);
    const indexA = normalQueue.findIndex((q) => q.patient_id === testPatient1.id && q.service_order_id === orderARes.serviceOrders[0].id);

    assert.ok(indexB !== -1, "Patient B in queue");
    assert.ok(indexA !== -1, "Patient A in queue");
    assert.ok(indexB < indexA, `Patient B (index ${indexB}) must be ahead of Patient A (index ${indexA}) because Patient B paid first`);
  });

  await t.test("Scenario 9: Radiology Result Reporting", async () => {
    const radQueue = await queueService.getDepartmentQueue("RADIOLOGY");
    assert.ok(radQueue.length > 0, "Radiology queue should have at least one test");

    const radEntry = radQueue[0];
    const reportResult = await radiologyService.recordRadiologyResult(
      radEntry.service_order_id,
      {
        modality: "X_RAY",
        clinicalIndication: "Chest PA View",
        technicianNotes: "Adequate inspiration, good exposure",
        findings: "Lungs are clear bilaterally. No pleural effusion or pneumothorax. Heart size is normal.",
        impression: "Normal chest radiography.",
      },
      radUser.id
    );

    assert.equal(reportResult.status, "REPORTED");
    assert.ok(reportResult.findings.includes("Lungs are clear"));

    // Check that service order is marked COMPLETED
    const so = await serviceOrderService.getServiceOrderById(radEntry.service_order_id);
    assert.equal(so.status, "COMPLETED");
  });
});
