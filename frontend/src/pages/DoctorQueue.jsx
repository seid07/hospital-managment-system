import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import { getDoctorQueue } from "../services/encounterService";
import { useAuth } from "../context/useAuth";

function DoctorQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const doctorId = user?.staff_id;

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;

    async function loadQueue() {
      try {
        setError("");
        const res = await getDoctorQueue(doctorId, today);
        if (!cancelled && res.data) {
          setQueue(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load consultation queue.");
          setLoading(false);
        }
      }
    }

    loadQueue();
    const interval = setInterval(loadQueue, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doctorId, today]);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Clinical Practice</p>
          <h1>Doctor Consultation Queue</h1>
          <p className="page-description">
            Today&apos;s appointments and active clinical visits ({today}).
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="card">
        <div className="card-header">
          <h2>Patient Consultation List ({queue.length})</h2>
          <p>Checked-in and in-progress patient visits.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading consultation queue...</div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🩺</div>
            <h3>No patients currently in queue</h3>
            <p>No checked-in or scheduled visits for today at this time.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Scheduled Time</th>
                  <th>Reason for Visit</th>
                  <th>Status</th>
                  <th>Encounter Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        to={`/patients/${item.patient_id}`}
                        style={{ fontWeight: 600, color: "var(--primary)" }}
                      >
                        {item.patient_first_name} {item.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {item.patient_number} | {item.patient_gender}, DOB: {item.patient_dob}
                      </small>
                    </td>
                    <td>
                      <strong>{item.start_time}</strong> – {item.end_time}
                    </td>
                    <td>{item.reason || "General Consultation"}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.encounter_id ? (
                        <StatusBadge status={item.encounter_status || "DRAFT"} />
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Not Started</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => {
                            if (item.encounter_id) {
                              navigate(`/encounters/${item.encounter_id}`);
                            } else {
                              navigate(
                                `/encounters/new?appointmentId=${item.id}&patientId=${item.patient_id}&doctorId=${item.doctor_id}`
                              );
                            }
                          }}
                        >
                          {item.encounter_id ? "Resume Consultation →" : "Start Consultation →"}
                        </button>
                        <Link
                          to={`/patients/${item.patient_id}`}
                          className="button button-secondary"
                        >
                          Medical History
                        </Link>
                      </div>
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

export default DoctorQueue;
