const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateEthiopianPhone,
  normalizeEthiopianPhone,
  validatePasswordStrength,
  calculateDobFromAge,
} = require("../src/validators/index.js");
const authService = require("../src/services/auth.service.js");
const patientService = require("../src/services/patient.service.js");
const scheduleService = require("../src/services/schedule.service.js");
const billingService = require("../src/services/billing.service.js");
const { ensureTestUsers } = require("./helpers/setup-test-users");

test("Ethiopian Hospital Enhancements & Security Test Suite", async (t) => {
  await ensureTestUsers();

  await t.test("1. Validator: Ethiopian Phone Numbers", () => {
    assert.equal(validateEthiopianPhone("0911223344"), true);
    assert.equal(validateEthiopianPhone("0711223344"), true);
    assert.equal(validateEthiopianPhone("+251911223344"), true);
    assert.equal(validateEthiopianPhone("+251711223344"), true);
    assert.equal(validateEthiopianPhone("251911223344"), true);

    // Invalid phones
    assert.equal(validateEthiopianPhone("0811223344"), false);
    assert.equal(validateEthiopianPhone("+1555123456"), false);
    assert.equal(validateEthiopianPhone("12345"), false);
    assert.equal(validateEthiopianPhone(""), false);

    // Normalization
    assert.equal(normalizeEthiopianPhone("0911223344"), "+251911223344");
    assert.equal(normalizeEthiopianPhone("+251911223344"), "+251911223344");
  });

  await t.test("2. Validator: Strong Password Policy", () => {
    // Valid: 8+ chars, upper, lower, digit, special char
    assert.equal(validatePasswordStrength("Hospital@12345").isValid, true);
    assert.equal(validatePasswordStrength("Abebe#2026").isValid, true);

    // Invalid passwords
    assert.equal(validatePasswordStrength("short").isValid, false);
    assert.equal(validatePasswordStrength("alllowercase123!").isValid, false);
    assert.equal(validatePasswordStrength("ALLUPPERCASE123!").isValid, false);
    assert.equal(validatePasswordStrength("NoSpecialChar123").isValid, false);
    assert.equal(validatePasswordStrength("NoDigitsHere!@#").isValid, false);
  });

  await t.test("3. Validator: Calculate DOB from Age", () => {
    const currentYear = new Date().getFullYear();
    assert.equal(calculateDobFromAge(30), `${currentYear - 30}-01-01`);
    assert.equal(calculateDobFromAge(0), `${currentYear}-01-01`);
  });

  await t.test("4. Auth Service: Request and Execute Password Reset Flow", async () => {
    // Request reset for admin using all 5 required verification fields
    const resetResult = await authService.requestPasswordReset({
      username: "admin",
      lastName: "Administrator",
      email: "admin@hospital.local",
      phone: "0911000000",
      department: "Administration",
    });
    assert.equal(resetResult.success, true);
    assert.ok(resetResult.resetToken);
    assert.equal(resetResult.resetToken.length, 64);

    // Reset password with new compliant password
    const newPass = "AdminSecure#2026";
    const updateResult = await authService.resetPassword(resetResult.resetToken, newPass);
    assert.equal(updateResult.success, true);

    // Authenticate with new password
    const loginResult = await authService.login("admin", newPass);
    assert.ok(loginResult.token);
    assert.equal(loginResult.user.username, "admin");

    // Token cannot be reused (one-time use)
    await assert.rejects(
      async () => {
        await authService.resetPassword(resetResult.resetToken, "AnotherPass@123");
      },
      (err) => err.message.includes("INVALID_OR_EXPIRED_TOKEN")
    );

    // Revert password back to Admin@12345
    const revertReq = await authService.requestPasswordReset({
      username: "admin",
      lastName: "Administrator",
      email: "admin@hospital.local",
      phone: "0911000000",
      department: "Administration",
    });
    await authService.resetPassword(revertReq.resetToken, "Admin@12345");
  });

  await t.test("5. Schedule Service: Upcoming Availability for Doctors", async () => {
    const doctors = await scheduleService.getDoctors();
    assert.ok(doctors.length > 0);
    const doctor = doctors[0];

    // Ensure schedule exists
    const schedules = await scheduleService.getDoctorSchedules(doctor.id);
    if (schedules.length === 0) {
      for (let day = 0; day <= 6; day++) {
        await scheduleService.createSchedule(doctor.id, {
          dayOfWeek: day,
          startTime: "08:00:00",
          endTime: "17:00:00",
          slotDurationMinutes: 30,
        });
      }
    }

    const upcoming = await scheduleService.getDoctorUpcomingAvailability(doctor.id, 14);
    assert.ok(upcoming.doctor);
    assert.equal(upcoming.doctor.id, doctor.id);
    assert.ok(Array.isArray(upcoming.availableDates));
    assert.ok(upcoming.availableDates.length > 0);
  });

  await t.test("6. Billing Service: Pending Cashier Orders Queue", async () => {
    const pending = await billingService.getPendingCashierOrders();
    assert.ok(Array.isArray(pending));
  });

  await t.test("7. Patient Service: Delete Patient (Soft Delete & Audit Log)", async () => {
    // Create temp patient
    const tempPatient = await patientService.createPatient({
      firstName: "SoftDelete",
      lastName: "TestPatient",
      age: 28,
      gender: "Female",
      phone: "0999887766",
      address: "Addis Ababa",
    });
    assert.ok(tempPatient.id);

    // Delete patient
    const deleted = await patientService.deletePatient(tempPatient.id);
    assert.equal(deleted.is_active, false);

    // Verify search excludes deactivated patient
    const searchRes = await patientService.getPatients({ search: "TestPatient" });
    const found = searchRes.patients.find((p) => p.id === tempPatient.id);
    assert.equal(found, undefined);
  });

  await t.test("8. Staff Service: Delete Staff Permanently (Foreign Key Cascade / Set Null)", async () => {
    const staffService = require("../src/services/staff.service.js");
    const pool = require("../src/config/database.js");

    // Create temp staff with user account
    const uniqueSuffix = Date.now();
    const uniquePhone = "09" + String(uniqueSuffix).slice(-8);
    const testEmail = `tempdoctor_${uniqueSuffix}@hospital.local`;
    await pool.query(
      `INSERT INTO staff_email_verifications (email, verified, verified_at)
       VALUES ($1, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET verified = TRUE, verified_at = CURRENT_TIMESTAMP`,
      [testEmail]
    );

    const created = await staffService.createStaff({
      firstName: "TempDelete",
      lastName: "Doctor",
      email: testEmail,
      phone: uniquePhone,
      department: "OPD",
      specialty: "General Practice",
      role: "DOCTOR",
      username: `tempdoctor_${uniqueSuffix}`,
      password: "Hospital@12345",
    });
    assert.ok(created.staffId);


    const userRes = await pool.query("SELECT id FROM users WHERE staff_id = $1", [created.staffId]);
    assert.ok(userRes.rows.length > 0);
    const userId = userRes.rows[0].id;

    // Create a dummy patient, invoice, and prescription referencing this user/staff
    const patient = await patientService.createPatient({
      firstName: "FKTest",
      lastName: "Patient",
      age: 40,
      gender: "Male",
      phone: "09" + String(uniqueSuffix + 1).slice(-8),
      address: "Addis Ababa",
    });

    // Insert an invoice created_by this user
    await pool.query(
      `INSERT INTO invoices (invoice_number, patient_id, subtotal, total_amount, paid_amount, balance_amount, created_by)
       VALUES ($1, $2, 100, 100, 0, 100, $3)`,
      [`INV-FK-${uniqueSuffix}`, patient.id, userId]
    );

    // Insert a prescription dispensed_by / ordered by this doctor
    await pool.query(
      `INSERT INTO prescriptions (prescription_number, patient_id, doctor_id, medication_name, dosage, frequency, dispensed_by, status)
       VALUES ($1, $2, $3, 'Amoxicillin', '500mg', 'TID', $4, 'DISPENSED')`,
      [`RX-FK-${uniqueSuffix}`, patient.id, created.staffId, userId]
    );

    // Now permanently delete the staff member - should succeed without foreign key constraint error!
    const deleteResult = await staffService.deleteStaffPermanently(created.staffId);
    assert.equal(deleteResult.success, true);

    // Verify staff and user records are deleted
    const staffCheck = await pool.query("SELECT id FROM staff WHERE id = $1", [created.staffId]);
    assert.equal(staffCheck.rows.length, 0);

    const userCheck = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    assert.equal(userCheck.rows.length, 0);
  });
});

