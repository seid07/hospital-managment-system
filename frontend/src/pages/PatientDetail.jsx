import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import { getPatientRecord, updatePatient } from "../services/patientService";
import { recordVitals } from "../services/vitalsService";
import { getPatientReferrals } from "../services/referralService";
import { useAuth } from "../context/useAuth";
import { formatCurrency } from "../utils/currency";

function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("encounters");
  const [reloadKey, setReloadKey] = useState(0);
  const [referrals, setReferrals] = useState([]);
  const [referralsLoaded, setReferralsLoaded] = useState(false);

  // Modals state
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Vitals form
  const [vitalsForm, setVitalsForm] = useState({
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
  });
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false);
  const [vitalsError, setVitalsError] = useState("");

  // Edit form
  const [editForm, setEditForm] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadRecord() {
      try {
        setError("");
        const res = await getPatientRecord(id);
        if (!cancelled && res.data) {
          setData(res.data);
          setEditForm({
            firstName: res.data.patient.first_name,
            lastName: res.data.patient.last_name,
            dateOfBirth: res.data.patient.date_of_birth,
            gender: res.data.patient.gender,
            phone: res.data.patient.phone,
            email: res.data.patient.email || "",
            address: res.data.patient.address || "",
            emergencyContactName: res.data.patient.emergency_contact_name || "",
            emergencyContactPhone: res.data.patient.emergency_contact_phone || "",
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load patient chart.");
          setLoading(false);
        }
      }
    }

    loadRecord();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  async function handleRecordVitals(e) {
    e.preventDefault();
    setVitalsError("");
    try {
      setVitalsSubmitting(true);
      await recordVitals({
        patientId: id,
        ...vitalsForm,
      });
      setShowVitalsModal(false);
      setVitalsForm({
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
      });
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setVitalsError(err.message || "Failed to record vital signs.");
    } finally {
      setVitalsSubmitting(false);
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditError("");
    try {
      setEditSubmitting(true);
      await updatePatient(id, editForm);
      setShowEditModal(false);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setEditError(err.message || "Failed to update patient.");
    } finally {
      setEditSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="loading-state">Loading patient medical chart...</div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="alert alert-error" role="alert">
          {error || "Patient not found."}
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => navigate("/patients")}
        >
          ← Back to Patients Directory
        </button>
      </AppShell>
    );
  }

  const { patient, appointments, vitals, encounters, prescriptions, labOrders, invoices } = data;

  const birthYear = patient.date_of_birth
    ? new Date(patient.date_of_birth).getFullYear()
    : null;
  const age = birthYear ? new Date().getFullYear() - birthYear : "—";
  const latestVital = vitals && vitals.length > 0 ? vitals[0] : null;

  return (
    <AppShell>
      {/* Patient Header Card */}
      <section
        className="card"
        style={{
          marginBottom: "20px",
          background: "linear-gradient(to right, #ffffff, var(--surface-muted))",
          borderColor: "var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span className="badge badge-info" style={{ fontSize: "12px", padding: "4px 10px" }}>
                {patient.patient_number}
              </span>
              <h1 style={{ margin: 0, fontSize: "24px" }}>
                {patient.first_name} {patient.last_name}
              </h1>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                color: "var(--text-secondary)",
                fontSize: "13px",
                marginTop: "8px",
              }}
            >
              <span>
                <strong>DOB:</strong> {patient.date_of_birth} ({age} yrs)
              </span>
              <span>
                <strong>Gender:</strong> {patient.gender}
              </span>
              <span>
                <strong>Phone:</strong> {patient.phone}
              </span>
              {patient.email && (
                <span>
                  <strong>Email:</strong> {patient.email}
                </span>
              )}
            </div>

            {(patient.emergency_contact_name || patient.address) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "6px",
                }}
              >
                {patient.address && <span>Address: {patient.address}</span>}
                {patient.emergency_contact_name && (
                  <span>
                    Emergency Contact: {patient.emergency_contact_name} ({patient.emergency_contact_phone || "—"})
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["ADMIN", "REGISTRAR", "NURSE", "DOCTOR"].includes(user?.role) && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowEditModal(true)}
              >
                Edit Demographics
              </button>
            )}

            {["ADMIN", "NURSE", "DOCTOR"].includes(user?.role) && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowVitalsModal(true)}
              >
                + Record Vitals
              </button>
            )}

            {["ADMIN", "REGISTRAR"].includes(user?.role) && (
              <Link
                to={`/appointments/availability`}
                className="button button-secondary"
              >
                Book Appointment
              </Link>
            )}

            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowPrintModal(true)}
            >
              Print Print Medical Summary
            </button>
          </div>
        </div>

        {/* Latest Vitals Snapshot Banner */}
        {latestVital && (
          <div
            style={{
              marginTop: "18px",
              padding: "12px 16px",
              background: "var(--primary-light)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "20px",
              fontSize: "13px",
            }}
          >
            <strong>Latest Vitals ({new Date(latestVital.recorded_at).toLocaleDateString()}):</strong>
            {latestVital.temperature && <span>Temp: <strong>{latestVital.temperature}°C</strong></span>}
            {latestVital.systolic_bp && (
              <span>
                BP: <strong>{latestVital.systolic_bp}/{latestVital.diastolic_bp} mmHg</strong>
              </span>
            )}
            {latestVital.heart_rate && <span>HR: <strong>{latestVital.heart_rate} bpm</strong></span>}
            {latestVital.oxygen_saturation && (
              <span>SpO2: <strong>{latestVital.oxygen_saturation}%</strong></span>
            )}
            {latestVital.bmi && <span>BMI: <strong>{latestVital.bmi}</strong></span>}
            <StatusBadge status={latestVital.triage_category} />
          </div>
        )}
      </section>

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid var(--border)",
          gap: "8px",
          marginBottom: "20px",
          overflowX: "auto",
        }}
      >
        {[
          { id: "encounters", label: `Encounters (${encounters.length})` },
          { id: "vitals", label: `Vitals Timeline (${vitals.length})` },
          { id: "prescriptions", label: `Prescriptions (${prescriptions.length})` },
          { id: "labs", label: `Lab Results (${labOrders.length})` },
          { id: "billing", label: `Invoices & Billing (${invoices.length})` },
          { id: "appointments", label: `Appointments (${appointments.length})` },
          { id: "referrals", label: `Referrals (${referrals.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === tab.id ? "3px solid var(--primary)" : "3px solid transparent",
              background: "none",
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "14px",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Encounters & Diagnoses */}
      {activeTab === "encounters" && (
        <section className="card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>Clinical Visits & Encounters</h2>
              <p>Consultations, clinical notes, and physician diagnoses.</p>
            </div>
            {["ADMIN", "DOCTOR"].includes(user?.role) && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => navigate(`/encounters/new?patientId=${patient.id}`)}
              >
                + New Consultation
              </button>
            )}
          </div>

          {encounters.length === 0 ? (
            <div className="empty-state">No clinical encounters recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {encounters.map((enc) => (
                <div
                  key={enc.id}
                  style={{
                    padding: "16px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div>
                      <strong>Visit Date: {enc.visit_date}</strong>
                      <span style={{ marginLeft: "12px", color: "var(--text-secondary)" }}>
                        Physician: Dr. {enc.doctor_first_name} {enc.doctor_last_name} ({enc.doctor_specialty || "General"})
                      </span>
                    </div>
                    <StatusBadge status={enc.status} />
                  </div>

                  {enc.chief_complaint && (
                    <div style={{ marginBottom: "8px", fontSize: "13px" }}>
                      <strong style={{ color: "var(--text)" }}>Chief Complaint:</strong> {enc.chief_complaint}
                    </div>
                  )}

                  {enc.clinical_notes && (
                    <div style={{ marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      <strong>Clinical Notes:</strong> {enc.clinical_notes}
                    </div>
                  )}

                  {enc.treatment_plan && (
                    <div style={{ marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                      <strong>Treatment Plan:</strong> {enc.treatment_plan}
                    </div>
                  )}

                  {enc.diagnoses && enc.diagnoses.length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <strong style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Diagnoses:
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                        {enc.diagnoses.map((d) => (
                          <span
                            key={d.id}
                            style={{
                              padding: "3px 8px",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--surface-muted)",
                              border: "1px solid var(--border)",
                              fontSize: "12px",
                            }}
                          >
                            {d.is_primary && <strong>[Primary] </strong>}
                            {d.code ? `(${d.code}) ` : ""}
                            {d.description}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Vitals Timeline */}
      {activeTab === "vitals" && (
        <section className="card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>Vital Signs History</h2>
              <p>Triage and nursing vital signs measurements.</p>
            </div>
            {["ADMIN", "NURSE", "DOCTOR"].includes(user?.role) && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setShowVitalsModal(true)}
              >
                + Record Vitals
              </button>
            )}
          </div>

          {vitals.length === 0 ? (
            <div className="empty-state">No vital signs recorded.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Temp (°C)</th>
                    <th>Blood Pressure</th>
                    <th>Heart Rate</th>
                    <th>Resp Rate</th>
                    <th>SpO2</th>
                    <th>Weight / Height</th>
                    <th>BMI</th>
                    <th>Triage</th>
                    <th>Recorded By</th>
                  </tr>
                </thead>
                <tbody>
                  {vitals.map((v) => (
                    <tr key={v.id}>
                      <td>{new Date(v.recorded_at).toLocaleString()}</td>
                      <td>{v.temperature ? `${v.temperature}°C` : "—"}</td>
                      <td>
                        {v.systolic_bp && v.diastolic_bp ? (
                          <strong>{v.systolic_bp}/{v.diastolic_bp}</strong>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{v.heart_rate ? `${v.heart_rate} bpm` : "—"}</td>
                      <td>{v.respiratory_rate ? `${v.respiratory_rate}/min` : "—"}</td>
                      <td>{v.oxygen_saturation ? `${v.oxygen_saturation}%` : "—"}</td>
                      <td>
                        {v.weight ? `${v.weight} kg` : "—"} / {v.height ? `${v.height} cm` : "—"}
                      </td>
                      <td><strong>{v.bmi || "—"}</strong></td>
                      <td><StatusBadge status={v.triage_category} /></td>
                      <td>{v.recorded_by_username || "Staff"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Prescriptions */}
      {activeTab === "prescriptions" && (
        <section className="card">
          <div className="card-header">
            <h2>Prescriptions</h2>
            <p>Physician medication orders and pharmacy dispensing records.</p>
          </div>

          {prescriptions.length === 0 ? (
            <div className="empty-state">No prescriptions recorded.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rx #</th>
                    <th>Medication</th>
                    <th>Dosage & Frequency</th>
                    <th>Duration / Qty</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Dispensed Info</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.prescription_number}</strong></td>
                      <td><strong style={{ color: "var(--primary)" }}>{p.medication_name}</strong></td>
                      <td>{p.dosage} — {p.frequency} ({p.route})</td>
                      <td>{p.duration || "—"} ({p.quantity} units)</td>
                      <td>Dr. {p.doctor_first_name} {p.doctor_last_name}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        {p.dispensed_at ? (
                          <span style={{ fontSize: "11px", color: "var(--success)" }}>
                            Dispensed by {p.dispensed_by_username || "Pharmacy"} on{" "}
                            {new Date(p.dispensed_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Awaiting dispensing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab 4: Laboratory */}
      {activeTab === "labs" && (
        <section className="card">
          <div className="card-header">
            <h2>Laboratory Test Results</h2>
            <p>Diagnostic laboratory tests and verified patient reports.</p>
          </div>

          {labOrders.length === 0 ? (
            <div className="empty-state">No laboratory orders recorded.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {labOrders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    padding: "16px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div>
                      <strong style={{ fontSize: "15px", color: "var(--primary)" }}>
                        {order.test_name} ({order.test_code})
                      </strong>
                      <span style={{ marginLeft: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Order Ref: {order.order_number} | Priority: {order.priority}
                      </span>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  {order.clinical_indication && (
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                      Indication: {order.clinical_indication}
                    </div>
                  )}

                  {order.result_value ? (
                    <div
                      style={{
                        padding: "12px",
                        background: order.is_abnormal ? "var(--danger-bg)" : "var(--surface-muted)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        marginTop: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>Result: {order.result_value}</strong>
                        {order.is_abnormal && <span className="badge badge-danger">Abnormal</span>}
                      </div>
                      {order.result_reference_range && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                          Reference Range: {order.result_reference_range}
                        </div>
                      )}
                      {order.result_comments && (
                        <div style={{ fontSize: "12px", marginTop: "4px" }}>
                          Technician Comments: {order.result_comments}
                        </div>
                      )}
                      {order.verified_by_username && (
                        <div style={{ fontSize: "11px", color: "var(--success)", marginTop: "4px" }}>
                          ✓ Verified by {order.verified_by_username} on {new Date(order.verified_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                      Specimen testing in progress...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 5: Invoices & Billing */}
      {activeTab === "billing" && (
        <section className="card">
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>Billing & Invoices</h2>
              <p>Charges, outstanding balances, and payment receipts.</p>
            </div>
            {["ADMIN", "FINANCE", "REGISTRAR"].includes(user?.role) && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => navigate(`/billing?patientId=${patient.id}`)}
              >
                View Billing Center →
              </button>
            )}
          </div>

          {invoices.length === 0 ? (
            <div className="empty-state">No invoices generated for this patient.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    padding: "16px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div>
                      <strong style={{ fontSize: "15px" }}>Invoice #{inv.invoice_number}</strong>
                      <span style={{ marginLeft: "12px", fontSize: "12px", color: "var(--text-muted)" }}>
                        Date: {new Date(inv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px", background: "var(--surface-muted)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "12px" }}>
                    <div><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Subtotal</span><br /><strong>{formatCurrency(inv.subtotal)}</strong></div>
                    <div><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Discount / Tax</span><br /><span>-{formatCurrency(inv.discount_amount)} / +{formatCurrency(inv.tax_amount)}</span></div>
                    <div><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Due</span><br /><strong style={{ color: "var(--primary)" }}>{formatCurrency(inv.total_amount)}</strong></div>
                    <div><span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Balance Remaining</span><br /><strong style={{ color: parseFloat(inv.balance_amount) > 0 ? "var(--danger)" : "var(--success)" }}>{formatCurrency(inv.balance_amount)}</strong></div>
                  </div>

                  {inv.items && inv.items.length > 0 && (
                    <div style={{ fontSize: "12px" }}>
                      <strong>Line Items:</strong>
                      <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                        {inv.items.map((it, idx) => (
                          <li key={idx}>
                            {it.description} ({it.quantity} × {formatCurrency(it.unit_price)}) = <strong>{formatCurrency(it.total_price)}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {inv.payments && inv.payments.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--success)" }}>
                      <strong>Payments Received:</strong>
                      <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                        {inv.payments.map((pm, idx) => (
                          <li key={idx}>
                            {formatCurrency(pm.amount)} via {pm.payment_method} ({pm.payment_number}) on {new Date(pm.created_at).toLocaleDateString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 6: Appointments History */}
      {activeTab === "appointments" && (
        <section className="card">
          <div className="card-header">
            <h2>Appointments History</h2>
            <p>Schedule of previous and upcoming visits.</p>
          </div>

          {appointments.length === 0 ? (
            <div className="empty-state">No appointments recorded.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Appt #</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Doctor</th>
                    <th>Reason</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.appointment_number}</strong></td>
                      <td>{a.appointment_date}</td>
                      <td>{a.start_time} – {a.end_time}</td>
                      <td>Dr. {a.doctor_first_name} {a.doctor_last_name}</td>
                      <td>{a.reason || "—"}</td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tab 7: Referral History */}
      {activeTab === "referrals" && (
        <section className="card">
          <div className="card-header">
            <h2>Referral History</h2>
            <p>Doctor-to-doctor referrals involving this patient.</p>
          </div>

          {!referralsLoaded ? (
            <div style={{ textAlign: "center", padding: "24px" }}>
              <button
                className="button button-secondary"
                onClick={async () => {
                  try {
                    const res = await getPatientReferrals(id);
                    setReferrals(res.data || []);
                  } catch (err) {
                    console.error("Failed to load referrals:", err);
                  } finally {
                    setReferralsLoaded(true);
                  }
                }}
              >
                Load Referral History
              </button>
            </div>
          ) : referrals.length === 0 ? (
            <div className="empty-state">No referrals recorded for this patient.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {referrals.map((r) => {
                const urgencyColor = r.urgency === "EMERGENCY" ? "#ef4444" : r.urgency === "URGENT" ? "#f59e0b" : "#6366f1";
                const statusColor = r.status === "RESPONDED" ? "#10b981" : r.status === "VIEWED" ? "#6366f1" : "#f59e0b";
                return (
                  <div key={r.id} style={{
                    border: "1px solid var(--border)", borderLeft: `4px solid ${urgencyColor}`,
                    borderRadius: "8px", padding: "14px 16px", background: "var(--surface)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ background: urgencyColor + "20", color: urgencyColor, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>
                          {r.urgency}
                        </span>
                        <span style={{ background: statusColor + "20", color: statusColor, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>
                          {r.status}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {new Date(r.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: "13px" }}>
                      <strong>From:</strong> Dr. {r.referring_first_name} {r.referring_last_name}
                      {r.referring_specialty ? ` (${r.referring_specialty})` : ""} →{" "}
                      <strong>To:</strong> Dr. {r.receiving_first_name} {r.receiving_last_name}
                      {r.receiving_specialty ? ` (${r.receiving_specialty})` : ""}
                    </div>
                    {r.case_note && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>
                        <strong>Reason:</strong> {r.case_note}
                      </div>
                    )}
                    {r.status === "RESPONDED" && r.response_assessment && (
                      <div style={{ marginTop: "8px", padding: "8px 10px", background: "#f0fdf4", borderRadius: "6px", fontSize: "12px", color: "#15803d" }}>
                        <strong>Response:</strong> {r.response_assessment}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Modal 1: Record Vitals */}
      <Modal isOpen={showVitalsModal} onClose={() => setShowVitalsModal(false)} title="Record Patient Vital Signs">
        {vitalsError && <div className="alert alert-error">{vitalsError}</div>}
        <form onSubmit={handleRecordVitals}>
          <div className="form-grid">
            <div className="form-field">
              <label>Temperature (°C)</label>
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
              <label>Respiratory Rate (/min)</label>
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
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency / Critical</option>
              </select>
            </div>
          </div>

          <div className="form-field" style={{ marginTop: "14px" }}>
            <label>Nursing Notes</label>
            <textarea
              rows="2"
              placeholder="Observations or patient-reported symptoms..."
              value={vitalsForm.notes}
              onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowVitalsModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={vitalsSubmitting}>
              {vitalsSubmitting ? "Saving..." : "Save Vital Signs"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Edit Demographics */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Patient Demographics">
        {editError && <div className="alert alert-error">{editError}</div>}
        <form onSubmit={handleEditSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>First Name</label>
              <input
                value={editForm.firstName || ""}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Last Name</label>
              <input
                value={editForm.lastName || ""}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Date of Birth</label>
              <input
                type="date"
                value={editForm.dateOfBirth || ""}
                onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Gender</label>
              <select
                value={editForm.gender || "Male"}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-field">
              <label>Phone</label>
              <input
                value={editForm.phone || ""}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: "14px" }}>
            <label>Address</label>
            <textarea
              rows="2"
              value={editForm.address || ""}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
          </div>

          <div className="form-grid" style={{ marginTop: "14px" }}>
            <div className="form-field">
              <label>Emergency Contact Name</label>
              <input
                value={editForm.emergencyContactName || ""}
                onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Emergency Contact Phone</label>
              <input
                value={editForm.emergencyContactPhone || ""}
                onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Update Demographics"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Print Medical Summary */}
      <Modal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} title="Patient Medical Record Summary" maxWidth="800px">
        <PrintableDocument
          title="PATIENT MEDICAL RECORD SUMMARY"
          subtitle="Comprehensive Clinical History"
          documentNumber={patient.patient_number}
          date={new Date().toLocaleDateString()}
        >
          <div style={{ marginBottom: "16px" }}>
            <h3>Patient Demographics</h3>
            <table style={{ width: "100%", fontSize: "13px" }}>
              <tbody>
                <tr>
                  <td><strong>Full Name:</strong> {patient.first_name} {patient.last_name}</td>
                  <td><strong>DOB / Age:</strong> {patient.date_of_birth} ({age} yrs)</td>
                </tr>
                <tr>
                  <td><strong>Gender:</strong> {patient.gender}</td>
                  <td><strong>Phone:</strong> {patient.phone}</td>
                </tr>
                <tr>
                  <td><strong>Address:</strong> {patient.address || "—"}</td>
                  <td><strong>Emergency:</strong> {patient.emergency_contact_name || "—"} ({patient.emergency_contact_phone || "—"})</td>
                </tr>
              </tbody>
            </table>
          </div>

          {latestVital && (
            <div style={{ marginBottom: "16px" }}>
              <h4>Latest Vital Signs</h4>
              <p style={{ fontSize: "12px" }}>
                Temp: {latestVital.temperature || "—"}°C | BP: {latestVital.systolic_bp}/{latestVital.diastolic_bp} mmHg | Pulse: {latestVital.heart_rate} bpm | SpO2: {latestVital.oxygen_saturation}% | BMI: {latestVital.bmi}
              </p>
            </div>
          )}

          {encounters.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h4>Clinical Encounters & Diagnoses ({encounters.length})</h4>
              {encounters.map((enc) => (
                <div key={enc.id} style={{ fontSize: "12px", borderBottom: "1px dashed #ccc", paddingBottom: "6px", marginBottom: "6px" }}>
                  <strong>{enc.visit_date} (Dr. {enc.doctor_last_name}):</strong> {enc.chief_complaint || "Consultation"}
                  {enc.diagnoses && enc.diagnoses.length > 0 && (
                    <div style={{ color: "#333" }}>
                      Diagnoses: {enc.diagnoses.map((d) => `${d.description} ${d.code ? `(${d.code})` : ""}`).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {prescriptions.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h4>Prescriptions History ({prescriptions.length})</h4>
              <ul style={{ fontSize: "12px", margin: 0, paddingLeft: "20px" }}>
                {prescriptions.map((p) => (
                  <li key={p.id}>
                    <strong>{p.medication_name}</strong> — {p.dosage}, {p.frequency} ({p.status})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {labOrders.length > 0 && (
            <div>
              <h4>Laboratory Tests ({labOrders.length})</h4>
              <ul style={{ fontSize: "12px", margin: 0, paddingLeft: "20px" }}>
                {labOrders.map((l) => (
                  <li key={l.id}>
                    <strong>{l.test_name}</strong> ({l.status}) {l.result_value ? `— Result: ${l.result_value}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PrintableDocument>
      </Modal>
    </AppShell>
  );
}

export default PatientDetail;
