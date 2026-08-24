require("dotenv").config();
const pool = require("../src/config/database");

async function seedMasterData() {
  const client = await pool.connect();

  try {
    console.log("Starting master configuration seed (Roles, Departments, Services, Medications, Beds)...");
    await client.query("BEGIN");

    // 1. Standard Roles
    const roles = [
      { name: "ADMIN", description: "System administrator with full hospital oversight" },
      { name: "REGISTRAR", description: "Front desk, patient intake, and appointment scheduling" },
      { name: "DOCTOR", description: "Physicians and clinical specialists" },
      { name: "NURSE", description: "Nursing staff and triage management" },
      { name: "PHARMACIST", description: "Pharmacy dispensing and medication inventory" },
      { name: "LAB_TECH", description: "Laboratory test processing and verification" },
      { name: "FINANCE", description: "Hospital billing, invoicing, and payment reconciliation" },
      { name: "RADIOLOGIST", description: "Radiology technician and imaging specialist" },
      { name: "SURGEON", description: "Surgical specialist and operating theatre staff" },
      { name: "WARD_STAFF", description: "Inpatient ward nurse and bed manager" },
    ];

    for (const r of roles) {
      await client.query(
        `
        INSERT INTO roles (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;
        `,
        [r.name, r.description]
      );
    }
    console.log("Standard Roles verified.");

    // 2. Standard Departments
    const departments = [
      { code: "REGISTRATION", name: "Registration & Cashier", description: "Front desk patient registration and cashier payments" },
      { code: "CLINICAL", name: "Clinical & Outpatient", description: "General and specialist medical consultations" },
      { code: "LABORATORY", name: "Diagnostic Pathology & Laboratory", description: "Clinical diagnostic laboratory and pathology tests" },
      { code: "RADIOLOGY", name: "Radiology & Medical Imaging", description: "Diagnostic X-Ray and Ultrasound imaging" },
      { code: "CARDIOLOGY", name: "Cardiology & Diagnostic Testing", description: "Electrocardiogram (ECG) and cardiac diagnostics" },
      { code: "PROCEDURE", name: "Nursing & Clinical Procedures", description: "Minor surgical procedures, dressings, and injections" },
      { code: "WARD", name: "Inpatient Care & Ward", description: "Inpatient admission, beds, and daily nursing care" },
      { code: "SURGERY", name: "Operating Theatre & Surgery", description: "Surgical procedures and operative care" },
      { code: "PHARMACY", name: "Hospital Pharmacy & Formulary", description: "Medication dispensing and pharmaceutical payment" },
    ];

    for (const d of departments) {
      await client.query(
        `
        INSERT INTO departments (code, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
        `,
        [d.code, d.name, d.description]
      );
    }
    console.log("Standard Departments verified.");

    // 3. Ensure Standard Services
    const services = [
      { code: "CONSULT-GENERAL", name: "General Consultation", category: "Consultation", dept: "CLINICAL", price: 300.00, loc: "CASHIER" },
      { code: "CONSULT-SPECIALIST", name: "Specialist Consultation", category: "Consultation", dept: "CLINICAL", price: 500.00, loc: "CASHIER" },
      { code: "CONSULT-FOLLOWUP", name: "Follow-up Consultation", category: "Consultation", dept: "CLINICAL", price: 150.00, loc: "CASHIER" },
      { code: "CONSULT-EMERGENCY", name: "Emergency Consultation", category: "Consultation", dept: "CLINICAL", price: 400.00, loc: "CASHIER" },
      { code: "ADMIN-REGISTRATION", name: "Patient Card / Registration Fee", category: "Administrative", dept: "REGISTRATION", price: 50.00, loc: "CASHIER" },
      { code: "LAB-GENERAL", name: "Laboratory General Service", category: "Laboratory", dept: "LABORATORY", price: 100.00, loc: "CASHIER" },
      { code: "LAB-CBC", name: "Complete Blood Count (CBC)", category: "Laboratory", dept: "LABORATORY", price: 150.00, loc: "CASHIER" },
      { code: "LAB-URINE", name: "Urinalysis Test", category: "Laboratory", dept: "LABORATORY", price: 80.00, loc: "CASHIER" },
      { code: "LAB-MALARIA", name: "Malaria Rapid & Microscopy Test", category: "Laboratory", dept: "LABORATORY", price: 120.00, loc: "CASHIER" },
      { code: "LAB-CHEMISTRY", name: "Blood Chemistry Panel", category: "Laboratory", dept: "LABORATORY", price: 250.00, loc: "CASHIER" },
      { code: "IMG-XRAY", name: "X-Ray Diagnostic Imaging", category: "Imaging", dept: "RADIOLOGY", price: 300.00, loc: "CASHIER" },
      { code: "IMG-ULTRASOUND", name: "Ultrasound Sonogram Scan", category: "Imaging", dept: "RADIOLOGY", price: 350.00, loc: "CASHIER" },
      { code: "DIAG-ECG", name: "Electrocardiogram (ECG)", category: "Diagnostic", dept: "CARDIOLOGY", price: 200.00, loc: "CASHIER" },
      { code: "PROC-GENERAL", name: "Minor Clinical Procedure", category: "Procedure", dept: "PROCEDURE", price: 250.00, loc: "CASHIER" },
      { code: "PROC-DRESSING", name: "Wound Dressing & Care", category: "Procedure", dept: "PROCEDURE", price: 100.00, loc: "CASHIER" },
      { code: "PROC-INJECTION", name: "Clinical Injection Administration", category: "Procedure", dept: "PROCEDURE", price: 50.00, loc: "CASHIER" },
      { code: "WARD-BED-DAY", name: "Inpatient Bed / Daily Care", category: "Inpatient", dept: "WARD", price: 400.00, loc: "CASHIER" },
      { code: "SURG-GENERAL", name: "Surgical Operation & OT", category: "Surgery", dept: "SURGERY", price: 3500.00, loc: "CASHIER" },
      { code: "PHARM-MEDICATION", name: "Prescription Medicines & Pharmaceuticals", category: "Pharmacy", dept: "PHARMACY", price: 0.00, loc: "PHARMACY" },
    ];

    for (const s of services) {
      await client.query(
        `
        INSERT INTO services (code, name, category, department_id, price, currency, requires_payment, payment_location, queue_enabled)
        VALUES (
          $1, $2, $3,
          (SELECT id FROM departments WHERE code = $4 LIMIT 1),
          $5, 'ETB', TRUE, $6, TRUE
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          price = EXCLUDED.price,
          payment_location = EXCLUDED.payment_location;
        `,
        [s.code, s.name, s.category, s.dept, s.price, s.loc]
      );
    }
    console.log("Standard Services verified.");

    // 3b. Ensure Standard Laboratory Test Catalog, linked to its billable
    // service. Doctor-ordered lab tests are only allowed once linked
    // (see migrations/007_lab_billing_linkage.sql) — without this seed step,
    // every lab test would be blocked from ordering until an admin manually
    // linked each one from Laboratory > Catalog.
    const labTests = [
      { code: "LABTEST-CBC", name: "Complete Blood Count (CBC)", category: "Hematology", unit: null, turnaround: 4, serviceCode: "LAB-CBC" },
      { code: "LABTEST-URINE", name: "Urinalysis", category: "Clinical Chemistry", unit: null, turnaround: 2, serviceCode: "LAB-URINE" },
      { code: "LABTEST-MALARIA", name: "Malaria Rapid & Microscopy Test", category: "Parasitology", unit: null, turnaround: 1, serviceCode: "LAB-MALARIA" },
      { code: "LABTEST-CHEMISTRY", name: "Blood Chemistry Panel", category: "Clinical Chemistry", unit: null, turnaround: 6, serviceCode: "LAB-CHEMISTRY" },
    ];

    for (const t of labTests) {
      await client.query(
        `
        INSERT INTO lab_test_catalog (code, name, category, unit, turnaround_time_hours, price, service_id, is_active)
        VALUES (
          $1, $2, $3, $4, $5,
          (SELECT price FROM services WHERE code = $6 LIMIT 1),
          (SELECT id FROM services WHERE code = $6 LIMIT 1),
          TRUE
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          turnaround_time_hours = EXCLUDED.turnaround_time_hours,
          price = (SELECT price FROM services WHERE code = $6 LIMIT 1),
          service_id = (SELECT id FROM services WHERE code = $6 LIMIT 1);
        `,
        [t.code, t.name, t.category, t.unit, t.turnaround, t.serviceCode]
      );
    }

    // Backfill: link any pre-existing lab_test_catalog rows (created before
    // migration 007, or added by hand) that still have no service_id, by
    // matching their name against the standard services above. This is a
    // best-effort data fix, not a schema change — it only ever fills in a
    // NULL, never overwrites an existing manual link.
    await client.query(`
      UPDATE lab_test_catalog t
      SET service_id = s.id
      FROM services s
      WHERE t.service_id IS NULL
        AND (
          (t.name ILIKE '%complete blood count%' OR t.name ILIKE '%cbc%') AND s.code = 'LAB-CBC'
          OR (t.name ILIKE '%urinalysis%' OR t.name ILIKE '%urine%') AND s.code = 'LAB-URINE'
          OR t.name ILIKE '%malaria%' AND s.code = 'LAB-MALARIA'
          OR (t.name ILIKE '%chemistry%' OR t.name ILIKE '%blood chem%') AND s.code = 'LAB-CHEMISTRY'
        );
    `);
    console.log("Standard Laboratory Test Catalog verified and linked to billable services.");

    // 4. Ensure Standard Medications Formulary
    const medications = [
      { name: "Paracetamol", code: "MED-PCM-500", form: "Tablet", strength: "500mg", stock: 100, price: 15.00, reorder: 15 },
      { name: "Amoxicillin", code: "MED-AMX-500", form: "Capsule", strength: "500mg", stock: 80, price: 35.00, reorder: 15 },
      { name: "Ibuprofen", code: "MED-IBU-400", form: "Tablet", strength: "400mg", stock: 90, price: 20.00, reorder: 15 },
      { name: "Ciprofloxacin", code: "MED-CIP-500", form: "Tablet", strength: "500mg", stock: 50, price: 45.00, reorder: 15 },
      { name: "Omeprazole", code: "MED-OMP-20", form: "Capsule", strength: "20mg", stock: 75, price: 25.00, reorder: 15 },
      { name: "Metformin", code: "MED-MET-500", form: "Tablet", strength: "500mg", stock: 60, price: 18.00, reorder: 15 },
      { name: "Artemether/Lumefantrine (Coartem)", code: "MED-COA-20", form: "Tablet", strength: "20/120mg", stock: 40, price: 85.00, reorder: 15 },
      { name: "Ceftriaxone Injection", code: "MED-CEF-1G", form: "Injection", strength: "1g Vial", stock: 30, price: 120.00, reorder: 15 },
      { name: "Normal Saline 0.9% IV", code: "MED-NS-500", form: "IV Infusion", strength: "500ml", stock: 50, price: 65.00, reorder: 15 },
    ];

    for (const m of medications) {
      await client.query(
        `
        INSERT INTO medications (name, code, form, strength, stock_quantity, reorder_level, unit_price, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          form = EXCLUDED.form,
          strength = EXCLUDED.strength,
          unit_price = EXCLUDED.unit_price;
        `,
        [m.name, m.code, m.form, m.strength, m.stock, m.reorder, m.price]
      );
    }
    console.log("Formulary Medications verified.");

    // 5. Standard Hospital Beds
    const beds = [
      { bedNumber: "BED-101", ward: "General Male Ward", type: "STANDARD", rate: 400.00 },
      { bedNumber: "BED-102", ward: "General Male Ward", type: "STANDARD", rate: 400.00 },
      { bedNumber: "BED-201", ward: "General Female Ward", type: "STANDARD", rate: 400.00 },
      { bedNumber: "BED-202", ward: "General Female Ward", type: "STANDARD", rate: 400.00 },
      { bedNumber: "BED-ICU-01", ward: "Intensive Care Unit (ICU)", type: "ICU", rate: 1200.00 },
      { bedNumber: "BED-PED-01", ward: "Pediatric Ward", type: "PEDIATRIC", rate: 350.00 },
    ];

    for (const b of beds) {
      await client.query(
        `
        INSERT INTO beds (bed_number, ward_name, bed_type, daily_rate)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (bed_number) DO NOTHING;
        `,
        [b.bedNumber, b.ward, b.type, b.rate]
      );
    }
    console.log("Hospital Beds verified.");

    await client.query("COMMIT");
    console.log("Master Data Configuration Seed completed successfully (No fake patients or staff accounts created).");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Master seed error:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedMasterData();
}

module.exports = { seedMasterData };
