import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { surgeryService } from "../services/clinicalDepartmentServices";

export default function SurgeryQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Surgery update modal
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [formData, setFormData] = useState({
    surgeryName: "",
    preOpDiagnosis: "",
    postOpDiagnosis: "",
    preOpChecklistComplete: false,
    anesthesiaType: "General",
    operationNotes: "",
    status: "IN_THEATRE",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const data = await surgeryService.getSurgeryQueue();
        if (!cancelled) {
          setQueue(data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load surgery queue:", err);
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function handleOpenModal(item) {
    setSelectedOrder(item);
    setFormData({
      surgeryName: item.service_name || "Surgical Procedure",
      preOpDiagnosis: item.clinical_notes || "",
      postOpDiagnosis: "",
      preOpChecklistComplete: true,
      anesthesiaType: "General",
      operationNotes: "",
      status: "COMPLETED",
    });
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      setSubmitting(true);
      await surgeryService.updateSurgeryStatus(selectedOrder.service_order_id, formData);
      setShowModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to update surgery record:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Operating Theatre & Surgical Services</p>
          <h1>Operating Theatre Station</h1>
          <p className="page-description">
            Authorized surgical procedures, pre-operative safety verification, and operative reporting.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            🔄 Refresh Queue
          </button>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Authorized Surgical Queue ({queue.length})</h2>
          <p>Patients scheduled for operating theatre procedures.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading surgery queue...</div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔪</div>
            <h3>No surgical procedures in queue</h3>
            <p>Authorized surgery orders will appear here automatically.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Queue Token</th>
                  <th>Patient Details</th>
                  <th>Surgical Procedure</th>
                  <th>Surgeon / Team</th>
                  <th>Payment State</th>
                  <th>Authorized At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.queue_entry_id}>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "13px",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: "rgba(225, 29, 72, 0.15)",
                          color: "#e11d48",
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
                      <small style={{ color: "var(--text-muted)" }}>{item.clinical_notes || "Surgical Procedure"}</small>
                    </td>
                    <td>
                      {item.doctor_first_name ? `Dr. ${item.doctor_first_name} ${item.doctor_last_name}` : "Surgical Dept"}
                    </td>
                    <td>
                      <span className="badge badge-success">{item.payment_status || "AUTHORIZED"}</span>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {new Date(item.authorized_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => handleOpenModal(item)}
                      >
                        Operative Log →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Operative Log Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedOrder ? `Operative Log: ${selectedOrder.service_name}` : "Surgical Record"}
        maxWidth="650px"
      >
        {selectedOrder && (
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{ marginBottom: "14px" }}>
              <div className="form-field">
                <label>Pre-Op Diagnosis</label>
                <input
                  type="text"
                  value={formData.preOpDiagnosis}
                  onChange={(e) => setFormData({ ...formData, preOpDiagnosis: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Post-Op Diagnosis *</label>
                <input
                  type="text"
                  required
                  placeholder="Confirmed post-op diagnosis..."
                  value={formData.postOpDiagnosis}
                  onChange={(e) => setFormData({ ...formData, postOpDiagnosis: e.target.value })}
                />
              </div>
            </div>

            <div className="form-grid" style={{ marginBottom: "14px" }}>
              <div className="form-field">
                <label>Anesthesia Type</label>
                <select
                  value={formData.anesthesiaType}
                  onChange={(e) => setFormData({ ...formData, anesthesiaType: e.target.value })}
                >
                  <option value="General">General Anesthesia</option>
                  <option value="Spinal">Spinal / Epidural</option>
                  <option value="Local">Local Anesthesia</option>
                  <option value="Sedation">Conscious Sedation</option>
                </select>
              </div>

              <div className="form-field" style={{ justifyContent: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "16px" }}>
                  <input
                    type="checkbox"
                    checked={formData.preOpChecklistComplete}
                    onChange={(e) => setFormData({ ...formData, preOpChecklistComplete: e.target.checked })}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>WHO Safe Surgery Checklist Verified</span>
                </label>
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Operative Procedure Summary *</label>
              <textarea
                rows="4"
                required
                placeholder="Incision approach, intraoperative findings, estimated blood loss, specimens..."
                value={formData.operationNotes}
                onChange={(e) => setFormData({ ...formData, operationNotes: e.target.value })}
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
                {submitting ? "Signing Record..." : "✓ Sign & Complete Surgical Log"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
