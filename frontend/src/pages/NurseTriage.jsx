import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatusBadge from "../components/common/StatusBadge";
import { nursingService } from "../services/nursingService";
import { recordVitals } from "../services/vitalsService";
import { useAuth } from "../context/useAuth";
import { useCalendar } from "../context/useCalendar";

const INITIAL_VITALS = {
  temperatureCelsius: "",
  pulseRateBpm: "",
  respiratoryRate: "",
  systolicBp: "",
  diastolicBp: "",
  oxygenSaturation: "",
  painScore: "0",
  weightKg: "",
  heightCm: "",
  notes: "",
};

export default function NurseTriage() {
  const { user } = useAuth();
  const { formatDate, formatDateTime } = useCalendar();

  // Dashboard metrics & list
  const [metrics, setMetrics] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("ALL"); // ALL, NEW_ADMISSIONS, ATTENTION, MEDS_DUE, VITALS_DUE, PENDING_TASKS, CRITICAL
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Active Patient Nursing Workspace Screen
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [activeTab, setActiveTab] = useState("OVERVIEW"); // OVERVIEW, VITALS, MEDS, TASKS, NOTES, ESCALATE

  // Form states inside patient workspace
  const [vitalsForm, setVitalsForm] = useState(INITIAL_VITALS);
  const [submittingVitals, setSubmittingVitals] = useState(false);

  // MAR Admin Modal
  const [selectedRx, setSelectedRx] = useState(null);
  const [medAdminForm, setMedAdminForm] = useState({
    status: "GIVEN", // GIVEN, REFUSED, HELD, NOT_AVAILABLE
    reasonNotAdministered: "",
    notes: "",
  });
  const [submittingMed, setSubmittingMed] = useState(false);

  // Nursing Task creation form
  const [taskForm, setTaskForm] = useState({
    taskType: "WOUND_CARE",
    priority: "ROUTINE",
    notes: "",
  });
  const [submittingTask, setSubmittingTask] = useState(false);

  // Nursing Note creation form
  const [noteForm, setNoteForm] = useState({
    category: "PROGRESS",
    note: "",
  });
  const [submittingNote, setSubmittingNote] = useState(false);

  // Escalation form
  const [escalateForm, setEscalateForm] = useState({
    urgency: "URGENT",
    reason: "",
    clinicalNotes: "",
  });
  const [submittingEscalation, setSubmittingEscalation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");
        const [mRes, pRes] = await Promise.all([
          nursingService.getMetrics().catch(() => null),
          nursingService.getPatients({ filter, search }),
        ]);
        if (!cancelled) {
          if (mRes) setMetrics(mRes);
          setPatients(pRes || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load nursing dashboard.");
          setLoading(false);
        }
      }
    }

    loadDashboard();
    const interval = setInterval(loadDashboard, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [filter, search, refreshKey]);

  async function openPatientWorkspace(patient) {
    setSelectedPatient(patient);
    setActiveTab("OVERVIEW");
    setVitalsForm(INITIAL_VITALS);
    setLoadingOverview(true);
    try {
      const data = await nursingService.getPatientOverview(patient.patient_id);
      setOverviewData(data);
    } catch {
      setOverviewData(null);
    } finally {
      setLoadingOverview(false);
    }
  }

  async function reloadPatientOverview() {
    if (!selectedPatient) return;
    try {
      const data = await nursingService.getPatientOverview(selectedPatient.patient_id);
      setOverviewData(data);
    } catch {
      // ignore
    }
  }

  async function handleRecordVitals(e) {
    e.preventDefault();
    if (!selectedPatient || submittingVitals) return;
    try {
      setSubmittingVitals(true);
      setError("");
      await recordVitals({
        patientId: selectedPatient.patient_id,
        temperature: vitalsForm.temperatureCelsius,
        pulseRate: vitalsForm.pulseRateBpm,
        respiratoryRate: vitalsForm.respiratoryRate,
        systolicBp: vitalsForm.systolicBp,
        diastolicBp: vitalsForm.diastolicBp,
        oxygenSaturation: vitalsForm.oxygenSaturation,
        painScore: parseInt(vitalsForm.painScore, 10) || 0,
        weight: vitalsForm.weightKg,
        height: vitalsForm.heightCm,
        notes: vitalsForm.notes,
      });
      setSuccess("Vital signs recorded successfully.");
      setVitalsForm(INITIAL_VITALS);
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to record vital signs.");
    } finally {
      setSubmittingVitals(false);
    }
  }

  async function handleRecordMedAdmin(e) {
    e.preventDefault();
    if (!selectedRx || submittingMed) return;
    try {
      setSubmittingMed(true);
      setError("");
      await nursingService.recordMedication({
        prescriptionId: selectedRx.id,
        patientId: selectedPatient.patient_id,
        medicationName: selectedRx.medication_name,
        dose: selectedRx.dosage,
        route: selectedRx.route || "Oral",
        status: medAdminForm.status,
        reasonNotAdministered: medAdminForm.reasonNotAdministered,
        notes: medAdminForm.notes,
      });
      setSuccess(`Medication ${selectedRx.medication_name} recorded as ${medAdminForm.status}.`);
      setSelectedRx(null);
      setMedAdminForm({ status: "GIVEN", reasonNotAdministered: "", notes: "" });
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to record medication administration.");
    } finally {
      setSubmittingMed(false);
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!selectedPatient || submittingTask) return;
    try {
      setSubmittingTask(true);
      setError("");
      await nursingService.createTask({
        patientId: selectedPatient.patient_id,
        taskType: taskForm.taskType,
        priority: taskForm.priority,
        notes: taskForm.notes,
      });
      setSuccess("Nursing task scheduled.");
      setTaskForm({ taskType: "WOUND_CARE", priority: "ROUTINE", notes: "" });
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to create nursing task.");
    } finally {
      setSubmittingTask(false);
    }
  }

  async function handleCompleteTask(taskId) {
    try {
      setError("");
      await nursingService.updateTaskStatus(taskId, { status: "COMPLETED" });
      setSuccess("Nursing task marked as completed.");
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to complete task.");
    }
  }

  async function handleCreateNote(e) {
    e.preventDefault();
    if (!selectedPatient || submittingNote) return;
    try {
      setSubmittingNote(true);
      setError("");
      await nursingService.createNote({
        patientId: selectedPatient.patient_id,
        category: noteForm.category,
        note: noteForm.note,
      });
      setSuccess("Nursing note added to clinical timeline.");
      setNoteForm({ category: "PROGRESS", note: "" });
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to post nursing note.");
    } finally {
      setSubmittingNote(false);
    }
  }

  async function handleEscalate(e) {
    e.preventDefault();
    if (!selectedPatient || submittingEscalation) return;
    try {
      setSubmittingEscalation(true);
      setError("");
      await nursingService.escalateToDoctor({
        patientId: selectedPatient.patient_id,
        urgency: escalateForm.urgency,
        reason: escalateForm.reason,
        clinicalNotes: escalateForm.clinicalNotes,
      });
      setSuccess(`Doctor notified immediately (${escalateForm.urgency} priority).`);
      setEscalateForm({ urgency: "URGENT", reason: "", clinicalNotes: "" });
      await reloadPatientOverview();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to escalate to doctor.");
    } finally {
      setSubmittingEscalation(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header flex items-center justify-between">
        <div>
          <p className="page-eyebrow">Inpatient & Clinical Nursing</p>
          <h1>Nursing & Patient Care Management</h1>
          <p className="page-description">
            Operational hub for nurses managing day-to-day inpatient care, medication administration (MAR), vital sign monitoring, and doctor escalation.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* 7 Nursing Dashboard Cards (Clicking opens corresponding filtered list) */}
      {metrics && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div
            className={`card kpi-card ${filter === "ALL" ? "active" : ""}`}
            onClick={() => setFilter("ALL")}
            style={{ cursor: "pointer", borderLeft: "4px solid #3b82f6" }}
          >
            <span className="kpi-label">Under Care</span>
            <span className="kpi-value">{metrics.patientsUnderCare}</span>
            <span className="text-xs text-muted">All active patients</span>
          </div>

          <div
            className={`card kpi-card ${filter === "NEW_ADMISSIONS" ? "active" : ""}`}
            onClick={() => setFilter("NEW_ADMISSIONS")}
            style={{ cursor: "pointer", borderLeft: "4px solid #10b981" }}
          >
            <span className="kpi-label">New Admissions</span>
            <span className="kpi-value">{metrics.newAdmissions}</span>
            <span className="text-xs text-muted">Admitted today</span>
          </div>

          <div
            className={`card kpi-card ${filter === "ATTENTION" ? "active" : ""}`}
            onClick={() => setFilter("ATTENTION")}
            style={{ cursor: "pointer", borderLeft: "4px solid #f59e0b" }}
          >
            <span className="kpi-label">Requires Attention</span>
            <span className="kpi-value">{metrics.requiringAttention}</span>
            <span className="text-xs text-muted">Abnormal parameters</span>
          </div>

          <div
            className={`card kpi-card ${filter === "MEDS_DUE" ? "active" : ""}`}
            onClick={() => setFilter("MEDS_DUE")}
            style={{ cursor: "pointer", borderLeft: "4px solid #8b5cf6" }}
          >
            <span className="kpi-label">Meds Tasks Due</span>
            <span className="kpi-value">{metrics.medicationTasksDue}</span>
            <span className="text-xs text-muted">MAR active</span>
          </div>

          <div
            className={`card kpi-card ${filter === "VITALS_DUE" ? "active" : ""}`}
            onClick={() => setFilter("VITALS_DUE")}
            style={{ cursor: "pointer", borderLeft: "4px solid #06b6d4" }}
          >
            <span className="kpi-label">Vital Signs Due</span>
            <span className="kpi-value">{metrics.vitalSignsDue}</span>
            <span className="text-xs text-muted">No vitals today</span>
          </div>

          <div
            className={`card kpi-card ${filter === "PENDING_TASKS" ? "active" : ""}`}
            onClick={() => setFilter("PENDING_TASKS")}
            style={{ cursor: "pointer", borderLeft: "4px solid #ec4899" }}
          >
            <span className="kpi-label">Pending Tasks</span>
            <span className="kpi-value">{metrics.pendingNursingTasks}</span>
            <span className="text-xs text-muted">Dressing, IV, etc.</span>
          </div>

          <div
            className={`card kpi-card ${filter === "CRITICAL" ? "active" : ""}`}
            onClick={() => setFilter("CRITICAL")}
            style={{ cursor: "pointer", borderLeft: "4px solid #ef4444" }}
          >
            <span className="kpi-label">Critical Alerts</span>
            <span className="kpi-value" style={{ color: "#dc2626" }}>{metrics.criticalAlerts}</span>
            <span className="text-xs text-muted">SpO2 / Fever / Pain</span>
          </div>
        </div>
      )}

      {/* Main Patient List Table */}
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2>Patients Under Care ({patients.length})</h2>
            <p className="text-xs text-muted">
              Filtered by: <strong>{filter}</strong>. Click any patient to open their comprehensive clinical nursing screen.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by name, patient #, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-sm"
              style={{ width: "260px" }}
            />
          </div>
        </div>

        {loading && <div className="p-6 text-center text-sm text-muted">Loading patients...</div>}

        {!loading && patients.length === 0 && (
          <div className="empty-state p-8 text-center text-muted">
            <p>No patients match the current filter.</p>
          </div>
        )}

        {!loading && patients.length > 0 && (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Patient #</th>
                  <th>Age / Gender</th>
                  <th>Ward & Bed</th>
                  <th>Attending Doctor</th>
                  <th>Latest Vitals</th>
                  <th>Pending Tasks</th>
                  <th>Active Meds</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const hasAbnormalVitals =
                    p.temperature_celsius >= 38.5 ||
                    p.oxygen_saturation <= 92 ||
                    p.pain_score >= 7;

                  return (
                    <tr
                      key={p.patient_id}
                      style={{ background: hasAbnormalVitals ? "#fffbeb" : undefined }}
                    >
                      <td className="font-medium">
                        {p.first_name} {p.last_name}
                      </td>
                      <td className="font-mono text-xs">{p.patient_number}</td>
                      <td>{p.age != null ? `${p.age} yrs` : "—"} / {p.gender}</td>
                      <td>
                        {p.bed_number ? (
                          <span className="badge badge-success">
                            🛏️ {p.ward_name} ({p.bed_number})
                          </span>
                        ) : (
                          <span className="badge badge-outline">Outpatient / Triage</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {p.doctor_first_name ? `Dr. ${p.doctor_first_name} ${p.doctor_last_name}` : "—"}
                      </td>
                      <td className="text-xs">
                        {p.latest_vital_time ? (
                          <div>
                            <span>BP: {p.blood_pressure || "—"}</span> |{" "}
                            <span>Temp: {p.temperature_celsius ? `${p.temperature_celsius}°C` : "—"}</span> |{" "}
                            <span>SpO₂: {p.oxygen_saturation ? `${p.oxygen_saturation}%` : "—"}</span>
                          </div>
                        ) : (
                          <span className="badge badge-warning text-xs">Vitals Due</span>
                        )}
                      </td>
                      <td>
                        {p.pending_task_count > 0 ? (
                          <span className="badge badge-danger text-xs font-mono">{p.pending_task_count} pending</span>
                        ) : (
                          <span className="text-xs text-muted">0</span>
                        )}
                      </td>
                      <td>
                        {p.active_rx_count > 0 ? (
                          <span className="badge badge-secondary text-xs font-mono">{p.active_rx_count} meds</span>
                        ) : (
                          <span className="text-xs text-muted">0</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openPatientWorkspace(p)}
                          className="button button-primary button-sm font-bold"
                        >
                          Open Care Screen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patient Nursing Workspace Modal */}
      {selectedPatient && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPatient(null)}
          title={`Clinical Nursing Workspace — ${selectedPatient.first_name} ${selectedPatient.last_name}`}
        >
          <div className="space-y-4">
            {/* Patient Header */}
            <div
              style={{
                background: "#f1f5f9",
                padding: "12px 16px",
                borderRadius: "8px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
                fontSize: "13px",
                border: "1px solid #cbd5e1",
              }}
            >
              <div>
                <span className="text-muted block text-xs">Patient</span>
                <strong>{selectedPatient.first_name} {selectedPatient.last_name}</strong>
              </div>
              <div>
                <span className="text-muted block text-xs">Patient #</span>
                <span className="font-mono">{selectedPatient.patient_number}</span>
              </div>
              <div>
                <span className="text-muted block text-xs">Age / Gender</span>
                <span>{selectedPatient.age != null ? `${selectedPatient.age} yrs` : "—"} / {selectedPatient.gender}</span>
              </div>
              <div>
                <span className="text-muted block text-xs">Ward & Bed</span>
                <span>{selectedPatient.ward_name ? `${selectedPatient.ward_name} (${selectedPatient.bed_number})` : "Outpatient"}</span>
              </div>
              <div>
                <span className="text-muted block text-xs">Attending Doctor</span>
                <span>{selectedPatient.doctor_first_name ? `Dr. ${selectedPatient.doctor_first_name} ${selectedPatient.doctor_last_name}` : "—"}</span>
              </div>
              <div>
                <span className="text-muted block text-xs">Admission Date</span>
                <span>{selectedPatient.admission_date ? formatDate(selectedPatient.admission_date) : "—"}</span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b gap-1 flex-wrap">
              {[
                { id: "OVERVIEW", label: "1. Overview" },
                { id: "VITALS", label: "2. Vital Signs" },
                { id: "MEDS", label: "3. Medication Admin (MAR)" },
                { id: "TASKS", label: "4. Nursing Tasks" },
                { id: "NOTES", label: "5. Nursing Notes" },
                { id: "ESCALATE", label: "🚨 Notify Doctor" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`button button-sm ${activeTab === t.id ? "button-primary font-bold" : "button-secondary"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {loadingOverview && (
              <div className="p-8 text-center text-sm text-muted">Loading clinical record...</div>
            )}

            {!loadingOverview && overviewData && (
              <>
                {/* TAB 1: Overview */}
                {activeTab === "OVERVIEW" && (
                  <div className="space-y-3">
                    <div className="card p-3" style={{ background: "#ffffff" }}>
                      <h4 className="text-xs font-bold text-muted uppercase">Diagnosis & Clinical Reason</h4>
                      {overviewData.admission?.admission_reason && (
                        <p className="text-sm font-medium mt-1">
                          <strong>Admission Reason:</strong> {overviewData.admission.admission_reason}
                        </p>
                      )}
                      {overviewData.diagnoses && overviewData.diagnoses.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {overviewData.diagnoses.map((d) => (
                            <div key={d.id} className="text-xs flex items-center gap-2">
                              <span className="font-mono bg-gray-100 px-1 rounded">{d.code || "DX"}</span>
                              <span>{d.description}</span>
                              <span className="badge badge-secondary">{d.severity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted mt-1">No formal diagnoses recorded yet.</p>
                      )}
                    </div>

                    <div className="grid grid-2 gap-3">
                      <div className="card p-3" style={{ background: "#ffffff" }}>
                        <h4 className="text-xs font-bold text-muted uppercase">Allergies & Alerts</h4>
                        <p className="text-xs text-muted mt-1">No known drug allergies reported.</p>
                      </div>

                      <div className="card p-3" style={{ background: "#ffffff" }}>
                        <h4 className="text-xs font-bold text-muted uppercase">Current Active Treatment</h4>
                        <p className="text-xs mt-1">
                          {overviewData.prescriptions?.length || 0} active prescribed medications.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Vital Signs Recording & Historical Timeline */}
                {activeTab === "VITALS" && (
                  <div className="space-y-4">
                    {/* Record New Vitals Form */}
                    <form onSubmit={handleRecordVitals} className="card p-4 space-y-3" style={{ background: "#f8fafc" }}>
                      <h4 className="font-bold text-sm">Record New Vital Signs</h4>
                      <div className="grid grid-3 gap-3">
                        <div>
                          <label className="label">Temperature (°C) *</label>
                          <input
                            type="number"
                            step="0.1"
                            className="input"
                            placeholder="36.5"
                            value={vitalsForm.temperatureCelsius}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, temperatureCelsius: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">BP Systolic (mmHg) *</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="120"
                            value={vitalsForm.systolicBp}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, systolicBp: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">BP Diastolic (mmHg) *</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="80"
                            value={vitalsForm.diastolicBp}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, diastolicBp: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Pulse Rate (BPM) *</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="75"
                            value={vitalsForm.pulseRateBpm}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, pulseRateBpm: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Resp Rate (/min) *</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="16"
                            value={vitalsForm.respiratoryRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Oxygen Saturation (SpO₂ %) *</label>
                          <input
                            type="number"
                            className="input"
                            placeholder="98"
                            value={vitalsForm.oxygenSaturation}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="label">Pain Score (0–10)</label>
                          <select
                            className="select"
                            value={vitalsForm.painScore}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, painScore: e.target.value })}
                          >
                            <option value="0">0 - No Pain</option>
                            <option value="2">2 - Mild</option>
                            <option value="4">4 - Moderate</option>
                            <option value="6">6 - Severe</option>
                            <option value="8">8 - Very Severe</option>
                            <option value="10">10 - Worst Possible</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Weight (kg)</label>
                          <input
                            type="number"
                            step="0.1"
                            className="input"
                            placeholder="70.0"
                            value={vitalsForm.weightKg}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, weightKg: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="label">Clinical Notes</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Patient resting in bed..."
                            value={vitalsForm.notes}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-2">
                        <button type="submit" disabled={submittingVitals} className="button button-primary">
                          {submittingVitals ? "Saving..." : "Save Vital Signs"}
                        </button>
                      </div>
                    </form>

                    {/* Historical Measurements Timeline */}
                    <div>
                      <h4 className="font-bold text-sm mb-2">Historical Measurements Timeline</h4>
                      {overviewData.vitalsTimeline && overviewData.vitalsTimeline.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table text-xs">
                            <thead>
                              <tr>
                                <th>Timestamp</th>
                                <th>BP (mmHg)</th>
                                <th>Pulse</th>
                                <th>Temp</th>
                                <th>SpO₂</th>
                                <th>Pain</th>
                                <th>Weight</th>
                                <th>Recorded By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {overviewData.vitalsTimeline.map((v) => (
                                <tr key={v.id}>
                                  <td className="text-muted">{formatDateTime(v.recorded_at)}</td>
                                  <td className="font-mono">{v.blood_pressure}</td>
                                  <td>{v.pulse_rate_bpm} bpm</td>
                                  <td className={v.temperature_celsius >= 38.5 ? "text-danger font-bold" : ""}>
                                    {v.temperature_celsius}°C
                                  </td>
                                  <td className={v.oxygen_saturation <= 92 ? "text-danger font-bold" : ""}>
                                    {v.oxygen_saturation}%
                                  </td>
                                  <td>
                                    <span className={`badge ${v.pain_score >= 7 ? "badge-danger" : "badge-secondary"}`}>
                                      {v.pain_score ?? "—"}/10
                                    </span>
                                  </td>
                                  <td>{v.weight_kg ? `${v.weight_kg} kg` : "—"}</td>
                                  <td>{v.recorded_by_first_name ? `${v.recorded_by_first_name} ${v.recorded_by_last_name}` : "Nurse"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted">No historical measurements logged yet.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 3: Medication Administration Record (MAR) */}
                {activeTab === "MEDS" && (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                      ℹ️ <strong>Medication Administration Record:</strong> Displays doctor-approved active medication orders. Nurses can record administration events (Given, Refused, Held, Not Available). Doctor orders cannot be modified by nursing staff.
                    </div>

                    <h4 className="font-bold text-sm">Doctor-Approved Medication Orders</h4>
                    {overviewData.prescriptions && overviewData.prescriptions.length > 0 ? (
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Medication</th>
                              <th>Dosage</th>
                              <th>Frequency</th>
                              <th>Route</th>
                              <th>Prescribing Doctor</th>
                              <th>Instructions</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overviewData.prescriptions.map((rx) => (
                              <tr key={rx.id}>
                                <td className="font-medium">{rx.medication_name}</td>
                                <td className="font-mono text-xs">{rx.dosage}</td>
                                <td>{rx.frequency}</td>
                                <td>{rx.route || "Oral"}</td>
                                <td className="text-xs">Dr. {rx.doctor_first_name} {rx.doctor_last_name}</td>
                                <td className="text-xs text-muted">{rx.instructions || "As directed"}</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedRx(rx)}
                                    className="button button-primary button-sm font-bold"
                                  >
                                    Record Admin
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No active medication orders prescribed for this patient.</p>
                    )}

                    {/* MAR Admin Modal */}
                    {selectedRx && (
                      <div className="card p-4 space-y-3" style={{ background: "#f8fafc", border: "1px solid #3b82f6" }}>
                        <h4 className="font-bold text-sm text-primary">
                          Administer: {selectedRx.medication_name} ({selectedRx.dosage} - {selectedRx.route || "Oral"})
                        </h4>
                        <form onSubmit={handleRecordMedAdmin} className="space-y-3">
                          <div className="grid grid-2 gap-3">
                            <div>
                              <label className="label">Status *</label>
                              <select
                                className="select"
                                value={medAdminForm.status}
                                onChange={(e) => setMedAdminForm({ ...medAdminForm, status: e.target.value })}
                              >
                                <option value="GIVEN">Given / Administered</option>
                                <option value="REFUSED">Refused by Patient</option>
                                <option value="HELD">Held (Clinical Decision)</option>
                                <option value="NOT_AVAILABLE">Not Available in Ward</option>
                              </select>
                            </div>
                            <div>
                              <label className="label">Reason (if not given)</label>
                              <input
                                type="text"
                                className="input"
                                placeholder="e.g., NPO for surgery, patient asleep, nauseated..."
                                value={medAdminForm.reasonNotAdministered}
                                onChange={(e) => setMedAdminForm({ ...medAdminForm, reasonNotAdministered: e.target.value })}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="label">Administration Notes</label>
                            <input
                              type="text"
                              className="input"
                              placeholder="Tolerated well with water..."
                              value={medAdminForm.notes}
                              onChange={(e) => setMedAdminForm({ ...medAdminForm, notes: e.target.value })}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRx(null)}
                              className="button button-secondary"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={submittingMed}
                              className="button button-primary"
                            >
                              {submittingMed ? "Recording..." : "Confirm Administration"}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: Nursing Tasks */}
                {activeTab === "TASKS" && (
                  <div className="space-y-4">
                    {/* Add Task Form */}
                    <form onSubmit={handleCreateTask} className="card p-3 space-y-3" style={{ background: "#f8fafc" }}>
                      <h4 className="font-bold text-sm">Schedule Nursing Task</h4>
                      <div className="grid grid-3 gap-3">
                        <div>
                          <label className="label">Task Type *</label>
                          <select
                            className="select"
                            value={taskForm.taskType}
                            onChange={(e) => setTaskForm({ ...taskForm, taskType: e.target.value })}
                          >
                            <option value="WOUND_CARE">Wound Care / Dressing</option>
                            <option value="INJECTION">Therapeutic Injection</option>
                            <option value="IV_MONITORING">IV Line Monitoring</option>
                            <option value="POSITIONING">Patient Positioning</option>
                            <option value="OBSERVATION">Clinical Observation</option>
                            <option value="HYGIENE">Patient Hygiene</option>
                            <option value="GENERAL">General Nursing Task</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Priority</label>
                          <select
                            className="select"
                            value={taskForm.priority}
                            onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                          >
                            <option value="ROUTINE">Routine</option>
                            <option value="URGENT">Urgent</option>
                            <option value="EMERGENCY">Emergency</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Task Notes / Instructions</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Clean and dress surgical incision with sterile saline..."
                            value={taskForm.notes}
                            onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button type="submit" disabled={submittingTask} className="button button-primary">
                          {submittingTask ? "Adding..." : "+ Add Task"}
                        </button>
                      </div>
                    </form>

                    <h4 className="font-bold text-sm">Active & Pending Nursing Tasks</h4>
                    {overviewData.tasks && overviewData.tasks.length > 0 ? (
                      <div className="space-y-2">
                        {overviewData.tasks.map((t) => (
                          <div key={t.id} className="card p-3 flex justify-between items-center" style={{ borderLeft: t.status === "COMPLETED" ? "3px solid #10b981" : "3px solid #f59e0b" }}>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">{t.task_type.replace(/_/g, " ")}</span>
                                <span className={`badge ${t.priority === "EMERGENCY" ? "badge-danger" : t.priority === "URGENT" ? "badge-warning" : "badge-secondary"}`}>
                                  {t.priority}
                                </span>
                                <StatusBadge status={t.status} />
                              </div>
                              {t.notes && <p className="text-xs text-muted mt-1">{t.notes}</p>}
                            </div>
                            {t.status !== "COMPLETED" && (
                              <button
                                type="button"
                                onClick={() => handleCompleteTask(t.id)}
                                className="button button-success button-sm"
                              >
                                ✓ Mark Complete
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">No pending tasks for this patient.</p>
                    )}
                  </div>
                )}

                {/* TAB 5: Nursing Notes */}
                {activeTab === "NOTES" && (
                  <div className="space-y-4">
                    <form onSubmit={handleCreateNote} className="card p-3 space-y-3" style={{ background: "#f8fafc" }}>
                      <h4 className="font-bold text-sm">Add Time-Stamped Nursing Note</h4>
                      <div className="grid grid-3 gap-3">
                        <div>
                          <label className="label">Category</label>
                          <select
                            className="select"
                            value={noteForm.category}
                            onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
                          >
                            <option value="PROGRESS">Progress / Day Care</option>
                            <option value="ASSESSMENT">Nursing Assessment</option>
                            <option value="HANDOVER">Shift Handover</option>
                            <option value="INCIDENT">Incident / Note</option>
                          </select>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <label className="label">Note Text *</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="09:20 — Patient reports reduced pain. Vital signs stable..."
                            value={noteForm.note}
                            onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button type="submit" disabled={submittingNote} className="button button-primary">
                          {submittingNote ? "Saving..." : "Post Note"}
                        </button>
                      </div>
                    </form>

                    <h4 className="font-bold text-sm">Chronological Clinical Nursing Notes</h4>
                    {overviewData.notes && overviewData.notes.length > 0 ? (
                      <div className="space-y-2">
                        {overviewData.notes.map((n) => (
                          <div key={n.id} className="p-3 bg-white border rounded text-xs space-y-1">
                            <div className="flex justify-between text-muted">
                              <span className="font-bold text-primary">{n.category}</span>
                              <span>{formatDateTime(n.created_at)}</span>
                            </div>
                            <p className="text-sm">{n.note}</p>
                            <p className="text-xs text-muted">By: {n.nurse_first_name ? `${n.nurse_first_name} ${n.nurse_last_name}` : n.created_by_username || user?.username}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">No nursing notes posted yet.</p>
                    )}
                  </div>
                )}

                {/* TAB 6: Doctor Escalation */}
                {activeTab === "ESCALATE" && (
                  <form onSubmit={handleEscalate} className="card p-4 space-y-4" style={{ border: "2px solid #ef4444" }}>
                    <div className="flex items-center gap-2 text-danger">
                      <span style={{ fontSize: "24px" }}>🚨</span>
                      <div>
                        <h4 className="font-bold text-base">Escalate to Attending Doctor</h4>
                        <p className="text-xs text-muted">Creates an immediate high-priority alert for the responsible physician.</p>
                      </div>
                    </div>

                    <div className="grid grid-2 gap-3">
                      <div>
                        <label className="label">Urgency Level *</label>
                        <select
                          className="select"
                          value={escalateForm.urgency}
                          onChange={(e) => setEscalateForm({ ...escalateForm, urgency: e.target.value })}
                        >
                          <option value="URGENT">Urgent (Requires prompt physician review)</option>
                          <option value="EMERGENCY">Emergency (Immediate bedside response required)</option>
                        </select>
                      </div>

                      <div>
                        <label className="label">Primary Concern / Finding *</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Sudden drop in SpO2, severe acute chest pain, persistent fever..."
                          value={escalateForm.reason}
                          onChange={(e) => setEscalateForm({ ...escalateForm, reason: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Detailed Clinical Observations & Interventions Taken</label>
                      <textarea
                        rows={3}
                        className="textarea"
                        placeholder="Oxygen administered via cannula, vitals repeated, doctor requested to review bedside..."
                        value={escalateForm.clinicalNotes}
                        onChange={(e) => setEscalateForm({ ...escalateForm, clinicalNotes: e.target.value })}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => setActiveTab("OVERVIEW")}
                        className="button button-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingEscalation || !escalateForm.reason}
                        className="button button-danger font-bold"
                      >
                        {submittingEscalation ? "Notifying Doctor..." : "🚨 Dispatch Doctor Notification"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
