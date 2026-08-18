require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../src/config/database");

async function seedAll() {
  const client = await pool.connect();

  try {
    console.log("Starting comprehensive seed...");
    await client.query("BEGIN");

    // 1. Roles
    const roles = [
      { name: "ADMIN", description: "System administrator with full hospital oversight" },
      { name: "REGISTRAR", description: "Front desk, patient intake, and appointment scheduling" },
      { name: "DOCTOR", description: "Physicians and clinical specialists" },
      { name: "NURSE", description: "Nursing staff and triage management" },
      { name: "PHARMACIST", description: "Pharmacy dispensing and medication inventory" },
      { name: "LAB_TECH", description: "Laboratory test processing and verification" },
      { name: "FINANCE", description: "Hospital billing, invoicing, and payment reconciliation" },
    ];

    const roleMap = {};
    for (const r of roles) {
      const res = await client.query(
        `
        INSERT INTO roles (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
        RETURNING id, name;
        `,
        [r.name, r.description]
      );
      roleMap[r.name] = res.rows[0].id;
    }
    console.log("Roles verified:", Object.keys(roleMap));

    // 2. Staff & Users
    const defaultPasswordHash = await bcrypt.hash("Hospital@12345", 10);
    const adminPasswordHash = await bcrypt.hash("Admin@12345", 10);

    const staffAccounts = [
      {
        firstName: "System",
        lastName: "Administrator",
        email: "admin@hospital.local",
        phone: "+1-555-0100",
        department: "Administration",
        specialty: "System Oversight",
        role: "ADMIN",
        username: "admin",
        passwordHash: adminPasswordHash,
      },
      {
        firstName: "Sarah",
        lastName: "Johnson",
        email: "registrar@hospital.local",
        phone: "+1-555-0101",
        department: "Patient Services",
        specialty: "Front Desk & Admissions",
        role: "REGISTRAR",
        username: "registrar",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Sarah",
        lastName: "Smith",
        email: "dr.smith@hospital.local",
        phone: "+1-555-0102",
        department: "Cardiology",
        specialty: "Cardiovascular Medicine",
        role: "DOCTOR",
        username: "doctor_smith",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "James",
        lastName: "Jones",
        email: "dr.jones@hospital.local",
        phone: "+1-555-0103",
        department: "General Practice",
        specialty: "Internal Medicine",
        role: "DOCTOR",
        username: "doctor_jones",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Emily",
        lastName: "Watson",
        email: "nurse.emily@hospital.local",
        phone: "+1-555-0104",
        department: "Inpatient Care",
        specialty: "Triage & Critical Care",
        role: "NURSE",
        username: "nurse_emily",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "David",
        lastName: "Miller",
        email: "pharmacist.david@hospital.local",
        phone: "+1-555-0105",
        department: "Pharmacy",
        specialty: "Clinical Pharmacology",
        role: "PHARMACIST",
        username: "pharmacist_david",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Kevin",
        lastName: "Adams",
        email: "labtech.kevin@hospital.local",
        phone: "+1-555-0106",
        department: "Diagnostic Pathology",
        specialty: "Clinical Biochemistry",
        role: "LAB_TECH",
        username: "labtech_kevin",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Clara",
        lastName: "Evans",
        email: "finance.clara@hospital.local",
        phone: "+1-555-0107",
        department: "Billing & Revenue",
        specialty: "Revenue Cycle",
        role: "FINANCE",
        username: "finance_clara",
        passwordHash: defaultPasswordHash,
      },
    ];

    const staffMap = {};
    for (const acc of staffAccounts) {
      const staffRes = await client.query(
        `
        INSERT INTO staff (first_name, last_name, email, phone, department, specialty, role_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          department = EXCLUDED.department,
          specialty = EXCLUDED.specialty,
          role_id = EXCLUDED.role_id,
          is_active = TRUE
        RETURNING id;
        `,
        [
          acc.firstName,
          acc.lastName,
          acc.email,
          acc.phone,
          acc.department,
          acc.specialty,
          roleMap[acc.role],
        ]
      );
      const staffId = staffRes.rows[0].id;
      staffMap[acc.username] = staffId;

      await client.query(
        `
        INSERT INTO users (staff_id, username, password_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          staff_id = EXCLUDED.staff_id;
        `,
        [staffId, acc.username, acc.passwordHash]
      );
    }
    console.log("Staff & user accounts seeded.");

    // 3. Doctor Schedules
    const doctors = [staffMap["doctor_smith"], staffMap["doctor_jones"]].filter(Boolean);
    for (const doctorId of doctors) {
      // Days Monday(1) through Friday(5)
      for (let day = 1; day <= 5; day++) {
        await client.query(
          `
          INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active)
          VALUES ($1, $2, '08:30:00', '16:30:00', 30, TRUE)
          ON CONFLICT DO NOTHING;
          `,
          [doctorId, day]
        );
      }
    }
    console.log("Doctor schedules seeded.");

    // 4. Medications & Stock
    const medications = [
      { name: "Amoxicillin", code: "MED-AMOX-500", form: "Capsule", strength: "500mg", stock: 250, reorder: 40, price: 12.5 },
      { name: "Paracetamol", code: "MED-PARA-500", form: "Tablet", strength: "500mg", stock: 500, reorder: 100, price: 5.0 },
      { name: "Ibuprofen", code: "MED-IBU-400", form: "Tablet", strength: "400mg", stock: 300, reorder: 50, price: 8.0 },
      { name: "Omeprazole", code: "MED-OMEP-20", form: "Capsule", strength: "20mg", stock: 180, reorder: 30, price: 15.0 },
      { name: "Metformin", code: "MED-METF-500", form: "Tablet", strength: "500mg", stock: 400, reorder: 60, price: 9.5 },
      { name: "Atorvastatin", code: "MED-ATOR-20", form: "Tablet", strength: "20mg", stock: 220, reorder: 40, price: 22.0 },
      { name: "Ciprofloxacin", code: "MED-CIPR-500", form: "Tablet", strength: "500mg", stock: 140, reorder: 25, price: 18.5 },
      { name: "Salbutamol Inhaler", code: "MED-SALB-100", form: "Inhaler", strength: "100mcg/dose", stock: 65, reorder: 15, price: 28.0 },
      { name: "Azithromycin", code: "MED-AZIT-250", form: "Tablet", strength: "250mg", stock: 110, reorder: 20, price: 24.0 },
      { name: "Lisinopril", code: "MED-LISI-10", form: "Tablet", strength: "10mg", stock: 190, reorder: 30, price: 11.0 },
    ];

    for (const med of medications) {
      await client.query(
        `
        INSERT INTO medications (name, code, form, strength, stock_quantity, reorder_level, unit_price, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          stock_quantity = EXCLUDED.stock_quantity,
          unit_price = EXCLUDED.unit_price,
          is_active = TRUE;
        `,
        [med.name, med.code, med.form, med.strength, med.stock, med.reorder, med.price]
      );
    }
    console.log("Medications catalog seeded.");

    // 5. Laboratory Test Catalog
    const labTests = [
      { code: "LAB-CBC", name: "Complete Blood Count (CBC)", category: "Hematology", refRange: "WBC: 4.5-11.0 x10^9/L, Hb: 12.0-17.5 g/dL, PLT: 150-450 x10^9/L", unit: "Various", price: 35.0, turnaround: 12 },
      { code: "LAB-LIPID", name: "Lipid Panel", category: "Biochemistry", refRange: "Total Chol: < 200 mg/dL, HDL: > 40 mg/dL, LDL: < 100 mg/dL, Triglycerides: < 150 mg/dL", unit: "mg/dL", price: 45.0, turnaround: 24 },
      { code: "LAB-FBS", name: "Fasting Blood Glucose", category: "Biochemistry", refRange: "70 - 99 mg/dL", unit: "mg/dL", price: 20.0, turnaround: 4 },
      { code: "LAB-LFT", name: "Liver Function Test (LFT)", category: "Biochemistry", refRange: "ALT: 7-56 U/L, AST: 10-40 U/L, Bilirubin: 0.1-1.2 mg/dL", unit: "U/L", price: 50.0, turnaround: 24 },
      { code: "LAB-RFT", name: "Renal Function Test (Creatinine & Urea)", category: "Biochemistry", refRange: "Creatinine: 0.6-1.2 mg/dL, BUN: 7-20 mg/dL", unit: "mg/dL", price: 40.0, turnaround: 12 },
      { code: "LAB-URINE", name: "Urinalysis (Routine & Microscopy)", category: "Urinalysis", refRange: "Color: Pale yellow, pH: 5.0-8.0, Protein: Negative", unit: "Qualitative", price: 25.0, turnaround: 6 },
      { code: "LAB-MALARIA", name: "Malaria Rapid Diagnostic Test", category: "Serology", refRange: "Negative", unit: "Qualitative", price: 15.0, turnaround: 1 },
      { code: "LAB-TSH", name: "Thyroid Stimulating Hormone (TSH)", category: "Endocrinology", refRange: "0.4 - 4.0 mIU/L", unit: "mIU/L", price: 55.0, turnaround: 24 },
      { code: "LAB-ECG", name: "12-Lead Electrocardiogram (ECG)", category: "Cardiology", refRange: "Normal Sinus Rhythm", unit: "Trace", price: 60.0, turnaround: 2 },
      { code: "LAB-CXR", name: "Chest X-Ray (PA View)", category: "Radiology", refRange: "Clear lung fields, normal cardiothoracic ratio", unit: "Image Report", price: 75.0, turnaround: 12 },
    ];

    for (const test of labTests) {
      await client.query(
        `
        INSERT INTO lab_test_catalog (code, name, category, reference_range, unit, price, turnaround_time_hours, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          reference_range = EXCLUDED.reference_range,
          price = EXCLUDED.price,
          is_active = TRUE;
        `,
        [test.code, test.name, test.category, test.refRange, test.unit, test.price, test.turnaround]
      );
    }
    console.log("Lab test catalog seeded.");

    // 6. Billable Services
    const services = [
      { code: "SRV-CONS-GEN", name: "General Consultation", category: "Consultation", fee: 50.0 },
      { code: "SRV-CONS-SPEC", name: "Specialist Consultation", category: "Consultation", fee: 100.0 },
      { code: "SRV-TRIAGE-EMERG", name: "Emergency Triage & Assessment", category: "Nursing", fee: 40.0 },
      { code: "SRV-NURS-ROUTINE", name: "Routine Nursing Care & Vitals", category: "Nursing", fee: 15.0 },
      { code: "SRV-IV-THERAPY", name: "Intravenous Infusion Administration", category: "Procedure", fee: 35.0 },
      { code: "SRV-WOUND-DRESS", name: "Surgical Wound Dressing", category: "Procedure", fee: 30.0 },
      { code: "SRV-BED-DAY", name: "Inpatient Bed Day (General Ward)", category: "Room/Bed", fee: 120.0 },
    ];

    for (const s of services) {
      await client.query(
        `
        INSERT INTO billable_services (code, name, category, standard_fee, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          standard_fee = EXCLUDED.standard_fee,
          is_active = TRUE;
        `,
        [s.code, s.name, s.category, s.fee]
      );
    }
    console.log("Billable services seeded.");

    // 7. Sample Patients
    const samplePatients = [
      {
        patientNumber: "PAT-2026-001001",
        firstName: "Michael",
        lastName: "Green",
        dateOfBirth: "1985-04-12",
        gender: "Male",
        phone: "+1-555-2001",
        email: "michael.green@example.com",
        address: "742 Evergreen Terrace, Springfield",
        emergencyContactName: "Laura Green",
        emergencyContactPhone: "+1-555-2002",
      },
      {
        patientNumber: "PAT-2026-001002",
        firstName: "Eleanor",
        lastName: "Vance",
        dateOfBirth: "1992-09-28",
        gender: "Female",
        phone: "+1-555-2003",
        email: "eleanor.vance@example.com",
        address: "123 Hill House Lane, Boston",
        emergencyContactName: "Robert Vance",
        emergencyContactPhone: "+1-555-2004",
      },
      {
        patientNumber: "PAT-2026-001003",
        firstName: "Arthur",
        lastName: "Pendelton",
        dateOfBirth: "1960-11-05",
        gender: "Male",
        phone: "+1-555-2005",
        email: "arthur.p@example.com",
        address: "45 Baker Street, London",
        emergencyContactName: "Mary Pendelton",
        emergencyContactPhone: "+1-555-2006",
      },
    ];

    for (const p of samplePatients) {
      await client.query(
        `
        INSERT INTO patients (
          patient_number, first_name, last_name, date_of_birth, gender,
          phone, email, address, emergency_contact_name, emergency_contact_phone, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        ON CONFLICT (patient_number) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          phone = EXCLUDED.phone;
        `,
        [
          p.patientNumber,
          p.firstName,
          p.lastName,
          p.dateOfBirth,
          p.gender,
          p.phone,
          p.email,
          p.address,
          p.emergencyContactName,
          p.emergencyContactPhone,
        ]
      );
    }
    console.log("Sample patients seeded.");

    await client.query("COMMIT");
    console.log("Seed completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedAll();
}

module.exports = { seedAll };
