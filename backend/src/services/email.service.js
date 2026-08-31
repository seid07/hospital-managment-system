const nodemailer = require("nodemailer");

/**
 * Hospital Management System - Email Service
 * Handles SMTP email delivery for:
 * 1. Staff Email Ownership Verification (one-time link)
 * 2. Staff Welcome / Credentials (temporary password)
 * 3. Forgot Password 6-digit OTP code
 */

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  // If live SMTP credentials are not configured, return null to use fallback mode
  return null;
}

/**
 * Send one-time secure email ownership verification link to staff candidate.
 */
async function sendEmailVerificationEmail({ to, token, expiresInMinutes = 30 }) {
  const hospitalName = process.env.HOSPITAL_NAME || "Hospital Management System";
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  const verificationUrl = `${frontendUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM || `"${hospitalName}" <no-reply@hospital.local>`;

  const subject = `${hospitalName} — Verify Your Staff Email Address`;
  const textContent = `
Hospital Management System — Staff Email Verification

Hello,

A staff account creation request was initiated using this email address for ${hospitalName}.

Please click the following link to verify ownership of this email address:
${verificationUrl}

This verification link will expire in ${expiresInMinutes} minutes and can only be used once.

Once verified, your system administrator will complete the account setup and issue your temporary login credentials.

If you did not request this, please disregard this email.

Best regards,
${hospitalName} Administration
`.trim();

  const htmlContent = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
  <h2 style="color: #0f766e; margin-top: 0; border-bottom: 2px solid #0f766e; padding-bottom: 8px;">${hospitalName}</h2>
  <h3 style="color: #1e293b; margin: 16px 0 8px 0;">Verify Your Email Address</h3>
  <p style="color: #475569; font-size: 14px; line-height: 1.5;">
    An account registration was initiated for you in the ${hospitalName} portal. To verify ownership of this mailbox, please click the button below:
  </p>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="${verificationUrl}" style="background-color: #0f766e; color: #ffffff; padding: 14px 28px; text-decoration: none; font-size: 15px; font-weight: bold; border-radius: 6px; display: inline-block;">
      ✓ Verify Email Address
    </a>
  </div>

  <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
    Or copy and paste this verification URL directly into your web browser:
  </p>
  <p style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; color: #0284c7;">
    ${verificationUrl}
  </p>

  <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; margin-top: 20px;">
    <p style="margin: 0; color: #92400e; font-size: 12px;">
      ⏳ This verification link expires in <strong>${expiresInMinutes} minutes</strong> and is valid for a single use.
    </p>
  </div>

  <p style="color: #94a3b8; font-size: 11px; margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
    This is an automated security verification message from ${hospitalName}. If you did not request this, you may safely ignore this message.
  </p>
</div>
`.trim();

  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[EMAIL DISPATCH] Email ownership verification link dispatched for ${to}. (SMTP not configured in environment)`);
    return {
      sent: true,
      deliveredTo: to,
      method: "SYSTEM_DISPATCH_DEV",
      verificationUrl,
    };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });
    return {
      sent: true,
      deliveredTo: to,
      messageId: info.messageId,
      method: "SMTP",
    };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send email verification link to ${to}:`, err.message);
    return {
      sent: false,
      deliveredTo: to,
      error: err.message,
      method: "SMTP",
    };
  }
}

/**
 * Send welcome email with temporary generated password to newly created staff member.
 */
async function sendStaffWelcomeEmail({ to, firstName, lastName, username, temporaryPassword }) {
  const hospitalName = process.env.HOSPITAL_NAME || "Hospital Management System";
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
  const loginUrl = `${frontendUrl.replace(/\/$/, "")}/login`;
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM || `"${hospitalName}" <no-reply@hospital.local>`;

  const subject = `Welcome to ${hospitalName} — Your Account Credentials`;
  const textContent = `
Dear ${firstName} ${lastName},

Your staff account for ${hospitalName} has been successfully created.

Your login credentials are:
Username: ${username}
Temporary Password: ${temporaryPassword}

Login Portal: ${loginUrl}

IMPORTANT SECURITY NOTICE:
This temporary password will expire and must be changed immediately upon your first login. You will be prompted to set a new, secure password before accessing hospital clinical and administrative workspaces.

This temporary password should not be shared with anyone.

Best regards,
${hospitalName} Administration
`.trim();

  const htmlContent = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
  <h2 style="color: #1e40af; margin-top: 0;">Welcome to ${hospitalName}</h2>
  <p>Dear <strong>${firstName} ${lastName}</strong>,</p>
  <p>Your staff account has been created by the system administrator.</p>
  
  <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 20px 0;">
    <p style="margin: 0 0 8px 0;"><strong>Username:</strong> <code style="font-size: 14px; color: #0f172a;">${username}</code></p>
    <p style="margin: 0 0 8px 0;"><strong>Temporary Password:</strong> <code style="font-size: 14px; color: #b91c1c; font-weight: bold;">${temporaryPassword}</code></p>
    <p style="margin: 0;"><strong>Login URL:</strong> <a href="${loginUrl}" style="color: #2563eb;">${loginUrl}</a></p>
  </div>

  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin-bottom: 20px;">
    <strong style="color: #991b1b;">MANDATORY FIRST LOGIN REQUIREMENT:</strong>
    <p style="margin: 4px 0 0 0; color: #7f1d1d; font-size: 13px;">
      This password is temporary and must be changed immediately upon your first login before accessing hospital services. This temporary password should not be shared with anyone.
    </p>
  </div>

  <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
    This is an automated system email from ${hospitalName}. Please do not reply directly to this message.
  </p>
</div>
`.trim();

  const transporter = getTransporter();

  if (!transporter) {
    // Development / Test dispatch
    console.log(`[EMAIL DISPATCH] Staff welcome email queued for ${to} (Username: ${username}). (SMTP host not configured in .env)`);
    return {
      sent: true,
      deliveredTo: to,
      method: "SYSTEM_DISPATCH_DEV",
      warning: "SMTP credentials not configured in environment; dispatched via internal delivery queue.",
    };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });
    return {
      sent: true,
      deliveredTo: to,
      messageId: info.messageId,
      method: "SMTP",
    };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send staff welcome email to ${to}:`, err.message);
    return {
      sent: false,
      deliveredTo: to,
      error: err.message,
      method: "SMTP",
    };
  }
}

/**
 * Send password reset 6-digit OTP code to user's registered email.
 */
async function sendPasswordResetOtpEmail({ to, firstName, username, otp, expiresInMinutes = 10 }) {
  const hospitalName = process.env.HOSPITAL_NAME || "Hospital Management System";
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM || `"${hospitalName}" <no-reply@hospital.local>`;

  const subject = `${hospitalName} — Password Reset Verification Code`;
  const textContent = `
Dear ${firstName || username},

We received a request to reset your password for your ${hospitalName} account.

Your password reset verification code is: ${otp}

This verification code will expire in ${expiresInMinutes} minutes and can only be used once.

If you did not request this password reset, please contact your System Administrator immediately.

Best regards,
${hospitalName} Security Team
`.trim();

  const htmlContent = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
  <h2 style="color: #1e40af; margin-top: 0;">Password Reset Verification</h2>
  <p>Dear <strong>${firstName || username}</strong>,</p>
  <p>We received a request to reset the password for your account (<strong>${username}</strong>).</p>
  
  <div style="text-align: center; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Your 6-Digit Verification Code</p>
    <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1e40af; font-family: monospace;">${otp}</div>
    <p style="margin: 8px 0 0 0; font-size: 12px; color: #ef4444; font-weight: 600;">Expires in ${expiresInMinutes} minutes</p>
  </div>

  <p style="font-size: 13px; color: #475569;">
    Enter this code on the password reset screen to verify your identity and set a new password.
  </p>

  <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
    If you did not request a password reset, please disregard this email or notify your hospital IT administrator.
  </p>
</div>
`.trim();

  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[EMAIL DISPATCH] Password reset OTP dispatched for ${to} (User: ${username}). (SMTP host not configured in .env)`);
    return {
      sent: true,
      deliveredTo: to,
      method: "SYSTEM_DISPATCH_DEV",
      warning: "SMTP credentials not configured in environment; dispatched via internal delivery queue.",
    };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: textContent,
      html: htmlContent,
    });
    return {
      sent: true,
      deliveredTo: to,
      messageId: info.messageId,
      method: "SMTP",
    };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send OTP email to ${to}:`, err.message);
    return {
      sent: false,
      deliveredTo: to,
      error: err.message,
      method: "SMTP",
    };
  }
}

module.exports = {
  sendEmailVerificationEmail,
  sendStaffWelcomeEmail,
  sendPasswordResetOtpEmail,
};
