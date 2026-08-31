import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { verifyCurrentPassword, changePassword } from "../services/api";
import { checkPasswordStrength } from "../utils/password";
import { ShieldCheck, KeyRound, ArrowRight, CheckCircle2 } from "lucide-react";


export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 2-step verification state
  const [step, setStep] = useState(1); // 1: Verify Current Password, 2: Set New Password

  // Step 1 state
  const [currentPassword, setCurrentPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [step1Error, setStep1Error] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  // Step 2 state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changing, setChanging] = useState(false);
  const [step2Error, setStep2Error] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordStrength = checkPasswordStrength(newPassword);

  async function handleVerifyCurrentPassword(e) {
    e.preventDefault();
    setStep1Error("");

    if (!currentPassword) {
      setStep1Error("Please enter your current password.");
      return;
    }

    try {
      setVerifying(true);
      await verifyCurrentPassword(currentPassword);
      setStep(2);
    } catch (err) {
      setStep1Error(err.message || "Incorrect current password. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    setStep2Error("");

    if (!newPassword || !confirmPassword) {
      setStep2Error("All fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStep2Error("New password and confirm password do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setStep2Error("New password must be different from your current password.");
      return;
    }

    if (!passwordStrength.isValid) {
      setStep2Error(`Password requirement: ${passwordStrength.feedback}`);
      return;
    }

    try {
      setChanging(true);
      const res = await changePassword(currentPassword, newPassword, confirmPassword);

      setSuccess(true);

      // Update local auth session with updated token and must_change_password = false
      if (res?.data?.token && res?.data?.user) {
        localStorage.setItem("hospital_token", res.data.token);
        localStorage.setItem("hospital_user", JSON.stringify(res.data.user));
      } else if (user) {
        const updatedUser = { ...user, must_change_password: false };
        localStorage.setItem("hospital_user", JSON.stringify(updatedUser));
      }

      // Redirect to appropriate role workspace after 2 seconds
      setTimeout(() => {
        const role = (user?.role || "ADMIN").toUpperCase();
        if (role === "REGISTRAR") {
          navigate("/registrar/desk");
        } else if (role === "DOCTOR") {
          navigate("/doctor/queue");
        } else if (role === "NURSE") {
          navigate("/nurse/triage");
        } else if (role === "LAB_TECH") {
          navigate("/laboratory");
        } else if (role === "PHARMACIST") {
          navigate("/prescriptions");
        } else if (role === "RADIOLOGIST") {
          navigate("/radiology/queue");
        } else if (role === "FINANCE") {
          navigate("/billing");
        } else if (role === "ADMIN") {
          navigate("/admin/staff");
        } else {
          navigate(`/dashboard/${role.toLowerCase()}`);
        }
        window.location.reload(); // Refresh session state smoothly
      }, 1500);
    } catch (err) {
      setStep2Error(err.message || "Failed to update password.");
    } finally {
      setChanging(false);
    }
  }

  const isMandatoryFirstLogin = Boolean(user?.must_change_password);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        padding: "24px 16px",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "32px",
        }}
      >
        {/* Header Icon & Title */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: isMandatoryFirstLogin ? "#fef3c7" : "#e0e7ff",
              color: isMandatoryFirstLogin ? "#d97706" : "#4f46e5",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "12px",
            }}
          >
            {isMandatoryFirstLogin ? <KeyRound size={28} /> : <ShieldCheck size={28} />}
          </div>

          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-main)" }}>
            {isMandatoryFirstLogin ? "Mandatory Password Change" : "Change Your Password"}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            {isMandatoryFirstLogin
              ? "For system security, you must set a new personal password on your first login."
              : "Verify your current credentials and create a new secure password."}
          </p>
        </div>

        {/* Step Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "24px",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: step === 1 ? "var(--primary)" : "var(--success)",
            }}
          >
            <span
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: step === 1 ? "var(--primary)" : "var(--success)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "11px",
              }}
            >
              {step > 1 ? "✓" : "1"}
            </span>
            <span>Verify Identity</span>
          </div>

          <div style={{ width: "30px", height: "1px", background: "var(--border)" }} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: step === 2 ? "var(--primary)" : "var(--text-muted)",
            }}
          >
            <span
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: step === 2 ? "var(--primary)" : "var(--border)",
                color: step === 2 ? "#fff" : "var(--text-muted)",
                display: "grid",
                placeItems: "center",
                fontSize: "11px",
              }}
            >
              2
            </span>
            <span>New Password</span>
          </div>
        </div>

        {/* STEP 1: Verify Current Password */}
        {step === 1 && (
          <form onSubmit={handleVerifyCurrentPassword}>
            {step1Error && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                {step1Error}
              </div>
            )}

            <div className="form-field" style={{ marginBottom: "20px" }}>
              <label htmlFor="currentPassword">Current Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Enter current or temporary password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: "100%", paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="button button-primary"
              disabled={verifying || !currentPassword.trim()}
              style={{ width: "100%", padding: "11px 0", fontSize: "14px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
            >
              {verifying ? "Verifying..." : "Continue to New Password"} <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* STEP 2: Set New Password */}
        {step === 2 && !success && (
          <form onSubmit={handleChangePasswordSubmit}>
            {step2Error && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                {step2Error}
              </div>
            )}

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label htmlFor="newPassword">New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 8 chars with upper, lower, number, symbol"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: "100%", paddingRight: "44px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              </div>

              {/* Password Strength Feedback */}
              {newPassword && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Strength: <strong style={{ color: passwordStrength.color }}>{passwordStrength.label}</strong></span>
                    <span style={{ color: passwordStrength.isValid ? "var(--success)" : "var(--text-muted)" }}>
                      {passwordStrength.isValid ? "✓ Policy Compliant" : "Requirements Incomplete"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "4px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          background: i <= passwordStrength.score ? passwordStrength.color : "transparent",
                          transition: "all 150ms ease",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {passwordStrength.feedback}
                  </div>
                </div>
              )}
            </div>

            <div className="form-field" style={{ marginBottom: "20px" }}>
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  borderColor:
                    confirmPassword && confirmPassword !== newPassword
                      ? "var(--danger)"
                      : confirmPassword && confirmPassword === newPassword
                      ? "var(--success)"
                      : undefined,
                }}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <div style={{ color: "var(--danger)", fontSize: "11px", marginTop: "4px" }}>
                  Passwords do not match.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setStep(1)}
                disabled={changing}
                style={{ flex: 1 }}
              >
                Back
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={changing || !newPassword || !confirmPassword || !passwordStrength.isValid}
                style={{ flex: 2, padding: "11px 0", fontSize: "14px" }}
              >
                {changing ? "Updating Password..." : "Save New Password"}
              </button>
            </div>
          </form>
        )}

        {/* Success State */}
        {success && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <CheckCircle2 size={48} color="var(--success)" style={{ margin: "0 auto 12px auto" }} />
            <h3 style={{ fontSize: "18px", color: "var(--text-main)", marginBottom: "6px" }}>
              Password Changed Successfully!
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Redirecting you to your hospital workspace...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
