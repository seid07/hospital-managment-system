import { useEffect, useState } from "react";
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
import { getMedications, createPrescription } from "../services/pharmacyService";
import { getTestCatalog, createLabOrder } from "../services/laboratoryService";
import { getDoctors } from "../services/scheduleService";
import { createReferral } from "../services/referralService";
import { useAuth } from "../context/useAuth";
import { formatCurrency } from "../utils/currency";

function ClinicalEncounter() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const appointmentId = searchParams.get("appointmentId");
  const initialPatientId = searchParams.get("patientId");
  const initialDoctorId = searchParams.get("doctorId") || user?.staff_id;

  const [encounterId, setEncounterId] = useState(id || null);
  const [patientId, setPatientId] = useState(initialPatientId || null);
  const [doctorId] = useState(initialDoctorId || null);

  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Encounter form fields
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [diagnoses, setDiagnoses] = useState([
    { code: "", description: "", isPrimary: true, severity: "MODERATE" },
  ]);

  // Modals for Prescriptions & Lab Orders
  const [showRxModal, setShowRxModal] = useState(false);
  const [showLabModal, setShowLabModal] = useState(false);
  const [medicationsList, setMedicationsList] = useState([]);
  const [labCatalog, setLabCatalog] = useState([]);

  // Rx form
  const [rxForm, setRxForm] = useState({
    medicationName: "",
    dosage: "",
    frequency: "Once daily",
    route: "Oral",
    duration: "7 days",
    quantity: 1,
    instructions: "",
  });
  const [prescriptionsCreated, setPrescriptionsCreated] = useState([]);

  // Lab form
  const [labForm, setLabForm] = useState({
    testId: "",
    clinicalIndication: "",
    priority: "ROUTINE",
  });
  const [labsCreated, setLabsCreated] = useState([]);

  const [saving, setSaving] = useState(false);
  const [rxSubmitting, setRxSubmitting] = useState(false);
  const [labSubmitting, setLabSubmitting] = useState(false);

  // Referral state
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
  const [referralError, setReferralError] = useState("");
  const [referralSuccess, setReferralSuccess] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadExistingEncounter() {
      try {
        const res = await getEncounter(id);
        if (!cancelled && res.data) {
          const enc = res.data;
          setEncounterId(enc.id);
          setPatientId(enc.patient_id);
          setChiefComplaint(enc.chief_complaint || "");
          setClinicalNotes(enc.clinical_notes || "");
          setTreatmentPlan(enc.treatment_plan || "");
          setFollowUpDate(enc.follow_up_date || "");
          setStatus(enc.status || "DRAFT");
          if (enc.diagnoses && enc.diagnoses.length > 0) {
            setDiagnoses(
              enc.diagnoses.map((d) => ({
                code: d.code || "",
                description: d.description || "",
                isPrimary: Boolean(d.is_primary),
                severity: d.severity || "MODERATE",
              }))
            );
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load clinical encounter.");
      }
    }
    loadExistingEncounter();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Load patient chart and recent vitals
  useEffect(() => {
    if (!patientId) {
      return;
    }

    let cancelled = false;
    async function loadPatientChart() {
      try {
        const res = await getPatientRecord(patientId);
        if (!cancelled && res.data) {
          setPatientData(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load patient chart.");
          setLoading(false);
        }
      }
    }
    loadPatientChart();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Load catalogs for prescriptions and labs
  useEffect(() => {
    let cancelled = false;
    async function loadCatalogs() {
      try {
        const [medsRes, labRes] = await Promise.all([
          getMedications({ limit: 100 }),
          getTestCatalog({ limit: 100 }),
        ]);
        if (!cancelled) {
          if (medsRes.data) setMedicationsList(medsRes.data);
          if (labRes.data) setLabCatalog(labRes.data);
        }
      } catch {
        // silent
      }
    }
    loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAddDiagnosis() {
    setDiagnoses((prev) => [
      ...prev,
      { code: "", description: "", isPrimary: false, severity: "MILD" },
    ]);
  }

  function handleRemoveDiagnosis(index) {
    setDiagnoses((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDiagnosisChange(index, field, value) {
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

  async function handleSaveEncounter(asComplete = false) {
    setError("");
    setSuccess("");

    if (!chiefComplaint.trim()) {
      setError("Please enter the patient's chief complaint.");
      return;
    }

    const filteredDiagnoses = diagnoses.filter((d) => d.description.trim());
    if (filteredDiagnoses.length === 0) {
      setError("Please enter at least one clinical diagnosis.");
      return;
    }

    try {
      setSaving(true);
      let currentEncId = encounterId;

      const payload = {
        patientId,
        doctorId,
        appointmentId,
        chiefComplaint,
        clinicalNotes,
        treatmentPlan,
        followUpDate: followUpDate || null,
        diagnoses: filteredDiagnoses,
      };

      if (currentEncId) {
        await updateEncounter(currentEncId, payload);
      } else {
        const created = await createEncounter(payload);
        currentEncId = created.data.id;
        setEncounterId(currentEncId);
      }

      if (asComplete) {
        await completeEncounter(currentEncId);
        setSuccess("Consultation finalized successfully.");
        navigate(`/patients/${patientId}`);
      } else {
        setSuccess("Clinical encounter saved as Draft.");
      }
    } catch (err) {
      setError(err.message || "Failed to save encounter.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPrescription(e) {
    e.preventDefault();
    if (!encounterId) {
      setError("Please save the encounter first before prescribing medications.");
      return;
    }
    if (rxSubmitting) return; // guard against a double-click creating a duplicate prescription
    try {
      setRxSubmitting(true);
      setError("");
      const res = await createPrescription({
        encounterId,
        patientId,
        doctorId,
        ...rxForm,
        quantity: parseInt(rxForm.quantity, 10) || 1,
      });
      setPrescriptionsCreated((prev) => [...prev, res.data]);
      setShowRxModal(false);
      setRxForm({
        medicationName: "",
        dosage: "",
        frequency: "Once daily",
        route: "Oral",
        duration: "7 days",
        quantity: 1,
        instructions: "",
      });
      setSuccess("Prescription recorded for pharmacy queue.");
    } catch (err) {
      setError(err.message || "Failed to create prescription.");
    } finally {
      setRxSubmitting(false);
    }
  }

  async function handleAddLabOrder(e) {
    e.preventDefault();
    if (!encounterId) {
      setError("Please save the encounter first before ordering lab tests.");
      return;
    }
    if (labSubmitting) return; // guard against a double-click creating a duplicate lab order
    try {
      setLabSubmitting(true);
      setError("");
      const res = await createLabOrder({
        encounterId,
        patientId,
        doctorId,
        ...labForm,
      });
      setLabsCreated((prev) => [...prev, res.data]);
      setShowLabModal(false);
      setLabForm({ testId: "", clinicalIndication: "", priority: "ROUTINE" });
      setSuccess("Laboratory test order submitted to lab queue.");
    } catch (err) {
      setError(err.message || "Failed to order laboratory test.");
    } finally {
      setLabSubmitting(false);
    }
  }

  const patient = patientData?.patient;
  const latestVital = patientData?.vitals?.[0];

  if (patientId && loading && !patientData) {
    return (
      <AppShell>
        <div className="loading-state">Loading patient consultation workspace...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Clinical Encounter</p>
          <h1>Physician Consultation Workspace</h1>
          <p className="page-description">
            Document clinical assessment, record diagnoses, prescribe medications, and order diagnostics.
          </p>
        </div>

        <div className="page-actions">
          {patient && (
            <>
              <Link to={`/patients/${patient.id}`} className="button button-secondary">
                ← View Patient Chart
              </Link>
              <button
                type="button"
                className="button button-secondary"
                onClick={async () => {
                  setReferralError("");
                  setReferralSuccess("");
                  setReferralForm({ receivingDoctorId: "", urgency: "ROUTINE", symptoms: "", findings: "", diagnosis: "", investigationInfo: "", treatmentProvided: "", caseNote: "" });
                  if (allDoctors.length === 0) {
                    try {
                      const res = await getDoctors();
                      setAllDoctors((res.data || []).filter((d) => d.id !== user?.staff_id));
                    } catch { /* silent */ }
                  }
                  setShowReferralModal(true);
                }}
              >
                ↗ Refer Patient
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Patient Summary Header */}
      {patient && (
        <section
          className="card"
          style={{
            marginBottom: "20px",
            background: "var(--primary-light)",
            border: "1px solid var(--primary-border, #bfdbfe)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ fontSize: "18px" }}>
                  {patient.first_name} {patient.last_name}
                </strong>
                <span className="badge badge-info">{patient.patient_number}</span>
                <StatusBadge status={status} />
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                DOB: {patient.date_of_birth} | Gender: {patient.gender} | Phone: {patient.phone}
              </div>
            </div>

            {latestVital ? (
              <div style={{ fontSize: "12px", background: "#fff", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <strong>Vitals ({new Date(latestVital.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}): </strong>
                BP: <strong>{latestVital.systolic_bp}/{latestVital.diastolic_bp}</strong> | HR: <strong>{latestVital.heart_rate} bpm</strong> | Temp: <strong>{latestVital.temperature}°C</strong> | SpO2: <strong>{latestVital.oxygen_saturation}%</strong> | BMI: <strong>{latestVital.bmi}</strong>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No vitals recorded for this visit yet.</div>
            )}
          </div>
        </section>
      )}

      {/* Clinical Consultation Form */}
      <div className="appointment-layout">
        {/* Section 1: Chief Complaint & Notes */}
        <section className="card">
          <div className="card-header">
            <h2>1. Chief Complaint & History of Illness</h2>
            <p>Subjective symptoms and history presented by patient.</p>
          </div>

          <div className="form-field" style={{ marginBottom: "16px" }}>
            <label>
              Chief Complaint <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              placeholder="e.g. Acute severe migraine with nausea for 3 days"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              disabled={status === "COMPLETED"}
              required
            />
          </div>

          <div className="form-field" style={{ marginBottom: "16px" }}>
            <label>Physical Examination & Clinical Notes</label>
            <textarea
              rows="4"
              placeholder="Cardiovascular, respiratory, abdominal, neurological findings, patient history..."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              disabled={status === "COMPLETED"}
            />
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label>Treatment Plan & Physician Recommendations</label>
              <textarea
                rows="3"
                placeholder="Prescribed regimen, lifestyle changes, dietary restrictions..."
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                disabled={status === "COMPLETED"}
              />
            </div>

            <div className="form-field">
              <label>Follow-up Date</label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                disabled={status === "COMPLETED"}
              />
            </div>
          </div>
        </section>

        {/* Section 2: Diagnoses */}
        <section className="card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>2. Clinical Diagnoses & ICD Codes</h2>
              <p>Primary and secondary medical diagnoses.</p>
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
                  gridTemplateColumns: "100px 1fr 140px 100px 40px",
                  gap: "10px",
                  alignItems: "center",
                  padding: "8px",
                  background: "var(--surface-muted)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <input
                  placeholder="ICD Code (e.g. I10)"
                  value={diag.code}
                  onChange={(e) => handleDiagnosisChange(idx, "code", e.target.value)}
                  disabled={status === "COMPLETED"}
                />
                <input
                  placeholder="Diagnosis description (e.g. Essential Hypertension)"
                  value={diag.description}
                  onChange={(e) => handleDiagnosisChange(idx, "description", e.target.value)}
                  disabled={status === "COMPLETED"}
                  required
                />
                <select
                  value={diag.severity}
                  onChange={(e) => handleDiagnosisChange(idx, "severity", e.target.value)}
                  disabled={status === "COMPLETED"}
                >
                  <option value="MILD">Mild</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                  <option value="CRITICAL">Critical</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer" }}>
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

        {/* Section 3: Medication Prescriptions & Laboratory Orders */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Prescriptions Panel */}
          <section className="card">
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>Prescriptions</h2>
                <p>Medications for pharmacy dispensing.</p>
              </div>
              {status !== "COMPLETED" && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    if (!encounterId) {
                      handleSaveEncounter(false).then(() => setShowRxModal(true));
                    } else {
                      setShowRxModal(true);
                    }
                  }}
                >
                  + Prescribe
                </button>
              )}
            </div>

            {prescriptionsCreated.length === 0 ? (
              <div className="empty-state" style={{ padding: "16px" }}>No medications prescribed yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                {prescriptionsCreated.map((rx, i) => (
                  <li key={i} style={{ marginBottom: "6px" }}>
                    <strong>{rx.medication_name}</strong> — {rx.dosage}, {rx.frequency} ({rx.duration})
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Laboratory Orders Panel */}
          <section className="card">
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2>Diagnostic Lab Orders</h2>
                <p>Laboratory tests & panels.</p>
              </div>
              {status !== "COMPLETED" && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    if (!encounterId) {
                      handleSaveEncounter(false).then(() => setShowLabModal(true));
                    } else {
                      setShowLabModal(true);
                    }
                  }}
                >
                  + Order Lab
                </button>
              )}
            </div>

            {labsCreated.length === 0 ? (
              <div className="empty-state" style={{ padding: "16px" }}>No lab tests ordered yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                {labsCreated.map((lab, i) => (
                  <li key={i} style={{ marginBottom: "6px" }}>
                    <strong>{lab.order_number}</strong> — Priority: {lab.priority} ({lab.status})
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Section 4: Finalize & Actions */}
        {status !== "COMPLETED" && (
          <section className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Finalize Consultation:</strong>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                Completing will lock the encounter notes and mark the appointment as Completed.
              </p>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="button button-secondary button-large"
                onClick={() => handleSaveEncounter(false)}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>

              <button
                type="button"
                className="button button-primary button-large"
                onClick={() => handleSaveEncounter(true)}
                disabled={saving}
              >
                {saving ? "Finalizing..." : "✓ Complete & Finalize Consultation"}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Modal: Prescribe Medication */}
      <Modal isOpen={showRxModal} onClose={() => setShowRxModal(false)} title="Prescribe Medication">
        <form onSubmit={handleAddPrescription}>
          <div className="form-grid">
            <div className="form-field">
              <label>Select Medication from Formulary</label>
              <select
                value={rxForm.medicationName}
                onChange={(e) => {
                  const val = e.target.value;
                  const med = medicationsList.find((m) => m.name === val);
                  setRxForm({
                    ...rxForm,
                    medicationName: val,
                    dosage: med ? `${med.strength}` : rxForm.dosage,
                    route: med?.dosage_form === "Tablet" || med?.dosage_form === "Capsule" ? "Oral" : rxForm.route,
                  });
                }}
                required
              >
                <option value="">-- Choose Medication --</option>
                {medicationsList.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name} ({m.strength} {m.dosage_form}) - Stock: {m.stock_quantity}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Or Type Medication Name</label>
              <input
                placeholder="e.g. Amoxicillin"
                value={rxForm.medicationName}
                onChange={(e) => setRxForm({ ...rxForm, medicationName: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Dosage</label>
              <input
                placeholder="e.g. 500mg"
                value={rxForm.dosage}
                onChange={(e) => setRxForm({ ...rxForm, dosage: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Frequency</label>
              <select
                value={rxForm.frequency}
                onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })}
              >
                <option value="Once daily">Once daily</option>
                <option value="Twice daily (BID)">Twice daily (BID)</option>
                <option value="Three times daily (TID)">Three times daily (TID)</option>
                <option value="Four times daily (QID)">Four times daily (QID)</option>
                <option value="As needed (PRN)">As needed (PRN)</option>
              </select>
            </div>

            <div className="form-field">
              <label>Route</label>
              <select
                value={rxForm.route}
                onChange={(e) => setRxForm({ ...rxForm, route: e.target.value })}
              >
                <option value="Oral">Oral</option>
                <option value="Intravenous (IV)">Intravenous (IV)</option>
                <option value="Intramuscular (IM)">Intramuscular (IM)</option>
                <option value="Topical">Topical</option>
                <option value="Inhalation">Inhalation</option>
                <option value="Ophthalmic">Ophthalmic</option>
              </select>
            </div>

            <div className="form-field">
              <label>Duration</label>
              <input
                placeholder="e.g. 7 days"
                value={rxForm.duration}
                onChange={(e) => setRxForm({ ...rxForm, duration: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Total Quantity (Units / Tablets)</label>
              <input
                type="number"
                min="1"
                value={rxForm.quantity}
                onChange={(e) => setRxForm({ ...rxForm, quantity: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: "14px" }}>
            <label>Patient Instructions</label>
            <input
              placeholder="e.g. Take with food after breakfast"
              value={rxForm.instructions}
              onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowRxModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={rxSubmitting}>
              {rxSubmitting ? "Adding..." : "Add Prescription"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Order Diagnostic Lab Test */}
      <Modal isOpen={showLabModal} onClose={() => setShowLabModal(false)} title="Order Diagnostic Laboratory Test">
        <form onSubmit={handleAddLabOrder}>
          <div className="form-field" style={{ marginBottom: "14px" }}>
            <label>Select Test from Catalog</label>
            <select
              value={labForm.testId}
              onChange={(e) => setLabForm({ ...labForm, testId: e.target.value })}
              required
            >
              <option value="">-- Choose Lab Test --</option>
              {labCatalog
                .filter((t) => t.linked_service_code)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code}) - Category: {t.category} ({formatCurrency(t.price)})
                  </option>
                ))}
            </select>
            {labCatalog.some((t) => !t.linked_service_code) && (
              <small style={{ color: "var(--text-muted)" }}>
                Some catalog tests are hidden here because they aren&apos;t linked to a billable
                service yet. Ask an administrator to link them in Laboratory &gt; Catalog.
              </small>
            )}
          </div>

          <div className="form-field" style={{ marginBottom: "14px" }}>
            <label>Clinical Indication / Reason for Test</label>
            <input
              placeholder="e.g. Evaluate elevated blood glucose / fatigue"
              value={labForm.clinicalIndication}
              onChange={(e) => setLabForm({ ...labForm, clinicalIndication: e.target.value })}
            />
          </div>

          <div className="form-field">
            <label>Priority</label>
            <select
              value={labForm.priority}
              onChange={(e) => setLabForm({ ...labForm, priority: e.target.value })}
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="STAT">STAT (Immediate Emergency)</option>
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowLabModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={!labForm.testId || labSubmitting}>
              {labSubmitting ? "Ordering..." : "Submit Lab Order"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Refer Patient to Another Doctor */}
      <Modal isOpen={showReferralModal} onClose={() => setShowReferralModal(false)} title="Refer Patient to Another Doctor">
        {referralError && <div className="alert alert-error" style={{ marginBottom: "12px" }}>{referralError}</div>}
        {referralSuccess && <div className="alert alert-success" style={{ marginBottom: "12px" }}>{referralSuccess}</div>}
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!referralForm.receivingDoctorId) { setReferralError("Please select a receiving doctor."); return; }
          if (!referralForm.caseNote.trim()) { setReferralError("Case note / referral reason is required."); return; }
          try {
            setReferralSubmitting(true);
            setReferralError("");
            await createReferral({ patientId, ...referralForm });
            setReferralSuccess(`Referral sent successfully for ${patient?.first_name} ${patient?.last_name}.`);
            setReferralForm({ receivingDoctorId: "", urgency: "ROUTINE", symptoms: "", findings: "", diagnosis: "", investigationInfo: "", treatmentProvided: "", caseNote: "" });
          } catch (err) {
            setReferralError(err.message || "Failed to send referral.");
          } finally {
            setReferralSubmitting(false);
          }
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div className="form-field">
              <label>Refer To (Doctor) *</label>
              <select
                value={referralForm.receivingDoctorId}
                onChange={(e) => setReferralForm((p) => ({ ...p, receivingDoctorId: e.target.value }))}
                required
              >
                <option value="">-- Select Doctor --</option>
                {allDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.first_name} {d.last_name}{d.specialty ? ` — ${d.specialty}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Urgency *</label>
              <select
                value={referralForm.urgency}
                onChange={(e) => setReferralForm((p) => ({ ...p, urgency: e.target.value }))}
              >
                <option value="ROUTINE">Routine</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>
          {[{ key: "symptoms", label: "Chief Complaint / Symptoms", ph: "Main symptoms presented by the patient..." },
            { key: "findings", label: "Clinical Findings", ph: "Physical examination findings..." },
            { key: "diagnosis", label: "Working Diagnosis", ph: "Current diagnosis or differential..." },
            { key: "investigationInfo", label: "Investigations Done", ph: "Lab/imaging results completed..." },
            { key: "treatmentProvided", label: "Treatment Provided So Far", ph: "Medications or treatment already given..." },
            { key: "caseNote", label: "Referral Reason / Case Note *", ph: "Reason for referral and specific request to receiving doctor..." },
          ].map((f) => (
            <div key={f.key} className="form-field" style={{ marginTop: "10px" }}>
              <label>{f.label}</label>
              <textarea
                rows={f.key === "caseNote" ? 4 : 2}
                placeholder={f.ph}
                value={referralForm[f.key]}
                onChange={(e) => setReferralForm((p) => ({ ...p, [f.key]: e.target.value }))}
                required={f.key === "caseNote"}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowReferralModal(false)}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={referralSubmitting}>
              {referralSubmitting ? "Sending..." : "Send Referral"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

export default ClinicalEncounter;
