const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/database");

// Services
const encounterService = require("../src/services/encounter.service");
const serviceOrderService = require("../src/services/serviceOrder.service");
const billingService = require("../src/services/billing.service");
const laboratoryService = require("../src/services/laboratory.service");
const radiologyService = require("../src/services/radiology.service");
const pharmacyService = require("../src/services/pharmacy.service");
const wardService = require("../src/services/ward.service");

describe("Doctor Consultation Command Center & Department Workflow End-to-End Suite", () => {
  let doctorUser, doctorStaff;
  let labTechUser;
  let radiologistUser;
  let pharmacistUser;
  let registrarUser;
  let patient;
  let visit;
  let medication;
  let labTest;
  let labService, radService, procService, surgService, bedService;

  before(async () => {
    // 1. Get or create Doctor staff
    const docRes = await pool.query(
      `SELECT s.id, u.id AS user_id, u.username FROM staff s JOIN users u ON u.staff_id = s.id JOIN roles r ON s.role_id = r.id WHERE r.name = 'DOCTOR' AND s.is_active = TRUE LIMIT 1`
    );
    if (docRes.rows.length === 0) {
      throw new Error("No active doctor staff found in test database.");
    }
    doctorStaff = docRes.rows[0];
    doctorUser = { id: doctorStaff.user_id, staff_id: doctorStaff.id, username: doctorStaff.username };

    // 2. Get other department staff
    const labTechRes = await pool.query(
      `SELECT u.id, u.username FROM users u JOIN staff s ON u.staff_id = s.id JOIN roles r ON s.role_id = r.id WHERE r.name = 'LAB_TECH' AND s.is_active = TRUE LIMIT 1`
    );
    labTechUser = labTechRes.rows[0] || doctorUser;

    const radRes = await pool.query(
      `SELECT u.id, u.username FROM users u JOIN staff s ON u.staff_id = s.id JOIN roles r ON s.role_id = r.id WHERE r.name IN ('DOCTOR', 'ADMIN') AND s.is_active = TRUE LIMIT 1`
    );
    radiologistUser = radRes.rows[0] || doctorUser;

    const pharmRes = await pool.query(
      `SELECT u.id, u.username FROM users u JOIN staff s ON u.staff_id = s.id JOIN roles r ON s.role_id = r.id WHERE r.name = 'PHARMACIST' AND s.is_active = TRUE LIMIT 1`
    );
    pharmacistUser = pharmRes.rows[0] || doctorUser;

    const regRes = await pool.query(
      `SELECT u.id, u.username FROM users u JOIN staff s ON u.staff_id = s.id JOIN roles r ON s.role_id = r.id WHERE r.name = 'REGISTRAR' AND s.is_active = TRUE LIMIT 1`
    );
    registrarUser = regRes.rows[0] || doctorUser;

    // 3. Create fresh test patient
    const pRes = await pool.query(
      `INSERT INTO patients (
        patient_number, first_name, last_name, date_of_birth, gender, phone, address, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
      [
        `TEST-P-${Date.now()}`,
        "Abebe",
        "Kebede",
        "1988-04-12",
        "Male",
        "+251911223344",
        "Addis Ababa, Bole",
      ]
    );
    patient = pRes.rows[0];

    // 4. Create active visit
    const vRes = await pool.query(
      `INSERT INTO visits (
        visit_number, patient_id, created_by, status
      ) VALUES ($1, $2, $3, 'OPEN') RETURNING *`,
      [`VISIT-${Date.now()}`, patient.id, registrarUser.id]
    );
    visit = vRes.rows[0];

    // 5. Get or seed catalog services
    const srvQuery = await pool.query(
      `SELECT s.*, d.code as department_code FROM services s JOIN departments d ON s.department_id = d.id WHERE s.is_active = TRUE`
    );
    const services = srvQuery.rows;

    labService = services.find((s) => s.department_code === "LABORATORY") || services[0];
    radService = services.find((s) => s.department_code === "RADIOLOGY") || services[0];
    procService = services.find((s) => s.department_code === "PROCEDURE") || services[0];
    surgService = services.find((s) => s.department_code === "SURGERY") || services[0];
    bedService = services.find((s) => s.category === "Inpatient" || s.code.startsWith("WARD-") || s.department_code === "WARD") || services[0];

    // Lab test catalog item
    const ltRes = await pool.query(`SELECT * FROM lab_test_catalog LIMIT 1`);
    labTest = ltRes.rows[0];

    // Medication catalog item
    const medRes = await pool.query(`SELECT * FROM medications WHERE stock_quantity > 10 LIMIT 1`);
    medication = medRes.rows[0];
  });

  after(async () => {
    // Cleanup test records
    if (patient) {
      await pool.query(`DELETE FROM diagnoses WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM prescriptions WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM lab_results WHERE lab_order_id IN (SELECT id FROM lab_orders WHERE patient_id = $1)`, [patient.id]);
      await pool.query(`DELETE FROM lab_orders WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM radiology_orders WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM procedure_orders WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM surgery_orders WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM admissions WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM queue_entries WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM payment_allocations WHERE payment_id IN (SELECT id FROM payments WHERE patient_id = $1)`, [patient.id]);
      await pool.query(`DELETE FROM payments WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE patient_id = $1)`, [patient.id]);
      await pool.query(`DELETE FROM invoices WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM service_orders WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM encounters WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM visits WHERE patient_id = $1`, [patient.id]);
      await pool.query(`DELETE FROM patients WHERE id = $1`, [patient.id]);
    }
  });

  test("1. Doctor Consultation Start: Creates encounter with chief complaint, history, exam findings, priority and ICD diagnoses", async () => {
    const encounter = await encounterService.createEncounter({
      patientId: patient.id,
      doctorId: doctorStaff.id,
      visitId: visit.id,
      chiefComplaint: "Acute right lower abdominal pain with fever and vomiting",
      historySymptoms: "Pain started periumbilically 24h ago, migrated to RLQ. Anorexia present.",
      examinationFindings: "Tenderness at McBurney's point, positive Rovsing's sign, rebound tenderness present.",
      treatmentPlan: "NPO, IV hydration, pre-op workup (CBC, X-Ray), urgent surgical review.",
      followUpDate: "2026-09-17",
      followUpInstructions: "Post-op surgical follow-up in 2 weeks",
      priority: "URGENT",
      diagnoses: [
        {
          code: "K35.80",
          description: "Acute Appendicitis, Unspecified",
          isPrimary: true,
          severity: "SEVERE",
          notes: "Classic presentation with peritoneal signs",
        },
      ],
      createdBy: doctorUser.id,
    });

    assert.ok(encounter.id);
    assert.equal(encounter.status, "DRAFT");
    assert.equal(encounter.priority, "URGENT");
    assert.equal(encounter.chief_complaint, "Acute right lower abdominal pain with fever and vomiting");
    assert.equal(encounter.diagnoses.length, 1);
    assert.equal(encounter.diagnoses[0].code, "K35.80");

    // Store encounter for following tests
    thisEncounter = encounter;
  });

  let thisEncounter;
  let labOrder, radOrder, procOrder, surgOrder, bedOrder;
  let prescription;

  test("2. Doctor Clinical Command Center: Places multi-department orders (Lab, Radiology, Procedure, Surgery, Bed, Prescription)", async () => {
    // A. Service Orders (Lab, Radiology, Procedure, Surgery, Bed)
    const result = await serviceOrderService.createServiceOrders(
      {
        patientId: patient.id,
        encounterId: thisEncounter.id,
        visitId: visit.id,
        doctorId: doctorStaff.id,
        items: [
          { serviceId: labService.id, priority: "URGENT", notes: "Pre-op Complete Blood Count" },
          { serviceId: radService.id, priority: "URGENT", notes: "Chest X-Ray Pre-Op Clearance" },
          { serviceId: procService.id, priority: "ROUTINE", notes: "Wound Dressing & IV Cannulation" },
          { serviceId: surgService.id, priority: "URGENT", notes: "Emergency Open Appendectomy" },
          { serviceId: bedService.id, priority: "URGENT", notes: "Inpatient Bed / Post-Op Care" },
        ],
      },
      doctorUser.id
    );

    assert.ok(result.serviceOrders);
    assert.equal(result.serviceOrders.length, 5);

    const orders = result.serviceOrders;
    labOrder = orders.find((o) => o.service_id === labService.id);
    radOrder = orders.find((o) => o.service_id === radService.id);
    procOrder = orders.find((o) => o.service_id === procService.id);
    surgOrder = orders.find((o) => o.service_id === surgService.id);
    bedOrder = orders.find((o) => o.service_id === bedService.id);

    // B. Prescription (Strictly to Pharmacy)
    if (medication) {
      // Ensure medication has ample stock for test
      await pool.query(`UPDATE medications SET stock_quantity = 100 WHERE id = $1`, [medication.id]);
      const rxRes = await pharmacyService.createPrescription(
        {
          patientId: patient.id,
          doctorId: doctorStaff.id,
          encounterId: thisEncounter.id,
          medicationId: medication.id,
          dosage: "500mg",
          frequency: "TID",
          route: "Oral",
          duration: "5 days",
          quantity: 5,
          instructions: "Take with food",
        },
        doctorUser.id
      );
      prescription = rxRes;
      assert.ok(prescription.id);
      assert.equal(prescription.status, "ACTIVE");
    }
  });

  test("3. Status Pillar Verification: Non-medicine orders are WAITING_PAYMENT at Registrar; Prescription routes strictly to Pharmacy", async () => {
    // Non-medicine orders require payment before entering department queues
    assert.equal(labOrder.status, "WAITING_PAYMENT");
    assert.equal(radOrder.status, "WAITING_PAYMENT");
    assert.equal(procOrder.status, "WAITING_PAYMENT");

    // Check Lab Queue - patient should NOT be in queue yet
    const labQueueRes = await laboratoryService.getLabOrdersQueue();
    const inLabQueue = (labQueueRes.orders || []).some((q) => q.service_order_id === labOrder.id && ["PAID", "AUTHORIZED"].includes(q.service_payment_status));
    assert.equal(inLabQueue, false, "Unpaid lab order must NOT appear as authorized in Lab queue");

    // Check Radiology Queue - patient should NOT be in queue yet
    const radQueue = await radiologyService.getRadiologyQueue();
    const inRadQueue = (radQueue || []).some((q) => q.service_order_id === radOrder.id);
    assert.equal(inRadQueue, false, "Unpaid radiology order must NOT appear in Radiology queue");

    // Prescription is in Pharmacy pending queue
    if (prescription) {
      const rxQueueRes = await pharmacyService.getPrescriptionsQueue({ status: "ACTIVE" });
      const inPharmQueue = (rxQueueRes.prescriptions || rxQueueRes || []).some((p) => p.id === prescription.id);
      assert.equal(inPharmQueue, true, "Prescription must route directly to Pharmacy");
    }
  });

  test("4. Selective Payment: Registrar pays CBC and X-Ray; Dressing and Surgery remain UNPAID", async () => {
    // Find invoice
    const invRes = await pool.query(
      `SELECT * FROM invoices WHERE patient_id = $1 AND status IN ('PENDING', 'UNPAID') ORDER BY created_at DESC LIMIT 1`,
      [patient.id]
    );
    assert.ok(invRes.rows.length > 0);
    const invoice = invRes.rows[0];

    const totalToPay = parseFloat(labOrder.price) + parseFloat(radOrder.price);

    const paymentResult = await billingService.recordSelectivePayment({
      patientId: patient.id,
      invoiceId: invoice.id,
      serviceOrderIds: [labOrder.id, radOrder.id],
      amount: totalToPay,
      paymentMethod: "CASH",
      userId: registrarUser.id,
    });

    assert.ok(paymentResult.payment);

    // Verify CBC & X-Ray are now AUTHORIZED & QUEUED
    const updatedLabOrder = await pool.query(`SELECT status, authorized_at FROM service_orders WHERE id = $1`, [labOrder.id]);
    assert.equal(updatedLabOrder.rows[0].status, "PAID");
    assert.ok(updatedLabOrder.rows[0].authorized_at);

    const updatedRadOrder = await pool.query(`SELECT status, authorized_at FROM service_orders WHERE id = $1`, [radOrder.id]);
    assert.equal(updatedRadOrder.rows[0].status, "PAID");

    // Verify Dressing and Surgery remain WAITING_PAYMENT
    const updatedProcOrder = await pool.query(`SELECT status FROM service_orders WHERE id = $1`, [procOrder.id]);
    assert.equal(updatedProcOrder.rows[0].status, "WAITING_PAYMENT");

    const updatedSurgOrder = await pool.query(`SELECT status FROM service_orders WHERE id = $1`, [surgOrder.id]);
    assert.equal(updatedSurgOrder.rows[0].status, "WAITING_PAYMENT");
  });

  test("5. Department Execution: Lab Tech processes CBC and enters abnormal results", async () => {
    // Lab order is now in Lab queue
    const labQueueRes = await laboratoryService.getLabOrdersQueue();
    const labEntry = (labQueueRes.orders || []).find((q) => q.service_order_id === labOrder.id);
    assert.ok(labEntry, "Authorized lab order must be in Lab queue");

    // 1. Collect specimen
    await laboratoryService.collectSpecimen(labEntry.id, labTechUser.id);

    // 2. Enter result (WBC elevated 16.8 x10^3/uL)
    const resultRes = await laboratoryService.enterResults(
      labEntry.id,
      {
        resultValue: "16.8",
        unit: "x10^3/uL",
        referenceRange: "4.5 - 11.0",
        isAbnormal: true,
        comments: "Leukocytosis with left shift, consistent with acute inflammatory process",
      },
      labTechUser.id
    );
    assert.ok(resultRes);

    // 3. Verify result
    await laboratoryService.verifyResults(labEntry.id, labTechUser.id);

    const finalizedLab = await pool.query(`SELECT status FROM lab_orders WHERE id = $1`, [labEntry.id]);
    assert.equal(finalizedLab.rows[0].status, "VERIFIED");
  });

  test("6. Department Execution: Radiologist performs exam and enters signed radiology report", async () => {
    const radQueue = await radiologyService.getRadiologyQueue();
    const radEntry = (radQueue || []).find((q) => q.service_order_id === radOrder.id);
    assert.ok(radEntry, "Authorized radiology order must be in Radiology queue");

    // 1. Start examination
    await radiologyService.startRadiologyExam(radOrder.id, radiologistUser.id);

    // 2. Submit signed report
    await radiologyService.recordRadiologyResult(
      radOrder.id,
      {
        findings: "Lungs are clear bilaterally. No focal consolidation, pneumothorax, or pleural effusion. Cardiac silhouette is within normal limits.",
        impression: "Normal chest radiograph. Clear pre-operative surgical clearance.",
        recommendations: "Cleared for general anesthesia from cardiopulmonary standpoint.",
        technicianNotes: "Standard PA view obtained without complications.",
      },
      radiologistUser.id
    );

    const finalizedRad = await pool.query(`SELECT status, findings, impression FROM radiology_orders WHERE service_order_id = $1`, [radOrder.id]);
    assert.equal(finalizedRad.rows[0].status, "REPORTED");
    assert.ok(finalizedRad.rows[0].impression.includes("Normal chest radiograph"));
  });

  test("7. Department Execution: Pharmacist records pharmacy payment and dispenses medication", async () => {
    if (!prescription) return;

    // Dispense prescription (which decrements inventory)
    await pharmacyService.dispensePrescription(
      prescription.id,
      {
        dispensedNotes: "Dispensed with full patient instruction",
        paymentMethod: "CASH",
      },
      pharmacistUser.id
    );

    // Verify prescription is marked DISPENSED
    const rxRes = await pool.query(`SELECT status, dispensed_at FROM prescriptions WHERE id = $1`, [prescription.id]);
    assert.equal(rxRes.rows[0].status, "DISPENSED");
    assert.ok(rxRes.rows[0].dispensed_at);

    // Verify inventory decrement (100 - 5 = 95)
    const medRes = await pool.query(`SELECT stock_quantity FROM medications WHERE id = $1`, [medication.id]);
    assert.equal(medRes.rows[0].stock_quantity, 95);
  });

  test("8. Inpatient Bed Management: + Add Bed creates database bed, rejects duplicate, and assigns bed to patient", async () => {
    const uniqueBedNumber = `ICU-${Date.now().toString().slice(-4)}`;

    // 1. Create Bed via wardService
    const createdBed = await wardService.createBed(
      {
        bedNumber: uniqueBedNumber,
        wardName: "Intensive Care Unit (ICU)",
        roomNumber: "Room 401",
        bedType: "ICU",
        dailyRate: 1200.0,
        status: "AVAILABLE",
        notes: "High-dependency cardiac monitor and ventilator equipped",
      },
      registrarUser.id
    );

    assert.ok(createdBed.id);
    assert.equal(createdBed.bed_number, uniqueBedNumber);
    assert.equal(createdBed.status, "AVAILABLE");

    // 2. Reject Duplicate Bed Code
    await assert.rejects(
      async () => {
        await wardService.createBed(
          {
            bedNumber: uniqueBedNumber,
            wardName: "Intensive Care Unit (ICU)",
            bedType: "ICU",
          },
          registrarUser.id
        );
      },
      (err) => {
        return err.message.includes("DUPLICATE_BED") || err.statusCode === 409 || err.code === "23505";
      }
    );

    // 3. Admit patient and assign this bed
    const admission = await wardService.admitPatient(
      {
        visitId: visit.id,
        patientId: patient.id,
        bedId: createdBed.id,
        doctorId: doctorStaff.id,
        admissionReason: "Post-op acute monitoring",
      },
      registrarUser.id
    );

    assert.ok(admission.id);
    assert.equal(admission.status, "ADMITTED");

    // Verify bed is now OCCUPIED
    const bedCheck = await pool.query(`SELECT status FROM beds WHERE id = $1`, [createdBed.id]);
    assert.equal(bedCheck.rows[0].status, "OCCUPIED");
  });

  test("9. Doctor Consultation Workspace Retrieval: Retrieves consolidated clinical data with 3-pillar statuses and read-only results", async () => {
    const workspace = await encounterService.getEncounterById(thisEncounter.id);

    assert.ok(workspace);
    assert.equal(workspace.id, thisEncounter.id);
    assert.equal(workspace.patient_id, patient.id);
    assert.equal(workspace.patient_first_name, "Abebe");

    // 1. Diagnoses
    assert.equal(workspace.diagnoses.length, 1);
    assert.equal(workspace.diagnoses[0].code, "K35.80");

    // 2. Service Orders with 3-pillar status computation
    assert.ok(workspace.serviceOrders.length >= 5);

    const labSo = workspace.serviceOrders.find((so) => so.service_id === labService.id);
    assert.ok(labSo);
    assert.equal(labSo.financial_status, "PAID");
    assert.equal(labSo.authorization_status, "AUTHORIZED");

    const surgSo = workspace.serviceOrders.find((so) => so.service_id === surgService.id);
    assert.ok(surgSo);
    assert.equal(surgSo.financial_status, "UNPAID");
    assert.equal(surgSo.authorization_status, "NOT_AUTHORIZED");
    assert.equal(surgSo.execution_status, "WAITING_PAYMENT");

    // 3. Lab Results (Read-only for doctor)
    assert.ok(workspace.labOrders.length > 0);
    const labWithResult = workspace.labOrders.find((lo) => lo.result_value != null);
    assert.ok(labWithResult);
    assert.equal(labWithResult.result_value, "16.8");
    assert.equal(labWithResult.is_abnormal, true);

    // 4. Radiology Report (Read-only for doctor)
    assert.ok(workspace.radiologyOrders.length > 0);
    const radWithReport = workspace.radiologyOrders.find((ro) => ro.findings != null);
    assert.ok(radWithReport);
    assert.ok(radWithReport.impression.includes("Normal chest radiograph"));

    // 5. Inpatient Bed Allocation
    assert.ok(workspace.admissions.length > 0);
    assert.equal(workspace.admissions[0].status, "ADMITTED");
    assert.equal(workspace.admissions[0].ward_name, "Intensive Care Unit (ICU)");

    // 6. Complete Consultation
    const finalized = await encounterService.completeEncounter(thisEncounter.id, doctorUser.id);
    assert.equal(finalized.status, "COMPLETED");
  });
});
