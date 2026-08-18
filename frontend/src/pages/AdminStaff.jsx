import { useEffect, useState, useCallback } from "react";
import AppShell from "../components/layout/AppShell";
import { getStaff, getRoles, createStaff, updateStaffStatus } from "../services/staffService";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
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
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const refreshData = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setError("");
        const [staffRes, rolesRes] = await Promise.all([
          getStaff(),
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
  }, [reloadTrigger]);

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
            Create and manage hospital personnel accounts and system access roles.
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
          <p>Create a staff profile and system login credentials.</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="firstName">First name *</label>
            <input
              id="firstName"
              name="firstName"
              placeholder="First name"
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
              placeholder="Last name"
              value={form.lastName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email *</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="staff@hospital.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone *</label>
            <input
              id="phone"
              name="phone"
              placeholder="+1-555-0100"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="role">Role *</label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
              required
            >
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="department">Department</label>
            <input
              id="department"
              name="department"
              placeholder="e.g. Cardiology, Outpatient"
              value={form.department}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="specialty">Specialty</label>
            <input
              id="specialty"
              name="specialty"
              placeholder="e.g. Interventional Cardiology"
              value={form.specialty}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="username">Username *</label>
            <input
              id="username"
              name="username"
              placeholder="username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password *</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Temporary password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-actions" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button
              className="button button-primary button-large"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating account..." : "Create Staff Member →"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Active Hospital Personnel ({staff.length})</h2>
          <p>Current registered staff members and their active status.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="empty-state">No staff members found.</div>
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
                      <code>{member.username || "—"}</code>
                    </td>
                    <td>
                      {member.email}
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{member.phone}</small>
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
