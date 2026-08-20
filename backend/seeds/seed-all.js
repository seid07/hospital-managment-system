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
      { name: "RADIOLOGIST", description: "Radiology technician and imaging specialist" },
      { name: "SURGEON", description: "Surgical specialist and operating theatre staff" },
      { name: "WARD_STAFF", description: "Inpatient ward nurse and bed manager" },
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
      {
        firstName: "Samuel",
        lastName: "Reed",
        email: "radiologist.sam@hospital.local",
        phone: "+1-555-0108",
        department: "Radiology & Imaging",
        specialty: "Diagnostic Radiography",
        role: "RADIOLOGIST",
        username: "radiologist_sam",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Alexander",
        lastName: "Wright",
        email: "surgeon.alex@hospital.local",
        phone: "+1-555-0109",
        department: "Surgery",
        specialty: "General Surgery",
        role: "SURGEON",
        username: "surgeon_alex",
        passwordHash: defaultPasswordHash,
      },
      {
        firstName: "Hannah",
        lastName: "Cole",
        email: "ward.hannah@hospital.local",
        phone: "+1-555-0110",
        department: "Inpatient Ward",
        specialty: "Ward Management",
        role: "WARD_STAFF",
        username: "nurse_ward",
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
          phone = EXCLUDED.phone,
          department = EXCLUDED.department,
          specialty = EXCLUDED.specialty,
          role_id = EXCLUDED.role_id
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
    console.log("Staff and user accounts seeded.");

    // 3. Doctor Schedules
    const drSmithId = staffMap["doctor_smith"];
    const drJonesId = staffMap["doctor_jones"];

    if (drSmithId && drJonesId) {
      await client.query("DELETE FROM doctor_schedules WHERE doctor_id IN ($1, $2)", [
        drSmithId,
        drJonesId,
      ]);

      const schedules = [
        { doctorId: drSmithId, day: 1, start: "08:00", end: "12:00", duration: 30 },
        { doctorId: drSmithId, day: 3, start: "08:00", end: "12:00", duration: 30 },
        { doctorId: drSmithId, day: 5, start: "13:00", end: "17:00", duration: 30 },
        { doctorId: drJonesId, day: 1, start: "09:00", end: "13:00", duration: 30 },
        { doctorId: drJonesId, day: 2, start: "09:00", end: "13:00", duration: 30 },
        { doctorId: drJonesId, day: 4, start: "14:00", end: "18:00", duration: 30 },
      ];

      for (const s of schedules) {
        await client.query(
          `
          INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
          VALUES ($1, $2, $3, $4, $5);
          `,
          [s.doctorId, s.day, s.start, s.end, s.duration]
        );
      }
      console.log("Doctor schedules seeded.");
    }

    // 4. Sample Patients
    const patients = [
      {
        patientNumber: "PAT-2026-000001",
        firstName: "Abebe",
        lastName: "Kebede",
        dob: "1988-04-12",
        gender: "Male",
        phone: "+251-911-234567",
        email: "abebe.kebede@example.com",
        address: "Bole Sub-City, Kebele 03, Addis Ababa",
        emergencyName: "Tigist Kebede",
        emergencyPhone: "+251-911-987654",
      },
      {
        patientNumber: "PAT-2026-000002",
        firstName: "Hana",
        lastName: "Tadesse",
        dob: "1992-09-24",
        gender: "Female",
        phone: "+251-922-345678",
        email: "hana.tadesse@example.com",
        address: "Yeka Sub-City, Addis Ababa",
        emergencyName: "Mulugeta Tadesse",
        emergencyPhone: "+251-922-876543",
      },
      {
        patientNumber: "PAT-2026-000003",
        firstName: "Ali",
        lastName: "Mohammed",
        dob: "1975-11-03",
        gender: "Male",
        phone: "+251-933-456789",
        email: "ali.mohammed@example.com",
        address: "Kirkos Sub-City, Addis Ababa",
        emergencyName: "Fatuma Ali",
        emergencyPhone: "+251-933-765432",
      },
    ];

    for (const p of patients) {
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
          phone = EXCLUDED.phone,
          address = EXCLUDED.address;
        `,
        [
          p.patientNumber,
          p.firstName,
          p.lastName,
          p.dob,
          p.gender,
          p.phone,
          p.email,
          p.address,
          p.emergencyName,
          p.emergencyPhone,
        ]
      );
    }
    console.log("Sample patients seeded.");

    await client.query("COMMIT");
    console.log("Seed finished successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Seed error:", error);
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
