import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { useAuth } from "../context/useAuth";
import {
  getDoctors,
  getDoctorSchedules,
  createSchedule,
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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const targetDocId = isDoctor ? user?.staff_id : selectedDoctor;
    if (!targetDocId) {
      setError("Please select a doctor.");
      return;
    }

    try {
      setSubmitting(true);
      await createSchedule(targetDocId, form);
      setSuccess("Doctor schedule rule created successfully.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Unable to create schedule.");
    } finally {
      setSubmitting(false);
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
              Configure weekday, hours, and slot intervals. The database prevents overlapping shifts.
            </p>
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="dayOfWeek">Day of week *</label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                value={form.dayOfWeek}
                onChange={handleFormChange}
                required
              >
                {DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
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
                disabled={submitting || !selectedDoctor}
              >
                {submitting ? "Saving schedule..." : "Save Schedule Slot →"}
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
                        <button
                          className="button button-danger"
                          type="button"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => handleDelete(schedule.id)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
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

export default DoctorSchedules;
