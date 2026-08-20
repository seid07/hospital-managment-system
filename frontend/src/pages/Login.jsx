import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-icon">🏥</div>
          <h1 className="login-title">Seid Hospital Management System</h1>
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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
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
    </div>
  );
}

export default Login;
