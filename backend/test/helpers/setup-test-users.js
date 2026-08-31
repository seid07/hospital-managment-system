const pool = require("../../src/config/database");
const bcrypt = require("bcrypt");

async function ensureTestUsers() {
  const rolesRes = await pool.query("SELECT id, name FROM roles");
  const roleMap = Object.fromEntries(rolesRes.rows.map((r) => [r.name, r.id]));

  const passwordHash = await bcrypt.hash("Admin@12345", 10);
  const staffPassHash = await bcrypt.hash("Hospital@12345", 10);

  // Helper to upsert a staff member and their corresponding user record
  async function upsertStaffUser({ username, role, first, last, email, phone, dept, spec, passHash }) {
    if (!roleMap[role]) return;

    // Check if staff already exists by email or phone
    const existingStaff = await pool.query(
      "SELECT id FROM staff WHERE email = $1 OR phone = $2 LIMIT 1",
      [email, phone]
    );

    let staffId;
    if (existingStaff.rows.length > 0) {
      staffId = existingStaff.rows[0].id;
      await pool.query(
        `UPDATE staff 
         SET first_name = $1, last_name = $2, email = $3, phone = $4, department = $5, specialty = $6, role_id = $7, is_active = TRUE
         WHERE id = $8`,
        [first, last, email, phone, dept, spec || null, roleMap[role], staffId]
      );
    } else {
      const inserted = await pool.query(
        `INSERT INTO staff (first_name, last_name, email, phone, department, specialty, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         RETURNING id`,
        [first, last, email, phone, dept, spec || null, roleMap[role]]
      );
      staffId = inserted.rows[0].id;
    }

    // Now upsert the user record for this staffId and username
    const userByStaff = await pool.query("SELECT id FROM users WHERE staff_id = $1", [staffId]);
    const userByUsername = await pool.query("SELECT id FROM users WHERE username = $1", [username]);

    if (userByStaff.rows.length > 0) {
      await pool.query(
        "UPDATE users SET username = $1, password_hash = $2 WHERE staff_id = $3",
        [username, passHash, staffId]
      );
    } else if (userByUsername.rows.length > 0) {
      await pool.query(
        "UPDATE users SET staff_id = $1, password_hash = $2 WHERE username = $3",
        [staffId, passHash, username]
      );
    } else {
      await pool.query(
        "INSERT INTO users (staff_id, username, password_hash) VALUES ($1, $2, $3)",
        [staffId, username, passHash]
      );
    }
  }

  // 1. Admin
  await upsertStaffUser({
    username: "admin",
    role: "ADMIN",
    first: "System",
    last: "Administrator",
    email: "admin@hospital.local",
    phone: "0911000000",
    dept: "Administration",
    spec: "Hospital System Administrator",
    passHash: passwordHash,
  });

  // 2. Staff users
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
    await upsertStaffUser({
      username: s.username,
      role: s.role,
      first: s.first,
      last: s.last,
      email: s.email,
      phone: s.phone,
      dept: s.dept,
      spec: s.spec,
      passHash: staffPassHash,
    });
  }
}

module.exports = { ensureTestUsers };

