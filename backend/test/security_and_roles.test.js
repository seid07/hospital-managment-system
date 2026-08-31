const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const app = require("../src/app");
const pool = require("../src/config/database");
const { ensureTestUsers } = require("./helpers/setup-test-users");
const authService = require("../src/services/auth.service");
const staffService = require("../src/services/staff.service");
const referralService = require("../src/services/referral.service");

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

  // 2. Real Email Ownership Verification Flow
  await t.test("Real Email Ownership Verification, Token Hashing & Expiration", async () => {
    const candidateEmail = `candidate_${Date.now()}@hospital.local`;

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

    // C. Check initial verification status for candidate email (unverified)
    const initialCheck = await apiRequest(`/api/staff/check-email?email=${encodeURIComponent(candidateEmail)}`, { token: adminToken });
    assert.equal(initialCheck.status, 200);
    assert.equal(initialCheck.body.available, true);
    assert.equal(initialCheck.body.verified, false);

    // D. Attempting to create staff with UNVERIFIED email MUST BE REJECTED with EMAIL_NOT_VERIFIED
    const unverifiedCreate = await apiRequest("/api/staff", {
      method: "POST",
      token: adminToken,
      body: {
        firstName: "Unverified",
        lastName: "Doctor",
        username: `unverified_${Date.now()}`,
        email: candidateEmail,
        phone: "09" + String(Date.now()).slice(-8),
        department: "General",
        role: "DOCTOR",
        password: "Temp#Doctor2026!",
      },
    });
    assert.equal(unverifiedCreate.status, 400);
    assert.equal(unverifiedCreate.body.code, "EMAIL_NOT_VERIFIED");

    // E. Trigger Email Verification Link
    const sendVerRes = await apiRequest("/api/staff/send-email-verification", {
      method: "POST",
      token: adminToken,
      body: { email: candidateEmail },
    });
    assert.equal(sendVerRes.status, 200);
    assert.equal(sendVerRes.body.success, true);

    // Cooldown test: Immediate second request within 60s should be rate-limited (HTTP 429)
    const cooldownRes = await apiRequest("/api/staff/send-email-verification", {
      method: "POST",
      token: adminToken,
      body: { email: candidateEmail },
    });
    assert.equal(cooldownRes.status, 429);

    // Verify token is hashed in DB (never plaintext)
    const dbRecord = await pool.query(
      "SELECT token_hash, expires_at, verified FROM staff_email_verifications WHERE LOWER(email) = $1",
      [candidateEmail.toLowerCase()]
    );
    assert.equal(dbRecord.rows.length, 1);
    assert.ok(dbRecord.rows[0].token_hash, "Token hash must be present");
    assert.equal(dbRecord.rows[0].token_hash.length, 64, "Token hash must be 64-char SHA-256");
    assert.equal(dbRecord.rows[0].verified, false);

    // Test Invalid verification token -> Rejected (400)
    const invalidTokenRes = await apiRequest("/api/auth/verify-email?token=invalid_random_token_123");
    assert.equal(invalidTokenRes.status, 400);

    // Test Expired token -> Rejected (400)
    const expiredRawToken = crypto.randomBytes(32).toString("hex");
    const expiredHash = crypto.createHash("sha256").update(expiredRawToken).digest("hex");
    const expiredEmail = `expired_${Date.now()}@hospital.local`;
    await pool.query(
      `INSERT INTO staff_email_verifications (email, token_hash, expires_at, verified)
       VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '5 minutes', FALSE)`,
      [expiredEmail, expiredHash]
    );
    const expiredVerRes = await apiRequest(`/api/auth/verify-email?token=${expiredRawToken}`);
    assert.equal(expiredVerRes.status, 400);

    // Generate valid raw token for candidate email to simulate email click
    const candidateRawToken = crypto.randomBytes(32).toString("hex");
    const candidateHash = crypto.createHash("sha256").update(candidateRawToken).digest("hex");
    await pool.query(
      `UPDATE staff_email_verifications 
       SET token_hash = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes', last_sent_at = CURRENT_TIMESTAMP - INTERVAL '70 seconds'
       WHERE LOWER(email) = $2`,
      [candidateHash, candidateEmail.toLowerCase()]
    );

    // F. Verify token via public verification endpoint (Simulating recipient clicking link)
    const verifySuccessRes = await apiRequest(`/api/auth/verify-email?token=${candidateRawToken}`);
    assert.equal(verifySuccessRes.status, 200);
    assert.equal(verifySuccessRes.body.success, true);
    assert.equal(verifySuccessRes.body.email.toLowerCase(), candidateEmail.toLowerCase());

    // Single-use check: Trying to verify the same token again -> Rejected (single-use)
    const secondVerifyRes = await apiRequest(`/api/auth/verify-email?token=${candidateRawToken}`);
    assert.equal(secondVerifyRes.status, 400);

    // Check email status is now VERIFIED
    const verifiedStatusCheck = await apiRequest(`/api/staff/check-email?email=${encodeURIComponent(candidateEmail)}`, { token: adminToken });
    assert.equal(verifiedStatusCheck.status, 200);
    assert.equal(verifiedStatusCheck.body.available, true);
    assert.equal(verifiedStatusCheck.body.verified, true);
  });

  // 3. Staff Creation with Verified Email, Temporary Password & First Login Password Change
  await t.test("Staff Creation with Verified Email, Temporary Password & First Login Mandatory Password Change", async () => {
    const candidateEmail = `verified_doc_${Date.now()}@hospital.local`;
    const newStaffUsername = `doc_kassahun_${Date.now()}`;
    const uniquePhone = "09" + String(Date.now()).slice(-8);
    const tempPassword = "Temp#Doctor2026!";

    // Mark candidate email as verified in DB
    await pool.query(
      `INSERT INTO staff_email_verifications (email, verified, verified_at)
       VALUES ($1, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET verified = TRUE, verified_at = CURRENT_TIMESTAMP`,
      [candidateEmail.toLowerCase()]
    );

    // Create staff member
    const createRes = await apiRequest("/api/staff", {
      method: "POST",
      token: adminToken,
      body: {
        firstName: "Tewodros",
        lastName: "Kassahun",
        username: newStaffUsername,
        email: candidateEmail,
        phone: uniquePhone,
        department: "Internal Medicine",
        specialty: "Cardiology",
        role: "DOCTOR",
        password: tempPassword,
      },
    });

    assert.equal(createRes.status, 201, `Failed to create staff: ${JSON.stringify(createRes.body)}`);
    assert.equal(createRes.body.data.username, newStaffUsername);
    assert.equal(createRes.body.data.mustChangePassword, true);
    const createdStaffId = createRes.body.data.staffId;

    // Verify staff record in database has email_verified = true
    const staffDb = await pool.query("SELECT email_verified, email_verified_at FROM staff WHERE id = $1", [createdStaffId]);
    assert.equal(staffDb.rows[0].email_verified, true);

    // Test Resend Credentials (Admin Action)
    const resendCredsRes = await apiRequest(`/api/staff/${createdStaffId}/resend-credentials`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(resendCredsRes.status, 200);
    assert.equal(resendCredsRes.body.success, true);

    // Single-role enforcement: Trying to create with array of roles -> 400
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
        password: "Temp#Doctor2026!",
      },
    });
    assert.equal(multiRoleRes.status, 400);

    // Test First Login with New Staff
    // Set a known password hash for the created user
    const hash = await bcrypt.hash(tempPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE staff_id = $2", [hash, createdStaffId]);

    const newStaffLogin = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { username: newStaffUsername, password: tempPassword },
    });
    assert.equal(newStaffLogin.status, 200);
    const loginUser = newStaffLogin.body.user || newStaffLogin.body.data?.user;
    const loginToken = newStaffLogin.body.token || newStaffLogin.body.data?.token;
    assert.equal(loginUser.must_change_password, true);

    // Attempting to access operational endpoints before changing password -> 403 PASSWORD_CHANGE_REQUIRED
    const blockedQueueRes = await apiRequest("/api/patients", { token: loginToken });
    assert.equal(blockedQueueRes.status, 403);
    assert.equal(blockedQueueRes.body.code, "PASSWORD_CHANGE_REQUIRED");

    // 2-Step Password Change: Step 1 (Verify Current Password)
    const verifyPassRes = await apiRequest("/api/auth/verify-password", {
      method: "POST",
      token: loginToken,
      body: { currentPassword: tempPassword },
    });
    assert.equal(verifyPassRes.status, 200);
    assert.equal(verifyPassRes.body.success, true);

    // 2-Step Password Change: Step 2 (Submit New Password)
    const permPassword = "Permanent#Pass2026!";
    const changePassRes = await apiRequest("/api/auth/change-password", {
      method: "POST",
      token: loginToken,
      body: {
        currentPassword: tempPassword,
        newPassword: permPassword,
        confirmPassword: permPassword,
      },
    });
    assert.equal(changePassRes.status, 200);
    assert.equal(changePassRes.body.success, true);
    assert.equal(changePassRes.body.user.must_change_password, false);

    const freshToken = changePassRes.body.token;
    assert.ok(freshToken, "Fresh token should be returned after password change");

    // Now operational endpoints should be accessible
    const unblockedRes = await apiRequest("/api/patients", { token: freshToken });
    assert.notEqual(unblockedRes.status, 403);

  });

  // 4. Forgot Password 6-Digit OTP Flow
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

  // 5. Doctor-to-Doctor Referral Chat Participant-Only Access Control
  await t.test("Doctor-to-Doctor Referral Chat Security (Strict Participant-Only RBAC)", async () => {
    // Setup verified doctors for referral
    const doc1Time = Date.now() + 10;
    const doc2Time = Date.now() + 20;

    await pool.query(
      `INSERT INTO staff_email_verifications (email, verified, verified_at)
       VALUES ($1, TRUE, CURRENT_TIMESTAMP), ($2, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
      [`doc1_${doc1Time}@hospital.local`, `doc2_${doc2Time}@hospital.local`]
    );

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
    await pool.query(
      `INSERT INTO staff_email_verifications (email, verified, verified_at)
       VALUES ($1, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO NOTHING`,
      [`doc3_${doc3Time}@hospital.local`]
    );

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

  // 6. Full Transaction History Strict Print/Export Authorization
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
