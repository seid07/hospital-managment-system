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

test("Ethiopian Hospital Enhancements & Security Test Suite", async (t) => {
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
    // Request reset for admin
    const resetResult = await authService.requestPasswordReset("admin");
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
    const revertReq = await authService.requestPasswordReset("admin");
    await authService.resetPassword(revertReq.resetToken, "Admin@12345");
  });

  await t.test("5. Schedule Service: Upcoming Availability for Doctors", async () => {
    const doctors = await scheduleService.getDoctors();
    assert.ok(doctors.length > 0);
    const doctor = doctors[0];

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
    const searchRes = await patientService.searchPatients("TestPatient");
    const found = searchRes.patients.find((p) => p.id === tempPatient.id);
    assert.equal(found, undefined);
  });
});
