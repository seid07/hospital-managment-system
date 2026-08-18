import { useEffect, useState, useTransition } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function AppointmentsList() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, startTransition] = useTransition();

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
        const res = await getAppointments({
          page,
          limit: 15,
          status: statusFilter,
          doctorId: doctorFilter,
          date: dateFilter,
          search: searchTerm,
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
  }, [page, statusFilter, doctorFilter, dateFilter, searchTerm, reloadKey]);

  useEffect(() => {
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
  }, []);

  async function handleStatusUpdate(id, newStatus, notes = "") {
    setError("");
    setSuccess("");
    try {
      await updateAppointmentStatus(id, newStatus, notes);
      setSuccess(`Appointment status changed to ${newStatus}.`);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to update appointment status.");
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
    startTransition(() => {
      setSearchTerm(searchInput.trim());
    });
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Scheduling & Queue</p>
          <h1>Appointments Directory</h1>
          <p className="page-description">
            Manage hospital consultations, patient check-ins, and doctor appointments.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/appointments/availability" className="button button-primary button-large">
            + Book Appointment
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filter Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} className="form-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
          <div className="form-field">
            <label>Search Patient / Appt #</label>
            <input
              type="search"
              placeholder="Name, phone, ref..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

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
              setSearchTerm("");
              setDoctorFilter("");
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
            <p>No appointments match the selected filters or search terms.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Appt #</th>
                  <th>Patient</th>
                  <th>Doctor</th>
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
                    <td>
                      Dr. {a.doctor_first_name} {a.doctor_last_name}
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {a.doctor_specialty || a.doctor_department || "Clinical"}
                      </small>
                    </td>
                    <td>
                      <strong>{a.appointment_date}</strong>
                      <br />
                      <span>{a.start_time} – {a.end_time}</span>
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
                              onClick={() => handleStatusUpdate(a.id, "CHECKED_IN")}
                            >
                              Check In
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
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
                              onClick={() => handleStatusUpdate(a.id, "CANCELLED", "Cancelled by user")}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => handleStatusUpdate(a.id, "NO_SHOW")}
                            >
                              No Show
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
        {rescheduleError && <div className="alert alert-error">{rescheduleError}</div>}
        {rescheduleTarget && (
          <form onSubmit={handleRescheduleSubmit}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Rescheduling appointment <strong>{rescheduleTarget.appointment_number}</strong> for{" "}
              <strong>{rescheduleTarget.patient_first_name} {rescheduleTarget.patient_last_name}</strong> with{" "}
              <strong>Dr. {rescheduleTarget.doctor_first_name} {rescheduleTarget.doctor_last_name}</strong>.
            </p>

            <div className="form-field" style={{ margin: "14px 0" }}>
              <label>New Appointment Date</label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                required
              />
            </div>

            <div className="form-field" style={{ margin: "14px 0" }}>
              <label>Available Slots for Selected Date</label>
              {availableSlots.length === 0 ? (
                <div style={{ padding: "12px", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: "13px" }}>
                  No slots available on this date or doctor is not scheduled.
                </div>
              ) : (
                <div className="slot-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  {availableSlots.map((slot) => {
                    const key = `${slot.startTime}-${slot.endTime}`;
                    const isSelected = selectedSlotKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!slot.available}
                        className={`slot-button ${isSelected ? "slot-button-selected" : ""} ${!slot.available ? "slot-button-booked" : ""}`}
                        onClick={() => slot.available && setSelectedSlotKey(key)}
                        style={{ minHeight: "54px" }}
                      >
                        <strong>{slot.startTime}</strong>
                        <span>{slot.endTime}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="form-field">
              <label>Reason for Rescheduling</label>
              <input
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="e.g. Patient requested new date"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRescheduleTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={rescheduleSubmitting || !selectedSlotKey}
              >
                {rescheduleSubmitting ? "Rescheduling..." : "Confirm Reschedule"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

export default AppointmentsList;
