import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { resetPassword } from "../services/api";
import { checkPasswordStrength } from "../utils/password";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const strength = checkPasswordStrength(newPassword);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token.trim()) {
      setError("Reset token is required.");
      return;
    }

    if (!strength.isValid) {
      setError(strength.feedback);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await resetPassword(token.trim(), newPassword);
      setSuccess(res.message || "Password has been successfully updated!");
      setTimeout(() => {
        navigate("/login");
      }, 2500);
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-icon">🔑</div>
          <h1 className="login-title">Set New Password</h1>
          <p className="login-subtitle">Hospital Staff Credential Reset</p>
        </div>

        {error && (
          <div className="login-error-alert" role="alert" style={{ marginBottom: "16px" }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: "16px" }}>
            <span>✓</span>
            <span>{success} Redirecting to login...</span>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label htmlFor="token">Reset Token *</label>
              <input
                id="token"
                type="text"
                required
                placeholder="Paste your 64-character token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "12px" }}
              />
            </div>

            <div className="login-field">
              <label htmlFor="newPassword">New Password *</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Min 8 chars, uppercase, lowercase, number, symbol"
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
                    fontSize: "16px",
                    padding: "4px",
                  }}
                >
                  {showPassword ? "👁️" : "🙈"}
                </button>
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Strength: <strong style={{ color: strength.color }}>{strength.label}</strong></span>
                    <span style={{ color: strength.isValid ? "#10b981" : "#94a3b8" }}>
                      {strength.isValid ? "✓ Policy Met" : "Requirements Pending"}
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
              />
            </div>

            <button type="submit" className="login-submit-btn" disabled={loading || !strength.isValid}>
              {loading ? "Updating Password..." : "Update Password & Continue →"}
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <Link to="/login" style={{ color: "#38bdf8", fontSize: "12px", textDecoration: "none" }}>
                ← Back to Staff Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
