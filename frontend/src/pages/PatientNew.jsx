import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { createPatient } from "../services/patientService";
import { getDoctors } from "../services/scheduleService";
import { getAvailability, createAppointment } from "../services/appointmentService";
import { validateEthiopianPhone } from "../utils/phone";

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
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Post-Registration Auto-Appointment Modal
  const [createdPatient, setCreatedPatient] = useState(null);
  const [todayDoctors, setTodayDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [todaySlots, setTodaySlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingAppointment, setBookingAppointment] = useState(false);
  const [appointmentSuccess, setAppointmentSuccess] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

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

      // Fetch today's available doctors for immediate appointment booking
      try {
        const docRes = await getDoctors({ date: today });
        const availableDocs = docRes.data || [];
        setTodayDoctors(availableDocs);
        if (availableDocs.length > 0) {
          setSelectedDoctorId(availableDocs[0].id);
        }
      } catch (err) {
        console.error("Failed to load today doctors:", err);
      }
    } catch (err) {
      setError(err.message || "Failed to register patient.");
    } finally {
      setLoading(false);
    }
  }

  // Load available time slots when a doctor is selected for today's appointment
  useEffect(() => {
    if (!createdPatient || !selectedDoctorId) {
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
  }, [createdPatient, selectedDoctorId, today]);

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
    } catch (err) {
      setError(err.message || "Failed to book consultation appointment.");
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

      {/* Post-Registration Auto-Appointment Modal */}
      <Modal
        isOpen={Boolean(createdPatient)}
        onClose={() => navigate(`/patients/${createdPatient.id}`)}
        title="✓ Patient Registered — Book Today's Consultation"
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
                    📅 Choose Another Date
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
    </AppShell>
  );
}

export default PatientNew;
