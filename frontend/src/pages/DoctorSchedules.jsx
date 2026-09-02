import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { useAuth } from "../context/useAuth";
import {
  getDoctors,
  getDoctorSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "../services/scheduleService";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const INITIAL_FORM = {
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "12:00",
  slotDurationMinutes: 30,
};

function DoctorSchedules({ isDoctorSelfView = false }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedStaffId = searchParams.get("staffId");
  const isDoctor = user?.role === "DOCTOR" || isDoctorSelfView;

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(
    isDoctor ? user?.staff_id : preselectedStaffId || ""
  );
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [doctorsLoading, setDoctorsLoading] = useState(!isDoctor);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Edit Schedule Modal State
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDoctors() {
      if (isDoctor) {
        setSelectedDoctor(user?.staff_id);
        return;
      }

      try {
        setError("");
        // Admins manage schedules for every staff member (doctors, nurses,
        // lab techs, etc.), not just doctors.
        const res = await getDoctors({ allStaff: true });
        if (cancelled) return;
        const list = res.data || [];
        setDoctors(list);
        setDoctorsLoading(false);
        if (list.length > 0 && !selectedDoctor) {
          setSelectedDoctor(list[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load staff members.");
          setDoctorsLoading(false);
        }
      }
    }

    loadDoctors();
    return () => {
      cancelled = true;
    };
  }, [isDoctor, selectedDoctor, user?.staff_id]);

  useEffect(() => {
    const doctorIdToLoad = isDoctor ? user?.staff_id : selectedDoctor;
    if (!doctorIdToLoad) return;
    let cancelled = false;

    async function loadSchedules() {
      try {
        setError("");
        const res = await getDoctorSchedules(doctorIdToLoad);
        if (!cancelled) {
          setSchedules(res.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load doctor schedules.");
          setLoading(false);
        }
      }
    }

    loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [isDoctor, selectedDoctor, user?.staff_id, reloadKey]);

  function handleDoctorChange(event) {
    setSelectedDoctor(event.target.value);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "dayOfWeek" || name === "slotDurationMinutes"
          ? Number(value)
          : value,
    }));
  }

  const [selectedDays, setSelectedDays] = useState([1]); // default to Monday

  function toggleDay(dayVal) {
    setSelectedDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort((a, b) => a - b)
    );
  }

  function selectWeekdays() {
    setSelectedDays([1, 2, 3, 4, 5]);
  }

  function selectAllDays() {
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  }

  function clearDays() {
    setSelectedDays([]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const targetDocId = isDoctor ? user?.staff_id : selectedDoctor;
    if (!targetDocId) {
      setError("Please select a staff member.");
      return;
    }

    if (selectedDays.length === 0) {
      setError("Please select at least one day of the week.");
      return;
    }

    if (form.startTime >= form.endTime) {
      setError("Start time must be before end time.");
      return;
    }

    try {
      setSubmitting(true);
      await createSchedule(targetDocId, {
        daysOfWeek: selectedDays,
        startTime: form.startTime,
        endTime: form.endTime,
        slotDurationMinutes: Number(form.slotDurationMinutes),
      });
      const dayNames = selectedDays.map((d) => DAYS.find((x) => x.value === d)?.label).join(", ");
      setSuccess(`Weekly schedule saved successfully for: ${dayNames} (${form.startTime} - ${form.endTime}).`);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Unable to create schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenEdit(schedule) {
    setEditingSchedule(schedule);
    setEditForm({
      dayOfWeek: schedule.day_of_week,
      startTime: schedule.start_time?.slice(0, 5) || "08:00",
      endTime: schedule.end_time?.slice(0, 5) || "12:00",
      slotDurationMinutes: schedule.slot_duration_minutes || 30,
    });
    setEditError("");
  }

  function handleEditChange(event) {
    const { name, value } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]:
        name === "dayOfWeek" || name === "slotDurationMinutes"
          ? Number(value)
          : value,
    }));
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingSchedule || !editForm) return;

    if (editForm.startTime >= editForm.endTime) {
      setEditError("Start time must be before end time.");
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError("");
      await updateSchedule(editingSchedule.id, {
        dayOfWeek: editForm.dayOfWeek,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        slotDurationMinutes: Number(editForm.slotDurationMinutes),
      });

      const dayName = DAYS.find((d) => d.value === editForm.dayOfWeek)?.label;
      setSuccess(`Schedule updated successfully for ${dayName} (${editForm.startTime} - ${editForm.endTime}).`);
      setEditingSchedule(null);
      setEditForm(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setEditError(err.message || "Unable to update schedule.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(id) {
    setError("");
    setSuccess("");

    try {
      await deleteSchedule(id);
      setSuccess("Doctor schedule removed.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Unable to remove schedule.");
    }
  }

  const selectedDoctorDetails = isDoctor
    ? { first_name: user?.first_name, last_name: user?.last_name, specialty: user?.specialty }
    : doctors.find((d) => d.id === selectedDoctor);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">{isDoctor ? "Doctor Workspace" : "Administration & Capacity"}</p>
          <h1>{isDoctor ? "My Clinic Schedule & Hours" : "Staff Schedules & Consultation Hours"}</h1>
          <p className="page-description">
            {isDoctor
              ? "View your assigned recurring weekly clinic hours and consultation appointment intervals."
              : "Define recurring weekly schedules and available consultation slots for any staff member — doctors, nurses, lab techs, and more."}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {/* Doctor Selector - Hidden for Doctors */}
      {!isDoctor && (
        <section className="card">
          <div className="card-header">
            <h2>Select Staff Member</h2>
            <p>Choose the staff member whose schedules you wish to manage.</p>
          </div>

          <div className="form-field">
            <label htmlFor="doctorSelect">Staff Member</label>
            <select
              id="doctorSelect"
              value={selectedDoctor}
              onChange={handleDoctorChange}
              disabled={doctorsLoading}
            >
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.role === "DOCTOR" ? "Dr. " : ""}
                  {doctor.first_name} {doctor.last_name} ({doctor.role ? `${doctor.role} — ` : ""}
                  {doctor.specialty || doctor.department || "General"})
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* Schedule creation form - Admin only */}
      {!isDoctor && user?.role === "ADMIN" && (
        <section className="card">
          <div className="card-header">
            <h2>
              Add Weekly Schedule for {selectedDoctorDetails?.role === "DOCTOR" ? "Dr. " : ""}
              {selectedDoctorDetails?.first_name} {selectedDoctorDetails?.last_name}
            </h2>
            <p>
              Choose one or multiple days of the week, working hours, and slot intervals.
            </p>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            {/* Multi-Day of Week Checkboxes */}
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
                <label style={{ fontWeight: 600, margin: 0 }}>Days of Week *</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectWeekdays}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                  >
                    Weekdays (Mon-Fri)
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={selectAllDays}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                  >
                    All 7 Days
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={clearDays}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {DAYS.map((day) => {
                  const isChecked = selectedDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "6px",
                        border: isChecked ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                        background: isChecked ? "rgba(2, 132, 199, 0.08)" : "var(--surface)",
                        cursor: "pointer",
                        fontWeight: isChecked ? 700 : 500,
                        fontSize: "13px",
                        color: isChecked ? "var(--primary)" : "var(--text-primary)",
                        transition: "all 150ms ease",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDay(day.value)}
                        style={{ cursor: "pointer" }}
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="startTime">Start time *</label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                value={form.startTime}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="endTime">End time *</label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                value={form.endTime}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="slotDurationMinutes">Slot duration *</label>
              <select
                id="slotDurationMinutes"
                name="slotDurationMinutes"
                value={form.slotDurationMinutes}
                onChange={handleFormChange}
                required
              >
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>

            <div className="form-actions" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
              <button
                className="button button-primary button-large"
                type="submit"
                disabled={submitting || !selectedDoctor || selectedDays.length === 0}
              >
                {submitting ? "Saving schedule..." : `Save Schedule for ${selectedDays.length} Selected Day${selectedDays.length === 1 ? "" : "s"} →`}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Recurring Schedules Table */}
      <section className="card">
        <div className="card-header">
          <h2>
            {isDoctor ? "My Active Recurring Schedules" : `Active Recurring Schedules (${schedules.length})`}
          </h2>
          <p>
            {isDoctor
              ? "Your weekly recurring consultation slots and duration."
              : `Configured clinic shifts for Dr. ${selectedDoctorDetails?.first_name || ""} ${selectedDoctorDetails?.last_name || ""}.`}
          </p>
        </div>

        {loading ? (
          <div className="loading-state">Loading schedules...</div>
        ) : schedules.length === 0 ? (
          <div className="empty-state">
            No active schedules defined for this doctor yet.
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Hours</th>
                  <th>Slot Duration</th>
                  <th>Status</th>
                  {!isDoctor && user?.role === "ADMIN" && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <strong>{DAYS.find((d) => d.value === schedule.day_of_week)?.label}</strong>
                    </td>
                    <td>
                      {schedule.start_time} – {schedule.end_time}
                    </td>
                    <td>{schedule.slot_duration_minutes} minutes</td>
                    <td>
                      <span className="badge badge-success">Active</span>
                    </td>
                    {!isDoctor && user?.role === "ADMIN" && (
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="button button-secondary"
                            type="button"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleOpenEdit(schedule)}
                          >
                            Edit
                          </button>
                          <button
                            className="button button-danger"
                            type="button"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleDelete(schedule.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Edit Schedule Modal */}
      {editingSchedule && editForm && (
        <Modal
          isOpen={true}
          onClose={() => {
            setEditingSchedule(null);
            setEditForm(null);
          }}
          title={`Edit Schedule — ${DAYS.find((d) => d.value === editForm.dayOfWeek)?.label || "Shift"}`}
        >
          <form onSubmit={handleEditSubmit}>
            {editError && (
              <div className="alert alert-error" role="alert" style={{ marginBottom: "12px" }}>
                {editError}
              </div>
            )}

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="editDayOfWeek">Day of Week *</label>
                <select
                  id="editDayOfWeek"
                  name="dayOfWeek"
                  value={editForm.dayOfWeek}
                  onChange={handleEditChange}
                  required
                >
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="editStartTime">Start Time *</label>
                <input
                  id="editStartTime"
                  name="startTime"
                  type="time"
                  value={editForm.startTime}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editEndTime">End Time *</label>
                <input
                  id="editEndTime"
                  name="endTime"
                  type="time"
                  value={editForm.endTime}
                  onChange={handleEditChange}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="editSlotDuration">Slot Duration *</label>
                <select
                  id="editSlotDuration"
                  name="slotDurationMinutes"
                  value={editForm.slotDurationMinutes}
                  onChange={handleEditChange}
                  required
                >
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setEditingSchedule(null);
                  setEditForm(null);
                }}
                disabled={editSubmitting}
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

export default DoctorSchedules;
