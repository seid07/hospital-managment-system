import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatusBadge from "../components/common/StatusBadge";
import { wardService } from "../services/wardService";
import { formatCurrency } from "../utils/currency";
import { useToast } from "../context/useToast";
import { useCalendar } from "../context/useCalendar";
import {
  Bed,
  CheckCircle2,
  Wrench,
  FileText,
  Plus,
  ArrowRightLeft,
  LogOut,
  Check,
  UserCheck,
} from "lucide-react";

export default function WardInpatient() {
  const toast = useToast();
  const { formatDate } = useCalendar();
  const [metrics, setMetrics] = useState(null);
  const [beds, setBeds] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeWardFilter, setActiveWardFilter] = useState("ALL");
  const [activeStatusFilter, setActiveStatusFilter] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);
  const [selectedBedId, setSelectedBedId] = useState("");
  const [admissionReason, setAdmissionReason] = useState("");
  const [admitBedTypeFilter, setAdmitBedTypeFilter] = useState("ALL");
  const [admitWardFilter, setAdmitWardFilter] = useState("ALL");

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [activeTransferBed, setActiveTransferBed] = useState(null);
  const [destBedId, setDestBedId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [activeDischargeBed, setActiveDischargeBed] = useState(null);
  const [dischargeForm, setDischargeForm] = useState({
    dischargeDiagnosis: "",
    dischargeSummary: "",
    dischargeMedications: "",
    dischargeFollowUp: "",
    dischargeInstructions: "",
  });

  const [showAddBedModal, setShowAddBedModal] = useState(false);
  const [bedForm, setBedForm] = useState({
    bedNumber: "",
    wardName: "General Male Ward",
    roomNumber: "",
    bedType: "STANDARD",
    dailyRate: 400.0,
    status: "AVAILABLE",
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        setLoading(true);
        setError("");
        const [mRes, bRes, qRes] = await Promise.all([
          wardService.getMetrics().catch(() => null),
          wardService.getBeds(),
          wardService.getWardQueue(),
        ]);
        if (!cancelled) {
          if (mRes) setMetrics(mRes);
          setBeds(bRes || []);
          setQueue(qRes || []);
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
    const interval = setInterval(loadData, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshKey]);

  const wardNames = Array.from(new Set(beds.map((b) => b.ward_name || "General Ward")));

  const filteredBeds = beds.filter((b) => {
    const matchesWard = activeWardFilter === "ALL" || b.ward_name === activeWardFilter;
    const matchesStatus = activeStatusFilter === "ALL" || b.status === activeStatusFilter;
    return matchesWard && matchesStatus;
  });

  const bedsByWard = filteredBeds.reduce((acc, bed) => {
    const ward = bed.ward_name || "General Ward";
    if (!acc[ward]) acc[ward] = [];
    acc[ward].push(bed);
    return acc;
  }, {});

  function handleOpenAdmit(item) {
    setSelectedQueueItem(item);
    setAdmissionReason(item.clinical_notes || "");
    setAdmitBedTypeFilter("ALL");
    setAdmitWardFilter("ALL");
    const availableBed = beds.find(
      (b) => b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED")
    );
    setSelectedBedId(availableBed ? availableBed.id : "");
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
        doctorId: selectedQueueItem.ordering_doctor_id || null,
        admissionReason,
      });
      const msg = `Patient ${selectedQueueItem.patient_first_name} ${selectedQueueItem.patient_last_name} admitted and assigned to bed.`;
      setSuccess(msg);
      toast.success(msg, 5000);
      setShowAdmitModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errMsg = err.message || "Failed to admit patient.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenTransfer(bed) {
    setActiveTransferBed(bed);
    const otherAvailable = beds.find(
      (b) =>
        (b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED")) &&
        b.id !== bed.id
    );
    setDestBedId(otherAvailable ? otherAvailable.id : "");
    setTransferReason("");
    setShowTransferModal(true);
  }

  async function handleTransferSubmit(e) {
    e.preventDefault();
    if (!activeTransferBed?.current_admission_id || !destBedId || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await wardService.transferBed(activeTransferBed.current_admission_id, {
        toBedId: destBedId,
        transferReason,
      });
      const msg = `Patient ${activeTransferBed.patient_first_name} ${activeTransferBed.patient_last_name} transferred successfully.`;
      setSuccess(msg);
      toast.success(msg, 5000);
      setShowTransferModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errMsg = err.message || "Failed to transfer patient.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenDischarge(bed) {
    setActiveDischargeBed(bed);
    setDischargeForm({
      dischargeDiagnosis: bed.patient_diagnosis || "",
      dischargeSummary: "Patient completed prescribed course of inpatient treatment. Vital signs stable.",
      dischargeMedications: "",
      dischargeFollowUp: "Follow-up at outpatient clinic in 1 week.",
      dischargeInstructions: "Continue prescribed oral medications, maintain hydration, seek immediate care if high fever recurs.",
    });
    setShowDischargeModal(true);
  }

  async function handleDischargeSubmit(e) {
    e.preventDefault();
    if (!activeDischargeBed?.current_admission_id || submitting) return;
    try {
      setSubmitting(true);
      setError("");
      await wardService.dischargePatient(activeDischargeBed.current_admission_id, dischargeForm);
      const msg = `Patient ${activeDischargeBed.patient_first_name} ${activeDischargeBed.patient_last_name} discharged and bed marked for cleaning.`;
      setSuccess(msg);
      toast.success(msg, 5000);
      setShowDischargeModal(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errMsg = err.message || "Failed to discharge patient.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddBedSubmit(e) {
    e.preventDefault();
    if (!bedForm.bedNumber.trim()) {
      setError("Please enter a bed number / code.");
      toast.error("Please enter a bed number / code.", 5000);
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await wardService.createBed({
        wardName: bedForm.wardName,
        bedNumber: bedForm.bedNumber.trim(),
        roomNumber: bedForm.roomNumber.trim() || null,
        bedType: bedForm.bedType,
        dailyRate: parseFloat(bedForm.dailyRate) || 400.0,
        status: bedForm.status || "AVAILABLE",
        notes: bedForm.notes.trim() || null,
      });
      const msg = `Bed ${bedForm.bedNumber} added to ${bedForm.wardName} successfully.`;
      setSuccess(msg);
      toast.success(msg, 5000);
      setShowAddBedModal(false);
      setBedForm({
        bedNumber: "",
        wardName: "General Male Ward",
        roomNumber: "",
        bedType: "STANDARD",
        dailyRate: 400.0,
        status: "AVAILABLE",
        notes: "",
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || "Failed to add bed.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatus(bedId, newStatus) {
    try {
      setError("");
      await wardService.updateBedStatus(bedId, newStatus);
      const msg = `Bed status updated to ${newStatus}.`;
      setSuccess(msg);
      toast.success(msg, 5000);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const errMsg = err.message || "Failed to update bed status.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    }
  }

  const availableBedsCount = beds.filter((b) => b.status === "AVAILABLE").length;
  const occupiedBedsCount = beds.filter((b) => b.status === "OCCUPIED").length;
  const maintenanceBedsCount = beds.filter((b) => b.status === "MAINTENANCE" || b.status === "CLEANING" || b.status === "RESERVED").length;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <p className="page-eyebrow">Inpatient Ward & Bed Capacity</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            Inpatient Ward Management
          </h1>
          <p className="page-description">
            Live occupancy tracking, bed allocations, patient transfers, and discharge management across all hospital wards.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button-primary font-bold"
            onClick={() => setShowAddBedModal(true)}
            style={{
              background: "#4f46e5",
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
              padding: "9px 18px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={16} />
            Add Bed
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* Interactive Dashboard Box Buttons (KPI & Filter Cards) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Box 1: Total Beds */}
        <button
          type="button"
          className={`dashboard-stat-btn ${activeStatusFilter === "ALL" ? "active" : ""}`}
          onClick={() => setActiveStatusFilter("ALL")}
          style={{
            borderLeft: "5px solid #4f46e5",
            background: activeStatusFilter === "ALL" ? "#f5f3ff" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#4338ca", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Total Hospital Beds
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1e293b", margin: "4px 0" }}>
                {beds.length}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#ede9fe", borderRadius: "10px", color: "#4f46e5" }}>
              <Bed size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>All hospital wards</span>
            {activeStatusFilter === "ALL" && <span style={{ color: "#4f46e5", fontWeight: 700 }}>• Showing All</span>}
          </div>
        </button>

        {/* Box 2: Available Beds */}
        <button
          type="button"
          className={`dashboard-stat-btn ${activeStatusFilter === "AVAILABLE" ? "active" : ""}`}
          onClick={() => setActiveStatusFilter(activeStatusFilter === "AVAILABLE" ? "ALL" : "AVAILABLE")}
          style={{
            borderLeft: "5px solid #059669",
            background: activeStatusFilter === "AVAILABLE" ? "#ecfdf5" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#047857", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Available Beds
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#059669", margin: "4px 0" }}>
                {availableBedsCount}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#d1fae5", borderRadius: "10px", color: "#059669" }}>
              <CheckCircle2 size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Ready for admission</span>
            {activeStatusFilter === "AVAILABLE" && <span style={{ color: "#059669", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 3: Occupied Beds */}
        <button
          type="button"
          className={`dashboard-stat-btn ${activeStatusFilter === "OCCUPIED" ? "active" : ""}`}
          onClick={() => setActiveStatusFilter(activeStatusFilter === "OCCUPIED" ? "ALL" : "OCCUPIED")}
          style={{
            borderLeft: "5px solid #e11d48",
            background: activeStatusFilter === "OCCUPIED" ? "#fff1f2" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#be123c", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Occupied Beds
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#e11d48", margin: "4px 0" }}>
                {occupiedBedsCount}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#ffe4e6", borderRadius: "10px", color: "#e11d48" }}>
              <UserCheck size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Admitted inpatients</span>
            {activeStatusFilter === "OCCUPIED" && <span style={{ color: "#e11d48", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 4: Maintenance / Cleaning */}
        <button
          type="button"
          className={`dashboard-stat-btn ${activeStatusFilter === "MAINTENANCE" ? "active" : ""}`}
          onClick={() => setActiveStatusFilter(activeStatusFilter === "MAINTENANCE" ? "ALL" : "MAINTENANCE")}
          style={{
            borderLeft: "5px solid #d97706",
            background: activeStatusFilter === "MAINTENANCE" ? "#fffbeb" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Cleaning / Maint.
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#d97706", margin: "4px 0" }}>
                {maintenanceBedsCount}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#fef3c7", borderRadius: "10px", color: "#d97706" }}>
              <Wrench size={20} />
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "12px", color: "#64748b" }}>
            <span>Sanitization in progress</span>
            {activeStatusFilter === "MAINTENANCE" && <span style={{ color: "#d97706", fontWeight: 700 }}>• Active Filter</span>}
          </div>
        </button>

        {/* Box 5: Admission Queue Requests */}
        <div
          className="dashboard-stat-btn"
          style={{
            borderLeft: "5px solid #0284c7",
            cursor: "default",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Pending Admissions
              </span>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#0284c7", margin: "4px 0" }}>
                {metrics?.waitingAdmissions != null ? metrics.waitingAdmissions : queue.length}
              </div>
            </div>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", background: "#e0f2fe", borderRadius: "10px", color: "#0284c7" }}>
              <FileText size={20} />
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            <span>Doctor requests awaiting bed</span>
          </div>
        </div>
      </div>

      {/* Admission Queue Card with Spaced Patient Row Cards */}
      {queue.length > 0 && (
        <div className="card" style={{ marginBottom: "24px", border: "1px solid #bae6fd", background: "#f0f9ff", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0369a1" }}>
                Pending Doctor Admission Requests ({queue.length})
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#0284c7" }}>
                Patients authorized for inpatient admission awaiting bed allocation.
              </p>
            </div>
          </div>

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
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Queue #</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Patient Name</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>MRN</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Age / Sex</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Admission Reason</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Doctor</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none" }}>Priority</th>
                  <th style={{ padding: "8px 14px", color: "#0369a1", fontSize: "11px", fontWeight: 700, border: "none", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr
                    key={item.queue_entry_id}
                    style={{
                      background: "#ffffff",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
                    }}
                  >
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd", borderLeft: "4px solid #0284c7", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px" }}>
                      <span className="font-mono font-bold text-primary">{item.queue_number}</span>
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd" }}>
                      <strong style={{ color: "#0f172a" }}>{item.patient_first_name} {item.patient_last_name}</strong>
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd" }}>
                      <span className="font-mono text-xs text-gray-500">{item.patient_number}</span>
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd", fontSize: "12px" }}>
                      {item.patient_age != null ? `${item.patient_age} yrs` : "—"} / {item.patient_gender || "—"}
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd", fontSize: "12px", color: "#334155" }}>
                      {item.clinical_notes || "Inpatient Care"}
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd", fontSize: "12px" }}>
                      Dr. {item.doctor_first_name} {item.doctor_last_name}
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd" }}>
                      <span className={`badge ${item.priority === "EMERGENCY" ? "badge-danger font-bold" : item.priority === "URGENT" ? "badge-warning font-bold" : "badge-secondary"}`}>
                        {item.priority || "ROUTINE"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", borderTop: "1px solid #bae6fd", borderBottom: "1px solid #bae6fd", borderRight: "1px solid #bae6fd", borderTopRightRadius: "8px", borderBottomRightRadius: "8px", textAlign: "right" }}>
                      <button
                        type="button"
                        className="button button-primary button-sm font-bold"
                        onClick={() => handleOpenAdmit(item)}
                        style={{ padding: "5px 14px", fontSize: "12px", background: "#0284c7", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <Bed size={13} />
                        Assign Bed & Admit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ward Filter Pills */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "18px", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#475569", marginRight: "4px" }}>
          Filter Ward:
        </span>
        <button
          type="button"
          onClick={() => setActiveWardFilter("ALL")}
          style={{
            padding: "6px 14px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: 700,
            border: "1px solid",
            borderColor: activeWardFilter === "ALL" ? "#4f46e5" : "#cbd5e1",
            background: activeWardFilter === "ALL" ? "#4f46e5" : "#ffffff",
            color: activeWardFilter === "ALL" ? "#ffffff" : "#475569",
            cursor: "pointer",
            transition: "all 120ms ease",
          }}
        >
          All Wards ({beds.length})
        </button>

        {wardNames.map((ward) => {
          const count = beds.filter((b) => b.ward_name === ward).length;
          const isSelected = activeWardFilter === ward;
          return (
            <button
              key={ward}
              type="button"
              onClick={() => setActiveWardFilter(ward)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                border: "1px solid",
                borderColor: isSelected ? "#4f46e5" : "#cbd5e1",
                background: isSelected ? "#4f46e5" : "#ffffff",
                color: isSelected ? "#ffffff" : "#475569",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
            >
              {ward} ({count})
            </button>
          );
        })}
      </div>

      {/* Bed Grid by Ward */}
      {loading && <div className="p-8 text-center text-sm text-gray-500">Loading ward beds...</div>}

      {!loading && Object.keys(bedsByWard).length === 0 && (
        <div className="empty-state p-12 text-center text-gray-400">
          <Bed size={40} style={{ margin: "0 auto 8px", color: "#94a3b8" }} />
          <p>No hospital beds match the selected ward and status filters.</p>
        </div>
      )}

      {!loading && Object.entries(bedsByWard).map(([ward, wardBeds]) => (
        <div key={ward} className="card" style={{ marginBottom: "20px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "10px", borderBottom: "1px solid #e2e8f0" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                {ward}
              </h2>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                {wardBeds.filter((b) => b.status === "AVAILABLE").length} Available / {wardBeds.length} Total
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
              gap: "14px",
            }}
          >
            {wardBeds.map((bed) => {
              const isOccupied = bed.status === "OCCUPIED";
              const isAvailable = bed.status === "AVAILABLE";

              return (
                <div
                  key={bed.id}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid",
                    borderColor: isOccupied ? "#fecdd3" : isAvailable ? "#a7f3d0" : "#fed7aa",
                    background: isOccupied ? "#fff1f2" : isAvailable ? "#ecfdf5" : "#fffbeb",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div>
                    {/* Bed Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Bed size={16} color="#475569" />
                        <strong style={{ fontSize: "16px", color: "#0f172a", fontFamily: "monospace" }}>
                          {bed.bed_number}
                        </strong>
                        {bed.room_number && (
                          <span style={{ fontSize: "11px", background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                            Rm {bed.room_number}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={bed.status} />
                    </div>

                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px" }}>
                      Type: <strong>{bed.bed_type}</strong> • Rate: <strong>{formatCurrency(bed.daily_rate)}/day</strong>
                    </div>

                    {/* Occupant Info */}
                    {isOccupied && bed.patient_id ? (
                      <div style={{ background: "#ffffff", padding: "10px", borderRadius: "8px", border: "1px solid #fda4af", fontSize: "12px", marginBottom: "12px" }}>
                        <div style={{ fontWeight: 700, color: "#881337" }}>
                          {bed.patient_first_name} {bed.patient_last_name}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9f1239", marginTop: "2px" }}>
                          MRN: <span className="font-mono">{bed.patient_number}</span>
                        </div>
                        {bed.admission_date && (
                          <div style={{ fontSize: "10px", color: "#be123c", marginTop: "4px" }}>
                            Admitted: {formatDate(bed.admission_date)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", color: isAvailable ? "#047857" : "#b45309", marginBottom: "12px", fontStyle: "italic" }}>
                        {isAvailable ? "Ready for incoming admission" : `Status: ${bed.status}`}
                      </div>
                    )}
                  </div>

                  {/* Bed Actions */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                    {isOccupied && (
                      <>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleOpenTransfer(bed)}
                          style={{ padding: "4px 8px", fontSize: "11px", flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
                        >
                          <ArrowRightLeft size={12} />
                          Transfer
                        </button>
                        <button
                          type="button"
                          className="button button-primary button-sm font-bold"
                          onClick={() => handleOpenDischarge(bed)}
                          style={{ padding: "4px 8px", fontSize: "11px", flex: 1, background: "#e11d48", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
                        >
                          <LogOut size={12} />
                          Discharge
                        </button>
                      </>
                    )}

                    {!isOccupied && !isAvailable && (
                      <button
                        type="button"
                        className="button button-secondary button-sm"
                        onClick={() => handleUpdateStatus(bed.id, "AVAILABLE")}
                        style={{ padding: "4px 10px", fontSize: "11px", width: "100%", background: "#10b981", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
                      >
                        <Check size={12} />
                        Mark Available
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 1. Modal: Admit Patient */}
      {showAdmitModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAdmitModal(false)}
          title={`Admit Patient to Ward: ${selectedQueueItem?.patient_first_name} ${selectedQueueItem?.patient_last_name}`}
          subtitle={`MRN: ${selectedQueueItem?.patient_number} • Order Priority: ${selectedQueueItem?.priority || "ROUTINE"}`}
          maxWidth="760px"
        >
          <form onSubmit={handleAdmitSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Filter Section: Bed Type & Hospital Ward */}
            <div style={{ background: "#f8fafc", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                    Select Bed Type / Classification
                  </label>
                  <select
                    className="select"
                    value={admitBedTypeFilter}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setAdmitBedTypeFilter(newType);
                      const matching = beds.filter((b) => {
                        const isUnocc = b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED");
                        const matchesType = newType === "ALL" || b.bed_type === newType;
                        const matchesWard = admitWardFilter === "ALL" || b.ward_name === admitWardFilter;
                        return isUnocc && matchesType && matchesWard;
                      });
                      if (matching.length > 0 && (!selectedBedId || !matching.some((b) => b.id === selectedBedId))) {
                        setSelectedBedId(matching[0].id);
                      }
                    }}
                    style={{ width: "100%", padding: "8px 10px", fontSize: "12px", borderRadius: "6px" }}
                  >
                    <option value="ALL">All Bed Types (STANDARD, ICU, ISOLATION...)</option>
                    <option value="STANDARD">Standard Bed</option>
                    <option value="ICU">ICU Critical Care Bed</option>
                    <option value="ISOLATION">Isolation Unit</option>
                    <option value="PEDIATRIC">Pediatric Ward Bed</option>
                    <option value="MATERNITY">Maternity Delivery Bed</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>
                    Select Hospital Ward
                  </label>
                  <select
                    className="select"
                    value={admitWardFilter}
                    onChange={(e) => {
                      const newWard = e.target.value;
                      setAdmitWardFilter(newWard);
                      const matching = beds.filter((b) => {
                        const isUnocc = b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED");
                        const matchesType = admitBedTypeFilter === "ALL" || b.bed_type === admitBedTypeFilter;
                        const matchesWard = newWard === "ALL" || b.ward_name === newWard;
                        return isUnocc && matchesType && matchesWard;
                      });
                      if (matching.length > 0 && (!selectedBedId || !matching.some((b) => b.id === selectedBedId))) {
                        setSelectedBedId(matching[0].id);
                      }
                    }}
                    style={{ width: "100%", padding: "8px 10px", fontSize: "12px", borderRadius: "6px" }}
                  >
                    <option value="ALL">All Hospital Wards</option>
                    {wardNames.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Visual Unoccupied Beds Grid (Listed Outside Dropdown) */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                  Available Inpatient Beds <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Click a bed card to select & allocate
                </span>
              </div>

              {(() => {
                const allUnoccupied = beds.filter(
                  (b) => b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED")
                );

                const filteredBedsList = allUnoccupied.filter((b) => {
                  const matchesType = admitBedTypeFilter === "ALL" || b.bed_type === admitBedTypeFilter;
                  const matchesWard = admitWardFilter === "ALL" || b.ward_name === admitWardFilter;
                  return matchesType && matchesWard;
                });

                if (allUnoccupied.length === 0) {
                  return (
                    <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "12px", textAlign: "center" }}>
                      No available / unoccupied beds found in any ward. Please use <strong>+ Add Bed</strong> or update an existing bed status to <strong>AVAILABLE</strong>.
                    </div>
                  );
                }

                if (filteredBedsList.length === 0) {
                  return (
                    <div style={{ padding: "16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", color: "#92400e", fontSize: "12px", textAlign: "center" }}>
                      No available beds match <strong>{admitBedTypeFilter}</strong> in <strong>{admitWardFilter}</strong>.
                      <button
                        type="button"
                        onClick={() => { setAdmitBedTypeFilter("ALL"); setAdmitWardFilter("ALL"); }}
                        style={{ marginLeft: "8px", color: "#0284c7", fontWeight: 700, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Reset filters to view all {allUnoccupied.length} available beds
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: "10px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      padding: "4px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      background: "#fafafa",
                    }}
                  >
                    {filteredBedsList.map((b) => {
                      const isSelected = selectedBedId === b.id;

                      return (
                        <div
                          key={b.id}
                          onClick={() => setSelectedBedId(b.id)}
                          style={{
                            padding: "12px",
                            borderRadius: "10px",
                            border: isSelected ? "2px solid #0284c7" : "1px solid #cbd5e1",
                            background: isSelected ? "#f0f9ff" : "#ffffff",
                            boxShadow: isSelected ? "0 0 0 2px rgba(2, 132, 199, 0.2), 0 2px 6px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.04)",
                            cursor: "pointer",
                            transition: "all 120ms ease",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Bed size={16} color={isSelected ? "#0284c7" : "#475569"} />
                                <strong style={{ fontSize: "14px", color: isSelected ? "#0369a1" : "#0f172a", fontFamily: "monospace" }}>
                                  {b.bed_number}
                                </strong>
                              </div>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: isSelected ? "#0284c7" : "#e2e8f0",
                                  color: isSelected ? "#ffffff" : "#475569",
                                }}
                              >
                                {b.bed_type || "STANDARD"}
                              </span>
                            </div>

                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "2px" }}>
                              {b.ward_name}
                            </div>
                            {b.room_number && (
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                Room {b.room_number}
                              </div>
                            )}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", paddingTop: "6px", borderTop: "1px solid rgba(0,0,0,0.05)", fontSize: "11px" }}>
                            <span style={{ fontWeight: 700, color: "#059669" }}>
                              {formatCurrency(b.daily_rate)}/day
                            </span>
                            {isSelected && (
                              <span style={{ display: "flex", alignItems: "center", gap: "2px", color: "#0284c7", fontWeight: 700 }}>
                                <Check size={12} /> Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Selected Bed Banner Confirmation */}
              {selectedBedId && (() => {
                const selectedBed = beds.find((b) => b.id === selectedBedId);
                if (!selectedBed) return null;
                return (
                  <div style={{ marginTop: "10px", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "12px", color: "#1e40af", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Check size={14} color="#2563eb" />
                    <span>
                      Selected Bed: <strong>{selectedBed.ward_name}</strong> — <strong>Bed {selectedBed.bed_number}</strong> {selectedBed.room_number ? `(Room ${selectedBed.room_number})` : ""} [{selectedBed.bed_type || "STANDARD"}] • Rate: <strong>{formatCurrency(selectedBed.daily_rate)}/day</strong>
                    </span>
                  </div>
                );
              })()}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Admission Reason & Nursing Directives
              </label>
              <textarea
                rows={3}
                className="textarea"
                value={admissionReason}
                onChange={(e) => setAdmissionReason(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px", borderRadius: "6px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowAdmitModal(false)} className="button button-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedBedId}
                className="button button-primary font-bold"
                style={{ background: "#0284c7" }}
              >
                {submitting ? "Admitting..." : "Confirm Inpatient Admission"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 2. Modal: Transfer Bed */}
      {showTransferModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowTransferModal(false)}
          title={`Transfer Patient: ${activeTransferBed?.patient_first_name} ${activeTransferBed?.patient_last_name}`}
          subtitle={`Current Bed: ${activeTransferBed?.ward_name} - Bed ${activeTransferBed?.bed_number}`}
        >
          <form onSubmit={handleTransferSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Destination Available Bed <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                className="select"
                value={destBedId}
                onChange={(e) => setDestBedId(e.target.value)}
                required
                style={{ width: "100%", padding: "9px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
              >
                <option value="">-- Choose Destination Bed --</option>
                {wardNames.map((ward) => {
                  const wardBeds = beds.filter(
                    (b) =>
                      (b.ward_name || "General Ward") === ward &&
                      (b.status === "AVAILABLE" || (!b.patient_id && !b.current_admission_id && b.status !== "OCCUPIED")) &&
                      b.id !== activeTransferBed?.id
                  );
                  if (wardBeds.length === 0) return null;
                  return (
                    <optgroup key={ward} label={`${ward} (${wardBeds.length} available)`}>
                      {wardBeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bed {b.bed_number} {b.room_number ? `(Room ${b.room_number})` : ""} [{b.bed_type || "STANDARD"}]
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Transfer Rationale / Notes
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Upgraded to ICU, patient isolation, ward consolidation..."
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowTransferModal(false)} className="button button-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !destBedId} className="button button-primary font-bold" style={{ background: "#4f46e5" }}>
                {submitting ? "Transferring..." : "Execute Transfer"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Modal: Discharge Patient */}
      {showDischargeModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowDischargeModal(false)}
          title={`Discharge Patient: ${activeDischargeBed?.patient_first_name} ${activeDischargeBed?.patient_last_name}`}
          subtitle={`Bed ${activeDischargeBed?.bed_number} (${activeDischargeBed?.ward_name})`}
        >
          <form onSubmit={handleDischargeSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Discharge Diagnosis
              </label>
              <input
                type="text"
                className="input"
                value={dischargeForm.dischargeDiagnosis}
                onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeDiagnosis: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Clinical Discharge Summary <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={3}
                className="textarea"
                value={dischargeForm.dischargeSummary}
                onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeSummary: e.target.value })}
                required
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Discharge Instructions & Home Directives
              </label>
              <textarea
                rows={2}
                className="textarea"
                value={dischargeForm.dischargeInstructions}
                onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeInstructions: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowDischargeModal(false)} className="button button-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="button button-primary font-bold" style={{ background: "#e11d48" }}>
                {submitting ? "Processing..." : "Finalize Inpatient Discharge"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 4. Modal: + Add Bed */}
      {showAddBedModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddBedModal(false)}
          title="Add New Inpatient Bed"
          subtitle="Creates a permanent hospital bed entity and persists to database"
        >
          <form onSubmit={handleAddBedSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Ward Location <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  className="select"
                  value={bedForm.wardName}
                  onChange={(e) => setBedForm({ ...bedForm, wardName: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                  required
                >
                  <option value="General Male Ward">General Male Ward</option>
                  <option value="General Female Ward">General Female Ward</option>
                  <option value="Pediatric Ward">Pediatric Ward</option>
                  <option value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</option>
                  <option value="Isolation Ward">Isolation Ward</option>
                  <option value="Maternity Ward">Maternity Ward</option>
                  <option value="Surgical Ward">Surgical Ward</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Room Number
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 101, 204"
                  value={bedForm.roomNumber}
                  onChange={(e) => setBedForm({ ...bedForm, roomNumber: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Bed Number / Code <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. GMW-05, ICU-02"
                  value={bedForm.bedNumber}
                  onChange={(e) => setBedForm({ ...bedForm, bedNumber: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Bed Classification Type
                </label>
                <select
                  className="select"
                  value={bedForm.bedType}
                  onChange={(e) => setBedForm({ ...bedForm, bedType: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                >
                  <option value="STANDARD">Standard Bed</option>
                  <option value="ICU">ICU Critical Bed</option>
                  <option value="ISOLATION">Isolation Bed</option>
                  <option value="PEDIATRIC">Pediatric Bed</option>
                  <option value="MATERNITY">Maternity Delivery Bed</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Daily Inpatient Rate (ETB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={bedForm.dailyRate}
                  onChange={(e) => setBedForm({ ...bedForm, dailyRate: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Initial Bed Status
                </label>
                <select
                  className="select"
                  value={bedForm.status}
                  onChange={(e) => setBedForm({ ...bedForm, status: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                >
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="CLEANING">CLEANING</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Equipment / Location Notes
              </label>
              <textarea
                rows={2}
                className="textarea"
                placeholder="Oxygen port present, near nursing station, motorized gatch bed..."
                value={bedForm.notes}
                onChange={(e) => setBedForm({ ...bedForm, notes: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", fontSize: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowAddBedModal(false)} className="button button-secondary">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !bedForm.bedNumber.trim()} className="button button-primary font-bold" style={{ background: "#4f46e5" }}>
                {submitting ? "Creating..." : "Create & Save Bed"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
