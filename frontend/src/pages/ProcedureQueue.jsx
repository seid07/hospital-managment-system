import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { procedureService } from "../services/clinicalDepartmentServices";
import { queueService } from "../services/queueService";

export default function ProcedureQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("WAITING");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");

  // Procedure completion modal
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [procNotes, setProcNotes] = useState("");
  const [procType, setProcType] = useState("GENERAL");
  const [submitting, setSubmitting] = useState(false);

  // Tracks the queue_entry_id currently mid-request for Call, so a
  // double-click can't fire the same status transition twice.
  const [actionInFlight, setActionInFlight] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const data = await procedureService.getProcedureQueue({
          status: statusFilter === "ALL" ? undefined : statusFilter,
        });
        if (!cancelled) {
          setQueue(data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load the procedure queue.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, refreshKey]);

  function handleOpenModal(item) {
    setSelectedOrder(item);
    setProcType(
      item.service_code === "PROC-DRESSING" ? "DRESSING" :
      item.service_code === "PROC-INJECTION" ? "INJECTION" : "GENERAL"
    );
    setProcNotes("");
    setShowModal(true);
  }

  async function handleCallPatient(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.queue_entry_id);
      setError("");
      setSuccess("");
      await queueService.updateQueueStatus(item.queue_entry_id, { status: "CALLED" });
      setSuccess(`${item.patient_first_name} ${item.patient_last_name} called.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to call patient.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleCompleteSubmit(e) {
    e.preventDefault();
    if (!selectedOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await procedureService.completeProcedure(selectedOrder.service_order_id, {
        procedureType: procType,
        procedureName: selectedOrder.service_name,
        procedureNotes: procNotes,
      });
      setSuccess("Procedure marked complete.");
      setShowModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to complete procedure.");
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
          <p className="page-eyebrow">Nursing & Minor Clinical Procedures</p>
          <h1>Clinical Procedures Station</h1>
          <p className="page-description">
            Authorized dressings, injections, and minor bedside surgical procedures.
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
          placeholder="Live search by patient name, PAT #, or procedure..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
        />
      </section>

      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Authorized Procedure Queue ({filteredQueue.length})</h2>
            <p>Patients waiting for nursing and clinical procedures.</p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
             Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading procedure queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>{searchInput ? "No matching procedures found" : "No pending procedure orders"}</h3>
            <p>{searchInput ? "Try a different search term." : "New orders will appear here automatically after cashier authorization."}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Queue Token</th>
                  <th>Patient Details</th>
                  <th>Procedure Type</th>
                  <th>Prescribing Clinician</th>
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
                          background: "rgba(13, 148, 136, 0.15)",
                          color: "#0d9488",
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
                      <small style={{ color: "var(--text-muted)" }}>{item.clinical_notes || "Clinical order"}</small>
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
                            onClick={() => handleCallPatient(item)}
                          >
                            Call
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleOpenModal(item)}
                        >
                          Complete →
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

      {/* Completion Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedOrder ? `Complete Procedure: ${selectedOrder.service_name}` : "Procedure Notes"}
      >
        {selectedOrder && (
          <form onSubmit={handleCompleteSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Patient:</strong> {selectedOrder.patient_first_name} {selectedOrder.patient_last_name} ({selectedOrder.patient_number})</div>
              <div><strong>Procedure:</strong> {selectedOrder.service_name}</div>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Clinical Notes / Observation *</label>
              <textarea
                rows="4"
                required
                placeholder="Sterile site prep, medication/dressing details, patient vitals & response..."
                value={procNotes}
                onChange={(e) => setProcNotes(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting}
              >
                {submitting ? "Saving..." : "✓ Confirm Completed"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
