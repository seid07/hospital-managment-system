import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatusBadge from "../components/common/StatusBadge";
import { radiologyService } from "../services/radiologyService";
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
  Scan,
  History,
} from "lucide-react";

export default function RadiologyQueue() {
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

  // Active Examination Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState("EXAM"); // 'EXAM', 'HISTORY'

  // Report Form state
  const [reportData, setReportData] = useState({
    modality: "X_RAY",
    clinicalIndication: "",
    technicianNotes: "",
    findings: "",
    impression: "",
    recommendations: "",
    reportText: "",
    radiologist: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [qData, mData] = await Promise.all([
          radiologyService.getRadiologyQueue({
            status: statusFilter === "ALL" ? undefined : statusFilter,
          }),
          radiologyService.getMetrics().catch(() => null),
        ]);
        if (!cancelled) {
          setQueue(qData || []);
          if (mData) setMetrics(mData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load radiology queue.");
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

  async function handleOpenExam(item) {
    setSelectedItem(item);
    setActiveTab("EXAM");
    setReportData({
      modality: item.modality || (item.service_code?.includes("ULTRASOUND") ? "ULTRASOUND" : "X_RAY"),
      clinicalIndication: item.clinical_indication || item.clinical_notes || "",
      technicianNotes: item.technician_notes || "",
      findings: item.findings || "",
      impression: item.impression || "",
      recommendations: item.recommendations || "",
      reportText: item.report_text || "",
      radiologist: user?.username || "",
    });

    try {
      setLoadingHistory(true);
      const history = await radiologyService.getPatientRadiologyHistory(item.patient_id);
      setPatientHistory((history || []).filter((h) => h.service_order_id !== item.service_order_id));
    } catch {
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleStartExam(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.service_order_id);
      setError("");
      await radiologyService.startExam(item.service_order_id);
      setSuccess(`Examination started for ${item.patient_first_name} ${item.patient_last_name}.`);
      setRefreshKey((k) => k + 1);
      if (selectedItem?.service_order_id === item.service_order_id) {
        setSelectedItem((prev) => ({ ...prev, queue_status: "IN_PROGRESS", radiology_status: "IN_PROGRESS" }));
      }
    } catch (err) {
      setError(err.message || "Failed to start examination.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleCallPatient(item) {
    if (actionInFlight) return;
    try {
      setActionInFlight(item.queue_entry_id);
      setError("");
      await queueService.updateQueueStatus(item.queue_entry_id, { status: "CALLED" });
      setSuccess(`${item.patient_first_name} ${item.patient_last_name} called to examination room.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to call patient.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!selectedItem || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await radiologyService.recordRadiologyResult(selectedItem.service_order_id, reportData);
      setSuccess(`Diagnostic report submitted for ${selectedItem.patient_first_name} ${selectedItem.patient_last_name}.`);
      setSelectedItem(null);
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
          <p className="page-eyebrow">Diagnostic Imaging Department</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            Radiology & Medical Imaging
          </h1>
          <p className="page-description">
            Executes diagnostic X-Rays, Ultrasound sonograms, and CT scans for authorized doctor orders.
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
            <span>Awaiting scan room</span>
            {statusFilter === "WAITING" && <span style={{ color: "#d97706", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 2: In Progress */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "IN_PROGRESS" ? "active" : ""}`}
          onClick={() => setStatusFilter(statusFilter === "IN_PROGRESS" ? "ALL" : "IN_PROGRESS")}
          style={{
            borderLeft: "5px solid #0284c7",
            background: statusFilter === "IN_PROGRESS" ? "#f0f9ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                In Progress
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.inProgressCount : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#e0f2fe", borderRadius: "10px", color: "#0284c7" }}>
              <Activity size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Currently scanning</span>
            {statusFilter === "IN_PROGRESS" && <span style={{ color: "#0284c7", fontWeight: 700 }}>• Active Filter</span>}
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
                Completed & Reported
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
            <span>Final signed reports</span>
            {statusFilter === "COMPLETED" && <span style={{ color: "#059669", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 4: Total Orders */}
        <button
          type="button"
          className={`dashboard-stat-btn ${statusFilter === "ALL" ? "active" : ""}`}
          onClick={() => setStatusFilter("ALL")}
          style={{
            borderLeft: "5px solid #4f46e5",
            background: statusFilter === "ALL" ? "#f5f3ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#4338ca", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Total Imaging Orders
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {metrics ? metrics.totalOrders : "—"}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#ede9fe", borderRadius: "10px", color: "#4f46e5" }}>
              <Layers size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>All imaging modalities</span>
            {statusFilter === "ALL" && <span style={{ color: "#4f46e5", fontWeight: 700 }}>• Showing All</span>}
          </div>
        </button>
      </div>

      {/* Main Radiology Worklist Card with Spaced Patient Row Cards */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
              Radiology Worklist Queue ({filteredQueue.length})
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Authorized doctor orders queued by payment timestamp with dedicated row spacing.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: "10px", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search patient, MRN, doctor, service..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="input text-sm"
              style={{ width: "300px", padding: "8px 12px 8px 34px", borderRadius: "8px" }}
            />
          </div>
        </div>

        {loading && <div className="p-8 text-center text-sm text-gray-500">Loading radiology examinations...</div>}

        {!loading && filteredQueue.length === 0 && (
          <div className="empty-state p-10 text-center text-gray-400">
            <Scan size={36} style={{ margin: "0 auto 8px", color: "#94a3b8" }} />
            <p>No radiology examinations found matching the current filter.</p>
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
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Imaging Service</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Ordering Doctor</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Priority</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none" }}>Status</th>
                  <th style={{ padding: "8px 14px", color: "#64748b", fontSize: "11px", fontWeight: 700, border: "none", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item) => {
                  const isCompleted = item.queue_status === "COMPLETED" || item.radiology_status === "REPORTED";

                  return (
                    <tr
                      key={item.queue_entry_id}
                      style={{
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
                        transition: "all 120ms ease",
                      }}
                    >
                      <td style={{ padding: "12px 14px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", borderLeft: "4px solid #0284c7", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>
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
                        <span className="badge badge-secondary mr-1.5 font-bold text-[11px]">
                          {item.modality === "ULTRASOUND" ? "US" : "XR"}
                        </span>
                        <span className="font-medium text-xs">{item.service_name}</span>
                        {item.clinical_indication && (
                          <span className="block text-[11px] text-gray-400">{item.clinical_indication}</span>
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
                        <StatusBadge status={item.radiology_status || item.queue_status} />
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

                          {!isCompleted && item.radiology_status !== "IN_PROGRESS" && (
                            <button
                              type="button"
                              className="button button-secondary button-sm"
                              onClick={() => handleStartExam(item)}
                              disabled={actionInFlight === item.service_order_id}
                              style={{ padding: "5px 10px", fontSize: "12px", background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <Play size={13} />
                              Start Scan
                            </button>
                          )}

                          <button
                            type="button"
                            className="button button-primary button-sm font-bold"
                            onClick={() => handleOpenExam(item)}
                            style={{
                              padding: "5px 12px",
                              fontSize: "12px",
                              background: isCompleted ? "#4f46e5" : "#0284c7",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <FileText size={13} />
                            {isCompleted ? "View Report" : "Enter Report"}
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

      {/* Examination & Reporting Modal */}
      {selectedItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          title={`Radiology Examination & Reporting: ${selectedItem.patient_first_name} ${selectedItem.patient_last_name}`}
          subtitle={`Service: ${selectedItem.service_name} • MRN: ${selectedItem.patient_number}`}
          maxWidth="750px"
        >
          {/* Modal Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", marginBottom: "16px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("EXAM")}
              style={{
                padding: "8px 14px",
                fontWeight: 700,
                fontSize: "13px",
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: activeTab === "EXAM" ? "2px solid #0284c7" : "2px solid transparent",
                color: activeTab === "EXAM" ? "#0284c7" : "#64748b",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FileText size={14} />
              Scan Details & Findings
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("HISTORY")}
              style={{
                padding: "8px 14px",
                fontWeight: 700,
                fontSize: "13px",
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: activeTab === "HISTORY" ? "2px solid #0284c7" : "2px solid transparent",
                color: activeTab === "HISTORY" ? "#0284c7" : "#64748b",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <History size={14} />
              Prior Imaging History ({patientHistory.length})
            </button>
          </div>

          {activeTab === "EXAM" && (
            <form onSubmit={handleSubmitReport} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Modality</label>
                  <select
                    className="select"
                    value={reportData.modality}
                    onChange={(e) => setReportData({ ...reportData, modality: e.target.value })}
                    style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                  >
                    <option value="X_RAY">Diagnostic X-Ray (Radiography)</option>
                    <option value="ULTRASOUND">Ultrasound Scan (Sonography)</option>
                    <option value="CT_SCAN">CT Scan</option>
                    <option value="MRI">MRI Scan</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>Clinical Indication</label>
                  <input
                    type="text"
                    className="input"
                    value={reportData.clinicalIndication}
                    onChange={(e) => setReportData({ ...reportData, clinicalIndication: e.target.value })}
                    style={{ width: "100%", marginTop: "4px", padding: "6px 10px", fontSize: "12px" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Radiological Findings <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  rows={4}
                  className="textarea"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="Detailed anatomical observations, opacity, bone alignment, organ dimensions..."
                  value={reportData.findings}
                  onChange={(e) => setReportData({ ...reportData, findings: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Diagnostic Impression / Summary <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  rows={2}
                  className="textarea"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="Definitive radiological diagnosis or differential conclusion..."
                  value={reportData.impression}
                  onChange={(e) => setReportData({ ...reportData, impression: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Recommendations & Clinical Advice
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", fontSize: "12px" }}
                  placeholder="e.g. Follow-up CT recommended, clinical correlation advised..."
                  value={reportData.recommendations}
                  onChange={(e) => setReportData({ ...reportData, recommendations: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                <button type="button" onClick={() => setSelectedItem(null)} className="button button-secondary">
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="button button-primary font-bold"
                  style={{ background: "#0284c7" }}
                >
                  {submitting ? "Submitting..." : "Sign & Finalize Report"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "HISTORY" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto" }}>
              {loadingHistory && <div className="p-4 text-center text-xs text-gray-500">Loading prior records...</div>}
              {!loadingHistory && patientHistory.length === 0 && (
                <div className="p-8 text-center text-xs text-gray-400">No prior imaging history for this patient.</div>
              )}
              {patientHistory.map((hist) => (
                <div key={hist.id} style={{ padding: "10px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc", fontSize: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>{hist.service_name || hist.modality}</span>
                    <span style={{ color: "#64748b" }}>{new Date(hist.reported_at || hist.created_at).toLocaleDateString()}</span>
                  </div>
                  {hist.impression && (
                    <div style={{ marginTop: "4px", color: "#1e293b" }}>
                      <strong>Impression:</strong> {hist.impression}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </AppShell>
  );
}
