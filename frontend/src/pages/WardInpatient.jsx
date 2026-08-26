import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { wardService } from "../services/clinicalDepartmentServices";

export default function WardInpatient() {
  const [beds, setBeds] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Admission Modal
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);
  const [selectedBedId, setSelectedBedId] = useState("");
  const [admissionReason, setAdmissionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Discharge Modal
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [activeAdmission, setActiveAdmission] = useState(null);
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [bedsData, queueData] = await Promise.all([
          wardService.getBeds(),
          wardService.getWardQueue(),
        ]);
        if (!cancelled) {
          setBeds(bedsData || []);
          setQueue(queueData || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load ward data.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reloadData() {
    try {
      setLoading(true);
      setError("");
      const [bedsData, queueData] = await Promise.all([
        wardService.getBeds(),
        wardService.getWardQueue(),
      ]);
      setBeds(bedsData || []);
      setQueue(queueData || []);
    } catch (err) {
      setError(err.message || "Unable to reload ward data.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenAdmit(item) {
    setSelectedQueueItem(item);
    setAdmissionReason(item.clinical_notes || "");
    const firstAvailableBed = beds.find((b) => b.status === "AVAILABLE");
    setSelectedBedId(firstAvailableBed ? firstAvailableBed.id : "");
    setShowAdmitModal(true);
  }

  async function handleAdmitSubmit(e) {
    e.preventDefault();
    if (!selectedQueueItem || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await wardService.admitPatient({
        visitId: selectedQueueItem.visit_id || null,
        patientId: selectedQueueItem.patient_id,
        bedId: selectedBedId || null,
        doctorId: selectedQueueItem.ordering_doctor_id || selectedQueueItem.doctor_id || null,
        admissionReason,
      });
      setSuccess("Patient admitted to ward.");
      setShowAdmitModal(false);
      reloadData();
    } catch (err) {
      setError(err.message || "Failed to admit patient.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenDischarge(admissionId, bedNumber) {
    setActiveAdmission({ id: admissionId, bedNumber });
    setDischargeSummary("");
    setShowDischargeModal(true);
  }

  async function handleDischargeSubmit(e) {
    e.preventDefault();
    if (!activeAdmission || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await wardService.dischargePatient(activeAdmission.id, { dischargeSummary });
      setSuccess("Patient discharged.");
      setShowDischargeModal(false);
      reloadData();
    } catch (err) {
      setError(err.message || "Failed to discharge patient.");
    } finally {
      setSubmitting(false);
    }
  }

  const availableBeds = beds.filter((b) => b.status === "AVAILABLE");
  const occupiedBeds = beds.filter((b) => b.status === "OCCUPIED");
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
          <p className="page-eyebrow">Inpatient & Nursing Care</p>
          <h1>Inpatient Ward & Bed Management</h1>
          <p className="page-description">
            Ward admissions, bed capacity census, and authorized inpatient bed/day care.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "10px" }}>
          <span className="badge badge-success">{availableBeds.length} Available</span>
          <span className="badge badge-warning">{occupiedBeds.length} Occupied</span>
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

      {/* Bed Grid Section */}
      <section className="card">
        <div className="card-header">
          <h2>Hospital Bed Census ({beds.length} Total Beds)</h2>
          <p>Real-time occupancy status across all hospital wards.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
          {beds.map((bed) => {
            const isOcc = bed.status === "OCCUPIED";
            return (
              <div
                key={bed.id}
                style={{
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${isOcc ? "#e2e8f0" : "#d1fae5"}`,
                  background: isOcc ? "var(--surface-muted)" : "#f0fdf4",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontFamily: "monospace", fontSize: "14px" }}>{bed.bed_number}</strong>
                    <span className={`badge ${isOcc ? "badge-danger" : "badge-success"}`}>
                      {bed.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {bed.ward_name} ({bed.bed_type})
                  </div>
                </div>

                {isOcc ? (
                  <div style={{ marginTop: "10px", borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600 }}>
                      {bed.current_patient_first_name} {bed.current_patient_last_name}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                      {bed.current_patient_number}
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ width: "100%", marginTop: "8px", minHeight: "28px", padding: "4px" }}
                      onClick={() => handleOpenDischarge(bed.current_admission_id, bed.bed_number)}
                    >
                      Discharge
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: "10px", borderTop: "1px solid var(--border)", paddingTop: "8px", fontSize: "11px", color: "var(--success)" }}>
                    Ready for Admission
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Admission Queue Table */}
      <section className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Authorized Admission Queue ({filteredQueue.length})</h2>
            <p>Patients waiting for bed allocation and ward check-in.</p>
          </div>
          <button type="button" className="button button-secondary" onClick={reloadData}>
             Refresh
          </button>
        </div>

        <div style={{ padding: "0 0 14px 0" }}>
          <input
            type="search"
            placeholder="Live search by patient name, PAT #, or service..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />
        </div>

        {loading ? (
          <div className="loading-state">Loading ward queue...</div>
        ) : filteredQueue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>{searchInput ? "No matching admissions found" : "No pending admissions"}</h3>
            <p>{searchInput ? "Try a different search term." : "Authorized bed admission orders will appear here automatically."}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Queue Token</th>
                  <th>Patient Details</th>
                  <th>Service Ordered</th>
                  <th>Admission Status</th>
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
                          background: "rgba(124, 58, 237, 0.15)",
                          color: "#7c3aed",
                        }}
                      >
                        {item.queue_number}
                      </span>
                    </td>
                    <td>
                      <strong>{item.patient_first_name} {item.patient_last_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {item.patient_number}
                      </small>
                    </td>
                    <td>
                      <strong>{item.service_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{item.clinical_notes || "Inpatient Care"}</small>
                    </td>
                    <td>
                      {item.bed_number ? (
                        <span className="badge badge-info">Assigned {item.bed_number}</span>
                      ) : (
                        <span className="badge badge-warning">Awaiting Bed</span>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {new Date(item.authorized_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      {!item.bed_number && (
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleOpenAdmit(item)}
                        >
                          Allocate Bed & Admit →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Admit Modal */}
      <Modal
        isOpen={showAdmitModal}
        onClose={() => setShowAdmitModal(false)}
        title={selectedQueueItem ? `Admit Patient: ${selectedQueueItem.patient_first_name} ${selectedQueueItem.patient_last_name}` : "Bed Allocation"}
      >
        {selectedQueueItem && (
          <form onSubmit={handleAdmitSubmit}>
            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Select Available Bed *</label>
              <select
                required
                value={selectedBedId}
                onChange={(e) => setSelectedBedId(e.target.value)}
              >
                <option value="">-- Choose Bed --</option>
                {availableBeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bed_number} — {b.ward_name} ({b.bed_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Clinical Reason for Admission</label>
              <textarea
                rows="3"
                value={admissionReason}
                onChange={(e) => setAdmissionReason(e.target.value)}
                placeholder="Care plan, admitting diagnosis, nursing instructions..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowAdmitModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting || !selectedBedId}
              >
                {submitting ? "Admitting..." : "✓ Confirm Admission"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Discharge Modal */}
      <Modal
        isOpen={showDischargeModal}
        onClose={() => setShowDischargeModal(false)}
        title={activeAdmission ? `Discharge Patient & Free Bed ${activeAdmission.bedNumber}` : "Patient Discharge"}
      >
        {activeAdmission && (
          <form onSubmit={handleDischargeSubmit}>
            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Discharge Summary Notes *</label>
              <textarea
                rows="4"
                required
                placeholder="Patient condition upon discharge, home medications, follow-up instructions..."
                value={dischargeSummary}
                onChange={(e) => setDischargeSummary(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowDischargeModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting}
              >
                {submitting ? "Processing..." : "✓ Complete Discharge"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
