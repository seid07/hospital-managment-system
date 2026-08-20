import { useEffect, useState, useCallback } from "react";
import AppShell from "../components/layout/AppShell";
import { getStaff, getRoles, createStaff, updateStaffStatus } from "../services/staffService";
import { validateEthiopianPhone } from "../utils/phone";
import { checkPasswordStrength } from "../utils/password";
import { useDebounce } from "../hooks/useDebounce";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "09",
  department: "",
  specialty: "",
  role: "DOCTOR",
  username: "",
  password: "",
};

function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const passwordStrength = checkPasswordStrength(form.password);

  const refreshData = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setError("");
        const [staffRes, rolesRes] = await Promise.all([
          getStaff({ search: debouncedSearch.trim() }),
          getRoles(),
        ]);
        if (!cancelled) {
          setStaff(staffRes.data || []);
          setRoles(rolesRes.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load staff data.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, reloadTrigger]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!validateEthiopianPhone(form.phone)) {
      setError("Please enter a valid Ethiopian phone number starting with 09, 07, or +251.");
      return;
    }

    if (!passwordStrength.isValid) {
      setError(`Password requirement: ${passwordStrength.feedback}`);
      return;
    }

    try {
      setSubmitting(true);
      await createStaff(form);

      setSuccess(`Staff account created for ${form.firstName} ${form.lastName} (${form.role}).`);
      setForm(INITIAL_FORM);
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to create staff.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(member) {
    setError("");
    setSuccess("");

    try {
      const nextStatus = !member.is_active;
      await updateStaffStatus(member.id, nextStatus);

      setSuccess(
        `Staff member ${member.first_name} ${member.last_name} ${
          nextStatus ? "activated" : "deactivated"
        } successfully.`
      );
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to update staff.");
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Administration</p>
          <h1>Staff & Role Management</h1>
          <p className="page-description">
            Create and manage hospital personnel accounts, security credentials, and system access roles.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="status">
          {success}
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Create New Staff Account</h2>
          <p>Create a staff profile with strong authentication credentials.</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="firstName">First name *</label>
            <input
              id="firstName"
              name="firstName"
              placeholder="e.g. Dawit"
              value={form.firstName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="lastName">Last name *</label>
            <input
              id="lastName"
              name="lastName"
              placeholder="e.g. Haile"
              value={form.lastName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email Address *</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="staff@hospital.local"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone Number (Ethiopian Format) *</label>
            <input
              id="phone"
              name="phone"
              placeholder="09XXXXXXXX or +2519XXXXXXXX"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="role">System Role *</label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              required
            >
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name} — {role.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="department">Department</label>
            <input
              id="department"
              name="department"
              placeholder="e.g. Cardiology, Outpatient, Lab"
              value={form.department}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="specialty">Specialty</label>
            <input
              id="specialty"
              name="specialty"
              placeholder="e.g. Internal Medicine, Radiography"
              value={form.specialty}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="username">Username *</label>
            <input
              id="username"
              name="username"
              placeholder="e.g. dr_dawit"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          {/* Password with Strength Meter and Eye Toggle */}
          <div className="form-field">
            <label htmlFor="password">Temporary Password *</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min 8 chars with upper, lower, digit, symbol"
                value={form.password}
                onChange={handleChange}
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
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px",
                }}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>

            {/* Live Strength Feedback */}
            {form.password && (
              <div style={{ marginTop: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                  <span>Policy Strength: <strong style={{ color: passwordStrength.color }}>{passwordStrength.label}</strong></span>
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

          <div className="form-actions" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              className="button button-primary button-large"
              type="submit"
              disabled={submitting || !passwordStrength.isValid}
            >
              {submitting ? "Creating account..." : "Create Staff Member →"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Active Hospital Personnel ({staff.length})</h2>
            <p>Current registered staff members and their active status.</p>
          </div>
          <div style={{ width: "240px" }}>
            <input
              type="search"
              placeholder="Live filter staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: "6px 10px", fontSize: "12px" }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="empty-state">No staff members match criteria.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Department / Specialty</th>
                  <th>Username</th>
                  <th>Email & Phone</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-info">{member.role}</span>
                    </td>
                    <td>
                      {member.department || "General"}
                      {member.specialty && ` (${member.specialty})`}
                    </td>
                    <td>
                      <code style={{ fontFamily: "monospace" }}>{member.username || "—"}</code>
                    </td>
                    <td>
                      {member.email}
                      <br />
                      <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{member.phone}</small>
                    </td>
                    <td>
                      <span
                        className={`status ${
                          member.is_active ? "status-active" : "status-inactive"
                        }`}
                      >
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => toggleStatus(member)}
                      >
                        {member.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

export default AdminStaff;
