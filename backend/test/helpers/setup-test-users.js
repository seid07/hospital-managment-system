const pool = require("../../src/config/database");
const bcrypt = require("bcrypt");

async function ensureTestUsers() {
  const rolesRes = await pool.query("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(rolesRes.rows.map((r) => [r.name, r.id]));

  const passwordHash = await bcrypt.hash("Admin@12345", 10);
  const staffPassHash = await bcrypt.hash("Hospital@12345", 10);

  // 1. Admin
  const adminStaffRes = await pool.query(
    `INSERT INTO staff (first_name, last_name, email, phone, department, role_id)
     VALUES ('System', 'Administrator', 'admin@hospital.local', '0911000000', 'Administration', $1)
     ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, department = EXCLUDED.department, phone = EXCLUDED.phone
     RETURNING id`,
    [roleMap.ADMIN]
  );
  const adminStaffId = adminStaffRes.rows[0].id;
  await pool.query(
    `INSERT INTO users (staff_id, username, password_hash)
     VALUES ($1, 'admin', $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, staff_id = EXCLUDED.staff_id`,
    [adminStaffId, passwordHash]
  );

  // 2. Helper for staff users
  const staffDefinitions = [
    { username: "registrar", role: "REGISTRAR", first: "Abebe", last: "Kebede", email: "registrar@hospital.local", phone: "0911111111", dept: "Patient Services" },
    { username: "doctor_smith", role: "DOCTOR", first: "Dawit", last: "Smith", email: "doctor@hospital.local", phone: "0922222222", dept: "Cardiology", spec: "Cardiology" },
    { username: "nurse_emily", role: "NURSE", first: "Emily", last: "Haile", email: "nurse@hospital.local", phone: "0933333333", dept: "Triage" },
    { username: "labtech_kevin", role: "LAB_TECH", first: "Kevin", last: "Bekele", email: "lab@hospital.local", phone: "0944444444", dept: "Laboratory" },
    { username: "pharmacist_david", role: "PHARMACIST", first: "David", last: "Alemu", email: "pharmacy@hospital.local", phone: "0955555555", dept: "Pharmacy" },
    { username: "radiologist_sam", role: "RADIOLOGIST", first: "Sam", last: "Tadesse", email: "radiology@hospital.local", phone: "0966666666", dept: "Radiology" },
    { username: "finance_clara", role: "FINANCE", first: "Clara", last: "Mekonnen", email: "finance@hospital.local", phone: "0977777777", dept: "Finance" },
  ];

  for (const s of staffDefinitions) {
    if (roleMap[s.role]) {
      const staffRes = await pool.query(
        `INSERT INTO staff (first_name, last_name, email, phone, department, specialty, role_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, department = EXCLUDED.department, phone = EXCLUDED.phone
         RETURNING id`,
        [s.first, s.last, s.email, s.phone, s.dept, s.spec || null, roleMap[s.role]]
      );
      await pool.query(
        `INSERT INTO users (staff_id, username, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, staff_id = EXCLUDED.staff_id`,
        [staffRes.rows[0].id, s.username, staffPassHash]
      );
    }
  }
}

module.exports = { ensureTestUsers };
