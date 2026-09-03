import { useState, useEffect } from "react";
import Modal from "../common/Modal";
import { formatCurrency } from "../../utils/currency";
import { getTestCatalog, createLabOrder } from "../../services/laboratoryService";
import { getMedications, createPrescription } from "../../services/pharmacyService";
import { getServices } from "../../services/serviceCatalogService";
import { serviceOrderService } from "../../services/serviceOrderService";

// 1. LABORATORY ORDER MODAL
export function LaboratoryOrderModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    testId: "",
    clinicalIndication: "",
    priority: "ROUTINE",
    notes: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getTestCatalog({ limit: 100 });
        setCatalog(res.data || []);
      } catch {
        setError("Failed to load laboratory test catalog.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedTest = catalog.find((t) => t.id === form.testId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.testId) {
      setError("Please select a diagnostic laboratory test.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createLabOrder({
        patientId,
        encounterId,
        doctorId,
        testId: form.testId,
        clinicalIndication: form.clinicalIndication || form.notes,
        priority: form.priority,
      });
      if (onSuccess) onSuccess("Laboratory investigation ordered successfully.");
      onClose();
      setForm({ testId: "", clinicalIndication: "", priority: "ROUTINE", notes: "" });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to order laboratory test.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Order Laboratory Investigation"
      subtitle="Creates a diagnostic laboratory request for specimen collection & testing"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Select Diagnostic Lab Test <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.testId}
            onChange={(e) => setForm({ ...form, testId: e.target.value })}
            required
            disabled={loading}
          >
            <option value="">-- Choose Test from Hospital Catalog --</option>
            {catalog.map((test) => (
              <option key={test.id} value={test.id}>
                {test.name} ({test.category}) — {test.code} [{formatCurrency(test.price || test.linked_service_price || 0)}]
              </option>
            ))}
          </select>
          {selectedTest && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              <span>Standard fee: <strong style={{ color: "#0f172a" }}>{formatCurrency(selectedTest.price || selectedTest.linked_service_price || 0)}</strong></span>
              <span>Reference Range: <strong>{selectedTest.reference_range || "Standard"} {selectedTest.unit || ""}</strong></span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Order Priority
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="STAT">STAT / Emergency</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Clinical Indication / Suspicion
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Febrile illness, suspected anemia..."
              value={form.clinicalIndication}
              onChange={(e) => setForm({ ...form, clinicalIndication: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Special Instructions for Lab Technologist
          </label>
          <textarea
            rows={2}
            className="textarea"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="Fasting status, specific parameters requested, or clinical context..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "11px", color: "#1e40af", lineHeight: 1.5 }}>
          <strong>Workflow Notice:</strong> This request routes to the Registrar Cashier for payment authorization. Once paid, the patient enters the Laboratory work queue for specimen collection and testing.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.testId} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#4f46e5" }}>
            {submitting ? "Ordering..." : "Submit Lab Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// 2. RADIOLOGY ORDER MODAL
export function RadiologyOrderModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    serviceId: "",
    modality: "X_RAY",
    bodySite: "",
    clinicalIndication: "",
    priority: "ROUTINE",
    notes: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getServices({ isActive: true });
        const all = res.data || res || [];
        const radServices = all.filter(
          (s) => s.category === "Imaging" || s.category === "Radiology" || s.category === "RADIOLOGY" || (s.code && s.code.startsWith("IMG-"))
        );
        setServices(radServices.length > 0 ? radServices : all);
        if (radServices.length > 0) {
          setForm((f) => ({ ...f, serviceId: radServices[0].id }));
        }
      } catch {
        setError("Failed to load radiology services catalog.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedService = services.find((s) => s.id === form.serviceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.serviceId) {
      setError("Please select a radiology examination.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const combinedNotes = [
        form.bodySite ? `Site: ${form.bodySite}` : null,
        form.clinicalIndication ? `Indication: ${form.clinicalIndication}` : null,
        form.notes ? `Notes: ${form.notes}` : null,
      ].filter(Boolean).join(" | ");

      await serviceOrderService.createServiceOrders({
        patientId,
        encounterId,
        doctorId,
        items: [
          {
            serviceId: form.serviceId,
            priority: form.priority,
            notes: combinedNotes || "Radiology Examination",
          },
        ],
      });

      if (onSuccess) onSuccess("Radiology investigation ordered successfully.");
      onClose();
      setForm({ serviceId: "", modality: "X_RAY", bodySite: "", clinicalIndication: "", priority: "ROUTINE", notes: "" });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to order radiology examination.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Order Radiology / Medical Imaging"
      subtitle="Order X-Ray, Ultrasound, or CT scan examination"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Select Radiology Imaging Service <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.serviceId}
            onChange={(e) => {
              const val = e.target.value;
              const s = services.find((srv) => srv.id === val);
              const mod = (s?.name?.toLowerCase().includes("ultrasound") || s?.code?.includes("ULTRASOUND")) ? "ULTRASOUND" : "X_RAY";
              setForm({ ...form, serviceId: val, modality: mod });
            }}
            required
            disabled={loading}
          >
            <option value="">-- Choose Imaging Service --</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) — {formatCurrency(s.price)}
              </option>
            ))}
          </select>
          {selectedService && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              <span>Standard fee: <strong style={{ color: "#0f172a" }}>{formatCurrency(selectedService.price)}</strong></span>
              <span>Billing Location: <strong>Registrar Cashier</strong></span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Imaging Modality
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.modality}
              onChange={(e) => setForm({ ...form, modality: e.target.value })}
            >
              <option value="X_RAY">Diagnostic X-Ray (Radiography)</option>
              <option value="ULTRASOUND">Ultrasound Sonogram Scan</option>
              <option value="CT_SCAN">CT Scan</option>
              <option value="MRI">MRI Scan</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Anatomical Region / Body Site <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Chest PA, Left Ankle, Abdomen/Pelvis..."
              value={form.bodySite}
              onChange={(e) => setForm({ ...form, bodySite: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Clinical Indication / Suspicion
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Rule out fracture, consolidation..."
              value={form.clinicalIndication}
              onChange={(e) => setForm({ ...form, clinicalIndication: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Priority
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Instructions for Radiologist / Radiographer
          </label>
          <textarea
            rows={2}
            className="textarea"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="Clinical questions to answer, patient positioning precautions..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", fontSize: "11px", color: "#0369a1", lineHeight: 1.5 }}>
          <strong>Workflow Notice:</strong> Radiology orders route to Registrar Cashier for payment authorization. Once paid, the order appears in the Radiology department queue for exam execution and reporting.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.serviceId} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#0284c7" }}>
            {submitting ? "Submitting..." : "Submit Radiology Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// 3. PRESCRIPTION MODAL (PHARMACY DIRECT)
export function PrescriptionOrderModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    medicationId: "",
    medicationName: "",
    dosage: "",
    frequency: "Once daily",
    route: "Oral",
    duration: "7 days",
    quantity: 1,
    instructions: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getMedications({ limit: 100 });
        setMeds(res.data || []);
      } catch {
        setError("Failed to load formulary medications.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedMed = meds.find((m) => m.id === form.medicationId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.medicationName || !form.dosage) {
      setError("Please specify medication name and dosage.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createPrescription({
        patientId,
        encounterId,
        doctorId,
        medicationId: form.medicationId || null,
        medicationName: form.medicationName,
        dosage: form.dosage,
        frequency: form.frequency,
        route: form.route,
        duration: form.duration,
        quantity: parseInt(form.quantity, 10) || 1,
        instructions: form.instructions,
      });

      if (onSuccess) onSuccess("Prescription dispatched directly to Pharmacy queue.");
      onClose();
      setForm({
        medicationId: "",
        medicationName: "",
        dosage: "",
        frequency: "Once daily",
        route: "Oral",
        duration: "7 days",
        quantity: 1,
        instructions: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to prescribe medication.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prescribe Medication (Pharmacy Formulary)"
      subtitle="Routes directly to Pharmacy Counter for pricing, cashiering, and dispensing"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Select from Hospital Pharmacy Formulary
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.medicationId}
            onChange={(e) => {
              const val = e.target.value;
              const m = meds.find((med) => med.id === val);
              if (m) {
                setForm({
                  ...form,
                  medicationId: m.id,
                  medicationName: m.name,
                  dosage: m.strength || form.dosage,
                  route: m.form === "Tablet" || m.form === "Capsule" ? "Oral" : form.route,
                });
              } else {
                setForm({ ...form, medicationId: "" });
              }
            }}
            disabled={loading}
          >
            <option value="">-- Choose from Available In-Stock Medications --</option>
            {meds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.form} {m.strength || ""}) — Stock: {m.stock_quantity} units [{formatCurrency(m.unit_price)}/unit]
              </option>
            ))}
          </select>
          {selectedMed && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              <span>Formulary Code: <strong>{selectedMed.code}</strong></span>
              <span>Available Stock: <strong style={{ color: selectedMed.stock_quantity < 15 ? "#b91c1c" : "#059669" }}>{selectedMed.stock_quantity} units</strong></span>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Medication Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="e.g. Amoxicillin Clavulanate"
            value={form.medicationName}
            onChange={(e) => setForm({ ...form, medicationName: e.target.value })}
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Dosage / Strength <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. 500mg, 1g, 10ml"
              value={form.dosage}
              onChange={(e) => setForm({ ...form, dosage: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Frequency
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="Once daily">Once daily (OD)</option>
              <option value="Twice daily">Twice daily (BID)</option>
              <option value="Three times daily">Three times daily (TID)</option>
              <option value="Four times daily">Four times daily (QID)</option>
              <option value="Every 8 hours">Every 8 hours</option>
              <option value="Every 12 hours">Every 12 hours</option>
              <option value="As needed (PRN)">As needed (PRN)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Route
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
            >
              <option value="Oral">Oral</option>
              <option value="IV">Intravenous (IV)</option>
              <option value="IM">Intramuscular (IM)</option>
              <option value="SC">Subcutaneous (SC)</option>
              <option value="Topical">Topical</option>
              <option value="Inhalation">Inhalation</option>
              <option value="Ophthalmic">Ophthalmic</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Duration
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. 7 days"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Total Quantity <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="number"
              min="1"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value, 10) || 1 })}
              required
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Patient Direction for Use / Instructions
          </label>
          <input
            type="text"
            className="input"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="e.g. Take with meal. Complete the entire course."
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", fontSize: "11px", color: "#065f46", lineHeight: 1.5 }}>
          <strong>Pharmacy Separation:</strong> Medication prescriptions route directly to the <strong>Pharmacy Cashier</strong> for payment and dispensing. Stock decrements atomically upon fulfillment.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.medicationName} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#059669" }}>
            {submitting ? "Prescribing..." : "Send Prescription to Pharmacy"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// 4. PROCEDURE ORDER MODAL
export function ProcedureOrderModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    serviceId: "",
    clinicalIndication: "",
    instructions: "",
    priority: "ROUTINE",
    notes: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getServices({ isActive: true });
        const all = res.data || res || [];
        const procServices = all.filter(
          (s) => s.category === "Procedure" || s.category === "PROCEDURE" || (s.code && s.code.startsWith("PROC-"))
        );
        setServices(procServices.length > 0 ? procServices : all);
        if (procServices.length > 0) {
          setForm((f) => ({ ...f, serviceId: procServices[0].id }));
        }
      } catch {
        setError("Failed to load procedure services.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedService = services.find((s) => s.id === form.serviceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.serviceId) {
      setError("Please select a procedure service.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const combinedNotes = [
        form.clinicalIndication ? `Indication: ${form.clinicalIndication}` : null,
        form.instructions ? `Instructions: ${form.instructions}` : null,
        form.notes ? `Notes: ${form.notes}` : null,
      ].filter(Boolean).join(" | ");

      await serviceOrderService.createServiceOrders({
        patientId,
        encounterId,
        doctorId,
        items: [
          {
            serviceId: form.serviceId,
            priority: form.priority,
            notes: combinedNotes || "Clinical Procedure",
          },
        ],
      });

      if (onSuccess) onSuccess("Clinical procedure ordered successfully.");
      onClose();
      setForm({ serviceId: "", clinicalIndication: "", instructions: "", priority: "ROUTINE", notes: "" });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to order procedure.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Order Clinical / Nursing Procedure"
      subtitle="Orders wound care, therapeutic injections, or minor procedures"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Select Procedure Service <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            required
            disabled={loading}
          >
            <option value="">-- Choose Procedure Service --</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) — {formatCurrency(s.price)}
              </option>
            ))}
          </select>
          {selectedService && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              Standard Fee: <strong>{formatCurrency(selectedService.price)}</strong> • Paid at Registrar Cashier
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Priority
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Clinical Indication <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Post-op dressing, laceration care..."
              value={form.clinicalIndication}
              onChange={(e) => setForm({ ...form, clinicalIndication: e.target.value })}
              required
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Specific Clinical Directives for Procedure Staff
          </label>
          <textarea
            rows={2}
            className="textarea"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="Aseptic technique, saline irrigation, suture removal, medication ampoule..."
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "11px", color: "#92400e", lineHeight: 1.5 }}>
          <strong>Workflow Notice:</strong> Procedure orders route to Registrar Cashier for payment authorization. Once paid, the patient enters the Procedure Room queue for execution.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.serviceId} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#d97706" }}>
            {submitting ? "Ordering..." : "Submit Procedure Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// 5. SURGERY REQUEST MODAL
export function SurgeryRequestModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    serviceId: "",
    plannedProcedure: "",
    preOpDiagnosis: "",
    indication: "",
    priority: "ROUTINE",
    preferredDate: "",
    anesthesiaType: "GENERAL",
    preOpRequirements: "",
    notes: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getServices({ isActive: true });
        const all = res.data || res || [];
        const surgServices = all.filter(
          (s) => s.category === "Surgery" || s.category === "SURGERY" || (s.code && s.code.startsWith("SURG-"))
        );
        setServices(surgServices.length > 0 ? surgServices : all);
        if (surgServices.length > 0) {
          setForm((f) => ({ ...f, serviceId: surgServices[0].id }));
        }
      } catch {
        setError("Failed to load surgical service catalog.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedService = services.find((s) => s.id === form.serviceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.serviceId || !form.plannedProcedure) {
      setError("Please specify surgical service and planned procedure.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const combinedNotes = [
        `Procedure: ${form.plannedProcedure}`,
        form.preOpDiagnosis ? `Pre-Op Diagnosis: ${form.preOpDiagnosis}` : null,
        form.anesthesiaType ? `Anesthesia: ${form.anesthesiaType}` : null,
        form.indication ? `Indication: ${form.indication}` : null,
        form.preOpRequirements ? `Pre-Op: ${form.preOpRequirements}` : null,
        form.preferredDate ? `Preferred: ${form.preferredDate}` : null,
        form.notes ? `Notes: ${form.notes}` : null,
      ].filter(Boolean).join(" | ");

      await serviceOrderService.createServiceOrders({
        patientId,
        encounterId,
        doctorId,
        items: [
          {
            serviceId: form.serviceId,
            priority: form.priority,
            notes: combinedNotes,
          },
        ],
      });

      if (onSuccess) onSuccess("Surgery booking request submitted to Operating Theatre.");
      onClose();
      setForm({
        serviceId: "",
        plannedProcedure: "",
        preOpDiagnosis: "",
        indication: "",
        priority: "ROUTINE",
        preferredDate: "",
        anesthesiaType: "GENERAL",
        preOpRequirements: "",
        notes: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to submit surgery request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Surgery / Operating Theatre Booking"
      subtitle="Schedules surgical theatre time, pre-op checklist, and anesthesia clearance"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Surgical Operation Service <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            required
            disabled={loading}
          >
            <option value="">-- Choose Surgical Service --</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) — {formatCurrency(s.price)}
              </option>
            ))}
          </select>
          {selectedService && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              OT Standard Fee: <strong>{formatCurrency(selectedService.price)}</strong> • Paid at Registrar Cashier
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Planned Surgical Procedure <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Open Appendectomy, Herniorrhaphy..."
              value={form.plannedProcedure}
              onChange={(e) => setForm({ ...form, plannedProcedure: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Pre-Operative Clinical Diagnosis <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Acute Suppurative Appendicitis"
              value={form.preOpDiagnosis}
              onChange={(e) => setForm({ ...form, preOpDiagnosis: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Priority
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="ROUTINE">Elective / Routine</option>
              <option value="URGENT">Urgent (Within 24h)</option>
              <option value="EMERGENCY">Emergency (Immediate)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Anesthesia Type
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.anesthesiaType}
              onChange={(e) => setForm({ ...form, anesthesiaType: e.target.value })}
            >
              <option value="GENERAL">General Anesthesia</option>
              <option value="SPINAL">Spinal / Epidural</option>
              <option value="LOCAL">Local Anesthesia</option>
              <option value="SEDATION">Monitored Sedation</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Preferred Date/Time
            </label>
            <input
              type="datetime-local"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.preferredDate}
              onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Pre-Op Directives & Theatre Requirements
          </label>
          <textarea
            rows={2}
            className="textarea"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="NPO status, blood cross-match, antibiotic prophylaxis, implant sizing..."
            value={form.preOpRequirements}
            onChange={(e) => setForm({ ...form, preOpRequirements: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: "8px", fontSize: "11px", color: "#9f1239", lineHeight: 1.5 }}>
          <strong>OT Protocol:</strong> Surgery request will route to Registrar for payment authorization, then Operating Theatre queue for theatre scheduling, pre-op safety checklist, and surgeon operative record.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.plannedProcedure} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#dc2626" }}>
            {submitting ? "Submitting..." : "Submit Surgery Request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// 6. ADMISSION / BED REQUEST MODAL
export function AdmissionRequestModal({
  isOpen,
  onClose,
  patientId,
  encounterId,
  doctorId,
  onSuccess,
}) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    serviceId: "",
    admissionReason: "",
    diagnosis: "",
    requestedWard: "General Male Ward",
    bedType: "STANDARD",
    priority: "ROUTINE",
    notes: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await getServices({ isActive: true });
        const all = res.data || res || [];
        const wardServices = all.filter(
          (s) => s.category === "Inpatient" || s.category === "WARD" || (s.code && s.code.startsWith("WARD-"))
        );
        setServices(wardServices.length > 0 ? wardServices : all);
        if (wardServices.length > 0) {
          setForm((f) => ({ ...f, serviceId: wardServices[0].id }));
        }
      } catch {
        setError("Failed to load ward admission services.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isOpen]);

  const selectedService = services.find((s) => s.id === form.serviceId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.serviceId || !form.admissionReason) {
      setError("Please specify admission reason.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const combinedNotes = [
        `Reason: ${form.admissionReason}`,
        form.diagnosis ? `Diagnosis: ${form.diagnosis}` : null,
        `Requested Ward: ${form.requestedWard}`,
        `Bed Type: ${form.bedType}`,
        form.notes ? `Notes: ${form.notes}` : null,
      ].filter(Boolean).join(" | ");

      await serviceOrderService.createServiceOrders({
        patientId,
        encounterId,
        doctorId,
        items: [
          {
            serviceId: form.serviceId,
            priority: form.priority,
            notes: combinedNotes,
          },
        ],
      });

      if (onSuccess) onSuccess("Inpatient admission request submitted to Ward queue.");
      onClose();
      setForm({
        serviceId: "",
        admissionReason: "",
        diagnosis: "",
        requestedWard: "General Male Ward",
        bedType: "STANDARD",
        priority: "ROUTINE",
        notes: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to request admission.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Inpatient Admission & Bed"
      subtitle="Orders hospital admission and initiates ward bed allocation"
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "12px", fontWeight: 500 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Inpatient Admission Service <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <select
            className="select"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            required
            disabled={loading}
          >
            <option value="">-- Choose Ward Service --</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) — {formatCurrency(s.price)}/day
              </option>
            ))}
          </select>
          {selectedService && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "6px 10px", borderRadius: "6px" }}>
              Daily Rate: <strong>{formatCurrency(selectedService.price)}</strong> • Paid at Registrar Cashier
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Admission Reason & Clinical Indication <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Acute severe dehydration, IV antibiotic therapy..."
              value={form.admissionReason}
              onChange={(e) => setForm({ ...form, admissionReason: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Primary Admission Diagnosis
            </label>
            <input
              type="text"
              className="input"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              placeholder="e.g. Community Acquired Pneumonia"
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Requested Ward
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.requestedWard}
              onChange={(e) => setForm({ ...form, requestedWard: e.target.value })}
            >
              <option value="General Male Ward">General Male Ward</option>
              <option value="General Female Ward">General Female Ward</option>
              <option value="Pediatric Ward">Pediatric Ward</option>
              <option value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</option>
              <option value="Isolation Ward">Isolation Ward</option>
              <option value="Maternity Ward">Maternity Ward</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Requested Bed Type
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.bedType}
              onChange={(e) => setForm({ ...form, bedType: e.target.value })}
            >
              <option value="STANDARD">Standard Inpatient Bed</option>
              <option value="ICU">ICU Critical Bed</option>
              <option value="ISOLATION">Isolation Bed</option>
              <option value="PEDIATRIC">Pediatric Ward Bed</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
              Priority
            </label>
            <select
              className="select"
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="ROUTINE">Routine</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency (Direct Bed)</option>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            Admission Orders / Nursing Directives
          </label>
          <textarea
            rows={2}
            className="textarea"
            style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
            placeholder="Continuous monitoring, vitals q4h, strict fluid balance chart, oxygen therapy..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div style={{ padding: "10px 14px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", fontSize: "11px", color: "#6d28d9", lineHeight: 1.5 }}>
          <strong>Ward Assignment:</strong> The physician places the clinical admission request. Ward nurses and bed coordinators assign a physical bed from the Inpatient Ward Management dashboard.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={onClose} className="button button-secondary" style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px" }}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !form.admissionReason} className="button button-primary font-bold" style={{ padding: "8px 18px", borderRadius: "8px", fontSize: "13px", background: "#7c3aed" }}>
            {submitting ? "Submitting..." : "Submit Admission Request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
