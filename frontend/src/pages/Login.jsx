import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { forgotPassword } from "../services/api";
import Modal from "../components/common/Modal";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotResult, setForgotResult] = useState(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const demoAccounts = [
    { label: "Admin", user: "admin", pass: "Admin@12345" },
    { label: "Registrar", user: "registrar", pass: "Hospital@12345" },
    { label: "Dr. Smith", user: "doctor_smith", pass: "Hospital@12345" },
    { label: "Nurse Emily", user: "nurse_emily", pass: "Hospital@12345" },
    { label: "Pharmacist", user: "pharmacist_david", pass: "Hospital@12345" },
    { label: "Lab Tech", user: "labtech_kevin", pass: "Hospital@12345" },
    { label: "Radiologist", user: "radiologist_sam", pass: "Hospital@12345" },
    { label: "Surgeon", user: "surgeon_alex", pass: "Hospital@12345" },
    { label: "Finance", user: "finance_clara", pass: "Hospital@12345" },
  ];

  function handleQuickFill(acc) {
    setUsername(acc.user);
    setPassword(acc.pass);
    setError("");
  }

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

  async function handleForgotSubmit(e) {
    e.preventDefault();
    try {
      setForgotLoading(true);
      const res = await forgotPassword(forgotUsername);
      setForgotResult(res);
    } catch (err) {
      setForgotResult({
        success: false,
        message: err.message || "Failed to process request.",
      });
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-icon">🏥</div>
          <h1 className="login-title">Hospital Management System</h1>
          <p className="login-subtitle">Secure Staff Portal & Service Station Login</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="username">Username / Staff ID</label>
            <input
              id="username"
              type="text"
              placeholder="e.g. registrar, doctor_smith"
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
                onClick={() => setShowForgotModal(true)}
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

        <div className="login-quick-roles">
          <div className="login-quick-roles-title">Quick Demo Login Presets</div>
          <div className="login-pills-grid">
            {demoAccounts.map((acc) => (
              <button
                key={acc.user}
                type="button"
                className="login-pill"
                onClick={() => handleQuickFill(acc)}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={showForgotModal}
        onClose={() => {
          setShowForgotModal(false);
          setForgotResult(null);
          setForgotUsername("");
        }}
        title="Reset Staff Password"
      >
        {forgotResult ? (
          <div>
            <div className="alert alert-success" style={{ marginBottom: "16px" }}>
              {forgotResult.message}
            </div>

            {forgotResult.resetToken && (
              <div style={{ background: "var(--surface-muted)", padding: "12px", borderRadius: "8px", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Development Reset Token Generated:
                </p>
                <div style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", background: "#ffffff", padding: "8px", border: "1px solid var(--border)", borderRadius: "6px" }}>
                  {forgotResult.resetToken}
                </div>
                <div style={{ marginTop: "12px" }}>
                  <Link
                    to={`/reset-password?token=${forgotResult.resetToken}`}
                    className="button button-primary"
                    style={{ width: "100%", textAlign: "center" }}
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
              Enter your staff username or registered email address to receive password reset instructions.
            </p>

            <div className="form-field" style={{ marginBottom: "16px" }}>
              <label>Username or Email Address</label>
              <input
                type="text"
                required
                placeholder="e.g. registrar or staff@hospital.local"
                value={forgotUsername}
                onChange={(e) => setForgotUsername(e.target.value)}
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
                disabled={forgotLoading || !forgotUsername.trim()}
              >
                {forgotLoading ? "Submitting..." : "Send Reset Request"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default Login;
