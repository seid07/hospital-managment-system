import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { radiologyService } from "../services/radiologyService";
import { queueService } from "../services/queueService";

export default function RadiologyQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("WAITING");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");

  // Tracks the queue_entry_id currently mid-request for Call/Start, so a
  // double-click can't fire the same status transition twice.
  const [actionInFlight, setActionInFlight] = useState(null);

  // Report Modal form
  const [showReportModal, setShowReportModal] = useState(false);
  const [activeReportOrder, setActiveReportOrder] = useState(null);
  const [reportData, setReportData] = useState({
    modality: "X_RAY",
    clinicalIndication: "",
    technicianNotes: "",
    findings: "",
    impression: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const data = await radiologyService.getRadiologyQueue({
          status: statusFilter === "ALL" ? undefined : statusFilter,
        });
        if (!cancelled) {
          setQueue(data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load the radiology queue.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, refreshKey]);

  function handleOpenReportModal(item) {
    setActiveReportOrder(item);
    setReportData({
      modality: item.service_code?.includes("ULTRASOUND") ? "ULTRASOUND" : "X_RAY",
      clinicalIndication: item.clinical_notes || "",
      technicianNotes: "",
      findings: "",
      impression: "",
    });
    setShowReportModal(true);
  }

  async function handleCallPatient(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.queue_entry_id);
      setError("");
      setSuccess("");
      await queueService.updateQueueStatus(item.queue_entry_id, { status: "CALLED" });
      setSuccess(`${item.patient_first_name} ${item.patient_last_name} called for imaging.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to call patient.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleStartExam(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.queue_entry_id);
      setError("");
      setSuccess("");
      await queueService.updateQueueStatus(item.queue_entry_id, { status: "IN_PROGRESS" });
      setSuccess(`Exam started for ${item.patient_first_name} ${item.patient_last_name}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to start exam.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!activeReportOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await radiologyService.recordRadiologyResult(activeReportOrder.service_order_id, reportData);
      setSuccess("Radiology report signed and completed.");
      setShowReportModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to submit radiology report.");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredQueue = searchInput.trim()
    ? queue.filter((item) => {
        const q = searchInput.trim().toLowerCase();
        return (
          item.patient_first_name?.toLowerCase().includes(q) ||
          item.patient_last_name?.toLowerCase().includes(q) ||
          item.patient_number?.toLowerCase().includes(q) ||
          item.service_name?.toLowerCase().includes(q) ||
          item.queue_number?.toLowerCase?.().includes(q)
        );
      })
    : queue;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Medical Imaging & Diagnostics</p>
          <h1>Radiology & Imaging Station</h1>
          <p className="page-description">
            Authorized imaging examinations for X-Ray and Ultrasound scans sorted by payment authorization time.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "6px" }}>
          {["WAITING", "CALLED", "IN_PROGRESS", "ALL"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`button ${statusFilter === st ? "button-primary" : "button-secondary"}`}
              style={{ fontSize: "11px", padding: "6px 12px" }}
            >
              {st}
            </button>
          ))}
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

      <section className="card" style={{ marginBottom: "16px" }}>
        <input
          type="search"
          placeholder="Live search by patient name, PAT #, or exam..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
        />
      </section>

      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Authorized Imaging Queue ({filteredQueue.length})</h2>
            <p>Patients waiting for diagnostic imaging procedures.</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading radiology queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🩻</div>
            <h3>{searchInput ? "No matching exams found" : "No imaging exams currently in this status"}</h3>
            <p>{searchInput ? "Try a different search term." : "New authorized radiology orders will appear here automatically."}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Queue Token</th>
                  <th>Patient Details</th>
                  <th>Exam Modality</th>
                  <th>Ordering Doctor</th>
                  <th>Payment State</th>
                  <th>Authorized At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item) => (
                  <tr key={item.queue_entry_id}>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "13px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: item.priority === "EMERGENCY" ? "rgba(239, 68, 68, 0.15)" : "rgba(2, 132, 199, 0.15)",
                          color: item.priority === "EMERGENCY" ? "#ef4444" : "#0284c7",
                        }}
                      >
                        {item.queue_number}
                      </span>
                    </td>
                    <td>
                      <strong>{item.patient_first_name} {item.patient_last_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {item.patient_number} • {item.patient_gender}
                      </small>
                    </td>
                    <td>
                      <strong>{item.service_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{item.clinical_notes || "Diagnostic Scan"}</small>
                    </td>
                    <td>
                      {item.doctor_first_name ? `Dr. ${item.doctor_first_name} ${item.doctor_last_name}` : "General OPD"}
                    </td>
                    <td>
                      <span className="badge badge-success">{item.payment_status || "AUTHORIZED"}</span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {new Date(item.authorized_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {item.queue_status === "WAITING" && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={actionInFlight === item.queue_entry_id}
                            onClick={() => handleCallPatient(item)}
                          >
                            {actionInFlight === item.queue_entry_id ? "Calling..." : "Call"}
                          </button>
                        )}
                        {item.queue_status === "CALLED" && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={actionInFlight === item.queue_entry_id}
                            onClick={() => handleStartExam(item)}
                          >
                            {actionInFlight === item.queue_entry_id ? "Starting..." : "Start"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleOpenReportModal(item)}
                        >
                          Report →
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

      {/* Report Modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title={activeReportOrder ? `Radiology Report: ${activeReportOrder.service_name}` : "Diagnostic Report"}
        maxWidth="650px"
      >
        {activeReportOrder && (
          <form onSubmit={handleSubmitReport}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Patient:</strong> {activeReportOrder.patient_first_name} {activeReportOrder.patient_last_name} ({activeReportOrder.patient_number})</div>
              <div><strong>Exam:</strong> {activeReportOrder.service_name}</div>
            </div>

            <div className="form-grid" style={{ marginBottom: "14px" }}>
              <div className="form-field">
                <label>Modality</label>
                <select
                  value={reportData.modality}
                  onChange={(e) => setReportData({ ...reportData, modality: e.target.value })}
                >
                  <option value="X_RAY">Diagnostic X-Ray</option>
                  <option value="ULTRASOUND">Ultrasound Sonogram</option>
                </select>
              </div>

              <div className="form-field">
                <label>Exposure / Tech Notes</label>
                <input
                  type="text"
                  placeholder="e.g. PA view, good inspiration"
                  value={reportData.technicianNotes}
                  onChange={(e) => setReportData({ ...reportData, technicianNotes: e.target.value })}
                />
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Findings *</label>
              <textarea
                rows="4"
                required
                placeholder="Detailed anatomical and radiological findings..."
                value={reportData.findings}
                onChange={(e) => setReportData({ ...reportData, findings: e.target.value })}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Radiological Impression *</label>
              <input
                type="text"
                required
                placeholder="Summary diagnostic impression..."
                value={reportData.impression}
                onChange={(e) => setReportData({ ...reportData, impression: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowReportModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting}
              >
                {submitting ? "Saving..." : "✓ Sign & Complete Report"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
