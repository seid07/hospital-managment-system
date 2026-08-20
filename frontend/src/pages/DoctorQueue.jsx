import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import { getDoctorQueue } from "../services/encounterService";
import { queueService } from "../services/queueService";
import { useAuth } from "../context/useAuth";

function DoctorQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const doctorId = user?.staff_id;

  const [clinicalQueue, setClinicalQueue] = useState([]);
  const [appointmentQueue, setAppointmentQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setError("");
        const [qData, apptData] = await Promise.all([
          queueService.getDepartmentQueue("CLINICAL").catch(() => []),
          doctorId ? getDoctorQueue(doctorId, today).catch(() => ({ data: [] })) : { data: [] },
        ]);

        if (!cancelled) {
          setClinicalQueue(qData || []);
          setAppointmentQueue(apptData?.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load consultation queue.");
          setLoading(false);
        }
      }
    }

    loadData();
    const interval = setInterval(loadData, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doctorId, today]);

  async function handleCallNext() {
    try {
      const nextPat = await queueService.callNext("CLINICAL");
      if (nextPat) {
        // reload
        const qData = await queueService.getDepartmentQueue("CLINICAL");
        setClinicalQueue(qData || []);
      }
    } catch (err) {
      console.error("Call next error:", err);
    }
  }

  return (
    <AppShell>
      <div className="page-header flex items-center justify-between">
        <div>
          <p className="page-eyebrow">Clinical Practice</p>
          <h1>Doctor Consultation Workspace & Queue</h1>
          <p className="page-description">
            Live authorized patient consultation queue (sorted by payment authorization time) and scheduled appointments.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCallNext}
          disabled={clinicalQueue.filter((q) => q.queue_status === "WAITING").length === 0}
          className="button button-primary"
          style={{ padding: "10px 18px", fontWeight: 700 }}
        >
          📢 Call Next Authorized Patient
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Authorized Service-First Clinical Queue */}
      <section className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header flex items-center justify-between">
          <div>
            <h2>Authorized Waiting Queue ({clinicalQueue.length})</h2>
            <p>Patients who have completed cashier payment or emergency override authorization.</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading consultation queue...</div>
        ) : clinicalQueue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🩺</div>
            <h3>No authorized patients currently waiting</h3>
            <p>Patients will appear here automatically as soon as their consultation service is paid at registration.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Queue Token</th>
                  <th>Patient Details</th>
                  <th>Consultation Service</th>
                  <th>Payment State</th>
                  <th>Authorized At</th>
                  <th>Queue Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clinicalQueue.map((item) => (
                  <tr key={item.queue_entry_id}>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "14px",
                          fontWeight: 800,
                          padding: "4px 8px",
                          borderRadius: "6px",
                          backgroundColor: item.priority === "EMERGENCY" ? "rgba(239, 68, 68, 0.15)" : "rgba(99, 102, 241, 0.15)",
                          color: item.priority === "EMERGENCY" ? "rgb(239, 68, 68)" : "rgb(129, 140, 248)",
                          border: `1px solid ${item.priority === "EMERGENCY" ? "rgba(239, 68, 68, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
                        }}
                      >
                        {item.queue_number}
                      </span>
                      {item.priority === "EMERGENCY" && (
                        <span
                          style={{
                            marginLeft: "6px",
                            padding: "2px 6px",
                            fontSize: "10px",
                            fontWeight: 800,
                            borderRadius: "4px",
                            backgroundColor: "rgba(239, 68, 68, 0.2)",
                            color: "rgb(248, 113, 113)",
                          }}
                        >
                          STAT
                        </span>
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/patients/${item.patient_id}`}
                        style={{ fontWeight: 600, color: "var(--primary)" }}
                      >
                        {item.patient_first_name} {item.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {item.patient_number} | {item.patient_gender}, DOB: {item.patient_dob ? new Date(item.patient_dob).toLocaleDateString() : ""}
                      </small>
                    </td>
                    <td>
                      <strong>{item.service_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{item.clinical_notes || "General Consultation"}</small>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: item.payment_status === "AUTHORIZED" || item.payment_status === "PAID" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: item.payment_status === "AUTHORIZED" || item.payment_status === "PAID" ? "rgb(52, 211, 153)" : "rgb(251, 191, 36)",
                        }}
                      >
                        {item.payment_status}
                      </span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {new Date(item.authorized_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <StatusBadge status={item.queue_status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => {
                            navigate(
                              `/encounters/new?visitId=${item.visit_id}&patientId=${item.patient_id}&doctorId=${doctorId || ""}&serviceOrderId=${item.service_order_id}`
                            );
                          }}
                        >
                          Start Consultation →
                        </button>
                        <Link
                          to={`/patients/${item.patient_id}`}
                          className="button button-secondary"
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
      </section>

      {/* Appointment Schedule List */}
      <section className="card">
        <div className="card-header">
          <h2>Scheduled Appointments Today ({appointmentQueue.length})</h2>
          <p>Booked doctor schedule slots for {today}.</p>
        </div>

        {appointmentQueue.length === 0 ? (
          <div className="empty-state">
            <p>No booked appointment slots remaining for today.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Time Slot</th>
                  <th>Reason for Visit</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointmentQueue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        to={`/patients/${item.patient_id}`}
                        style={{ fontWeight: 600, color: "var(--primary)" }}
                      >
                        {item.patient_first_name} {item.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{item.patient_number}</small>
                    </td>
                    <td>
                      <strong>{item.start_time}</strong> – {item.end_time}
                    </td>
                    <td>{item.reason || "General Consultation"}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          navigate(`/encounters/new?appointmentId=${item.id}&patientId=${item.patient_id}&doctorId=${item.doctor_id}`);
                        }}
                      >
                        Open Encounter
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

export default DoctorQueue;
