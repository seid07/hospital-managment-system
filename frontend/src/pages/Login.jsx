import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { forgotPassword, checkSystemStatus, setupAdmin } from "../services/api";
import { checkPasswordStrength } from "../utils/password";
import Modal from "../components/common/Modal";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // System Initialization state
  const [isSystemInitialized, setIsSystemInitialized] = useState(true);
  const [checkingSystem, setCheckingSystem] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupData, setSetupData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupSuccess, setSetupSuccess] = useState("");

  // Forgot password state (5-Field Verification)
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotForm, setForgotForm] = useState({
    username: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
  });
  const [forgotResult, setForgotResult] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const setupPasswordStrength = checkPasswordStrength(setupData.password);

  useEffect(() => {
    checkSystemStatus()
      .then((res) => {
        if (res?.data) {
          setIsSystemInitialized(res.data.isInitialized);
        }
      })
      .catch((err) => {
        console.error("Status check error:", err);
      })
      .finally(() => {
        setCheckingSystem(false);
      });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(username, password);
      navigate(`/dashboard/${user.role.toLowerCase()}`);
    } catch (err) {
      setError(err.message || "Invalid credentials. Please check and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    setSetupError("");
    setSetupSuccess("");

    if (!setupPasswordStrength.isValid) {
      setSetupError(setupPasswordStrength.feedback);
      return;
    }

    if (setupData.password !== setupData.confirmPassword) {
      setSetupError("Passwords do not match.");
      return;
    }

    try {
      setSetupLoading(true);
      const res = await setupAdmin({
        firstName: setupData.firstName,
        lastName: setupData.lastName,
        email: setupData.email,
        phone: setupData.phone,
        username: setupData.username,
        password: setupData.password,
      });

      setSetupSuccess(res.message || "System Administrator account created successfully!");
      setIsSystemInitialized(true);
      setUsername(setupData.username);
      setTimeout(() => {
        setShowSetupModal(false);
        setSetupSuccess("");
      }, 2000);
    } catch (err) {
      setSetupError(err.message || "Failed to initialize administrator.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    try {
      setForgotLoading(true);
      const res = await forgotPassword({
        username: forgotForm.username,
        lastName: forgotForm.lastName,
        email: forgotForm.email,
        phone: forgotForm.phone,
        department: forgotForm.department,
      });
      setForgotResult(res);
    } catch (err) {
      setForgotResult({
        success: false,
        message: err.message || "Unable to verify your identity with the information provided.",
      });
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-icon"></div>
          <h1 className="login-title">Hospital Management System</h1>
          <p className="login-subtitle">Secure Staff Portal & Service Station Login</p>
        </div>

        {!checkingSystem && !isSystemInitialized && (
          <div
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              border: "1px solid #38bdf8",
              borderRadius: "8px",
              padding: "14px",
              marginBottom: "18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 600, color: "#38bdf8", marginBottom: "4px" }}>
              ⚙️ Fresh System Detected (0 Staff Accounts)
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 10px" }}>
              The database is currently clean. Please initialize the primary System Administrator.
            </p>
            <button
              type="button"
              className="button button-primary button-sm"
              onClick={() => setShowSetupModal(true)}
              style={{ width: "100%" }}
            >
              Initialize System Administrator Account →
            </button>
          </div>
        )}

        {error && (
          <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
            <span>Warning:</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username / Staff ID</label>
            <input
              id="username"
              type="text"
              placeholder="e.g. admin, registrar, doctor_name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="login-field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="password">Password</label>
              <button
                type="button"
                onClick={() => navigate("/reset-password")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "11px",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Forgot password?
              </button>
            </div>


            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
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
                  fontSize: "16px",
                  padding: "4px",
                }}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? "Authenticating Staff..." : "Sign In to Portal →"}
          </button>
        </form>

        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
          Ethiopian Hospital Information & Management System • ETB Financial Standards
        </div>
      </div>

      {/* Initial Administrator Setup Modal */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        title="Initialize Primary System Administrator"
      >
        {setupSuccess ? (
          <div className="alert alert-success" style={{ marginBottom: "16px" }}>
            ✓ {setupSuccess} Redirecting to login...
          </div>
        ) : (
          <form onSubmit={handleSetupSubmit}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
              Create the initial System Administrator account to manage staff roles, departments, and hospital services.
            </p>

            {setupError && (
              <div className="alert alert-danger" style={{ marginBottom: "14px" }}>
                Warning: {setupError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div className="form-field">
                <label>First Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. System"
                  value={setupData.firstName}
                  onChange={(e) => setSetupData({ ...setupData, firstName: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Last Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Administrator"
                  value={setupData.lastName}
                  onChange={(e) => setSetupData({ ...setupData, lastName: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div className="form-field">
                <label>Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="admin@hospital.local"
                  value={setupData.email}
                  onChange={(e) => setSetupData({ ...setupData, email: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Phone Number (Ethiopian) *</label>
                <input
                  type="tel"
                  required
                  placeholder="0911000000"
                  value={setupData.phone}
                  onChange={(e) => setSetupData({ ...setupData, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Administrator Username *</label>
              <input
                type="text"
                required
                placeholder="admin"
                value={setupData.username}
                onChange={(e) => setSetupData({ ...setupData, username: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Password (Strong) *</label>
              <input
                type="password"
                required
                placeholder="Min 8 chars, uppercase, lowercase, number, symbol"
                value={setupData.password}
                onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
              />

              {setupData.password && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Strength: <strong style={{ color: setupPasswordStrength.color }}>{setupPasswordStrength.label}</strong></span>
                    <span style={{ color: setupPasswordStrength.isValid ? "#10b981" : "#ef4444" }}>
                      {setupPasswordStrength.isValid ? "✓ Policy Met" : "Requirements Pending"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>{setupPasswordStrength.feedback}</div>
                </div>
              )}
            </div>

            <div className="form-field" style={{ marginBottom: "16px" }}>
              <label>Confirm Password *</label>
              <input
                type="password"
                required
                placeholder="Re-enter password"
                value={setupData.confirmPassword}
                onChange={(e) => setSetupData({ ...setupData, confirmPassword: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowSetupModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={setupLoading || !setupPasswordStrength.isValid}
              >
                {setupLoading ? "Creating Administrator..." : "Create Admin Account"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Forgot Password Modal (5-Field Verification) */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => {
          setShowForgotModal(false);
          setForgotResult(null);
        }}
        title="Staff Identity Verification & Password Recovery"
      >
        {forgotResult ? (
          <div>
            {forgotResult.success ? (
              <div className="alert alert-success" style={{ marginBottom: "16px" }}>
                ✓ {forgotResult.message}
              </div>
            ) : (
              <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
                Warning: {forgotResult.message}
              </div>
            )}

            {forgotResult.resetToken && (
              <div style={{ background: "var(--surface-muted)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Secure Reset Token Generated:
                </p>
                <div style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", background: "#ffffff", padding: "8px", border: "1px solid var(--border)", borderRadius: "6px" }}>
                  {forgotResult.resetToken}
                </div>
                <div style={{ marginTop: "12px" }}>
                  <Link
                    to={`/reset-password?token=${forgotResult.resetToken}`}
                    className="button button-primary"
                    style={{ width: "100%", textAlign: "center", display: "block", textDecoration: "none" }}
                  >
                    Proceed to Reset Password Page →
                  </Link>
                </div>
              </div>
            )}

            <button
              type="button"
              className="button button-secondary"
              style={{ width: "100%" }}
              onClick={() => {
                setShowForgotModal(false);
                setForgotResult(null);
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
              For institutional security, please provide all 5 identity verification fields registered with your staff profile.
            </p>

            <div className="form-field" style={{ marginBottom: "10px" }}>
              <label>Staff Username *</label>
              <input
                type="text"
                required
                placeholder="e.g. seid"
                value={forgotForm.username}
                onChange={(e) => setForgotForm({ ...forgotForm, username: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "10px" }}>
              <label>Last Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Ahmed"
                value={forgotForm.lastName}
                onChange={(e) => setForgotForm({ ...forgotForm, lastName: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "10px" }}>
              <label>Registered Email Address *</label>
              <input
                type="email"
                required
                placeholder="e.g. seid@example.com"
                value={forgotForm.email}
                onChange={(e) => setForgotForm({ ...forgotForm, email: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "10px" }}>
              <label>Registered Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="e.g. 0912345678"
                value={forgotForm.phone}
                onChange={(e) => setForgotForm({ ...forgotForm, phone: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "16px" }}>
              <label>Assigned Department *</label>
              <input
                type="text"
                required
                placeholder="e.g. Laboratory, Administration, Patient Services"
                value={forgotForm.department}
                onChange={(e) => setForgotForm({ ...forgotForm, department: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowForgotModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  forgotLoading ||
                  !forgotForm.username.trim() ||
                  !forgotForm.lastName.trim() ||
                  !forgotForm.email.trim() ||
                  !forgotForm.phone.trim() ||
                  !forgotForm.department.trim()
                }
              >
                {forgotLoading ? "Verifying Identity..." : "Verify Identity & Reset"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default Login;
