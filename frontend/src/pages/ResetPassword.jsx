import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resendPasswordResetOtp,
  resetPassword,
} from "../services/api";
import { checkPasswordStrength } from "../utils/password";
import { KeyRound, Mail, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";


function ResetPassword() {
  const navigate = useNavigate();

  // Multi-step flow: 1: Request OTP, 2: Verify OTP, 3: Set New Password
  const [step, setStep] = useState(1);

  // Step 1 State: Username & Email only (Requirement 5)
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [step1Error, setStep1Error] = useState("");

  // Step 2 State: 6-digit OTP & 60s Resend Timer
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [step2Error, setStep2Error] = useState("");
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");

  // Step 3 State: New Password & Reset Token
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step3Error, setStep3Error] = useState("");
  const [success, setSuccess] = useState("");

  const strength = checkPasswordStrength(newPassword);

  // 60-second Resend countdown timer for Step 2
  useEffect(() => {
    let timer = null;
    if (step === 2 && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, resendCooldown]);

  // STEP 1 SUBMIT: Request OTP
  async function handleRequestOtp(e) {
    e.preventDefault();
    setStep1Error("");

    if (!username.trim() || !email.trim()) {
      setStep1Error("Please provide both your username and registered email address.");
      return;
    }

    try {
      setRequesting(true);
      await requestPasswordResetOtp(username.trim(), email.trim());
      setResendCooldown(60);
      setStep(2);
    } catch (err) {
      setStep1Error(err.message || "Unable to send verification code. Please check your username and email.");
    } finally {
      setRequesting(false);
    }
  }

  // STEP 2 SUBMIT: Verify OTP
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setStep2Error("");

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setStep2Error("Please enter the complete 6-digit numeric verification code.");
      return;
    }

    try {
      setVerifying(true);
      const res = await verifyPasswordResetOtp(username.trim(), email.trim(), cleanOtp);
      if (res?.data?.resetToken) {
        setResetToken(res.data.resetToken);
        setStep(3);
      } else {
        setStep2Error("Verification succeeded but no session token was received.");
      }
    } catch (err) {
      setStep2Error(err.message || "Invalid or expired verification code.");
    } finally {
      setVerifying(false);
    }
  }

  // STEP 2 RESEND OTP
  async function handleResendOtp() {
    if (resendCooldown > 0 || resending) return;
    setStep2Error("");
    setResendNotice("");

    try {
      setResending(true);
      await resendPasswordResetOtp(username.trim(), email.trim());
      setResendCooldown(60);
      setResendNotice("A new 6-digit code has been sent to your email.");
      setTimeout(() => setResendNotice(""), 5000);
    } catch (err) {
      setStep2Error(err.message || "Unable to resend verification code. Please wait and try again.");
    } finally {
      setResending(false);
    }
  }

  // STEP 3 SUBMIT: Set New Password
  async function handleResetPassword(e) {
    e.preventDefault();
    setStep3Error("");

    if (!newPassword || !confirmPassword) {
      setStep3Error("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStep3Error("New password and confirm password do not match.");
      return;
    }

    if (!strength.isValid) {
      setStep3Error(`Password policy requirement: ${strength.feedback}`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await resetPassword(resetToken, newPassword, confirmPassword);
      setSuccess(res.message || "Password updated successfully!");
      setTimeout(() => {
        navigate("/login");
      }, 2500);
    } catch (err) {
      setStep3Error(err.message || "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrapper" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="login-card" style={{ width: "100%", maxWidth: "460px", padding: "32px" }}>
        {/* Brand & Title */}
        <div className="login-brand" style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
            }}
          >
            <KeyRound size={28} />
          </div>
          <h1 className="login-title" style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px 0" }}>
            Account Password Recovery
          </h1>
          <p className="login-subtitle" style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            Secure 6-digit OTP verification for hospital personnel
          </p>
        </div>

        {/* Multi-step progress indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "24px",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "5px", color: step >= 1 ? "#38bdf8" : "#64748b" }}>
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: step > 1 ? "#10b981" : step === 1 ? "#38bdf8" : "#334155",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "10px",
              }}
            >
              {step > 1 ? "✓" : "1"}
            </span>
            <span>Identify</span>
          </div>

          <div style={{ width: "20px", height: "1px", background: "#475569" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "5px", color: step >= 2 ? "#38bdf8" : "#64748b" }}>
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: step > 2 ? "#10b981" : step === 2 ? "#38bdf8" : "#334155",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "10px",
              }}
            >
              {step > 2 ? "✓" : "2"}
            </span>
            <span>Verify OTP</span>
          </div>

          <div style={{ width: "20px", height: "1px", background: "#475569" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "5px", color: step === 3 ? "#38bdf8" : "#64748b" }}>
            <span
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: step === 3 ? "#38bdf8" : "#334155",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "10px",
              }}
            >
              3
            </span>
            <span>New Password</span>
          </div>
        </div>

        {/* STEP 1: Username & Email Only */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="login-form">
            {step1Error && (
              <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
                <span>Warning:</span>
                <span>{step1Error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="username">Username / Staff ID *</label>
              <input
                id="username"
                type="text"
                required
                autoFocus
                placeholder="e.g. dr_dawit or admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="login-field">
              <label htmlFor="email">Registered Email Address *</label>
              <input
                id="email"
                type="email"
                required
                placeholder="e.g. dawit@hospital.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={requesting || !username.trim() || !email.trim()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              {requesting ? "Sending Code..." : "Send Verification Code"} <ArrowRight size={16} />
            </button>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <Link to="/login" style={{ color: "#38bdf8", fontSize: "12px", textDecoration: "none" }}>
                ← Back to Staff Login
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: 6-Digit OTP Verification */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} className="login-form">
            {step2Error && (
              <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
                <span>Warning:</span>
                <span>{step2Error}</span>
              </div>
            )}

            {resendNotice && (
              <div className="alert alert-success" style={{ marginBottom: "16px", fontSize: "12px" }}>
                <span>✓</span>
                <span>{resendNotice}</span>
              </div>
            )}

            <div style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "8px", padding: "12px", marginBottom: "18px", textAlign: "center" }}>
              <Mail size={22} color="#38bdf8" style={{ marginBottom: "4px" }} />
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>
                Code Sent to {email}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Enter the 6-digit numerical code sent to your registered inbox. Valid for 10 minutes.
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="otp" style={{ textAlign: "center" }}>Enter 6-Digit Code *</label>
              <input
                id="otp"
                type="text"
                required
                autoFocus
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{
                  fontFamily: "monospace",
                  fontSize: "24px",
                  letterSpacing: "8px",
                  textAlign: "center",
                  padding: "10px",
                }}
              />
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={verifying || otp.trim().length !== 6}
            >
              {verifying ? "Verifying Code..." : "Verify Code & Proceed →"}
            </button>

            {/* Resend Code Section */}
            <div style={{ textAlign: "center", marginTop: "16px", fontSize: "12px", color: "var(--text-secondary)" }}>
              {resendCooldown > 0 ? (
                <span>Resend available in <strong style={{ color: "#38bdf8" }}>{resendCooldown}s</strong></span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resending}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#38bdf8",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <RefreshCw size={12} /> {resending ? "Sending..." : "Resend 6-Digit Code"}
                </button>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "11px", cursor: "pointer" }}
              >
                ← Change Username / Email
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Set New Password */}
        {step === 3 && !success && (
          <form onSubmit={handleResetPassword} className="login-form">
            {step3Error && (
              <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
                <span>Warning:</span>
                <span>{step3Error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="newPassword">New Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  autoFocus
                  placeholder="Min 8 chars with uppercase, lowercase, digit, symbol"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ paddingRight: "42px" }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: "13px",
                    padding: "4px",
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Strength: <strong style={{ color: strength.color }}>{strength.label}</strong></span>
                    <span style={{ color: strength.isValid ? "#10b981" : "#94a3b8" }}>
                      {strength.isValid ? "✓ Policy Compliant" : "Requirements Incomplete"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "4px", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          background: i <= strength.score ? strength.color : "transparent",
                          transition: "all 150ms ease",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
                    {strength.feedback}
                  </div>
                </div>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="confirmPassword">Confirm New Password *</label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  borderColor:
                    confirmPassword && confirmPassword !== newPassword
                      ? "var(--danger)"
                      : confirmPassword && confirmPassword === newPassword
                      ? "var(--success)"
                      : undefined,
                }}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <div style={{ color: "#f87171", fontSize: "11px", marginTop: "4px" }}>
                  Passwords do not match.
                </div>
              )}
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={submitting || !strength.isValid || newPassword !== confirmPassword}
            >
              {submitting ? "Updating Password..." : "Update Password & Login →"}
            </button>
          </form>
        )}

        {/* SUCCESS NOTIFICATION */}
        {success && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle2 size={48} color="#10b981" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ fontSize: "18px", color: "#f8fafc", marginBottom: "6px" }}>
              {success}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Redirecting you to the staff login screen...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
