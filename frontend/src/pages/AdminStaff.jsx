import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { getStaff, getRoles, createStaff, updateStaff, updateStaffStatus } from "../services/staffService";
import { createSchedule } from "../services/scheduleService";
import { validateEthiopianPhone } from "../utils/phone";
import { checkPasswordStrength } from "../utils/password";
import { useDebounce } from "../hooks/useDebounce";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const INITIAL_SLOT = {
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "12:00",
  slotDurationMinutes: 30,
};

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
  const navigate = useNavigate();
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

  // Available Work Date / Consultation Slot builder — used during staff
  // creation so an admin can set up an initial weekly schedule right away.
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [newSlot, setNewSlot] = useState(INITIAL_SLOT);

  // Edit Staff Modal State
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

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

  function handleNewSlotChange(event) {
    const { name, value } = event.target;
    setNewSlot((prev) => ({
      ...prev,
      [name]: name === "dayOfWeek" || name === "slotDurationMinutes" ? Number(value) : value,
    }));
  }

  function handleAddSlot() {
    if (newSlot.startTime >= newSlot.endTime) {
      setError("Slot start time must be before end time.");
      return;
    }
    setError("");
    setScheduleSlots((prev) => [...prev, newSlot]);
    setNewSlot(INITIAL_SLOT);
  }

  function handleRemoveSlot(index) {
    setScheduleSlots((prev) => prev.filter((_, i) => i !== index));
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
      const result = await createStaff(form);
      const staffId = result?.data?.staffId;

      let scheduleWarning = "";
      if (staffId && scheduleSlots.length > 0) {
        const failures = [];
        for (const slot of scheduleSlots) {
          try {
            await createSchedule(staffId, slot);
          } catch (slotErr) {
            failures.push(slotErr.message || "Unknown error");
          }
        }
        if (failures.length > 0) {
          scheduleWarning = ` (Note: ${failures.length} of ${scheduleSlots.length} schedule slots could not be saved — you can add them from Manage Schedule.)`;
        }
      }

      setSuccess(`Staff account created for ${form.firstName} ${form.lastName} (${form.role}).${scheduleWarning}`);
      setForm(INITIAL_FORM);
      setScheduleSlots([]);
      setNewSlot(INITIAL_SLOT);
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to create staff.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenEdit(member) {
    setEditError("");
    setEditingMember(member);
    setEditForm({
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      email: member.email || "",
      phone: member.phone || "",
      department: member.department || "",
      specialty: member.specialty || "",
      role: member.role || "DOCTOR",
    });
  }

  function handleEditChange(event) {
    const { name, value } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    setEditError("");

    if (!validateEthiopianPhone(editForm.phone)) {
      setEditError("Please enter a valid Ethiopian phone number starting with 09, 07, or +251.");
      return;
    }

    try {
      setEditSubmitting(true);
      await updateStaff(editingMember.id, editForm);

      setSuccess(`Staff member ${editForm.firstName} ${editForm.lastName} updated successfully.`);
      setEditingMember(null);
      setEditForm(null);
      refreshData();
    } catch (err) {
      setEditError(err.message || "Unable to update staff member.");
    } finally {
      setEditSubmitting(false);
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

          <div className="form-field" style={{ gridColumn: "1 / -1" }}>
            <label>Available Work Dates & Consultation Slots (optional)</label>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 10px" }}>
              Set up a recurring weekly schedule for this staff member now, or skip and add it later from{" "}
              <strong>Manage Schedule</strong>.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr 1fr auto",
                gap: "8px",
                alignItems: "end",
                marginBottom: "10px",
              }}
            >
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label htmlFor="slotDay" style={{ fontSize: "11px" }}>Day of week</label>
                <select id="slotDay" name="dayOfWeek" value={newSlot.dayOfWeek} onChange={handleNewSlotChange}>
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label htmlFor="slotStart" style={{ fontSize: "11px" }}>Start time</label>
                <input
                  id="slotStart"
                  type="time"
                  name="startTime"
                  value={newSlot.startTime}
                  onChange={handleNewSlotChange}
                />
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label htmlFor="slotEnd" style={{ fontSize: "11px" }}>End time</label>
                <input
                  id="slotEnd"
                  type="time"
                  name="endTime"
                  value={newSlot.endTime}
                  onChange={handleNewSlotChange}
                />
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label htmlFor="slotDuration" style={{ fontSize: "11px" }}>Slot length (min)</label>
                <input
                  id="slotDuration"
                  type="number"
                  min="5"
                  step="5"
                  name="slotDurationMinutes"
                  value={newSlot.slotDurationMinutes}
                  onChange={handleNewSlotChange}
                />
              </div>

              <button type="button" className="button button-secondary" onClick={handleAddSlot}>
                + Add Slot
              </button>
            </div>

            {scheduleSlots.length > 0 && (
              <div className="table-wrapper" style={{ marginBottom: "4px" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Slot Length</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleSlots.map((slot, index) => (
                      <tr key={`${slot.dayOfWeek}-${slot.startTime}-${index}`}>
                        <td>{DAYS.find((d) => d.value === slot.dayOfWeek)?.label}</td>
                        <td>{slot.startTime}</td>
                        <td>{slot.endTime}</td>
                        <td>{slot.slotDurationMinutes} min</td>
                        <td>
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => handleRemoveSlot(index)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => handleOpenEdit(member)}
                        >
                          Edit
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => navigate(`/admin/schedules?staffId=${member.id}`)}
                        >
                          📅 Schedule
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => toggleStatus(member)}
                        >
                          {member.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit Staff Member Modal */}
      {editingMember && editForm && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingMember(null);
            setEditForm(null);
          }}
          title={`Edit Staff Member — ${editingMember.first_name} ${editingMember.last_name}`}
        >
          <form onSubmit={handleEditSubmit}>
            {editError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "12px" }}>
                {editError}
              </div>
            )}

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="editFirstName">First name *</label>
                <input
                  id="editFirstName"
                  name="firstName"
                  value={editForm.firstName}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editLastName">Last name *</label>
                <input
                  id="editLastName"
                  name="lastName"
                  value={editForm.lastName}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editEmail">Email Address *</label>
                <input
                  id="editEmail"
                  name="email"
                  type="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editPhone">Phone Number (Ethiopian Format) *</label>
                <input
                  id="editPhone"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editRole">System Role *</label>
                <select
                  id="editRole"
                  name="role"
                  value={editForm.role}
                  onChange={handleEditChange}
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
                <label htmlFor="editDepartment">Department</label>
                <input
                  id="editDepartment"
                  name="department"
                  value={editForm.department}
                  onChange={handleEditChange}
                />
              </div>

              <div className="form-field">
                <label htmlFor="editSpecialty">Specialty</label>
                <input
                  id="editSpecialty"
                  name="specialty"
                  value={editForm.specialty}
                  onChange={handleEditChange}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setEditingMember(null);
                  setEditForm(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

export default AdminStaff;
