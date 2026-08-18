import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatCard from "../components/common/StatCard";
import { getAppointments, updateAppointmentStatus } from "../services/appointmentService";

function ReceptionQueue() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      try {
        setError("");
        const res = await getAppointments({
          date: today,
          limit: 100,
        });
        if (!cancelled && res.data) {
          setAppointments(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load today's reception queue.");
          setLoading(false);
        }
      }
    }

    loadQueue();
    const timer = setInterval(loadQueue, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [today, reloadKey]);

  async function handleCheckIn(id) {
    try {
      setError("");
      setSuccess("");
      await updateAppointmentStatus(id, "CHECKED_IN", "Patient arrived at reception front desk");
      setSuccess("Patient checked in successfully and queued for nursing triage.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to check in patient.");
    }
  }

  const scheduledList = appointments.filter((a) => a.status === "SCHEDULED");
  const checkedInList = appointments.filter((a) => a.status === "CHECKED_IN");
  const completedList = appointments.filter((a) => a.status === "COMPLETED");

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Front Desk & Reception</p>
          <h1>Today&apos;s Patient Check-in Queue</h1>
          <p className="page-description">
            Arrival management, fast check-in, and patient verification ({today}).
          </p>
        </div>

        <div className="page-actions">
          <Link to="/patients/new" className="button button-secondary">
            + Register New Patient
          </Link>
          <Link to="/appointments/availability" className="button button-primary">
            + Book Appointment
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Metrics Bar */}
      <div className="dashboard-grid" style={{ marginBottom: "24px" }}>
        <StatCard
          label="Total Scheduled Today"
          value={appointments.length}
          icon="□"
          description="Total booked consultations"
        />
        <StatCard
          label="Pending Arrival"
          value={scheduledList.length}
          icon="⏳"
          description="Awaiting patient arrival"
        />
        <StatCard
          label="Checked In & In Clinic"
          value={checkedInList.length}
          icon="🏥"
          description="Currently in triage or doctor visit"
        />
        <StatCard
          label="Completed Today"
          value={completedList.length}
          icon="✓"
          description="Finished consultations"
        />
      </div>

      {/* Queue Table */}
      <section className="card">
        <div className="card-header">
          <h2>Arrivals & Check-in Queue</h2>
          <p>Click Check In when patient presents at reception desk.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading today&apos;s queue...</div>
        ) : appointments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">□</div>
            <h3>No appointments scheduled today</h3>
            <p>No appointments booked for date: {today}.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time Slot</th>
                  <th>Appt #</th>
                  <th>Patient Name & ID</th>
                  <th>Assigned Physician</th>
                  <th>Reason for Visit</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.start_time}</strong> – {a.end_time}
                    </td>
                    <td>
                      <code>{a.appointment_number}</code>
                    </td>
                    <td>
                      <Link to={`/patients/${a.patient_id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
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
                        {a.doctor_specialty || a.doctor_department || "General"}
                      </small>
                    </td>
                    <td>{a.reason || "General Consultation"}</td>
                    <td>
                      <span
                        className={`badge ${
                          a.status === "CHECKED_IN"
                            ? "badge-success"
                            : a.status === "COMPLETED"
                            ? "badge-info"
                            : a.status === "SCHEDULED"
                            ? "badge-warning"
                            : "badge-danger"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.status === "SCHEDULED" && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleCheckIn(a.id)}
                        >
                          ✓ Check In Patient
                        </button>
                      )}
                      {a.status === "CHECKED_IN" && (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => navigate(`/nurse/triage`)}
                        >
                          Send to Triage →
                        </button>
                      )}
                      {a.status === "COMPLETED" && (
                        <Link
                          to={`/patients/${a.patient_id}`}
                          className="button button-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                          View Chart
                        </Link>
                      )}
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

export default ReceptionQueue;
