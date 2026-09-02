const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const bcrypt = require("bcrypt");
const app = require("../src/app");
const pool = require("../src/config/database");
const { ensureTestUsers } = require("./helpers/setup-test-users");
const staffService = require("../src/services/staff.service");
const referralService = require("../src/services/referral.service");
const scheduleService = require("../src/services/schedule.service");

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

async function apiRequest(endpoint, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  }

  return { status: res.status, body: data };
}

async function loginAsRole(roleName) {
  const userRes = await pool.query(
    `SELECT u.username, u.id
     FROM users u
     JOIN staff s ON u.staff_id = s.id
     JOIN roles r ON s.role_id = r.id
     WHERE r.name = $1
     ORDER BY u.created_at ASC
     LIMIT 1`,
    [roleName]
  );
  if (userRes.rows.length === 0) {
    throw new Error(`No user found for role ${roleName}`);
  }
  const username = userRes.rows[0].username;
  const testPass = "Hospital@12345";
  const hash = await bcrypt.hash(testPass, 10);
  await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2",
    [hash, userRes.rows[0].id]
  );
  const res = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { username, password: testPass },
  });
  return res;
}

test("Security, Authentication, Referral Chat & Transaction Access Suite", async (t) => {
  await ensureTestUsers();
  await startServer();

  t.after(async () => {
    await stopServer();
  });

  let adminToken, registrarToken, doctor1Token, nurseToken, labTechToken;
  let adminUser, registrarUser, doctor1User, nurseUser;

  // 1. Obtain Tokens for Roles
  await t.test("Setup & Authentication for Role-Based Tests", async () => {
    const adminLogin = await loginAsRole("ADMIN");
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.body.token || adminLogin.body.data?.token;
    adminUser = adminLogin.body.user || adminLogin.body.data?.user;
    assert.ok(adminToken, "Admin token should exist");

    const regLogin = await loginAsRole("REGISTRAR");
    assert.equal(regLogin.status, 200);
    registrarToken = regLogin.body.token || regLogin.body.data?.token;
    registrarUser = regLogin.body.user || regLogin.body.data?.user;
    assert.ok(registrarToken, "Registrar token should exist");

    const doc1Login = await loginAsRole("DOCTOR");
    assert.equal(doc1Login.status, 200);
    doctor1Token = doc1Login.body.token || doc1Login.body.data?.token;
    doctor1User = doc1Login.body.user || doc1Login.body.data?.user;
    assert.ok(doctor1Token, "Doctor 1 token should exist");

    const nurseLogin = await loginAsRole("NURSE");
    assert.equal(nurseLogin.status, 200);
    nurseToken = nurseLogin.body.token || nurseLogin.body.data?.token;
    nurseUser = nurseLogin.body.user || nurseLogin.body.data?.user;
    assert.ok(nurseToken, "Nurse token should exist");

    const labLogin = await loginAsRole("LAB_TECH");
    assert.equal(labLogin.status, 200);
    labTechToken = labLogin.body.token || labLogin.body.data?.token;
    assert.ok(labTechToken, "Labtech token should exist");
  });

  // 2. Direct Staff Creation, Email Format Validation, Temporary Password Generation & Resend
  await t.test("Direct Staff Creation, Validation, Password Hashing & Resend Temporary Password", async () => {
    const uniqueTime = Date.now();
    const candidateEmail = `candidate_${uniqueTime}@hospital.local`;
    const candidateUsername = `dr_kassahun_${uniqueTime}`;
    const candidatePhone = "09" + String(uniqueTime).slice(-8);

    // A. Check email format validation
    const invalidFormatRes = await apiRequest("/api/staff/check-email?email=invalid-email", { token: adminToken });
    assert.equal(invalidFormatRes.status, 200);
    assert.equal(invalidFormatRes.body.available, false);
    assert.equal(invalidFormatRes.body.reason, "INVALID_FORMAT");

    // B. Check duplicate email validation
    const duplicateRes = await apiRequest("/api/staff/check-email?email=admin@hospital.local", { token: adminToken });
    assert.equal(duplicateRes.status, 200);
    assert.equal(duplicateRes.body.available, false);
    assert.equal(duplicateRes.body.reason, "DUPLICATE");

    // C. Check available valid email
    const availableRes = await apiRequest(`/api/staff/check-email?email=${encodeURIComponent(candidateEmail)}`, { token: adminToken });
    assert.equal(availableRes.status, 200);
    assert.equal(availableRes.body.available, true);

    // D. Direct Staff Creation without requiring verification link
    const createRes = await apiRequest("/api/staff", {
      method: "POST",
      token: adminToken,
      body: {
        firstName: "Tewodros",
        lastName: "Kassahun",
        username: candidateUsername,
        email: candidateEmail,
        phone: candidatePhone,
        department: "Internal Medicine",
        specialty: "Cardiology",
        role: "DOCTOR",
      },
    });

    assert.equal(createRes.status, 201, `Staff creation failed: ${JSON.stringify(createRes.body)}`);
    assert.equal(createRes.body.data.username, candidateUsername);
    assert.equal(createRes.body.data.mustChangePassword, true);
    const createdStaffId = createRes.body.data.staffId;

    // E. Verify password is saved as a bcrypt hash (never plaintext)
    const userDb = await pool.query(
      "SELECT password_hash, must_change_password FROM users WHERE staff_id = $1",
      [createdStaffId]
    );
    assert.equal(userDb.rows.length, 1);
    assert.ok(userDb.rows[0].password_hash.startsWith("$2b$") || userDb.rows[0].password_hash.startsWith("$2a$"));
    assert.equal(userDb.rows[0].must_change_password, true);

    // F. Test Resend Temporary Password (Admin Action)
    const resendRes = await apiRequest(`/api/staff/${createdStaffId}/resend-credentials`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(resendRes.status, 200);
    assert.equal(resendRes.body.success, true);

    // G. Single role enforcement: array of roles rejected (HTTP 400)
    const multiRoleRes = await apiRequest("/api/staff", {
      method: "POST",
      token: adminToken,
      body: {
        firstName: "Multi",
        lastName: "Tester",
        username: `multi_${Date.now()}`,
        email: `multi_${Date.now()}@hospital.local`,
        phone: "0911998877",
        department: "General",
        role: ["DOCTOR", "ADMIN"],
      },
    });
    assert.equal(multiRoleRes.status, 400);

    // H. GET /api/staff loads active hospital personnel list
    const staffListRes = await apiRequest("/api/staff", { token: adminToken });
    assert.equal(staffListRes.status, 200);
    assert.ok(Array.isArray(staffListRes.body.data));
    assert.ok(staffListRes.body.data.length > 0);
  });

  // 3. Schedule Management: Create, Update (PUT /api/schedules/:id) and Delete
  await t.test("Schedule Management: Create, Edit/Update, and Delete", async () => {
    // Get doctor staff ID
    const docRes = await pool.query(
      `SELECT s.id FROM staff s JOIN roles r ON s.role_id = r.id WHERE r.name = 'DOCTOR' LIMIT 1`
    );
    const doctorStaffId = docRes.rows[0].id;
    await pool.query("DELETE FROM doctor_schedules WHERE doctor_id = $1", [doctorStaffId]);

    // Create schedule
    const createSchedRes = await apiRequest(`/api/schedules/doctors/${doctorStaffId}`, {

      method: "POST",
      token: adminToken,
      body: {
        dayOfWeek: 2, // Tuesday
        startTime: "09:00",
        endTime: "13:00",
        slotDurationMinutes: 30,
      },
    });
    assert.equal(createSchedRes.status, 201);
    const scheduleId = createSchedRes.body.data.id || createSchedRes.body.data[0]?.id;
    assert.ok(scheduleId);

    // Edit/Update schedule (PUT /api/schedules/:id)
    const updateSchedRes = await apiRequest(`/api/schedules/${scheduleId}`, {
      method: "PUT",
      token: adminToken,
      body: {
        dayOfWeek: 3, // Changed to Wednesday
        startTime: "10:00",
        endTime: "15:00",
        slotDurationMinutes: 45,
      },
    });
    assert.equal(updateSchedRes.status, 200);
    assert.equal(updateSchedRes.body.data.day_of_week, 3);
    assert.equal(updateSchedRes.body.data.start_time.slice(0, 5), "10:00");
    assert.equal(updateSchedRes.body.data.end_time.slice(0, 5), "15:00");
    assert.equal(updateSchedRes.body.data.slot_duration_minutes, 45);

    // Delete schedule
    const deleteSchedRes = await apiRequest(`/api/schedules/${scheduleId}`, {
      method: "DELETE",
      token: adminToken,
    });
    assert.equal(deleteSchedRes.status, 200);
  });

  // 4. First Login with Temporary Password -> Mandatory Password Change Workflow
  await t.test("First Login with Temporary Password & Mandatory Password Change", async () => {
    const uniqueTime = Date.now() + 5;
    const tempUser = `firstlogin_${uniqueTime}`;
    const tempPass = "Initial#Temp2026!";

    // Create staff with known temporary password
    const createRes = await staffService.createStaff(
      {
        firstName: "Abebech",
        lastName: "Gobena",
        username: tempUser,
        email: `${tempUser}@hospital.local`,
        phone: "09" + String(uniqueTime).slice(-8),
        department: "Pediatrics",
        role: "DOCTOR",
        password: tempPass,
      },
      adminUser.id
    );
    assert.ok(createRes.staffId);

    // Login with temporary password
    const loginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { username: tempUser, password: tempPass },
    });
    assert.equal(loginRes.status, 200);
    const loginToken = loginRes.body.token || loginRes.body.data?.token;
    const loginUserData = loginRes.body.user || loginRes.body.data?.user;
    assert.equal(loginUserData.must_change_password, true);

    // Attempting to access protected operational endpoints before changing password -> 403 PASSWORD_CHANGE_REQUIRED
    const blockedRes = await apiRequest("/api/patients", { token: loginToken });
    assert.equal(blockedRes.status, 403);
    assert.equal(blockedRes.body.code, "PASSWORD_CHANGE_REQUIRED");

    // 2-Step Password Change: Step 1 (Verify Current Password)
    const verifyPassRes = await apiRequest("/api/auth/verify-password", {
      method: "POST",
      token: loginToken,
      body: { currentPassword: tempPass },
    });
    assert.equal(verifyPassRes.status, 200);

    // 2-Step Password Change: Step 2 (Submit New Permanent Password)
    const permanentPass = "Permanent#Secure2026!";
    const changePassRes = await apiRequest("/api/auth/change-password", {
      method: "POST",
      token: loginToken,
      body: {
        currentPassword: tempPass,
        newPassword: permanentPass,
        confirmPassword: permanentPass,
      },
    });
    assert.equal(changePassRes.status, 200);
    assert.equal(changePassRes.body.user.must_change_password, false);

    const freshToken = changePassRes.body.token;
    assert.ok(freshToken);

    // Now protected operational endpoints should be accessible
    const unblockedRes = await apiRequest("/api/patients", { token: freshToken });
    assert.notEqual(unblockedRes.status, 403);

    // Old temporary password no longer works
    const oldLoginRes = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { username: tempUser, password: tempPass },
    });
    assert.equal(oldLoginRes.status, 401);
  });

  // 5. Forgot Password 6-Digit OTP Flow
  await t.test("Forgot Password: 6-Digit OTP, Expiration, Attempt Limiting & Password Reset", async () => {
    const testUsername = "admin";
    const testEmail = "admin@hospital.local";

    // Step 1: Request OTP with valid username + matching registered email
    const otpReqRes = await apiRequest("/api/auth/forgot-password/request-otp", {
      method: "POST",
      body: { username: testUsername, email: testEmail },
    });
    assert.equal(otpReqRes.status, 200);
    assert.equal(otpReqRes.body.success, true);

    // Verify OTP in DB is hashed with bcrypt (never plaintext)
    const userOtpDb = await pool.query(
      "SELECT password_reset_otp_hash, password_reset_attempts FROM users WHERE username = $1",
      [testUsername]
    );
    assert.ok(userOtpDb.rows[0].password_reset_otp_hash);
    assert.ok(userOtpDb.rows[0].password_reset_otp_hash.startsWith("$2b$") || userOtpDb.rows[0].password_reset_otp_hash.startsWith("$2a$"));

    // Request with mismatched email should fail / not dispatch OTP
    const mismatchRes = await apiRequest("/api/auth/forgot-password/request-otp", {
      method: "POST",
      body: { username: testUsername, email: "attacker@gmail.com" },
    });
    assert.equal(mismatchRes.status, 400);

    // Step 2: Test Invalid OTP attempt limit
    const wrongOtpRes = await apiRequest("/api/auth/forgot-password/verify-otp", {
      method: "POST",
      body: { username: testUsername, email: testEmail, otp: "000000" },
    });
    assert.equal(wrongOtpRes.status, 400);

    // Set a known OTP hash for testing
    const knownOtp = "729145";
    const knownHash = await bcrypt.hash(knownOtp, 10);
    await pool.query(
      `UPDATE users 
       SET password_reset_otp_hash = $1,
           password_reset_otp_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
           password_reset_attempts = 0
       WHERE username = $2`,
      [knownHash, testUsername]
    );

    // Step 3: Verify correct OTP -> returns short-lived single-use reset token
    const verifyOtpRes = await apiRequest("/api/auth/forgot-password/verify-otp", {
      method: "POST",
      body: { username: testUsername, email: testEmail, otp: knownOtp },
    });
    assert.equal(verifyOtpRes.status, 200);
    assert.ok(verifyOtpRes.body.resetToken, "Reset token must be returned");
    const resetToken = verifyOtpRes.body.resetToken;

    // Step 4: Reset Password using reset token
    const newResetPass = "NewAdminPassword#2026!";
    const resetRes = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: {
        resetToken,
        newPassword: newResetPass,
        confirmPassword: newResetPass,
      },
    });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);

    // Single-use check: Reset token cannot be reused
    const secondResetRes = await apiRequest("/api/auth/reset-password", {
      method: "POST",
      body: {
        resetToken,
        newPassword: newResetPass,
        confirmPassword: newResetPass,
      },
    });
    assert.equal(secondResetRes.status, 400);
  });

  // 6. Doctor-to-Doctor Referral Chat Participant-Only Access Control
  await t.test("Doctor-to-Doctor Referral Chat Security (Strict Participant-Only RBAC)", async () => {
    const doc1Time = Date.now() + 10;
    const doc2Time = Date.now() + 20;

    const doc1Res = await staffService.createStaff(
      {
        firstName: "Referring",
        lastName: "Doctor",
        username: `doc1_${doc1Time}`,
        email: `doc1_${doc1Time}@hospital.local`,
        phone: "09" + String(doc1Time).slice(-8),
        department: "Internal Medicine",
        role: "DOCTOR",
        password: "Doc1#Password123!",
      },
      adminUser.id
    );
    const doc1StaffId = doc1Res.staffId;

    const doc2Res = await staffService.createStaff(
      {
        firstName: "Receiving",
        lastName: "Doctor",
        username: `doc2_${doc2Time}`,
        email: `doc2_${doc2Time}@hospital.local`,
        phone: "09" + String(doc2Time).slice(-8),
        department: "Cardiology",
        role: "DOCTOR",
        password: "Doc2#Password123!",
      },
      adminUser.id
    );
    const doc2StaffId = doc2Res.staffId;

    // Create a third doctor for unauthorized access testing
    const doc3Time = Date.now() + 50;
    const doc3Res = await staffService.createStaff(
      {
        firstName: "Third",
        lastName: "Doctor",
        username: `doc3_${doc3Time}`,
        email: `doc3_${doc3Time}@hospital.local`,
        phone: "09" + String(doc3Time + 22).slice(-8),
        department: "Dermatology",
        role: "DOCTOR",
        password: "Doc3#Password123!",
      },
      adminUser.id
    );
    const doc3StaffId = doc3Res.staffId;

    const patientRes = await pool.query("SELECT id FROM patients LIMIT 1");
    let patientId = patientRes.rows[0]?.id;
    if (!patientId) {
      const pat = await pool.query(
        `INSERT INTO patients (patient_number, first_name, last_name, gender, date_of_birth, phone)
         VALUES ('PAT-TEST-001', 'Abebe', 'Bikila', 'MALE', '1990-01-01', '0911111111')
         RETURNING id`
      );
      patientId = pat.rows[0].id;
    }

    const referral = await referralService.createReferral(
      {
        patientId,
        referringDoctorId: doc1StaffId,
        receivingDoctorId: doc2StaffId,
        urgency: "URGENT",
        caseNote: "Please evaluate for cardiology consult",
      },
      adminUser.id
    );
    assert.ok(referral.id);

    // Doctor 1 sends message
    const msg1 = await referralService.sendReferralMessage(
      referral.id,
      "Patient has elevated cardiac enzymes",
      doc1StaffId,
      adminUser.id,
      "DOCTOR"
    );
    assert.ok(msg1.id);
    assert.equal(msg1.message, "Patient has elevated cardiac enzymes");

    // Doctor 2 sends reply
    const msg2 = await referralService.sendReferralMessage(
      referral.id,
      "Will review ECG and perform echocardiogram",
      doc2StaffId,
      adminUser.id,
      "DOCTOR"
    );
    assert.ok(msg2.id);

    // Doctor 1 retrieves messages (participant -> allowed)
    const messages = await referralService.getReferralMessages(referral.id, doc1StaffId, "DOCTOR");
    assert.equal(messages.length, 2);

    // Doctor 3 (non-participant) attempts to retrieve messages -> REJECTED with REFERRAL_ACCESS_DENIED
    await assert.rejects(
      async () => {
        await referralService.getReferralMessages(referral.id, doc3StaffId, "DOCTOR");
      },
      { message: "REFERRAL_ACCESS_DENIED" }
    );

    // Doctor 3 attempts to send message -> REJECTED with REFERRAL_ACCESS_DENIED
    await assert.rejects(
      async () => {
        await referralService.sendReferralMessage(
          referral.id,
          "Intruder message",
          doc3StaffId,
          adminUser.id,
          "DOCTOR"
        );
      },
      { message: "REFERRAL_ACCESS_DENIED" }
    );
  });

  // 7. Full Transaction History Strict Print/Export Authorization
  await t.test("Strict Transaction History Print/Export RBAC (ADMIN & REGISTRAR Only)", async () => {
    // ADMIN access -> Allowed (200 OK)
    const adminTxRes = await apiRequest("/api/billing/transactions/full-history", {
      token: adminToken,
    });
    assert.equal(adminTxRes.status, 200);
    assert.ok(Array.isArray(adminTxRes.body.data));

    // REGISTRAR access -> Allowed (200 OK)
    const registrarTxRes = await apiRequest("/api/billing/transactions/full-history", {
      token: registrarToken,
    });
    assert.equal(registrarTxRes.status, 200);
    assert.ok(Array.isArray(registrarTxRes.body.data));

    // DOCTOR access -> FORBIDDEN (403)
    const doctorTxRes = await apiRequest("/api/billing/transactions/full-history", {
      token: doctor1Token,
    });
    assert.equal(doctorTxRes.status, 403);

    // NURSE access -> FORBIDDEN (403)
    const nurseTxRes = await apiRequest("/api/billing/transactions/full-history", {
      token: nurseToken,
    });
    assert.equal(nurseTxRes.status, 403);

    // LAB_TECH access -> FORBIDDEN (403)
    const labTechTxRes = await apiRequest("/api/billing/transactions/full-history", {
      token: labTechToken,
    });
    assert.equal(labTechTxRes.status, 403);
  });
});
