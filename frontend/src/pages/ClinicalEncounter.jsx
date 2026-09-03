import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Modal from "../components/common/Modal";
import {
  createEncounter,
  updateEncounter,
  completeEncounter,
  getEncounter,
} from "../services/encounterService";
import { getPatientRecord } from "../services/patientService";
import { getDoctors } from "../services/scheduleService";
import { createReferral } from "../services/referralService";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { formatCurrency } from "../utils/currency";
import {
  LaboratoryOrderModal,
  RadiologyOrderModal,
  PrescriptionOrderModal,
  ProcedureOrderModal,
  SurgeryRequestModal,
  AdmissionRequestModal,
} from "../components/doctor/OrderModals";

export default function ClinicalEncounter() {
  const toast = useToast();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const appointmentId = searchParams.get("appointmentId");
  const initialPatientId = searchParams.get("patientId");
  const initialDoctorId = searchParams.get("doctorId") || user?.staff_id || user?.staffId;

  const [encounterId, setEncounterId] = useState(id || null);
  const [patientId, setPatientId] = useState(initialPatientId || null);
  const [doctorId, setDoctorId] = useState(initialDoctorId || null);

  const [activeTab, setActiveTab] = useState("CONSULTATION"); // 'CONSULTATION', 'ORDERS', 'RESULTS', 'HISTORY'
  const [patientData, setPatientData] = useState(null);
  const [encounterData, setEncounterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [historySymptoms, setHistorySymptoms] = useState("");
  const [examinationFindings, setExaminationFindings] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [priority, setPriority] = useState("ROUTINE");
  const [status, setStatus] = useState("DRAFT");
  const [diagnoses, setDiagnoses] = useState([
    { code: "", description: "", isPrimary: true, severity: "MODERATE", notes: "" },
  ]);

  // Order Modals
  const [showLabModal, setShowLabModal] = useState(false);
  const [showRadModal, setShowRadModal] = useState(false);
  const [showRxModal, setShowRxModal] = useState(false);
  const [showProcModal, setShowProcModal] = useState(false);
  const [showSurgModal, setShowSurgModal] = useState(false);
  const [showAdmModal, setShowAdmModal] = useState(false);

  // Referral Modal
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [allDoctors, setAllDoctors] = useState([]);
  const [referralForm, setReferralForm] = useState({
    receivingDoctorId: "",
    urgency: "ROUTINE",
    symptoms: "",
    findings: "",
    diagnosis: "",
    investigationInfo: "",
    treatmentProvided: "",
    caseNote: "",
  });
  const [referralSubmitting, setReferralSubmitting] = useState(false);

  const isFormDirty = useRef(false);

  // Load existing encounter
  const loadEncounter = useCallback(async (encId, background = false) => {
    if (!encId) return;
    try {
      if (!background) setLoading(true);
      const res = await getEncounter(encId);
      if (res.data) {
        const enc = res.data;
        setEncounterData(enc);
        if (enc.patient_id) setPatientId(enc.patient_id);
        if (enc.doctor_id) setDoctorId(enc.doctor_id);
        setStatus(enc.status || "DRAFT");

        // Only populate form from backend if first load or not dirty
        if (!isFormDirty.current || !background) {
          setChiefComplaint(enc.chief_complaint || "");
          setHistorySymptoms(enc.history_symptoms || "");
          setExaminationFindings(enc.examination_findings || "");
          setClinicalNotes(enc.clinical_notes || "");
          setTreatmentPlan(enc.treatment_plan || "");
          setFollowUpDate(enc.follow_up_date ? enc.follow_up_date.split("T")[0] : "");
          setFollowUpInstructions(enc.follow_up_instructions || "");
          setPriority(enc.priority || "ROUTINE");

          if (enc.diagnoses && enc.diagnoses.length > 0) {
            setDiagnoses(
              enc.diagnoses.map((d) => ({
                code: d.code || "",
                description: d.description || "",
                isPrimary: Boolean(d.is_primary),
                severity: d.severity || "MODERATE",
                notes: d.notes || "",
              }))
            );
          }
        }
      }
    } catch (err) {
      if (!background) setError(err.message || "Failed to load clinical encounter.");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (id && !cancelled) {
        await loadEncounter(id, false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [id, loadEncounter]);

  // Load patient chart
  useEffect(() => {
    const activePatientId = patientId || encounterData?.patient_id;
    if (!activePatientId) return;
    let cancelled = false;
    async function loadPatientChart() {
      try {
        const res = await getPatientRecord(activePatientId);
        if (!cancelled && res.data) {
          setPatientData(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load patient record.");
          setLoading(false);
        }
      }
    }
    loadPatientChart();
    return () => {
      cancelled = true;
    };
  }, [patientId, encounterData?.patient_id]);

  // Background auto-refresh for live order & result status (every 15 seconds)
  useEffect(() => {
    if (!encounterId) return;
    const interval = setInterval(() => {
      loadEncounter(encounterId, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [encounterId, loadEncounter]);

  // Diagnoses Handlers
  function handleAddDiagnosis() {
    isFormDirty.current = true;
    setDiagnoses((prev) => [
      ...prev,
      { code: "", description: "", isPrimary: false, severity: "MILD", notes: "" },
    ]);
  }

  function handleRemoveDiagnosis(index) {
    isFormDirty.current = true;
    setDiagnoses((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDiagnosisChange(index, field, value) {
    isFormDirty.current = true;
    setDiagnoses((prev) =>
      prev.map((d, i) => {
        if (i === index) {
          return { ...d, [field]: value };
        }
        if (field === "isPrimary" && value === true) {
          return { ...d, isPrimary: false };
        }
        return d;
      })
    );
  }

  // Save / Update Encounter
  async function handleSaveEncounter(asComplete = false) {
    setError("");
    setSuccess("");

    if (!chiefComplaint.trim()) {
      setError("Please record the patient's Chief Complaint.");
      return;
    }

    const filteredDiagnoses = diagnoses.filter((d) => d.description && d.description.trim());
    if (filteredDiagnoses.length === 0) {
      setError("Please record at least one clinical diagnosis / assessment.");
      return;
    }

    const activePatientId = patientId || encounterData?.patient_id;
    const activeDoctorId = doctorId || encounterData?.doctor_id || user?.staff_id || user?.staffId;

    if (!activePatientId) {
      setError("Missing active patient identifier.");
      return;
    }

    try {
      setSaving(true);
      let currentEncId = encounterId;

      const payload = {
        patientId: activePatientId,
        doctorId: activeDoctorId,
        appointmentId,
        visitId: encounterData?.visit_id || null,
        chiefComplaint,
        historySymptoms,
        examinationFindings,
        clinicalNotes,
        treatmentPlan,
        followUpDate: followUpDate || null,
        followUpInstructions,
        priority,
        diagnoses: filteredDiagnoses,
      };

      if (currentEncId) {
        await updateEncounter(currentEncId, payload);
      } else {
        const created = await createEncounter(payload);
        currentEncId = created.data.id;
        setEncounterId(currentEncId);
        navigate(`/encounters/${currentEncId}`, { replace: true });
      }

      isFormDirty.current = false;

      if (asComplete) {
        await completeEncounter(currentEncId);
        setSuccess("Consultation finalized successfully.");
        toast.success("Consultation finalized and locked successfully.", 5000);
        setStatus("COMPLETED");
        loadEncounter(currentEncId, false);
      } else {
        setSuccess("Clinical encounter notes saved as Draft.");
        toast.success("Clinical encounter notes saved as Draft.", 5000);
        loadEncounter(currentEncId, true);
      }
    } catch (err) {
      const errMsg = err.message || "Failed to save clinical encounter.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setSaving(false);
    }
  }

  // Handle Order Success
  const handleOrderCreated = (msg) => {
    setSuccess(msg);
    toast.success(msg, 5000);
    if (encounterId) {
      loadEncounter(encounterId, true);
    }
    setActiveTab("ORDERS");
  };

  // Referral Submit
  const handleReferralSubmit = async (e) => {
    e.preventDefault();
    const activePatientId = patientId || encounterData?.patient_id;
    const activeDoctorId = doctorId || encounterData?.doctor_id || user?.staff_id || user?.staffId;

    if (!referralForm.receivingDoctorId) {
      setError("Please select a receiving specialist doctor.");
      toast.error("Please select a receiving specialist doctor.", 5000);
      return;
    }
    if (!activePatientId) {
      setError("Missing patient record for referral.");
      toast.error("Missing patient record for referral.", 5000);
      return;
    }

    setReferralSubmitting(true);
    setError("");
    try {
      await createReferral({
        patientId: activePatientId,
        referringDoctorId: activeDoctorId,
        receivingDoctorId: referralForm.receivingDoctorId,
        urgency: referralForm.urgency,
        symptoms: referralForm.symptoms || historySymptoms || chiefComplaint,
        findings: referralForm.findings || examinationFindings,
        diagnosis: referralForm.diagnosis || diagnoses[0]?.description,
        investigationInfo: referralForm.investigationInfo,
        treatmentProvided: referralForm.treatmentProvided || treatmentPlan,
        caseNote: referralForm.caseNote || clinicalNotes || "Patient referral for specialist consultation.",
      });
      const msg = "Patient referral dispatched successfully.";
      setSuccess(msg);
      toast.success(msg, 5000);
      setShowReferralModal(false);
    } catch (err) {
      const errMsg = err.message || "Failed to dispatch patient referral.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setReferralSubmitting(false);
    }
  };

  const patient = patientData?.patient || (encounterData ? {
    id: encounterData.patient_id,
    first_name: encounterData.patient_first_name,
    last_name: encounterData.patient_last_name,
    patient_number: encounterData.patient_number,
    date_of_birth: encounterData.patient_dob,
    gender: encounterData.patient_gender,
    phone: encounterData.patient_phone,
    age: encounterData.patient_age,
  } : null);

  const effectivePatientId = patientId || encounterData?.patient_id || patient?.id;
  const effectiveDoctorId = doctorId || encounterData?.doctor_id || user?.staff_id || user?.staffId;

  const latestVital = encounterData?.vitals?.[0] || patientData?.vitals?.[0];
  const serviceOrders = encounterData?.serviceOrders || [];
  const prescriptions = encounterData?.prescriptions || [];
  const labOrders = encounterData?.labOrders || [];
  const radiologyOrders = encounterData?.radiologyOrders || [];
  const procedureOrders = encounterData?.procedureOrders || [];
  const surgeryOrders = encounterData?.surgeryOrders || [];
  const admissions = encounterData?.admissions || [];
  const historyList = encounterData?.history || [];

  if (loading && !patient) {
    return (
      <AppShell>
        <div className="p-12 text-center text-gray-500">Loading Doctor Consultation Workspace...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* 1. PATIENT HEADER BAR */}
      <div className="page-header" style={{ marginBottom: "16px" }}>
        <div>
          <p className="page-eyebrow">Clinical Command Center</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            Doctor Consultation Workspace
            <StatusBadge status={status} />
          </h1>
          <p className="page-description">
            Document clinical findings, prescribe medications, issue multi-department orders, and monitor diagnostic results.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {status !== "COMPLETED" ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => handleSaveEncounter(false)}
                disabled={saving}
              >
                {saving ? "Saving..." : "💾 Save Draft"}
              </button>
              <button
                type="button"
                className="button button-primary font-bold"
                onClick={() => handleSaveEncounter(true)}
                disabled={saving}
              >
                {saving ? "Finalizing..." : "✓ Finalize Consultation"}
              </button>
            </>
          ) : (
            <span className="badge badge-success font-bold px-3 py-1.5 text-sm">
              🔒 Finalized & Locked
            </span>
          )}

          {patient && (
            <Link to={`/patients/${patient.id}`} className="button button-secondary">
              ← Patient Chart
            </Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* Patient Demographic & Triage Summary */}
      {patient && (
        <section
          className="card"
          style={{
            marginBottom: "16px",
            background: "linear-gradient(to right, #f8fafc, #eff6ff)",
            border: "1px solid #bfdbfe",
            padding: "14px 18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <strong style={{ fontSize: "19px", color: "#1e293b" }}>
                  {patient.first_name} {patient.last_name}
                </strong>
                <span className="badge badge-info font-mono">{patient.patient_number}</span>
                <span className={`badge ${priority === "EMERGENCY" ? "badge-danger" : priority === "URGENT" ? "badge-warning" : "badge-secondary"}`}>
                  {priority} PRIORITY
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                Age: <strong>{patient.age != null ? `${patient.age} yrs` : "—"}</strong> | Gender: <strong>{patient.gender}</strong> | DOB: {patient.date_of_birth} | Phone: {patient.phone}
                {encounterData?.visit_number && <span> | Visit #: <strong className="font-mono">{encounterData.visit_number}</strong></span>}
                {encounterData?.appointment_number && <span> | Appt #: <strong className="font-mono">{encounterData.appointment_number}</strong></span>}
                {encounterData?.doctor_first_name && <span> | Attending: Dr. {encounterData.doctor_first_name} {encounterData.doctor_last_name}</span>}
              </div>
            </div>

            {latestVital ? (
              <div style={{ fontSize: "12px", background: "#ffffff", padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                <div style={{ fontWeight: 600, color: "#475569", marginBottom: "2px" }}>
                  Triage Vitals ({new Date(latestVital.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}):
                </div>
                <div>
                  BP: <strong>{latestVital.systolic_bp}/{latestVital.diastolic_bp}</strong> | HR: <strong>{latestVital.heart_rate} bpm</strong> | Temp: <strong>{latestVital.temperature}°C</strong> | SpO2: <strong>{latestVital.oxygen_saturation}%</strong> | BMI: <strong>{latestVital.bmi}</strong>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>No triage vitals recorded for this visit yet.</div>
            )}
          </div>
        </section>
      )}



      {/* 3. MAIN NAVIGATION TABS */}
      <div style={{ display: "flex", gap: "6px", borderBottom: "2px solid #e2e8f0", marginBottom: "18px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("CONSULTATION")}
          style={{
            padding: "10px 18px",
            fontWeight: 700,
            fontSize: "14px",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "CONSULTATION" ? "3px solid #4f46e5" : "3px solid transparent",
            color: activeTab === "CONSULTATION" ? "#4f46e5" : "#64748b",
          }}
        >
          Consultation Documentation
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ORDERS")}
          style={{
            padding: "10px 18px",
            fontWeight: 700,
            fontSize: "14px",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "ORDERS" ? "3px solid #4f46e5" : "3px solid transparent",
            color: activeTab === "ORDERS" ? "#4f46e5" : "#64748b",
          }}
        >
          Current Orders ({serviceOrders.length + prescriptions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("RESULTS")}
          style={{
            padding: "10px 18px",
            fontWeight: 700,
            fontSize: "14px",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "RESULTS" ? "3px solid #4f46e5" : "3px solid transparent",
            color: activeTab === "RESULTS" ? "#4f46e5" : "#64748b",
          }}
        >
          Results & Reports ({labOrders.length + radiologyOrders.length + procedureOrders.length + surgeryOrders.length + admissions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("HISTORY")}
          style={{
            padding: "10px 18px",
            fontWeight: 700,
            fontSize: "14px",
            border: "none",
            background: "none",
            cursor: "pointer",
            borderBottom: activeTab === "HISTORY" ? "3px solid #4f46e5" : "3px solid transparent",
            color: activeTab === "HISTORY" ? "#4f46e5" : "#64748b",
          }}
        >
          📜 Patient History & Timeline ({historyList.length})
        </button>
      </div>

      {/* 4. TAB CONTENTS */}

      {/* TAB 1: CONSULTATION DOCUMENTATION */}
      {activeTab === "CONSULTATION" && (
        <div className="appointment-layout">
          {/* Section 1: Clinical Narrative */}
          <section className="card">
            <div className="card-header">
              <h2>1. Clinical Presentation & Findings</h2>
              <p>Document patient history, subjective symptoms, and objective physical examination findings.</p>
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label className="font-semibold">
                Chief Complaint <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                className="input"
                placeholder="e.g. Acute severe lower abdominal pain with fever for 2 days"
                value={chiefComplaint}
                onChange={(e) => {
                  isFormDirty.current = true;
                  setChiefComplaint(e.target.value);
                }}
                disabled={status === "COMPLETED"}
                required
              />
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label className="font-semibold">History of Present Illness (HPI) & Relevant Medical History</label>
              <textarea
                rows={3}
                className="textarea"
                placeholder="Onset, duration, character, radiation, aggravating/relieving factors, previous episodes, drug allergies..."
                value={historySymptoms}
                onChange={(e) => {
                  isFormDirty.current = true;
                  setHistorySymptoms(e.target.value);
                }}
                disabled={status === "COMPLETED"}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label className="font-semibold">Physical Examination & Systemic Findings</label>
              <textarea
                rows={3}
                className="textarea"
                placeholder="General appearance, HEENT, chest/lungs, CVS, abdomen (rebound/guarding), CNS, extremities..."
                value={examinationFindings}
                onChange={(e) => {
                  isFormDirty.current = true;
                  setExaminationFindings(e.target.value);
                }}
                disabled={status === "COMPLETED"}
              />
            </div>
          </section>

          {/* Section 2: Diagnoses & Assessment */}
          <section className="card">
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>2. Clinical Diagnoses & Assessment</h2>
                <p>Database-driven ICD diagnostic classification and severity.</p>
              </div>
              {status !== "COMPLETED" && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleAddDiagnosis}
                >
                  + Add Diagnosis
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {diagnoses.map((diag, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "110px 1fr 140px 100px 40px",
                    gap: "10px",
                    alignItems: "center",
                    padding: "10px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                  }}
                >
                  <input
                    className="input"
                    placeholder="ICD Code"
                    value={diag.code}
                    onChange={(e) => handleDiagnosisChange(idx, "code", e.target.value)}
                    disabled={status === "COMPLETED"}
                  />
                  <input
                    className="input"
                    placeholder="Diagnosis description (e.g. Acute Appendicitis, Essential Hypertension)"
                    value={diag.description}
                    onChange={(e) => handleDiagnosisChange(idx, "description", e.target.value)}
                    disabled={status === "COMPLETED"}
                    required
                  />
                  <select
                    className="select"
                    value={diag.severity}
                    onChange={(e) => handleDiagnosisChange(idx, "severity", e.target.value)}
                    disabled={status === "COMPLETED"}
                  >
                    <option value="MILD">Mild</option>
                    <option value="MODERATE">Moderate</option>
                    <option value="SEVERE">Severe</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="primary_diag"
                      checked={diag.isPrimary}
                      onChange={() => handleDiagnosisChange(idx, "isPrimary", true)}
                      disabled={status === "COMPLETED"}
                    />
                    Primary
                  </label>
                  {status !== "COMPLETED" && (
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "4px 8px", color: "var(--danger)" }}
                      onClick={() => handleRemoveDiagnosis(idx)}
                      disabled={diagnoses.length === 1}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Treatment Plan, Priority & Follow-Up */}
          <section className="card">
            <div className="card-header">
              <h2>3. Treatment Plan & Directives</h2>
              <p>Physician recommendations, therapeutic strategy, and follow-up directives.</p>
            </div>

            <div className="form-grid" style={{ marginBottom: "14px" }}>
              <div className="form-field">
                <label className="font-semibold">Treatment Plan</label>
                <textarea
                  rows={3}
                  className="textarea"
                  placeholder="Medical therapy, dietary restrictions, activity limits, wound dressing schedule..."
                  value={treatmentPlan}
                  onChange={(e) => {
                    isFormDirty.current = true;
                    setTreatmentPlan(e.target.value);
                  }}
                  disabled={status === "COMPLETED"}
                />
              </div>

              <div className="form-field">
                <label className="font-semibold">Additional Clinical Notes</label>
                <textarea
                  rows={3}
                  className="textarea"
                  placeholder="Additional observations, family counseling, precautions..."
                  value={clinicalNotes}
                  onChange={(e) => {
                    isFormDirty.current = true;
                    setClinicalNotes(e.target.value);
                  }}
                  disabled={status === "COMPLETED"}
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label className="font-semibold">Encounter Priority</label>
                <select
                  className="select"
                  value={priority}
                  onChange={(e) => {
                    isFormDirty.current = true;
                    setPriority(e.target.value);
                  }}
                  disabled={status === "COMPLETED"}
                >
                  <option value="ROUTINE">ROUTINE (Standard Consultation)</option>
                  <option value="URGENT">URGENT (Priority Attention)</option>
                  <option value="EMERGENCY">EMERGENCY (Immediate Critical Care)</option>
                </select>
              </div>

              <div className="form-field">
                <label className="font-semibold">Follow-Up Date</label>
                <input
                  type="date"
                  className="input"
                  min={new Date().toISOString().split("T")[0]}
                  value={followUpDate}
                  onChange={(e) => {
                    isFormDirty.current = true;
                    setFollowUpDate(e.target.value);
                  }}
                  disabled={status === "COMPLETED"}
                />
              </div>

              <div className="form-field">
                <label className="font-semibold">Follow-Up Instructions</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Return in 2 weeks for repeat CBC or sooner if fever spikes"
                  value={followUpInstructions}
                  onChange={(e) => {
                    isFormDirty.current = true;
                    setFollowUpInstructions(e.target.value);
                  }}
                  disabled={status === "COMPLETED"}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: CURRENT ORDERS (3-PILLAR STATUS) */}
      {activeTab === "ORDERS" && (
        <div className="space-y-4">
          <section className="card">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2>Current Clinical Orders ({serviceOrders.length + prescriptions.length})</h2>
                <p className="text-xs text-muted">
                  Live tracking of all diagnostic investigations, procedures, prescriptions, surgery, and bed requests.
                </p>
              </div>
            </div>

            {serviceOrders.length === 0 && prescriptions.length === 0 ? (
              <div className="empty-state p-8 text-center text-muted">
                <p>No orders created for this consultation yet. Use the Action Toolbar above to place orders.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order # / Code</th>
                      <th>Item / Service Name</th>
                      <th>Department</th>
                      <th>Financial Status</th>
                      <th>Payment Authorization</th>
                      <th>Execution Status</th>
                      <th>Standard Price</th>
                      <th>Queue / Routing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Non-Medicine Service Orders */}
                    {serviceOrders.map((so) => (
                      <tr key={so.id}>
                        <td className="font-mono font-bold text-xs">{so.order_number}</td>
                        <td className="font-semibold text-sm">
                          {so.service_name}
                          {so.clinical_notes && (
                            <span className="block text-xs text-muted font-normal">{so.clinical_notes}</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-secondary font-mono text-[11px]">{so.department_code}</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              so.financial_status === "PAID"
                                ? "badge-success"
                                : so.financial_status === "PARTIALLY_PAID"
                                ? "badge-warning"
                                : "badge-danger"
                            }`}
                          >
                            {so.financial_status}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              so.authorization_status === "AUTHORIZED"
                                ? "badge-success"
                                : "badge-secondary"
                            }`}
                          >
                            {so.authorization_status}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              so.execution_status === "COMPLETED" || so.execution_status === "REPORTED" || so.execution_status === "ADMITTED"
                                ? "badge-success"
                                : so.execution_status === "IN_PROGRESS"
                                ? "badge-info"
                                : so.execution_status === "QUEUED"
                                ? "badge-warning"
                                : "badge-secondary"
                            }`}
                          >
                            {so.execution_status}
                          </span>
                        </td>
                        <td className="font-mono font-medium">{formatCurrency(so.price)}</td>
                        <td className="text-xs">
                          {so.queue_number ? (
                            <strong className="text-primary font-mono">{so.queue_number}</strong>
                          ) : (
                            <span className="text-muted">Cashier Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* Prescription Orders */}
                    {prescriptions.map((rx) => (
                      <tr key={rx.id} style={{ background: "#f0fdf4" }}>
                        <td className="font-mono font-bold text-xs">{rx.prescription_number}</td>
                        <td className="font-semibold text-sm text-emerald-900">
                          💊 {rx.medication_name} ({rx.dosage}, {rx.frequency})
                          <span className="block text-xs text-emerald-700 font-normal">
                            Route: {rx.route} | Duration: {rx.duration} | Qty: {rx.quantity}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-success font-mono text-[11px]">PHARMACY</span>
                        </td>
                        <td>
                          <span className={`badge ${rx.status === "DISPENSED" || rx.status === "PAID" ? "badge-success" : "badge-warning"}`}>
                            {rx.status === "DISPENSED" ? "PAID" : "PHARMACY CASHIER"}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-success">DIRECT TO RX</span>
                        </td>
                        <td>
                          <span className={`badge ${rx.status === "DISPENSED" ? "badge-success" : "badge-warning"}`}>
                            {rx.status === "DISPENSED" ? "DISPENSED" : "WAITING DISPENSING"}
                          </span>
                        </td>
                        <td className="font-mono font-medium text-xs">
                          {rx.unit_price ? formatCurrency(rx.unit_price * rx.quantity) : "Formulary"}
                        </td>
                        <td className="text-xs text-emerald-800 font-medium">
                          {rx.status === "DISPENSED" ? `Dispensed (${rx.dispensed_by_username || "Pharmacist"})` : "Pharmacy Counter"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: DIAGNOSTIC RESULTS & REPORTS (READ-ONLY) */}
      {activeTab === "RESULTS" && (
        <div className="space-y-6">
          {/* Laboratory Diagnostic Results */}
          <section className="card">
            <div className="card-header">
              <h2>🧪 Diagnostic Laboratory Results ({labOrders.length})</h2>
              <p className="text-xs text-muted">Read-only laboratory findings entered and verified by the Laboratory Department.</p>
            </div>

            {labOrders.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No laboratory investigations ordered for this encounter.</div>
            ) : (
              <div className="space-y-3">
                {labOrders.map((lab) => (
                  <div key={lab.id} className="p-3.5 border rounded-lg bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">
                        {lab.test_name} ({lab.test_code}) — {lab.test_category}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">#{lab.order_number}</span>
                        <StatusBadge status={lab.status} />
                      </div>
                    </div>

                    {lab.result_value ? (
                      <div className="p-3 bg-white border rounded-lg space-y-1.5 shadow-2xs">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <span className="text-gray-500">Test Result:</span>{" "}
                            <span className={`font-bold text-base ${lab.is_abnormal ? "text-red-600" : "text-gray-900"}`}>
                              {lab.result_value} {lab.result_unit || lab.standard_unit || ""}
                            </span>
                            {lab.is_abnormal && (
                              <span className="ml-2 text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                                ABNORMAL
                              </span>
                            )}
                          </div>
                          {(lab.result_reference_range || lab.standard_reference_range) && (
                            <div className="text-gray-500">
                              Reference Range: <strong>{lab.result_reference_range || lab.standard_reference_range}</strong>
                            </div>
                          )}
                        </div>

                        {lab.result_comments && (
                          <div className="text-gray-700 italic pt-1">
                            Technician Remarks: {lab.result_comments}
                          </div>
                        )}

                        <div className="text-[11px] text-gray-400 pt-1 border-t flex justify-between">
                          <span>
                            Resulted by: {lab.entered_by_username || "Lab Technologist"} • Verified by: {lab.verified_by_username || "Lab Supervisor"}
                          </span>
                          {lab.result_entered_at && (
                            <span>{new Date(lab.result_entered_at).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-amber-700 italic py-2">
                        ⏳ Laboratory investigation in progress. Waiting for specimen collection / result verification.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Radiology Reports */}
          <section className="card">
            <div className="card-header">
              <h2>🩻 Radiology & Imaging Reports ({radiologyOrders.length})</h2>
              <p className="text-xs text-muted">Official radiological reports signed by the Radiologist.</p>
            </div>

            {radiologyOrders.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No imaging examinations ordered for this encounter.</div>
            ) : (
              <div className="space-y-4">
                {radiologyOrders.map((rad) => (
                  <div key={rad.id} className="p-4 border rounded-lg bg-slate-50 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">
                        {rad.service_name || rad.modality}
                      </span>
                      <StatusBadge status={rad.status} />
                    </div>

                    {rad.clinical_indication && (
                      <div>
                        <span className="font-semibold text-gray-600">Clinical Indication:</span> {rad.clinical_indication}
                      </div>
                    )}

                    {rad.findings && (
                      <div>
                        <span className="font-semibold text-gray-700">Findings:</span>
                        <p className="mt-0.5 text-gray-800 whitespace-pre-wrap bg-white p-2.5 border rounded">
                          {rad.findings}
                        </p>
                      </div>
                    )}

                    {rad.impression && (
                      <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded text-indigo-900">
                        <span className="font-bold">Impression:</span> {rad.impression}
                      </div>
                    )}

                    {rad.recommendations && (
                      <div>
                        <span className="font-semibold text-gray-700">Recommendations:</span> {rad.recommendations}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-400 pt-1.5 border-t flex justify-between">
                      <span>Reported by: {rad.reported_by_username || "Staff Radiologist"}</span>
                      <span>{rad.reported_at ? new Date(rad.reported_at).toLocaleString() : "Report Pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Procedure Logs */}
          <section className="card">
            <div className="card-header">
              <h2>🩹 Clinical Procedure Records ({procedureOrders.length})</h2>
              <p className="text-xs text-muted">Records of minor surgical procedures, dressings, and therapeutic injections performed.</p>
            </div>

            {procedureOrders.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No clinical procedures ordered for this encounter.</div>
            ) : (
              <div className="space-y-3">
                {procedureOrders.map((proc) => (
                  <div key={proc.id} className="p-3.5 border rounded-lg bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">
                        {proc.procedure_name || proc.procedure_type}
                      </span>
                      <StatusBadge status={proc.status} />
                    </div>

                    {proc.findings && (
                      <div>
                        <span className="font-semibold">Procedure Findings:</span> {proc.findings}
                      </div>
                    )}
                    {proc.materials_used && (
                      <div>
                        <span className="font-semibold">Materials & Supplies Used:</span> {proc.materials_used}
                      </div>
                    )}
                    {proc.complications && (
                      <div className="text-red-700">
                        <span className="font-semibold">Complications:</span> {proc.complications}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-400 pt-1 border-t flex justify-between">
                      <span>Performed by: {proc.performed_by_username || "Procedure Nurse/Clinician"}</span>
                      <span>{proc.performed_at ? new Date(proc.performed_at).toLocaleString() : "Execution Pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Surgery / Operating Theatre Records */}
          <section className="card">
            <div className="card-header">
              <h2>🏥 Operating Theatre & Surgical Records ({surgeryOrders.length})</h2>
              <p className="text-xs text-muted">Complete operative records and post-anesthesia recovery logs.</p>
            </div>

            {surgeryOrders.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No surgical procedures requested for this encounter.</div>
            ) : (
              <div className="space-y-4">
                {surgeryOrders.map((surg) => (
                  <div key={surg.id} className="p-4 border rounded-lg bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-gray-900">{surg.surgery_name}</span>
                      <StatusBadge status={surg.status} />
                    </div>

                    <div className="grid grid-2 gap-3 text-gray-700">
                      <div><span className="font-semibold">Pre-Op Diagnosis:</span> {surg.pre_op_diagnosis || "—"}</div>
                      <div><span className="font-semibold">Post-Op Diagnosis:</span> {surg.post_op_diagnosis || "—"}</div>
                      <div><span className="font-semibold">Theatre Room:</span> {surg.theatre_room || "—"}</div>
                      <div><span className="font-semibold">Anesthesia:</span> {surg.anesthesia_type || "—"}</div>
                    </div>

                    {surg.intra_op_findings && (
                      <div className="bg-white p-2.5 border rounded">
                        <span className="font-semibold text-gray-800">Intra-Operative Findings:</span>
                        <p className="mt-0.5 text-gray-700">{surg.intra_op_findings}</p>
                      </div>
                    )}

                    {surg.operation_notes && (
                      <div className="bg-white p-2.5 border rounded">
                        <span className="font-semibold text-gray-800">Operative Procedure Notes:</span>
                        <p className="mt-0.5 text-gray-700">{surg.operation_notes}</p>
                      </div>
                    )}

                    {surg.post_op_instructions && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 font-medium">
                        Post-Op Directives: {surg.post_op_instructions}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-400 pt-1.5 border-t flex justify-between">
                      <span>Surgeon / Team: {surg.performed_by_username || "Surgical Specialist"} • Dest: {surg.recovery_destination || "Ward"}</span>
                      <span>{surg.completed_at ? new Date(surg.completed_at).toLocaleString() : "Scheduled / In Theatre"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Inpatient Admission & Bed Records */}
          <section className="card">
            <div className="card-header">
              <h2>🛏️ Inpatient Ward & Bed Location ({admissions.length})</h2>
              <p className="text-xs text-muted">Inpatient admission status and allocated hospital bed.</p>
            </div>

            {admissions.length === 0 ? (
              <div className="p-4 text-xs text-muted text-center">No active inpatient admission for this patient.</div>
            ) : (
              <div className="space-y-3">
                {admissions.map((adm) => (
                  <div key={adm.id} className="p-4 border rounded-lg bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong className="text-sm text-gray-900 font-mono">Admission #{adm.admission_number}</strong>
                        <span className="block text-gray-600">
                          Ward: <strong>{adm.ward_name || "General Ward"}</strong> | Bed: <strong className="text-primary font-mono">{adm.bed_number || "Awaiting Assignment"}</strong> ({adm.bed_type})
                        </span>
                      </div>
                      <StatusBadge status={adm.status} />
                    </div>

                    <div className="p-2.5 bg-white border rounded">
                      <span className="font-semibold">Admission Reason:</span> {adm.admission_reason || "Inpatient Care"}
                      {adm.admission_date && (
                        <div className="text-gray-500 mt-1">
                          Admitted on: <strong>{new Date(adm.admission_date).toLocaleString()}</strong>
                        </div>
                      )}
                    </div>

                    {adm.discharge_summary && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">
                        <strong>Discharge Summary:</strong> {adm.discharge_summary}
                        {adm.discharge_date && (
                          <div className="text-xs text-emerald-700 mt-1">
                            Discharged: {new Date(adm.discharge_date).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: CLINICAL HISTORY & TIMELINE */}
      {activeTab === "HISTORY" && (
        <div className="space-y-4">
          <section className="card">
            <div className="card-header">
              <h2>📜 Past Consultations & Clinical Timeline ({historyList.length})</h2>
              <p className="text-xs text-muted">Chronological clinical history of prior consultations and documented care.</p>
            </div>

            {historyList.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">
                No previous clinical consultation records found for this patient.
              </div>
            ) : (
              <div className="space-y-4">
                {historyList.map((hist) => (
                  <div key={hist.id} className="p-4 border rounded-lg bg-slate-50 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong className="text-sm text-gray-900">
                          Consultation on {new Date(hist.visit_date).toLocaleDateString()}
                        </strong>
                        <span className="text-gray-500 ml-2">by Dr. {hist.doctor_first_name} {hist.doctor_last_name}</span>
                      </div>
                      <StatusBadge status={hist.status} />
                    </div>

                    {hist.chief_complaint && (
                      <div>
                        <span className="font-semibold">Chief Complaint:</span> {hist.chief_complaint}
                      </div>
                    )}

                    {hist.diagnoses && hist.diagnoses.length > 0 && (
                      <div>
                        <span className="font-semibold">Diagnoses: </span>
                        {hist.diagnoses.map((d, i) => (
                          <span key={i} className="badge badge-secondary mr-1">
                            {d.description} {d.code ? `(${d.code})` : ""}
                          </span>
                        ))}
                      </div>
                    )}

                    {hist.treatment_plan && (
                      <div className="text-gray-700">
                        <span className="font-semibold">Treatment Plan:</span> {hist.treatment_plan}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 4. BOTTOM ACTION COMMAND BAR: CLINICAL ACTION POINT (CREATE ORDERS), SAVE DRAFT, FINALIZE */}
      <section
        className="card"
        style={{
          marginTop: "24px",
          marginBottom: "32px",
          padding: "16px 20px",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        {/* Left Side: Clinical Action Point (Create Orders) */}
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
            Clinical Action Point (Create Orders):
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#4f46e5", boxShadow: "0 2px 4px rgba(79, 70, 229, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowLabModal(true)}
            >
              + Laboratory
            </button>

            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#059669", boxShadow: "0 2px 4px rgba(5, 150, 105, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowRxModal(true)}
            >
              + Prescription
            </button>

            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#0284c7", boxShadow: "0 2px 4px rgba(2, 132, 199, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowRadModal(true)}
            >
              + Radiology
            </button>

            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#d97706", boxShadow: "0 2px 4px rgba(217, 119, 6, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowProcModal(true)}
            >
              + Procedure
            </button>

            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#dc2626", boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowSurgModal(true)}
            >
              + Surgery
            </button>

            <button
              type="button"
              className="button button-primary button-sm font-bold"
              style={{ background: "#7c3aed", boxShadow: "0 2px 4px rgba(124, 58, 237, 0.2)", padding: "7px 14px", borderRadius: "8px" }}
              onClick={() => setShowAdmModal(true)}
            >
              + Admission / Bed
            </button>

            <button
              type="button"
              className="button button-secondary button-sm font-bold"
              style={{ padding: "7px 14px", borderRadius: "8px" }}
              onClick={async () => {
                if (allDoctors.length === 0) {
                  try {
                    const res = await getDoctors();
                    const currentDocId = user?.staff_id || user?.staffId;
                    setAllDoctors((res.data || []).filter((d) => d.id !== currentDocId));
                  } catch { /* silent */ }
                }
                setShowReferralModal(true);
              }}
            >
              Refer Patient
            </button>
          </div>
        </div>

        {/* Right Side: Consultation Actions (Save Draft & Finalize) */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {status !== "COMPLETED" ? (
            <>
              <button
                type="button"
                className="button button-secondary font-bold"
                style={{ padding: "9px 20px", borderRadius: "8px", fontSize: "13px" }}
                onClick={() => handleSaveEncounter(false)}
                disabled={saving}
              >
                {saving ? "Saving Draft..." : "Save Draft"}
              </button>
              <button
                type="button"
                className="button button-primary font-bold"
                style={{
                  background: "#059669",
                  padding: "9px 24px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
                }}
                onClick={() => handleSaveEncounter(true)}
                disabled={saving}
              >
                {saving ? "Finalizing..." : "Finalize Consultation"}
              </button>
            </>
          ) : (
            <span className="badge badge-success font-bold px-4 py-2 text-sm" style={{ borderRadius: "8px" }}>
              Finalized & Locked
            </span>
          )}
        </div>
      </section>

      {/* 5. ORDER MODALS */}
      <LaboratoryOrderModal
        isOpen={showLabModal}
        onClose={() => setShowLabModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      <RadiologyOrderModal
        isOpen={showRadModal}
        onClose={() => setShowRadModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      <PrescriptionOrderModal
        isOpen={showRxModal}
        onClose={() => setShowRxModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      <ProcedureOrderModal
        isOpen={showProcModal}
        onClose={() => setShowProcModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      <SurgeryRequestModal
        isOpen={showSurgModal}
        onClose={() => setShowSurgModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      <AdmissionRequestModal
        isOpen={showAdmModal}
        onClose={() => setShowAdmModal(false)}
        patientId={effectivePatientId}
        encounterId={encounterId}
        doctorId={effectiveDoctorId}
        onSuccess={handleOrderCreated}
      />

      {/* Referral Modal */}
      {showReferralModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowReferralModal(false)}
          title="Refer Patient to Specialist Colleague"
          subtitle="Dispatches clinical referral with history and case findings"
          icon="↗"
        >
          <form onSubmit={handleReferralSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Receiving Specialist Doctor <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                className="select"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                value={referralForm.receivingDoctorId}
                onChange={(e) => setReferralForm({ ...referralForm, receivingDoctorId: e.target.value })}
                required
              >
                <option value="">-- Choose Specialist Doctor --</option>
                {allDoctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    Dr. {doc.first_name} {doc.last_name} ({doc.specialty || "Specialist"})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Urgency
                </label>
                <select
                  className="select"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  value={referralForm.urgency}
                  onChange={(e) => setReferralForm({ ...referralForm, urgency: e.target.value })}
                >
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                  Clinical Diagnosis
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  value={referralForm.diagnosis || diagnoses[0]?.description || ""}
                  onChange={(e) => setReferralForm({ ...referralForm, diagnosis: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                Reason for Referral & Clinical Case Notes <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={3}
                className="textarea"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                placeholder="Specialist consultation rationale, management requested, clinical summary..."
                value={referralForm.caseNote}
                onChange={(e) => setReferralForm({ ...referralForm, caseNote: e.target.value })}
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" onClick={() => setShowReferralModal(false)} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
                Cancel
              </button>
              <button type="submit" disabled={referralSubmitting} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#4f46e5" }}>
                {referralSubmitting ? "Dispatching..." : "Dispatch Referral"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
