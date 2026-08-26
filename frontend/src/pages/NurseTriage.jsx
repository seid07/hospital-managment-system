import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Modal from "../components/common/Modal";
import { getTriageQueue, recordVitals } from "../services/vitalsService";
import { getPatientVitals } from "../services/vitalsService";

const INITIAL_VITALS = {
  temperature: "",
  heartRate: "",
  respiratoryRate: "",
  systolicBp: "",
  diastolicBp: "",
  oxygenSaturation: "",
  weight: "",
  height: "",
  triageCategory: "NORMAL",
  notes: "",
};

function NurseTriage() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Modal & Active Patient
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [vitalsForm, setVitalsForm] = useState(INITIAL_VITALS);
  const [previousVitals, setPreviousVitals] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [vitalsError, setVitalsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      try {
        setError("");
        const res = await getTriageQueue();
        if (!cancelled && res.data) {
          setQueue(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load triage queue.");
          setLoading(false);
        }
      }
    }

    loadQueue();
    const interval = setInterval(loadQueue, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reloadKey]);

  async function openTriageModal(patientItem) {
    setSelectedPatient(patientItem);
    setVitalsForm(INITIAL_VITALS);
    setVitalsError("");
    try {
      const history = await getPatientVitals(patientItem.patient_id);
      if (history.data) {
        setPreviousVitals(history.data);
      }
    } catch {
      setPreviousVitals([]);
    }
  }

  // Calculated BMI
  const weightNum = parseFloat(vitalsForm.weight);
  const heightNum = parseFloat(vitalsForm.height);
  let computedBMI = null;
  if (weightNum > 0 && heightNum > 0) {
    const heightM = heightNum / 100;
    computedBMI = (weightNum / (heightM * heightM)).toFixed(1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setVitalsError("");

    try {
      setSubmitting(true);
      await recordVitals({
        patientId: selectedPatient.patient_id,
        appointmentId: selectedPatient.id,
        ...vitalsForm,
      });

      setSuccess(`Vitals recorded for ${selectedPatient.patient_first_name} ${selectedPatient.patient_last_name}. Patient ready for doctor.`);
      setSelectedPatient(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setVitalsError(err.message || "Failed to record vital signs.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Nursing & Clinical Intake</p>
          <h1>Triage & Vital Signs Queue</h1>
          <p className="page-description">
            Evaluate arriving patients, record physiological vital signs, and assign triage priority.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <section className="card">
        <div className="card-header">
          <h2>Checked-in Waiting Patients ({queue.length})</h2>
          <p>Patients waiting for nursing assessment and triage recording.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading triage queue...</div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>No patients waiting for triage</h3>
            <p>All checked-in patients have been triaged or no patients have arrived yet.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Appt Time</th>
                  <th>Assigned Physician</th>
                  <th>Reason for Visit</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/patients/${item.patient_id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {item.patient_first_name} {item.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {item.patient_number} | {item.patient_phone}
                      </small>
                    </td>
                    <td>
                      <strong>{item.start_time}</strong> – {item.end_time}
                    </td>
                    <td>Dr. {item.doctor_first_name} {item.doctor_last_name}</td>
                    <td>{item.reason || "General Consultation"}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => openTriageModal(item)}
                      >
                        + Record Vitals & Triage →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Triage & Vitals Modal */}
      <Modal
        isOpen={Boolean(selectedPatient)}
        onClose={() => setSelectedPatient(null)}
        title="Nursing Intake & Vital Signs Assessment"
        maxWidth="750px"
      >
        {vitalsError && <div className="alert alert-error">{vitalsError}</div>}

        {selectedPatient && (
          <form onSubmit={handleSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px 16px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
              <strong>Patient:</strong> {selectedPatient.patient_first_name} {selectedPatient.patient_last_name} ({selectedPatient.patient_number}) | <strong>Doctor:</strong> Dr. {selectedPatient.doctor_first_name} {selectedPatient.doctor_last_name}
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Body Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="36.5"
                  value={vitalsForm.temperature}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Heart Rate (bpm)</label>
                <input
                  type="number"
                  placeholder="72"
                  value={vitalsForm.heartRate}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Systolic BP (mmHg)</label>
                <input
                  type="number"
                  placeholder="120"
                  value={vitalsForm.systolicBp}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, systolicBp: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Diastolic BP (mmHg)</label>
                <input
                  type="number"
                  placeholder="80"
                  value={vitalsForm.diastolicBp}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, diastolicBp: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Respiratory Rate (breaths/min)</label>
                <input
                  type="number"
                  placeholder="16"
                  value={vitalsForm.respiratoryRate}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Oxygen Saturation SpO2 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="98.5"
                  value={vitalsForm.oxygenSaturation}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="70"
                  value={vitalsForm.weight}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Height (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="175"
                  value={vitalsForm.height}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Triage Category</label>
                <select
                  value={vitalsForm.triageCategory}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, triageCategory: e.target.value })}
                >
                  <option value="NORMAL">Normal / Routine</option>
                  <option value="URGENT">Urgent (Elevated Risk)</option>
                  <option value="EMERGENCY">Emergency (Immediate Attention)</option>
                </select>
              </div>

              <div className="form-field">
                <label>Auto-Calculated BMI</label>
                <input
                  type="text"
                  readOnly
                  value={computedBMI ? `${computedBMI} kg/m²` : "Enter weight & height"}
                  style={{ background: "var(--surface-muted)", fontWeight: 700 }}
                />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: "14px" }}>
              <label>Nursing Notes & Observations</label>
              <textarea
                rows="2"
                placeholder="Patient symptoms, pain score, allergies, or notes for physician..."
                value={vitalsForm.notes}
                onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
              />
            </div>

            {/* Previous Recorded Vitals for Comparison */}
            {previousVitals.length > 0 && (
              <div style={{ marginTop: "16px", padding: "10px", background: "var(--surface-muted)", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
                <strong>Prior Reading ({new Date(previousVitals[0].recorded_at).toLocaleDateString()}):</strong>{" "}
                BP {previousVitals[0].systolic_bp}/{previousVitals[0].diastolic_bp} mmHg, HR {previousVitals[0].heart_rate} bpm, Temp {previousVitals[0].temperature}°C, SpO2 {previousVitals[0].oxygen_saturation}%
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedPatient(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Save Vitals & Send to Doctor Queue →"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

export default NurseTriage;
