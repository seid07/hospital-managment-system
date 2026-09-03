import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatusBadge from "../components/common/StatusBadge";
import { procedureService } from "../services/procedureService";
import { queueService } from "../services/queueService";
import { useAuth } from "../context/useAuth";
import {
  Clock,
  Activity,
  CheckCircle2,
  Layers,
  Search,
  FileText,
  Play,
  Volume2,
  Stethoscope,
} from "lucide-react";

export default function ProcedureQueue() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [actionInFlight, setActionInFlight] = useState(null);

  // Procedure Execution Modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [execForm, setExecForm] = useState({
    procedureName: "",
    procedureType: "GENERAL",
    findings: "",
    materialsUsed: "",
    complications: "",
    procedureNotes: "",
    staff: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [qData, mData] = await Promise.all([
          procedureService.getProcedureQueue({
            status: statusFilter === "ALL" ? undefined : statusFilter,
          }),
          procedureService.getMetrics().catch(() => null),
        ]);
        if (!cancelled) {
          setQueue(qData || []);
          if (mData) setMetrics(mData);
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
    const interval = setInterval(loadData, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [statusFilter, refreshKey]);

  function handleOpenExecutionModal(item) {
    setSelectedOrder(item);
    setExecForm({
      procedureName: item.procedure_name || item.service_name,
      procedureType: item.procedure_type || (item.service_code === "PROC-DRESSING" ? "DRESSING" : item.service_code === "PROC-INJECTION" ? "INJECTION" : "GENERAL"),
      findings: item.findings || "",
      materialsUsed: item.materials_used || "",
      complications: item.complications || "None",
      procedureNotes: item.procedure_notes || item.clinical_notes || "",
      staff: user?.username || "",
    });
  }

  async function handleCallPatient(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.queue_entry_id);
      setError("");
      await queueService.updateQueueStatus(item.queue_entry_id, { status: "CALLED" });
      setSuccess(`${item.patient_first_name} ${item.patient_last_name} called to procedure room.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to call patient.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleStartProcedure(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.service_order_id);
      setError("");
      await procedureService.startProcedure(item.service_order_id);
      setSuccess(`Procedure started for ${item.patient_first_name} ${item.patient_last_name}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to start procedure.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleCompleteProcedure(e) {
    e.preventDefault();
    if (!selectedOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await procedureService.completeProcedure(selectedOrder.service_order_id, {
        procedureType: execForm.procedureType,
        procedureName: execForm.procedureName,
        findings: execForm.findings,
        materialsUsed: execForm.materialsUsed,
        complications: execForm.complications,
        procedureNotes: execForm.procedureNotes,
      });
      setSuccess(`Procedure completed and documented for ${selectedOrder.patient_first_name} ${selectedOrder.patient_last_name}.`);
      setSelectedOrder(null);
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
          item.queue_number?.toLowerCase().includes(q) ||
          item.doctor_last_name?.toLowerCase().includes(q)
        );
      })
    : queue;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <p className="page-eyebrow">Clinical Treatment & Interventions</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            Nursing & Clinical Procedures
          </h1>
          <p className="page-description">
            Executes doctor-ordered minor surgeries, wound care dressings, injections, and therapeutic procedures.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* Interactive Dashboard Box Buttons (Filter Cards) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Box 1: Waiting */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "WAITING" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "WAITING" ? "ALL" : "WAITING")}
          style={{
            borderLeft: "5px solid #f59e0b",
            background: statusFilter === "WAITING" ? "#fffbeb" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Waiting in Queue
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.waitingCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#fef3c7", borderRadius: "10px", color: "#d97706" }}>
              <Clock size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Ready for treatment</span>
            {statusFilter === "WAITING" && <span style={{ color: "#d97706", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 2: In Progress */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "IN_PROGRESS" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")}
          style={{
            borderLeft: "5px solid #d97706",
            background: statusFilter === "IN_PROGRESS" ? "#fffbeb" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                In Procedure Room
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.inProgressCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#fef3c7", borderRadius: "10px", color: "#b45309" }}>
              <Activity size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Currently performing</span>
            {statusFilter === "IN_PROGRESS" && <span style={{ color: "#d97706", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 3: Completed Today */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "COMPLETED" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED")}
          style={{
            borderLeft: "5px solid #059669",
            background: statusFilter === "COMPLETED" ? "#ecfdf5" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#047857", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Completed Today
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.completedToday : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#d1fae5", borderRadius: "10px", color: "#059669" }}>
              <CheckCircle2 size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Documented & discharged</span>
            {statusFilter === "COMPLETED" && <span style={{ color: "#059669", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 4: Total Procedures */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "ALL" ? "active" : ""}`}
          onClick={() => setStatusFilter("ALL")}
          style={{
            borderLeft: "5px solid #7c3aed",
            background: statusFilter === "ALL" ? "#f5f3ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Total Procedures
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.totalOrders : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#ede9fe", borderRadius: "10px", color: "#7c3aed" }}>
              <Layers size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>All procedural orders</span>
            {statusFilter === "ALL" && <span style={{ color: "#7c3aed", fontWeight: 700 }}>• Showing All</span>}
          </div>
        </button>
      </div>

      {/* Main Procedures Worklist Card with Spaced Patient Row Cards */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Procedure Room Queue ({filteredQueue.length})
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Authorized clinical procedures queued by payment confirmation with dedicated row spacing.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "10px", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search patient, MRN, doctor, procedure..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input text-sm"
              style={{ width: "300px", padding: "8px 12px 8px 34px", borderRadius: "8px" }}
            />
          </div>
        </div>

        {loading && <div className="p-8 text-center text-sm text-gray-500">Loading procedures...</div>}

        {!loading && filteredQueue.length === 0 && (
          <div className="empty-state p-10 text-center text-gray-400">
            <Stethoscope size={36} style={{ margin: "0 auto 8px", color: "#94a3b8" }} />
            <p>No procedure orders found matching the current filter.</p>
          </div>
        )}

        {!loading && filteredQueue.length > 0 && (
          <div className="table-responsive">
            <table
              className="table"
              style={{
                borderCollapse: "separate",
                borderSpacing: "0 8px",
                width: "100%",
              }}
            >
              <thead>
                <tr style={{ background: "transparent" }}>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Queue #</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Patient Name</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>MRN</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Age / Sex</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Procedure Name</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Ordering Doctor</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Priority</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Status</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item) => {
                  const isCompleted = item.queue_status === "COMPLETED" || item.procedure_status === "COMPLETED";

                  return (
                    <tr
                      key={item.queue_entry_id}
                      style={{
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
                        transition: "all 120ms ease",
                      }}
                    >
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderLeft: "4px solid #d97706", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>
                        <span className="font-mono font-bold text-primary">{item.queue_number}</span>
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                        <strong style={{ color: "#0f172a", fontSize: "13px" }}>{item.patient_first_name} {item.patient_last_name}</strong>
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                        <span className="font-mono text-xs text-gray-500">{item.patient_number}</span>
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", fontSize: "12px" }}>
                        {item.patient_age != null ? `${item.patient_age} yrs` : "—"} / {item.patient_gender || "—"}
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                        <strong className="text-xs text-amber-900">{item.service_name}</strong>
                        {item.clinical_notes && (
                          <span className="block text-[11px] text-gray-500">{item.clinical_notes}</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", fontSize: "12px" }}>
                        Dr. {item.doctor_first_name} {item.doctor_last_name}
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                        <span
                          className={`badge ${
                            item.priority === "EMERGENCY"
                              ? "badge-danger font-bold"
                              : item.priority === "URGENT"
                              ? "badge-warning font-bold"
                              : "badge-secondary"
                          }`}
                        >
                          {item.priority || "ROUTINE"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                        <StatusBadge status={item.procedure_status || item.queue_status} />
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderTopRightRadius: "8px", borderBottomRightRadius: "8px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                          {item.queue_status === "WAITING" && (
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => handleCallPatient(item)}
                              disabled={actionInFlight === item.queue_entry_id}
                              style={{ padding: "5px 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Volume2 size={13} />
                              Call
                            </button>
                          )}

                          {!isCompleted && item.procedure_status !== "IN_PROGRESS" && (
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => handleStartProcedure(item)}
                              disabled={actionInFlight === item.service_order_id}
                              style={{ padding: "5px 10px", fontSize: "12px", background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Play size={13} />
                              Start
                            </button>
                          )}

                          <button
                            type="button"
                            className="button button-primary button-sm font-bold"
                            onClick={() => handleOpenExecutionModal(item)}
                            style={{
                              padding: "5px 12px",
                              fontSize: "12px",
                              background: isCompleted ? "#4f46e5" : "#d97706",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <FileText size={13} />
                            {isCompleted ? "View Notes" : "Document & Complete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Procedure Documentation Modal */}
      {selectedOrder && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedOrder(null)}
          title={`Document Procedure: ${selectedOrder.patient_first_name} ${selectedOrder.patient_last_name}`}
          subtitle={`Procedure: ${selectedOrder.service_name} • MRN: ${selectedOrder.patient_number}`}
          maxWidth="700px"
        >
          <form onSubmit={handleCompleteProcedure} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Procedure Name</label>
                <input
                  type="text"
                  className="input"
                  value={execForm.procedureName}
                  onChange={(e) => setExecForm({ ...execForm, procedureName: e.target.value })}
                  style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Procedure Classification</label>
                <select
                  className="select"
                  value={execForm.procedureType}
                  onChange={(e) => setExecForm({ ...execForm, procedureType: e.target.value })}
                  style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                >
                  <option value="DRESSING">Wound Dressing / Bandaging</option>
                  <option value="INJECTION">Therapeutic Injection / IV Line</option>
                  <option value="SUTURE">Suturing / Suture Removal</option>
                  <option value="CATHETER">Catheterization / Tube Insertion</option>
                  <option value="GENERAL">General Minor Procedure</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Clinical Findings & Observations <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={3}
                className="textarea"
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Wound condition, drainage color/odor, skin integrity, patient tolerance..."
                value={execForm.findings}
                onChange={(e) => setExecForm({ ...execForm, findings: e.target.value })}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Materials & Supplies Used
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="e.g. Sterile gauze, 2x Betadine, 5ml syringe..."
                  value={execForm.materialsUsed}
                  onChange={(e) => setExecForm({ ...execForm, materialsUsed: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Complications / Adverse Events
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="e.g. None, mild bleeding, vasovagal reaction..."
                  value={execForm.complications}
                  onChange={(e) => setExecForm({ ...execForm, complications: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Detailed Procedure & Care Notes
              </label>
              <textarea
                rows={2}
                className="textarea"
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                placeholder="Discharge instructions, follow-up dressing date, home care advice..."
                value={execForm.procedureNotes}
                onChange={(e) => setExecForm({ ...execForm, procedureNotes: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setSelectedOrder(null)} className="button button-secondary">
                Close
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="button button-primary font-bold"
                style={{ background: "#d97706" }}
              >
                {submitting ? "Submitting..." : "Complete & Document Procedure"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
