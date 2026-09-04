import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import {
  getAppointments,
  updateAppointmentStatus,
  rescheduleAppointment,
  getAvailability,
} from "../services/appointmentService";
import { getDoctors } from "../services/scheduleService";
import { useAuth } from "../context/useAuth";
import { useDebounce } from "../hooks/useDebounce";
import { useCalendar } from "../context/useCalendar";

function AppointmentsList() {
  const { formatDate } = useCalendar();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isDoctor = user?.role === "DOCTOR";

  const todayStr = new Date().toISOString().split("T")[0];
  const initialDate = searchParams.get("date") === "today"
    ? todayStr
    : (searchParams.get("date") || "");
  const initialStatus = searchParams.get("status") || "";

  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [doctorFilter, setDoctorFilter] = useState(isDoctor ? (user?.staff_id || "") : "");
  const [dateFilter, setDateFilter] = useState(initialDate);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadAppointments() {
      try {
        setError("");
        const currentDoctorId = isDoctor ? (user?.staff_id || "") : doctorFilter;
        const res = await getAppointments({
          page,
          limit: 15,
          status: statusFilter,
          doctorId: currentDoctorId,
          date: dateFilter,
          search: debouncedSearch.trim(),
        });
        if (!cancelled && res.data) {
          setAppointments(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load appointments.");
          setLoading(false);
        }
      }
    }
    loadAppointments();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, doctorFilter, isDoctor, user?.staff_id, dateFilter, debouncedSearch, reloadKey]);

  useEffect(() => {
    if (isDoctor) return;
    let cancelled = false;
    async function loadDocs() {
      try {
        const res = await getDoctors();
        if (!cancelled && res.data) setDoctors(res.data);
      } catch {
        // silent
      }
    }
    loadDocs();
    return () => {
      cancelled = true;
    };
  }, [isDoctor]);

  async function handleStatusUpdate(id, newStatus, notes = "") {
    if (statusUpdatingId) return; // guard against a double-click firing two status updates
    if (newStatus === "CANCELLED" && !window.confirm("Cancel this appointment? This cannot be undone.")) {
      return;
    }
    setError("");
    setSuccess("");
    try {
      setStatusUpdatingId(id);
      await updateAppointmentStatus(id, newStatus, notes);
      setSuccess(`Appointment status changed to ${newStatus}.`);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to update appointment status.");
    } finally {
      setStatusUpdatingId(null);
    }
  }

  // Load available slots when reschedule date changes
  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) {
      return;
    }
    let cancelled = false;
    async function fetchSlots() {
      try {
        const res = await getAvailability(rescheduleTarget.doctor_id, rescheduleDate);
        if (!cancelled && res.data) setAvailableSlots(res.data);
      } catch {
        if (!cancelled) setAvailableSlots([]);
      }
    }
    fetchSlots();
    return () => {
      cancelled = true;
    };
  }, [rescheduleTarget, rescheduleDate]);

  async function handleRescheduleSubmit(e) {
    e.preventDefault();
    setRescheduleError("");
    const slot = availableSlots.find((s) => `${s.startTime}-${s.endTime}` === selectedSlotKey);
    if (!slot) {
      setRescheduleError("Please select an available time slot.");
      return;
    }

    try {
      setRescheduleSubmitting(true);
      await rescheduleAppointment(rescheduleTarget.id, {
        appointmentDate: rescheduleDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: rescheduleReason,
      });
      setRescheduleTarget(null);
      setSuccess("Appointment successfully rescheduled.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setRescheduleError(err.message || "Failed to reschedule appointment.");
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">{isDoctor ? "Doctor Clinical Workspace" : "Scheduling & Queue"}</p>
          <h1>{isDoctor ? "My Appointed Consultations" : "Appointments Directory"}</h1>
          <p className="page-description">
            {isDoctor
              ? "View your assigned scheduled patient consultations with designated appointment times."
              : "Manage hospital consultations, patient check-ins, and doctor appointments."}
          </p>
        </div>

        {/* Doctor cannot appoint patients - "+ Book Appointment" is hidden for doctors */}
        {!isDoctor && ["REGISTRAR", "ADMIN"].includes(user?.role) && (
          <div className="page-actions">
            <Link to="/appointments/availability" className="button button-primary button-large">
              + Book Appointment
            </Link>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filter Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form
          onSubmit={handleSearchSubmit}
          className="form-grid"
          style={{
            gridTemplateColumns: isDoctor
              ? "repeat(auto-fit, minmax(200px, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div className="form-field">
            <label>Search Patient / Appt #</label>
            <input
              type="search"
              placeholder="Name, phone, ref..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {!isDoctor && (
            <div className="form-field">
              <label>Doctor</label>
              <select
                value={doctorFilter}
                onChange={(e) => {
                  setDoctorFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.first_name} {d.last_name} ({d.specialty || "General"})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No Show</option>
            </select>
          </div>

          <div className="form-field">
            <label>Appointment Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </form>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setSearchInput("");
              if (!isDoctor) setDoctorFilter("");
              setStatusFilter("");
              setDateFilter("");
              setPage(1);
            }}
          >
            Reset Filters
          </button>
          <button type="button" className="button button-primary" onClick={handleSearchSubmit}>
            Apply Filters
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">□</div>
            <h3>No appointments found</h3>
            <p>
              {isDoctor
                ? "You do not have any appointed patient consultations matching these filters."
                : "No appointments match the selected filters or search terms."}
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Appt #</th>
                  <th>Patient</th>
                  {!isDoctor && <th>Doctor</th>}
                  <th>Date & Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.appointment_number}</strong>
                    </td>
                    <td>
                      <Link
                        to={`/patients/${a.patient_id}`}
                        style={{ fontWeight: 600, color: "var(--primary)" }}
                      >
                        {a.patient_first_name} {a.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {a.patient_number} | {a.patient_phone}
                      </small>
                    </td>
                    {!isDoctor && (
                      <td>
                        Dr. {a.doctor_first_name} {a.doctor_last_name}
                        <br />
                        <small style={{ color: "var(--text-muted)" }}>
                          {a.doctor_specialty || a.doctor_department || "Clinical"}
                        </small>
                      </td>
                    )}
                    <td>
                      <strong>{formatDate(a.appointment_date)}</strong>
                      <br />
                      <span style={{ fontWeight: 600, color: "var(--primary)", fontSize: "12px" }}>
                        🕒 {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px" }}>{a.reason || "General Consultation"}</span>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {a.status === "SCHEDULED" && (
                          <>
                            <button
                              type="button"
                              className="button button-primary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              disabled={statusUpdatingId === a.id}
                              onClick={() => handleStatusUpdate(a.id, "CHECKED_IN")}
                            >
                              {statusUpdatingId === a.id ? "..." : "Check In"}
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              disabled={statusUpdatingId === a.id}
                              onClick={() => {
                                setRescheduleTarget(a);
                                setRescheduleDate(a.appointment_date);
                                setSelectedSlotKey("");
                                setRescheduleReason(a.reason || "");
                              }}
                            >
                              Reschedule
                            </button>
                            <button
                              type="button"
                              className="button button-danger"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              disabled={statusUpdatingId === a.id}
                              onClick={() => handleStatusUpdate(a.id, "CANCELLED", "Cancelled by user")}
                            >
                              {statusUpdatingId === a.id ? "..." : "Cancel"}
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              disabled={statusUpdatingId === a.id}
                              onClick={() => handleStatusUpdate(a.id, "NO_SHOW")}
                            >
                              {statusUpdatingId === a.id ? "..." : "No Show"}
                            </button>
                          </>
                        )}

                        {a.status === "CHECKED_IN" && (
                          <>
                            {["ADMIN", "DOCTOR"].includes(user?.role) && (
                              <button
                                type="button"
                                className="button button-primary"
                                style={{ padding: "4px 8px", fontSize: "11px" }}
                                onClick={() => navigate(`/encounters/new?appointmentId=${a.id}&patientId=${a.patient_id}&doctorId=${a.doctor_id}`)}
                              >
                                Start Encounter →
                              </button>
                            )}
                            {["ADMIN", "NURSE"].includes(user?.role) && (
                              <button
                                type="button"
                                className="button button-secondary"
                                style={{ padding: "4px 8px", fontSize: "11px" }}
                                onClick={() => navigate(`/nurse/triage`)}
                              >
                                Record Vitals
                              </button>
                            )}
                          </>
                        )}

                        {a.status === "IN_PROGRESS" && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => navigate(`/encounters/new?appointmentId=${a.id}&patientId=${a.patient_id}&doctorId=${a.doctor_id}`)}
                          >
                            Resume Encounter →
                          </button>
                        )}

                        <Link
                          to={`/patients/${a.patient_id}`}
                          className="button button-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          Chart
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </section>

      {/* Reschedule Modal */}
      <Modal
        isOpen={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Appointment"
      >
        {rescheduleTarget && (
          <form onSubmit={handleRescheduleSubmit}>
            {rescheduleError && <div className="alert alert-error">{rescheduleError}</div>}

            <div style={{ background: "var(--surface-muted)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
              <strong>Patient:</strong> {rescheduleTarget.patient_first_name} {rescheduleTarget.patient_last_name} ({rescheduleTarget.patient_number})<br />
              <strong>Doctor:</strong> Dr. {rescheduleTarget.doctor_first_name} {rescheduleTarget.doctor_last_name}<br />
              <strong>Current Slot:</strong> {formatDate(rescheduleTarget.appointment_date)} at {rescheduleTarget.start_time} - {rescheduleTarget.end_time}
            </div>

            <div className="form-field">
              <label>Select New Date *</label>
              <input
                type="date"
                min={todayStr}
                value={rescheduleDate}
                onChange={(e) => {
                  setRescheduleDate(e.target.value);
                  setSelectedSlotKey("");
                }}
                required
              />
            </div>

            {rescheduleDate && (
              <div className="form-field">
                <label>Available Consultation Slots *</label>
                {availableSlots.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    No available time slots found for Dr. {rescheduleTarget.doctor_first_name} on this date.
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px", marginTop: "6px" }}>
                    {availableSlots.map((slot) => {
                      const key = `${slot.startTime}-${slot.endTime}`;
                      const isSelected = selectedSlotKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={!slot.isAvailable}
                          onClick={() => setSelectedSlotKey(key)}
                          style={{
                            padding: "8px 6px",
                            borderRadius: "6px",
                            border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
                            background: isSelected
                              ? "rgba(2, 132, 199, 0.12)"
                              : slot.isAvailable
                              ? "var(--surface)"
                              : "var(--surface-muted)",
                            color: slot.isAvailable ? "var(--text-primary)" : "var(--text-muted)",
                            cursor: slot.isAvailable ? "pointer" : "not-allowed",
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: "12px",
                            textAlign: "center",
                          }}
                        >
                          {slot.startTime} – {slot.endTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="form-field">
              <label>Reason for Rescheduling</label>
              <textarea
                rows={2}
                placeholder="e.g. Patient requested time shift..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRescheduleTarget(null)}
                disabled={rescheduleSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={rescheduleSubmitting || !selectedSlotKey}
              >
                {rescheduleSubmitting ? "Saving..." : "Confirm Reschedule"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

export default AppointmentsList;
