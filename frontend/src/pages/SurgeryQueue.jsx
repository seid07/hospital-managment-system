import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatusBadge from "../components/common/StatusBadge";
import { surgeryService } from "../services/surgeryService";
import {
  Calendar,
  Clock,
  HeartPulse,
  CheckCircle2,
  Layers,
  Search,
  FileText,
  Play,
  Eye,
  Hospital,
} from "lucide-react";

export default function SurgeryQueue() {
  const [metrics, setMetrics] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");

  // Modals
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [checklist, setChecklist] = useState({
    theatreRoom: "OT-1",
    assistantName: "",
    anesthetistName: "",
    anesthesiaAssessment: "",
    anesthesiaType: "GENERAL",
    consentConfirmed: false,
    allergiesReviewed: false,
    siteConfirmed: false,
    equipmentConfirmed: false,
    bloodAvailability: false,
    preOpChecklistComplete: false,
    scheduledAt: "",
  });

  const [showIntraOpModal, setShowIntraOpModal] = useState(false);
  const [intraOpForm, setIntraOpForm] = useState({
    surgeryName: "",
    theatreRoom: "OT-1",
    assistantName: "",
    anesthetistName: "",
    preOpDiagnosis: "",
    postOpDiagnosis: "",
    anesthesiaType: "GENERAL",
    intraOpFindings: "",
    specimens: "",
    complications: "",
    bloodLossMl: 0,
    implantsUsed: "",
    operationNotes: "",
    postOpInstructions: "",
    recoveryDestination: "WARD",
    recoveryStatus: "STABLE",
    status: "COMPLETED",
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [qData, mData] = await Promise.all([
          surgeryService.getSurgeryQueue({
            status: statusFilter === "ALL" ? undefined : statusFilter,
          }),
          surgeryService.getMetrics().catch(() => null),
        ]);
        if (!cancelled) {
          setQueue(qData || []);
          if (mData) setMetrics(mData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load the surgery queue.");
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

  function handleOpenChecklist(item) {
    setSelectedOrder(item);
    setChecklist({
      theatreRoom: item.theatre_room || "OT-1",
      assistantName: item.assistant_name || "",
      anesthetistName: item.anesthetist_name || "",
      anesthesiaAssessment: item.anesthesia_assessment || "Mallampati Class I, airway clear, ASA II. Cleared for general anesthesia.",
      anesthesiaType: item.anesthesia_type || "GENERAL",
      consentConfirmed: Boolean(item.consent_confirmed),
      allergiesReviewed: Boolean(item.allergies_reviewed),
      siteConfirmed: Boolean(item.site_confirmed),
      equipmentConfirmed: Boolean(item.equipment_confirmed),
      bloodAvailability: true,
      preOpChecklistComplete: Boolean(item.preOpChecklistComplete ?? item.pre_op_checklist_complete),
      scheduledAt: item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0, 16) : "",
    });
    setShowChecklistModal(true);
  }

  function handleOpenIntraOp(item) {
    setSelectedOrder(item);
    setIntraOpForm({
      surgeryName: item.surgery_name || item.service_name,
      theatreRoom: item.theatre_room || "OT-1",
      assistantName: item.assistant_name || "",
      anesthetistName: item.anesthetist_name || "",
      preOpDiagnosis: item.pre_op_diagnosis || item.clinical_notes || "",
      postOpDiagnosis: item.post_op_diagnosis || item.pre_op_diagnosis || item.clinical_notes || "",
      anesthesiaType: item.anesthesia_type || "GENERAL",
      intraOpFindings: item.intra_op_findings || "",
      specimens: item.specimens || "",
      complications: item.complications || "None observed. Hemostasis achieved.",
      bloodLossMl: item.blood_loss_ml || 50,
      implantsUsed: item.implants_used || "None",
      operationNotes: item.operation_notes || "",
      postOpInstructions: item.post_op_instructions || "Transfer to recovery, monitor vitals q15m x 1h, then transfer to ward.",
      recoveryDestination: item.recovery_destination || "WARD",
      recoveryStatus: item.recovery_status || "STABLE",
      status: "COMPLETED",
    });
    setShowIntraOpModal(true);
  }

  async function handleSaveChecklist(e) {
    e.preventDefault();
    if (!selectedOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await surgeryService.updateChecklist(selectedOrder.service_order_id, checklist);
      setSuccess("Pre-operative checklist saved.");
      setShowChecklistModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to save checklist.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartSurgery() {
    if (!selectedOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await surgeryService.updateChecklist(selectedOrder.service_order_id, {
        ...checklist,
        preOpChecklistComplete: true,
      });
      await surgeryService.startSurgery(selectedOrder.service_order_id, {
        theatreRoom: checklist.theatreRoom,
        anesthesiaType: checklist.anesthesiaType,
        assistantName: checklist.assistantName,
        anesthetistName: checklist.anesthetistName,
      });
      setSuccess("Surgery started and marked IN_THEATRE.");
      setShowChecklistModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to start surgery.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteSurgery(e) {
    e.preventDefault();
    if (!selectedOrder || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await surgeryService.completeSurgery(selectedOrder.service_order_id, intraOpForm);
      setSuccess("Operative record completed and patient transferred to recovery.");
      setShowIntraOpModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to complete surgery.");
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
          item.surgery_name?.toLowerCase().includes(q) ||
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
          <p className="page-eyebrow">Surgical Services & Operating Suite</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            Operating Theatre & Surgery
          </h1>
          <p className="page-description">
            Surgical scheduling, WHO pre-op safety checklists, theatre room operations, and post-anesthesia recovery logs.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* Interactive Dashboard Box Buttons (Filter Cards) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Box 1: Scheduled */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "SCHEDULED" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "SCHEDULED" ? "ALL" : "SCHEDULED")}
          style={{
            borderLeft: "5px solid #4f46e5",
            background: statusFilter === "SCHEDULED" ? "#f5f3ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#4338ca", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Scheduled
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.scheduledCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#ede9fe", borderRadius: "10px", color: "#4f46e5" }}>
              <Calendar size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Booked for OT</span>
            {statusFilter === "SCHEDULED" && <span style={{ color: "#4f46e5", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 2: Pre-Op Prep */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "PRE_OP" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "PRE_OP" ? "ALL" : "PRE_OP")}
          style={{
            borderLeft: "5px solid #f59e0b",
            background: statusFilter === "PRE_OP" ? "#fffbeb" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Pre-Op Preparation
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.preOpCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#fef3c7", borderRadius: "10px", color: "#d97706" }}>
              <Clock size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Checklist & Anesthesia</span>
            {statusFilter === "PRE_OP" && <span style={{ color: "#d97706", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 3: In Operating Theatre */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "IN_THEATRE" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "IN_THEATRE" ? "ALL" : "IN_THEATRE")}
          style={{
            borderLeft: "5px solid #dc2626",
            background: statusFilter === "IN_THEATRE" ? "#fef2f2" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                In Operating Theatre
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#dc2626", margin: "4px 0" }}>
                {metrics ? metrics.inTheatreCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#fee2e2", borderRadius: "10px", color: "#dc2626" }}>
              <HeartPulse size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Active surgical team</span>
            {statusFilter === "IN_THEATRE" && <span style={{ color: "#dc2626", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 4: Recovery */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "RECOVERY" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "RECOVERY" ? "ALL" : "RECOVERY")}
          style={{
            borderLeft: "5px solid #0284c7",
            background: statusFilter === "RECOVERY" ? "#f0f9ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Post-Op Recovery
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0284c7", margin: "4px 0" }}>
                {metrics ? metrics.recoveryCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#e0f2fe", borderRadius: "10px", color: "#0284c7" }}>
              <Hospital size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>PACU Monitoring</span>
            {statusFilter === "RECOVERY" && <span style={{ color: "#0284c7", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 5: Completed Surgeries */}
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
                Completed
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
            <span>Operative log signed</span>
            {statusFilter === "COMPLETED" && <span style={{ color: "#059669", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 6: Total Surgeries */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "ALL" ? "active" : ""}`}
          onClick={() => setStatusFilter("ALL")}
          style={{
            borderLeft: "5px solid #64748b",
            background: statusFilter === "ALL" ? "#f8fafc" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Total Surgeries
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.totalOrders : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#f1f5f9", borderRadius: "10px", color: "#64748b" }}>
              <Layers size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>All surgical cases</span>
            {statusFilter === "ALL" && <span style={{ color: "#475569", fontWeight: 700 }}>• Showing All</span>}
          </div>
        </button>
      </div>

      {/* Main Surgery Worklist Card with Spaced Patient Row Cards */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Operating Theatre Schedule & Worklist ({filteredQueue.length})
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Authorized surgical cases booked from outpatient consultations and inpatient wards with dedicated row spacing.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "10px", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search patient, MRN, surgeon, procedure..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input text-sm"
              style={{ width: "300px", padding: "8px 12px 8px 34px", borderRadius: "8px" }}
            />
          </div>
        </div>

        {loading && <div className="p-8 text-center text-sm text-gray-500">Loading surgical cases...</div>}

        {!loading && filteredQueue.length === 0 && (
          <div className="empty-state p-10 text-center text-gray-400">
            <Hospital size={36} style={{ margin: "0 auto 8px", color: "#94a3b8" }} />
            <p>No surgical procedures found matching the current filter.</p>
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
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Surgical Procedure</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Room / Anesthesia</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Surgeon</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Priority</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Status</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item) => {
                  const isCompleted = item.surgery_status === "COMPLETED";
                  const inTheatre = item.surgery_status === "IN_THEATRE";
                  const inRecovery = item.surgery_status === "RECOVERY";

                  return (
                    <tr
                      key={item.queue_entry_id}
                      style={{
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
                        transition: "all 120ms ease",
                      }}
                    >
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderLeft: "4px solid #dc2626", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>
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
                        <strong className="text-xs text-rose-900">{item.surgery_name || item.service_name}</strong>
                        {item.pre_op_diagnosis && (
                          <span className="block text-[11px] text-gray-500">Dx: {item.pre_op_diagnosis}</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", fontSize: "12px" }}>
                        <span className="badge badge-secondary mr-1 font-bold">{item.theatre_room || "OT-1"}</span>
                        <span className="text-gray-600">{item.anesthesia_type || "GA"}</span>
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
                        <StatusBadge status={item.surgery_status || item.queue_status} />
                      </td>
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", borderTopRightRadius: "8px", borderBottomRightRadius: "8px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                          {!isCompleted && !inTheatre && !inRecovery && (
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => handleOpenChecklist(item)}
                              style={{ padding: "5px 10px", fontSize: "12px", background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <FileText size={13} />
                              Pre-Op Checklist
                            </button>
                          )}

                          {inTheatre && (
                            <button
                              type="button"
                              className="button button-primary button-sm font-bold"
                              onClick={() => handleOpenIntraOp(item)}
                              style={{ padding: "5px 12px", fontSize: "12px", background: "#dc2626", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Play size={13} />
                              Record Operative Report
                            </button>
                          )}

                          {isCompleted && (
                            <button
                              type="button"
                              className="button button-secondary button-sm font-bold"
                              onClick={() => handleOpenIntraOp(item)}
                              style={{ padding: "5px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Eye size={13} />
                              View Operative Log
                            </button>
                          )}
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

      {/* Pre-Op Safety Checklist Modal */}
      {showChecklistModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowChecklistModal(false)}
          title={`Pre-Operative Safety Checklist: ${selectedOrder?.patient_first_name} ${selectedOrder?.patient_last_name}`}
          subtitle={`Surgery: ${selectedOrder?.surgery_name} • MRN: ${selectedOrder?.patient_number}`}
          maxWidth="680px"
        >
          <form onSubmit={handleSaveChecklist} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Assigned Theatre Room</label>
                <select
                  className="select"
                  value={checklist.theatreRoom}
                  onChange={(e) => setChecklist({ ...checklist, theatreRoom: e.target.value })}
                  style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                >
                  <option value="OT-1">Operating Theatre 1 (Main General)</option>
                  <option value="OT-2">Operating Theatre 2 (Orthopedic)</option>
                  <option value="OT-3">Operating Theatre 3 (Obstetric / Gynae)</option>
                  <option value="OT-Emergency">Emergency Trauma Suite</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Anesthesia Type</label>
                <select
                  className="select"
                  value={checklist.anesthesiaType}
                  onChange={(e) => setChecklist({ ...checklist, anesthesiaType: e.target.value })}
                  style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                >
                  <option value="GENERAL">General Anesthesia</option>
                  <option value="SPINAL">Spinal / Epidural</option>
                  <option value="LOCAL">Local Anesthesia</option>
                  <option value="SEDATION">Monitored Sedation</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Anesthetist Specialist Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Dr. Yohannes"
                  value={checklist.anesthetistName}
                  onChange={(e) => setChecklist({ ...checklist, anesthetistName: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Surgical Assistant / Scrub Nurse
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Nurse Tigist"
                  value={checklist.assistantName}
                  onChange={(e) => setChecklist({ ...checklist, assistantName: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                />
              </div>
            </div>

            {/* WHO Surgical Safety Checklist Checkboxes */}
            <div style={{ background: "#f0fdf4", padding: "14px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
              <strong style={{ fontSize: "12px", color: "#166534", display: "block", marginBottom: "8px" }}>
                WHO Surgical Safety Verification:
              </strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checklist.consentConfirmed}
                    onChange={(e) => setChecklist({ ...checklist, consentConfirmed: e.target.checked })}
                  />
                  Patient Informed Consent Signed
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checklist.siteConfirmed}
                    onChange={(e) => setChecklist({ ...checklist, siteConfirmed: e.target.checked })}
                  />
                  Surgical Site Marked & Verified
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checklist.allergiesReviewed}
                    onChange={(e) => setChecklist({ ...checklist, allergiesReviewed: e.target.checked })}
                  />
                  Known Allergies Reviewed
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checklist.equipmentConfirmed}
                    onChange={(e) => setChecklist({ ...checklist, equipmentConfirmed: e.target.checked })}
                  />
                  Sterile Instruments & Packs Ready
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Pre-Anesthesia Assessment Notes
              </label>
              <textarea
                rows={2}
                className="textarea"
                value={checklist.anesthesiaAssessment}
                onChange={(e) => setChecklist({ ...checklist, anesthesiaAssessment: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowChecklistModal(false)} className="button button-secondary">
                Cancel
              </button>

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="submit" disabled={submitting} className="button button-secondary">
                  Save Draft Checklist
                </button>
                <button
                  type="button"
                  onClick={handleStartSurgery}
                  disabled={submitting || !checklist.consentConfirmed || !checklist.siteConfirmed}
                  className="button button-primary font-bold"
                  style={{ background: "#dc2626" }}
                >
                  Start Surgery (In Theatre)
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Intra-Operative & Post-Op Report Modal */}
      {showIntraOpModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowIntraOpModal(false)}
          title={`Surgical Operative Report: ${selectedOrder?.patient_first_name} ${selectedOrder?.patient_last_name}`}
          subtitle={`Surgery: ${selectedOrder?.surgery_name} • Theatre Room: ${intraOpForm.theatreRoom}`}
          maxWidth="750px"
        >
          <form onSubmit={handleCompleteSurgery} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Pre-Operative Diagnosis
                </label>
                <input
                  type="text"
                  className="input"
                  value={intraOpForm.preOpDiagnosis}
                  onChange={(e) => setIntraOpForm({ ...intraOpForm, preOpDiagnosis: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Post-Operative Diagnosis <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={intraOpForm.postOpDiagnosis}
                  onChange={(e) => setIntraOpForm({ ...intraOpForm, postOpDiagnosis: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Intra-Operative Surgical Findings <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={3}
                className="textarea"
                placeholder="Tissue pathology, organ appearance, adhesions, anatomical variants..."
                value={intraOpForm.intraOpFindings}
                onChange={(e) => setIntraOpForm({ ...intraOpForm, intraOpFindings: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Operative Procedure Technique & Steps <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={4}
                className="textarea"
                placeholder="Incision site, dissection planes, ligation, closure layers, suture materials..."
                value={intraOpForm.operationNotes}
                onChange={(e) => setIntraOpForm({ ...intraOpForm, operationNotes: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Estimated Blood Loss (mL)
                </label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={intraOpForm.bloodLossMl}
                  onChange={(e) => setIntraOpForm({ ...intraOpForm, bloodLossMl: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Recovery Destination
                </label>
                <select
                  className="select"
                  value={intraOpForm.recoveryDestination}
                  onChange={(e) => setIntraOpForm({ ...intraOpForm, recoveryDestination: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                >
                  <option value="WARD">General Inpatient Ward</option>
                  <option value="ICU">Intensive Care Unit (ICU)</option>
                  <option value="PACU">PACU Recovery Room</option>
                  <option value="DAY_SURGERY">Day Surgery Discharge</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Post-Anesthesia Status
                </label>
                <select
                  className="select"
                  value={intraOpForm.recoveryStatus}
                  onChange={(e) => setIntraOpForm({ ...intraOpForm, recoveryStatus: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
                >
                  <option value="STABLE">Stable / Extubated</option>
                  <option value="MONITORED">Monitored / Sedated</option>
                  <option value="CRITICAL">Critical / Ventilated</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Post-Operative Instructions & Ward Orders
              </label>
              <textarea
                rows={2}
                className="textarea"
                value={intraOpForm.postOpInstructions}
                onChange={(e) => setIntraOpForm({ ...intraOpForm, postOpInstructions: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowIntraOpModal(false)} className="button button-secondary">
                Close
              </button>
              {selectedOrder?.surgery_status !== "COMPLETED" && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="button button-primary font-bold"
                  style={{ background: "#059669" }}
                >
                  {submitting ? "Finalizing..." : "Sign Operative Log & Send to Recovery"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
