import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import ToastPrompt from "../components/common/ToastPrompt";
import { getStaff, getRoles, createStaff, updateStaff, deleteStaffPermanently, updateStaffStatus, getDoctorScheduledAppointments } from "../services/staffService";
import { createSchedule } from "../services/scheduleService";
import { validateEthiopianPhone } from "../utils/phone";
import { checkPasswordStrength, generateSecurePassword } from "../utils/password";
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

  // Available Work Date / Consultation Slot builder — multi-day selection
  const [scheduleSlots, setScheduleSlots] = useState([]);
  const [newSlot, setNewSlot] = useState(INITIAL_SLOT);
  const [slotSelectedDays, setSlotSelectedDays] = useState([1, 2, 3, 4, 5]); // default Mon-Fri

  // Edit Staff Modal State
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Permanent Delete Modal State
  const [deletingMember, setDeletingMember] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Deactivation Modal State (Requirement 7)
  const [deactivatingMember, setDeactivatingMember] = useState(null);
  const [deactivationForm, setDeactivationForm] = useState(() => {
    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    return {
      reason: "Annual / Sick Leave",
      startDate: start,
      endDate: end,
    };
  });
  const [scheduledAppointments, setScheduledAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [deactivationSubmitting, setDeactivationSubmitting] = useState(false);
  const [deactivationError, setDeactivationError] = useState("");

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

  // Auto-dismiss success & error notifications after 4 seconds (Requirement 2)
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (editError) {
      const timer = setTimeout(() => {
        setEditError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [editError]);

  useEffect(() => {
    if (deleteError) {
      const timer = setTimeout(() => {
        setDeleteError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [deleteError]);

  useEffect(() => {
    if (deactivationError) {
      const timer = setTimeout(() => {
        setDeactivationError("");
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [deactivationError]);

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
      [name]: name === "slotDurationMinutes" ? Number(value) : value,
    }));
  }

  function toggleSlotDay(dayVal) {
    setSlotSelectedDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort((a, b) => a - b)
    );
  }

  function selectAllSlotWeekdays() {
    setSlotSelectedDays([1, 2, 3, 4, 5]);
  }

  function selectAllSlotDays() {
    setSlotSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  }

  function clearSlotDays() {
    setSlotSelectedDays([]);
  }

  function handleAddSlot() {
    if (slotSelectedDays.length === 0) {
      setError("Please select at least one day of the week for the schedule.");
      return;
    }
    if (newSlot.startTime >= newSlot.endTime) {
      setError("Slot start time must be before end time.");
      return;
    }
    setError("");
    const newSlots = slotSelectedDays.map((day) => ({
      ...newSlot,
      dayOfWeek: day,
    }));
    setScheduleSlots((prev) => [...prev, ...newSlots]);
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
      username: member.username || "",
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

  async function handleDeletePermanently() {
    if (!deletingMember) return;
    setDeleteError("");
    try {
      setDeleteSubmitting(true);
      await deleteStaffPermanently(deletingMember.id);
      setSuccess(`Staff member ${deletingMember.first_name} ${deletingMember.last_name} deleted permanently.`);
      setDeletingMember(null);
      refreshData();
    } catch (err) {
      setDeleteError(err.message || "Failed to permanently delete staff member.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleOpenDeactivate(member) {
    setDeactivationError("");
    setDeactivatingMember(member);
    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const initialForm = {
      reason: member.deactivation_reason || "Annual / Sick Leave",
      startDate: member.deactivation_start_date ? member.deactivation_start_date.split("T")[0] : start,
      endDate: member.deactivation_end_date ? member.deactivation_end_date.split("T")[0] : end,
    };
    setDeactivationForm(initialForm);

    if (member.role === "DOCTOR") {
      try {
        setLoadingAppointments(true);
        const res = await getDoctorScheduledAppointments(member.id, initialForm.startDate, initialForm.endDate);
        setScheduledAppointments(res.data || []);
      } catch {
        setScheduledAppointments([]);
      } finally {
        setLoadingAppointments(false);
      }
    } else {
      setScheduledAppointments([]);
    }
  }

  async function handleDeactivationDatesChange(field, val) {
    const updated = { ...deactivationForm, [field]: val };
    setDeactivationForm(updated);

    if (deactivatingMember?.role === "DOCTOR" && updated.startDate && updated.endDate) {
      try {
        setLoadingAppointments(true);
        const res = await getDoctorScheduledAppointments(deactivatingMember.id, updated.startDate, updated.endDate);
        setScheduledAppointments(res.data || []);
      } catch {
        setScheduledAppointments([]);
      } finally {
        setLoadingAppointments(false);
      }
    }
  }

  async function handleDeactivateSubmit(e) {
    e.preventDefault();
    setDeactivationError("");

    if (!deactivationForm.reason?.trim()) {
      setDeactivationError("Please provide a reason for deactivation.");
      return;
    }
    if (!deactivationForm.startDate || !deactivationForm.endDate) {
      setDeactivationError("Start date and end date are required.");
      return;
    }
    if (deactivationForm.startDate > deactivationForm.endDate) {
      setDeactivationError("Start date cannot be after end date.");
      return;
    }

    try {
      setDeactivationSubmitting(true);
      await updateStaffStatus(deactivatingMember.id, false, {
        reason: deactivationForm.reason.trim(),
        startDate: deactivationForm.startDate,
        endDate: deactivationForm.endDate,
      });

      setSuccess(`Staff member ${deactivatingMember.first_name} ${deactivatingMember.last_name} deactivated from ${deactivationForm.startDate} until ${deactivationForm.endDate}.`);
      setDeactivatingMember(null);
      refreshData();
    } catch (err) {
      setDeactivationError(err.message || "Failed to deactivate staff.");
    } finally {
      setDeactivationSubmitting(false);
    }
  }

  async function handleDirectActivate(member) {
    setError("");
    setSuccess("");
    try {
      await updateStaffStatus(member.id, true);
      setSuccess(`Staff member ${member.first_name} ${member.last_name} activated successfully.`);
      refreshData();
    } catch (err) {
      setError(err.message || "Unable to activate staff member.");
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

      {/* Floating 4-Second Animated Toast Prompt (Requirement 2) */}
      {success && (
        <ToastPrompt
          type="success"
          message={success}
          duration={4000}
          onClose={() => setSuccess("")}
        />
      )}

      {error && (
        <ToastPrompt
          type="error"
          message={error}
          duration={4000}
          onClose={() => setError("")}
        />
      )}

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

          <div className="form-field">
            <label htmlFor="password">Temporary Password *</label>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min 8 chars with upper, lower, digit, symbol"
                  value={form.password}
                  onChange={handleChange}
                  required
                  style={{ paddingRight: "42px", width: "100%" }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "4px",
                    lineHeight: 1,
                  }}
                >
                  {showPassword ? "⊙" : "○"}
                </button>
              </div>
              <button
                type="button"
                className="button button-primary"
                style={{ whiteSpace: "nowrap", fontSize: "12px", padding: "8px 14px" }}
                onClick={() => {
                  const pwd = generateSecurePassword();
                  setForm((prev) => ({ ...prev, password: pwd }));
                  setShowPassword(true);
                }}
                title="Autogenerate a strong, compliant random password"
              >
                ⟳ Autogenerate Password
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

            {/* Multi-Day of Week Checkbox Selector */}
            <div style={{ marginBottom: "12px", background: "var(--surface-muted)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Select Days of Week:</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectAllSlotWeekdays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    Weekdays (Mon-Fri)
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectAllSlotDays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    All 7 Days
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={clearSlotDays}
                    style={{ fontSize: "11px", padding: "2px 8px" }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {DAYS.map((day) => {
                  const isChecked = slotSelectedDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: isChecked ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                        background: isChecked ? "rgba(2, 132, 199, 0.08)" : "var(--surface)",
                        cursor: "pointer",
                        fontWeight: isChecked ? 700 : 500,
                        fontSize: "12px",
                        color: isChecked ? "var(--primary)" : "var(--text-primary)",
                        transition: "all 150ms ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSlotDay(day.value)}
                        style={{ cursor: "pointer" }}
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr auto",
                gap: "8px",
                alignItems: "end",
                marginBottom: "10px",
              }}
            >
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

              <button
                type="button"
                className="button button-secondary"
                onClick={handleAddSlot}
                disabled={slotSelectedDays.length === 0}
              >
                + Add Slot{slotSelectedDays.length > 1 ? `s (${slotSelectedDays.length} Days)` : ""}
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
                      <div>
                        <span
                          className={`status ${
                            member.is_active ? "status-active" : "status-inactive"
                          }`}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                        {!member.is_active && member.deactivation_end_date && (
                          <div style={{ fontSize: "11px", color: "var(--danger)", marginTop: "4px" }}>
                            {member.deactivation_reason || "On Leave"}
                            <br />
                            <small style={{ color: "var(--text-muted)" }}>
                              Until {new Date(member.deactivation_end_date).toLocaleDateString()}
                            </small>
                          </div>
                        )}
                      </div>
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
                           Schedule
                        </button>
                        {member.is_active ? (
                          <button
                            className="button button-secondary"
                            type="button"
                            style={{ color: "var(--danger)" }}
                            onClick={() => handleOpenDeactivate(member)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => handleDirectActivate(member)}
                          >
                            Activate
                          </button>
                        )}
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
                <label htmlFor="editUsername">Username (Login ID) *</label>
                <input
                  id="editUsername"
                  name="username"
                  value={editForm.username}
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

      {/* Permanent Delete Modal */}
      {deletingMember && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingMember(null)}
          title="⚠️ Delete Staff Member Permanently"
        >
          <div>
            {deleteError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "14px" }}>
                {deleteError}
              </div>
            )}

            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "14px", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: 700, color: "#dc2626" }}>
                Are you sure you want to permanently delete this staff member?
              </p>
              <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                <strong>Name:</strong> {deletingMember.first_name} {deletingMember.last_name}<br />
                <strong>Role:</strong> {deletingMember.role}<br />
                <strong>Username:</strong> {deletingMember.username || "—"}<br />
                <strong>Email:</strong> {deletingMember.email}
              </div>
              <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "#dc2626" }}>
                ⚠️ Warning: This will permanently remove their user credentials, clinic schedules, and staff profile from the hospital database. This action cannot be undone.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDeletingMember(null)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                onClick={handleDeletePermanently}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Deleting..." : "🗑 Yes, Delete Permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Staff Deactivation Modal (Requirement 7) */}
      {deactivatingMember && (
        <Modal
          isOpen={true}
          onClose={() => setDeactivatingMember(null)}
          title={`Deactivate Staff — ${deactivatingMember.first_name} ${deactivatingMember.last_name} (${deactivatingMember.role})`}
        >
          <form onSubmit={handleDeactivateSubmit}>
            {deactivationError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "14px" }}>
                {deactivationError}
              </div>
            )}

            <div style={{ background: "var(--surface-muted)", padding: "12px 14px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
              <strong>Staff Profile:</strong> {deactivatingMember.first_name} {deactivatingMember.last_name} • {deactivatingMember.role} • {deactivatingMember.specialty || deactivatingMember.department || "General"}
              <div style={{ marginTop: "4px", color: "var(--text-secondary)" }}>
                Staff member will be marked inactive between the specified dates and automatically reactivated after the end date.
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label htmlFor="deactReason" style={{ fontWeight: 600 }}>Reason for Deactivation *</label>
              <select
                id="deactReason"
                value={deactivationForm.reason}
                onChange={(e) => setDeactivationForm({ ...deactivationForm, reason: e.target.value })}
                className="input"
                style={{ width: "100%", marginBottom: "6px" }}
              >
                <option value="Annual / Personal Leave">Annual / Personal Leave</option>
                <option value="Medical / Sick Leave">Medical / Sick Leave</option>
                <option value="Maternity / Paternity Leave">Maternity / Paternity Leave</option>
                <option value="Professional Training / Conference">Professional Training / Conference</option>
                <option value="Administrative Suspension">Administrative Suspension</option>
                <option value="Temporary Off-duty">Temporary Off-duty</option>
                <option value="Other">Other Reason</option>
              </select>
              {deactivationForm.reason === "Other" && (
                <input
                  type="text"
                  placeholder="Specify custom reason..."
                  className="input"
                  style={{ width: "100%" }}
                  onChange={(e) => setDeactivationForm({ ...deactivationForm, reason: e.target.value })}
                  required
                />
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
              <div className="form-field">
                <label htmlFor="deactStartDate" style={{ fontWeight: 600 }}>Deactivation Start Date *</label>
                <input
                  id="deactStartDate"
                  type="date"
                  value={deactivationForm.startDate}
                  onChange={(e) => handleDeactivationDatesChange("startDate", e.target.value)}
                  className="input"
                  style={{ width: "100%" }}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="deactEndDate" style={{ fontWeight: 600 }}>Deactivation End Date (Active after) *</label>
                <input
                  id="deactEndDate"
                  type="date"
                  value={deactivationForm.endDate}
                  onChange={(e) => handleDeactivationDatesChange("endDate", e.target.value)}
                  className="input"
                  style={{ width: "100%" }}
                  required
                />
              </div>
            </div>

            {/* If Doctor: Conflict check for scheduled appointments */}
            {deactivatingMember.role === "DOCTOR" && (
              <div style={{ marginBottom: "18px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px", background: "var(--surface)" }}>
                <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Scheduled Patients Conflict Check</span>
                  {loadingAppointments && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Checking...</span>}
                </div>

                {loadingAppointments ? (
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", padding: "8px 0" }}>
                    Loading scheduled appointments...
                  </div>
                ) : scheduledAppointments.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--success)", padding: "6px 0" }}>
                    ✓ No scheduled patient appointments found for this doctor between {deactivationForm.startDate} and {deactivationForm.endDate}.
                  </div>
                ) : (
                  <div>
                    <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#92400e", padding: "8px 12px", borderRadius: "4px", fontSize: "12px", marginBottom: "10px" }}>
                      ⚠️ <strong>Attention:</strong> Dr. {deactivatingMember.first_name} {deactivatingMember.last_name} has <strong>{scheduledAppointments.length}</strong> scheduled patient appointment(s) during this period. Please reschedule or reassign these patients:
                    </div>

                    <div style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "4px" }}>
                      <table className="data-table" style={{ fontSize: "12px", margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Date & Time</th>
                            <th>Patient Name</th>
                            <th>Patient #</th>
                            <th>Phone</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduledAppointments.map((appt) => (
                            <tr key={appt.id}>
                              <td>
                                <strong>{appt.appointment_date}</strong>
                                <br />
                                <small>{appt.start_time} - {appt.end_time}</small>
                              </td>
                              <td>{appt.patient_first_name} {appt.patient_last_name}</td>
                              <td><code>{appt.patient_number}</code></td>
                              <td>{appt.patient_phone}</td>
                              <td><span className="badge badge-warning">{appt.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <button
                type="button"
                className="button"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#dc2626",
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  fontWeight: 600,
                  fontSize: "13px",
                  padding: "8px 14px",
                }}
                onClick={() => {
                  const targetMember = deactivatingMember;
                  setDeactivatingMember(null);
                  setDeleteError("");
                  setDeletingMember(targetMember);
                }}
                title="Permanently remove staff account from system"
              >
                🗑 Delete Permanently
              </button>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setDeactivatingMember(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                  disabled={deactivationSubmitting}
                >
                  {deactivationSubmitting ? "Deactivating..." : "Confirm & Deactivate Staff"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}

export default AdminStaff;
