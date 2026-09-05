import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import { createPatient, deletePatient } from "../services/patientService";
import { recordSelectivePayment } from "../services/billingService";
import { getDoctors } from "../services/scheduleService";
import { getAvailability, createAppointment } from "../services/appointmentService";
import { formatCurrency } from "../utils/currency";
import { validateEthiopianPhone } from "../utils/phone";
import { useToast } from "../context/useToast";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  age: "",
  gender: "Male",
  phone: "09",
  email: "",
  address: "Addis Ababa",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

function PatientNew() {
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicatePatient, setDuplicatePatient] = useState(null);

  // Post-Registration Card Payment Modal (Requirement 1)
  const [createdPatient, setCreatedPatient] = useState(null);
  const [showCardPayModal, setShowCardPayModal] = useState(false);
  const [cardPayInfo, setCardPayInfo] = useState(null);
  const [cardPayMethod, setCardPayMethod] = useState("CASH");
  const [cardPayTxnRef, setCardPayTxnRef] = useState("");
  const [cardPayNotes, setCardPayNotes] = useState("");
  const [cardPayEmergency, setCardPayEmergency] = useState(false);
  const [cardPayProcessing, setCardPayProcessing] = useState(false);
  const [cardPayError, setCardPayError] = useState("");

  // Receipt Prompt & Printable Receipt
  const [showCardReceiptPrompt, setShowCardReceiptPrompt] = useState(false);
  const [showCardPrintModal, setShowCardPrintModal] = useState(false);
  const [paidCardReceiptData, setPaidCardReceiptData] = useState(null);

  // Post-Registration Auto-Appointment Modal
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [todayDoctors, setTodayDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [todaySlots, setTodaySlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingAppointment, setBookingAppointment] = useState(false);
  const [appointmentSuccess, setAppointmentSuccess] = useState(null);
  const [appointmentReason, setAppointmentReason] = useState("First Visit / General Consultation");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [appointmentError, setAppointmentError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  }

  // Load today's doctors helper
  async function openAppointmentOffer() {
    try {
      const docRes = await getDoctors({ date: today });
      const availableDocs = docRes.data || [];
      setTodayDoctors(availableDocs);
      if (availableDocs.length > 0) {
        setSelectedDoctorId(availableDocs[0].id);
      }
      setShowAppointmentModal(true);
    } catch (err) {
      console.error("Failed to load today doctors:", err);
      setShowAppointmentModal(true);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setDuplicatePatient(null);

    if (!form.firstName || !form.lastName || form.age === "" || !form.phone) {
      setError("Please fill in all required fields (Name, Age, Phone).");
      return;
    }

    if (!validateEthiopianPhone(form.phone)) {
      setError("Enter a valid Ethiopian phone number starting with 09, 07, or +251 (e.g. 0912345678).");
      return;
    }

    if (form.emergencyContactPhone && !validateEthiopianPhone(form.emergencyContactPhone)) {
      setError("Emergency contact phone must be a valid Ethiopian phone number starting with 09, 07, or +251.");
      return;
    }

    const ageNum = parseInt(form.age, 10);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
      setError("Please enter a valid age between 0 and 130.");
      return;
    }

    try {
      setLoading(true);
      const res = await createPatient({
        ...form,
        age: ageNum,
      });
      const newPatient = res.data;
      setCreatedPatient(newPatient);
      toast.success(`Patient ${newPatient.first_name} ${newPatient.last_name} registered successfully.`, 5000);

      // If a registration card order was created, popup card payment first
      if (newPatient.registrationOrderId) {
        setCardPayInfo({
          patientName: `${newPatient.first_name} ${newPatient.last_name}`,
          patientNumber: newPatient.patient_number,
          orderId: newPatient.registrationOrderId,
          price: newPatient.registrationPrice || 200,
        });
        setCardPayMethod("CASH");
        setCardPayTxnRef("");
        setCardPayNotes("");
        setCardPayError("");
        setCardPayEmergency(false);
        setShowCardPayModal(true);
        return;
      }

      await openAppointmentOffer();
    } catch (err) {
      if (err.code === "DUPLICATE_PATIENT_EXISTS" || err.data?.existingPatient) {
        const existing = err.data?.existingPatient;
        setDuplicatePatient(existing);
        const warnMsg = `⚠️ Existing Patient Detected: ${existing?.first_name || ""} ${existing?.last_name || ""} (MRN: ${existing?.patient_number || "MRN"}). The registrar should not create another patient record. Please verify identity and create a visit/encounter for today.`;
        setError(warnMsg);
        toast.warning(warnMsg, 7000);
        return;
      }
      const errMsg = err.message || "Failed to register patient.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setLoading(false);
    }
  }

  // Cancel card fee payment: if routine, delete draft patient
  async function handleCancelCardPay() {
    if (createdPatient?.id && !cardPayEmergency) {
      try {
        await deletePatient(createdPatient.id);
      } catch (e) {
        console.error("Cleanup cancelled patient draft:", e);
      }
    }
    setShowCardPayModal(false);
    setCreatedPatient(null);
    setCardPayInfo(null);
    const cancelMsg = "Patient registration cancelled. Registration card fee payment is required before registering a patient.";
    setError(cancelMsg);
    toast.warning(cancelMsg, 5000);
  }

  // Pay registration card fee
  async function handlePayCardFee(e) {
    e.preventDefault();
    if (!cardPayInfo) return;

    if (cardPayEmergency) {
      setShowCardPayModal(false);
      await openAppointmentOffer();
      return;
    }

    try {
      setCardPayProcessing(true);
      setCardPayError("");
      const res = await recordSelectivePayment({
        serviceOrderIds: [cardPayInfo.orderId],
        paymentMethod: cardPayMethod,
        transactionReference: cardPayTxnRef || null,
        notes: cardPayNotes || `Registration card fee — ${cardPayInfo.patientName}`,
      });

      const receipt = {
        receiptNumber: res?.data?.paymentNumber || `REC-${Date.now().toString().slice(-6)}`,
        patientName: cardPayInfo.patientName,
        patientNumber: cardPayInfo.patientNumber,
        amount: cardPayInfo.price,
        paymentMethod: cardPayMethod,
        transactionReference: cardPayTxnRef || "—",
        date: new Date().toLocaleString(),
        description: "Patient Registration Card Fee",
      };

      setPaidCardReceiptData(receipt);
      toast.success(`Registration card payment of ${formatCurrency(cardPayInfo.price)} recorded successfully.`, 5000);
      setShowCardPayModal(false);
      setShowCardReceiptPrompt(true);
    } catch (err) {
      const errMsg = err.message || "Payment failed. Please try again.";
      setCardPayError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setCardPayProcessing(false);
    }
  }

  // Load available time slots when a doctor is selected for today's appointment
  useEffect(() => {
    if (!showAppointmentModal || !selectedDoctorId) {
      return;
    }

    let cancelled = false;
    async function loadTodaySlots() {
      try {
        setLoadingSlots(true);
        const res = await getAvailability(selectedDoctorId, today);
        if (!cancelled) {
          const availableSlots = (res.data || []).filter((s) => s.available);
          setTodaySlots(availableSlots);
          if (availableSlots.length > 0) {
            setSelectedSlot(availableSlots[0]); // Recommended slot
          } else {
            setSelectedSlot(null);
          }
          setLoadingSlots(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load today slots:", err);
          setLoadingSlots(false);
        }
      }
    }

    loadTodaySlots();
    return () => {
      cancelled = true;
    };
  }, [showAppointmentModal, selectedDoctorId, today]);

  async function handleConfirmAppointment() {
    if (!createdPatient || !selectedDoctorId || !selectedSlot) return;
    try {
      setBookingAppointment(true);
      const res = await createAppointment({
        patientId: createdPatient.id,
        doctorId: selectedDoctorId,
        appointmentDate: today,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reason: "General Consultation Intake",
      });
      setAppointmentSuccess(res.data);
      toast.success(`Appointment booked successfully with Dr. ${activeDoctor?.first_name || ""} for ${selectedSlot.startTime}.`, 5000);
    } catch (err) {
      const errMsg = err.message || "Failed to book consultation appointment.";
      setError(errMsg);
      toast.error(errMsg, 5000);
    } finally {
      setBookingAppointment(false);
    }
  }

  const activeDoctor = todayDoctors.find((d) => d.id === selectedDoctorId);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Patient Intake</p>
          <h1>New Patient Registration</h1>
          <p className="page-description">
            Register a new patient. After registration, the system will immediately offer appointment booking.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="appointment-layout">
        <section className="card">
          <div className="card-header">
            <h2>Personal Information</h2>
            <p>Primary identity and contact information.</p>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="firstName">
                First Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="e.g. Abebe"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="lastName">
                Last Name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="e.g. Kebede"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="age">
                Age (Years) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="age"
                name="age"
                type="number"
                min="0"
                max="130"
                value={form.age}
                onChange={handleChange}
                placeholder="e.g. 35"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="gender">
                Gender <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                id="gender"
                name="gender"
                value={form.gender}
                onChange={handleChange}
                required
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="phone">
                Phone Number (Ethiopian Format) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="09XXXXXXXX or +2519XXXXXXXX"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="patient@example.com"
              />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: "18px" }}>
            <label htmlFor="address">Residential Address / Sub-City</label>
            <input
              id="address"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="e.g. Bole Sub-City, Addis Ababa"
            />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Emergency Contact</h2>
            <p>Designated next of kin or emergency representative.</p>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="emergencyContactName">Emergency Contact Name</label>
              <input
                id="emergencyContactName"
                name="emergencyContactName"
                value={form.emergencyContactName}
                onChange={handleChange}
                placeholder="Full name of contact"
              />
            </div>

            <div className="form-field">
              <label htmlFor="emergencyContactPhone">Emergency Contact Phone</label>
              <input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                value={form.emergencyContactPhone}
                onChange={handleChange}
                placeholder="09XXXXXXXX or +2519XXXXXXXX"
              />
            </div>
          </div>
        </section>

        <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            className="button button-secondary button-large"
            onClick={() => navigate("/patients")}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary button-large"
            disabled={loading}
          >
            {loading ? "Registering Patient..." : "Register Patient & Book Consultation →"}
          </button>
        </div>
      </form>

      {/* ────────────────────────────────────────────────────────────
           Requirement 1: Mandatory Registration Card Payment Modal
      ──────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showCardPayModal}
        onClose={handleCancelCardPay}
        title="Step 1 of 2 — Pay Registration Card Fee"
      >
        {cardPayInfo && (
          <form onSubmit={handlePayCardFee}>
            <div style={{
              background: "linear-gradient(135deg, #667eea22 0%, #764ba222 100%)",
              border: "1px solid #667eea44",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>
                    {cardPayInfo.patientName}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {cardPayInfo.patientNumber}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Registration Card Fee
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--primary)" }}>
                    {formatCurrency(cardPayInfo.price)}
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Collect the one-time registration card fee before assigning the patient to a doctor.
              After payment this window will automatically advance to consultation booking.
            </p>

            {cardPayError && (
              <div className="alert alert-error" style={{ marginBottom: "12px" }}>
                {cardPayError}
              </div>
            )}

            {/* Emergency Patient Override Option (Requirement 1) */}
            <div
              style={{
                background: cardPayEmergency ? "#fef2f2" : "var(--surface-muted)",
                border: cardPayEmergency ? "1px solid #ef4444" : "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                marginBottom: "14px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: cardPayEmergency ? "#b91c1c" : "var(--text-main)",
                  fontSize: "13px",
                }}
              >
                <input
                  type="checkbox"
                  checked={cardPayEmergency}
                  onChange={(e) => setCardPayEmergency(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <span>🚨 Emergency Patient (Allow Pay Later / Defer Payment)</span>
              </label>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", marginLeft: "24px" }}>
                {cardPayEmergency
                  ? "Emergency override enabled: Patient may proceed to immediate consultation booking without upfront payment."
                  : "Registration fee payment is mandatory before booking consultation for routine patients."}
              </div>
            </div>

            {!cardPayEmergency && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="pNewCardPayMethod">Payment Method *</label>
                    <select
                      id="pNewCardPayMethod"
                      value={cardPayMethod}
                      onChange={(e) => setCardPayMethod(e.target.value)}
                      required
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="MOBILE_MONEY">Mobile Money (Telebirr / CBE Birr)</option>
                      <option value="POS">POS / Card</option>
                    </select>
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="pNewCardPayTxnRef">Transaction / Receipt Ref</label>
                    <input
                      id="pNewCardPayTxnRef"
                      placeholder="Optional reference number"
                      value={cardPayTxnRef}
                      onChange={(e) => setCardPayTxnRef(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field" style={{ marginBottom: "20px" }}>
                  <label htmlFor="pNewCardPayNotes">Notes (optional)</label>
                  <input
                    id="pNewCardPayNotes"
                    placeholder="e.g. Paid by relative, cash counted"
                    value={cardPayNotes}
                    onChange={(e) => setCardPayNotes(e.target.value)}
                  />
                </div>
              </>
            )}

            <div style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancelCardPay}
              >
                Cancel Registration
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={cardPayProcessing}
                style={{
                  minWidth: "220px",
                  background: cardPayEmergency ? "#b91c1c" : "var(--primary)",
                  borderColor: cardPayEmergency ? "#b91c1c" : "var(--primary)",
                }}
              >
                {cardPayProcessing
                  ? "Processing..."
                  : cardPayEmergency
                  ? "🚨 Authorize Emergency (Pay Later) → Book Consultation"
                  : `✓ Pay ${formatCurrency(cardPayInfo.price)} Received → Proceed`}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ────────────────────────────────────────────────────────────
           Requirement 1: Do You Want Receipt Prompt for Card Payment
      ──────────────────────────────────────────────────────────── */}
      {showCardReceiptPrompt && paidCardReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCardReceiptPrompt(false);
            openAppointmentOffer();
          }}
          title="Payment Received — Do You Want a Receipt?"
        >
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--success)" }}>Payment Recorded Successfully!</h3>
            <p style={{ fontSize: "14px", color: "var(--text-main)", marginBottom: "14px" }}>
              Registration Card payment of <strong>{formatCurrency(paidCardReceiptData.amount)}</strong> was recorded for{" "}
              <strong>{paidCardReceiptData.patientName}</strong> ({paidCardReceiptData.patientNumber}).
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>
              Would you like to print an official transaction receipt for the patient now?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setShowCardReceiptPrompt(false);
                  openAppointmentOffer();
                }}
                style={{ minWidth: "160px" }}
              >
                No, Skip to Consultation →
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setShowCardReceiptPrompt(false);
                  setShowCardPrintModal(true);
                }}
                style={{ minWidth: "160px" }}
              >
                🖨 Yes, Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable Card Receipt Modal */}
      {showCardPrintModal && paidCardReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCardPrintModal(false);
            openAppointmentOffer();
          }}
          title="Print Registration Card Receipt"
        >
          <PrintableDocument
            title="OFFICIAL REGISTRATION RECEIPT"
            subtitle="Patient Intake & Medical Card Fee"
            documentNumber={paidCardReceiptData.receiptNumber}
            date={paidCardReceiptData.date}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "13px" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0", color: "#666" }}>Patient Name:</td>
                  <td style={{ padding: "8px 0", fontWeight: 700 }}>{paidCardReceiptData.patientName}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0", color: "#666" }}>Patient MRN:</td>
                  <td style={{ padding: "8px 0", fontFamily: "monospace", fontWeight: 700 }}>{paidCardReceiptData.patientNumber}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0", color: "#666" }}>Payment Purpose:</td>
                  <td style={{ padding: "8px 0" }}>Patient Registration & Medical Card Fee</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0", color: "#666" }}>Payment Method:</td>
                  <td style={{ padding: "8px 0", fontWeight: 600 }}>{paidCardReceiptData.paymentMethod}</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 0", color: "#666" }}>Reference Number:</td>
                  <td style={{ padding: "8px 0", fontFamily: "monospace" }}>{paidCardReceiptData.transactionReference}</td>
                </tr>
                <tr style={{ borderTop: "2px solid #333" }}>
                  <td style={{ padding: "10px 0", fontSize: "15px", fontWeight: 800 }}>Total Amount Paid:</td>
                  <td style={{ padding: "10px 0", fontSize: "16px", fontWeight: 800, color: "#166534" }}>{formatCurrency(paidCardReceiptData.amount)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ textAlign: "center", marginTop: "16px", fontSize: "11px", color: "#888" }}>
              ✓ Status: COMPLETED / OFFICIAL HOSPITAL PAYMENT RECORD
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setShowCardPrintModal(false);
                  openAppointmentOffer();
                }}
              >
                Continue to Book Consultation →
              </button>
            </div>
          </PrintableDocument>
        </Modal>
      )}

      {/* ────────────────────────────────────────────────────────────
           Step 2: Book Today's Consultation Modal
      ──────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showAppointmentModal && Boolean(createdPatient)}
        onClose={() => navigate(`/patients/${createdPatient?.id}`)}
        title="Step 2 of 2 — ✓ Patient Registered: Book Consultation"
        maxWidth="680px"
      >
        {createdPatient && (
          <div>
            <div style={{ background: "var(--primary-light)", padding: "14px", borderRadius: "8px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "15px", color: "var(--primary-dark)" }}>
                    {createdPatient.first_name} {createdPatient.last_name}
                  </strong>
                  <span style={{ marginLeft: "10px", fontFamily: "monospace", fontSize: "12px", background: "#ffffff", padding: "2px 8px", borderRadius: "4px" }}>
                    {createdPatient.patient_number}
                  </span>
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Age: {createdPatient.age} yrs • {createdPatient.gender}
                </span>
              </div>
            </div>

            {appointmentSuccess ? (
              <div>
                <div className="alert alert-success" style={{ marginBottom: "16px" }}>
                  <strong>Consultation booked for today! Ref: {appointmentSuccess.appointment_number}</strong>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <Link
                    to={`/patients/${createdPatient.id}`}
                    className="button button-secondary"
                  >
                    Open Patient Chart
                  </Link>
                  <Link
                    to="/registrar/desk"
                    className="button button-primary"
                  >
                    Go to Registrar Desk →
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                  The system automatically recommends a consultation with an available general doctor for <strong>Today ({today})</strong>.
                </p>

                <div className="form-field" style={{ marginBottom: "14px" }}>
                  <label>Available Physicians Today ({today})</label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                  >
                    {todayDoctors.length === 0 && <option value="">No doctors scheduled today</option>}
                    {todayDoctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.first_name} {d.last_name} ({d.specialty || d.department || "General"})
                      </option>
                    ))}
                  </select>
                </div>

                {loadingSlots ? (
                  <div className="loading-state">Checking available consultation slots...</div>
                ) : todaySlots.length === 0 ? (
                  <div className="empty-state" style={{ padding: "16px", marginBottom: "16px" }}>
                    <p style={{ margin: 0, fontSize: "13px" }}>
                      Dr. {activeDoctor?.first_name} {activeDoctor?.last_name} has no remaining available slots today.
                    </p>
                  </div>
                ) : (
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>
                      Available Today Slots ({todaySlots.length}):
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "6px" }}>
                      {todaySlots.map((slot) => {
                        const isSelected = selectedSlot && selectedSlot.startTime === slot.startTime;
                        return (
                          <button
                            key={slot.startTime}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            style={{
                              padding: "7px",
                              borderRadius: "6px",
                              border: `1px solid ${isSelected ? "var(--primary)" : "#cbd5e1"}`,
                              background: isSelected ? "var(--primary)" : "#ffffff",
                              color: isSelected ? "#ffffff" : "var(--text)",
                              fontSize: "12px",
                              fontWeight: isSelected ? 700 : 500,
                              cursor: "pointer",
                            }}
                          >
                            {slot.startTime} – {slot.endTime}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                  <Link
                    to={`/appointments/availability?patientId=${createdPatient.id}`}
                    className="button button-secondary"
                  >
                     Choose Another Date
                  </Link>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => navigate(`/patients/${createdPatient.id}`)}
                    >
                      Skip Appointment
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={bookingAppointment || !selectedSlot}
                      onClick={handleConfirmAppointment}
                    >
                      {bookingAppointment
                        ? "Booking..."
                        : selectedSlot
                        ? `Confirm Appointment (${selectedSlot.startTime}) →`
                        : "Confirm Appointment"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Duplicate Patient Alert Modal (Requirement 3) */}
      <Modal
        isOpen={Boolean(duplicatePatient)}
        onClose={() => setDuplicatePatient(null)}
        title="⚠️ Existing Patient Record Found"
        size="md"
      >
        {duplicatePatient && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              <strong>Duplicate Patient Registration Blocked</strong>
              <p style={{ margin: "6px 0 0" }}>
                A patient record with matching information already exists in the hospital database. The registrar should not create another patient record.
              </p>
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "14px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                fontSize: "13px",
              }}
            >
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Patient Number (MRN)</span>
                <strong style={{ color: "#0f172a", fontSize: "14px" }}>{duplicatePatient.patient_number}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Full Name</span>
                <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                  {duplicatePatient.first_name} {duplicatePatient.last_name}
                </strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Phone Number</span>
                <strong style={{ color: "#0f172a" }}>{duplicatePatient.phone}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block" }}>Age / Gender</span>
                <strong style={{ color: "#0f172a" }}>
                  {duplicatePatient.age || "—"} yrs • {duplicatePatient.gender}
                </strong>
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                color: "#166534",
                fontSize: "13px",
              }}
            >
              <strong>Recommended Workflow:</strong>
              <p style={{ margin: "4px 0 0" }}>
                Open the existing patient record in the <strong>Registrar Desk</strong>, verify the patient's identity, and create a <strong>new visit/encounter for today</strong>.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "8px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setDuplicatePatient(null)}
              >
                Close & Review
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  const pat = duplicatePatient;
                  setDuplicatePatient(null);
                  navigate("/registrar", { state: { existingPatient: pat } });
                }}
              >
                🔄 Switch to Returning Patient Intake →
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

export default PatientNew;
