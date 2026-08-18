import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import PatientSearch from "../components/appointments/PatientSearch";
import DoctorSelector from "../components/appointments/DoctorSelector";
import SlotGrid from "../components/appointments/SlotGrid";
import AppointmentForm from "../components/appointments/AppointmentForm";
import PrintableDocument from "../components/common/PrintableDocument";

import { getDoctors } from "../services/scheduleService";
import {
  getAvailability,
  createAppointment,
} from "../services/appointmentService";

function AppointmentAvailability() {
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDoctors() {
      try {
        setError("");
        const response = await getDoctors();
        if (cancelled) return;
        setDoctors(response.data || []);
        setDoctorsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load doctors.");
          setDoctorsLoading(false);
        }
      }
    }

    loadDoctors();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!doctorId || !date) {
      return undefined;
    }

    let cancelled = false;

    async function loadAvailability() {
      try {
        setAvailabilityLoading(true);
        setError("");
        const response = await getAvailability(doctorId, date);
        if (cancelled) return;
        setSlots(response.data || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || "Unable to load availability.");
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      }
    }

    loadAvailability();
    return () => {
      cancelled = true;
    };
  }, [doctorId, date]);

  const selectedSlot =
    slots.find(
      (slot) => `${slot.startTime}-${slot.endTime}` === selectedSlotKey
    ) || null;

  const selectedDoctor = doctors.find((d) => d.id === doctorId) || null;

  function handleDoctorChange(value) {
    setDoctorId(value);
    setSelectedSlotKey("");
    setSlots([]);
  }

  function handleDateChange(value) {
    setDate(value);
    setSelectedSlotKey("");
    setSlots([]);
  }

  function handleSlotSelect(slot) {
    if (!slot?.available) return;
    setSelectedSlotKey(`${slot.startTime}-${slot.endTime}`);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    if (!patient) {
      setError("Please select a patient.");
      return;
    }

    if (!doctorId) {
      setError("Please select a doctor.");
      return;
    }

    if (!date) {
      setError("Please select an appointment date.");
      return;
    }

    if (!selectedSlot) {
      setError("Please select an available time.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await createAppointment({
        patientId: patient.id,
        doctorId,
        appointmentDate: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      });

      setSuccess({
        ...response.data,
        patientName: `${patient.first_name} ${patient.last_name}`,
        patientNumber: patient.patient_number,
        doctorName: selectedDoctor ? `Dr. ${selectedDoctor.first_name} ${selectedDoctor.last_name}` : "Doctor",
        specialty: selectedDoctor?.specialty || "General",
        date,
        time: `${selectedSlot.startTime} – ${selectedSlot.endTime}`,
      });

      const availability = await getAvailability(doctorId, date);
      setSlots(availability.data || []);
      setSelectedSlotKey("");
      setReason("");
      setNotes("");
    } catch (err) {
      setError(err.message || "Unable to create appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Appointments</p>
          <h1>Book New Appointment</h1>
          <p className="page-description">
            Schedule a consultation slot with a physician.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div style={{ marginBottom: "24px" }}>
          <div className="alert alert-success" role="status" style={{ marginBottom: "12px" }}>
            <strong>Appointment booked successfully! Ref: {success.appointment_number}</strong>
          </div>

          <PrintableDocument
            title="APPOINTMENT CONFIRMATION SLIP"
            subtitle="Hospital Outpatient Clinic"
            documentNumber={success.appointment_number}
            date={new Date().toLocaleDateString()}
          >
            <table style={{ width: "100%", fontSize: "14px", borderSpacing: "0 8px" }}>
              <tbody>
                <tr>
                  <td><strong>Patient Name:</strong></td>
                  <td>{success.patientName} ({success.patientNumber})</td>
                </tr>
                <tr>
                  <td><strong>Consulting Physician:</strong></td>
                  <td>{success.doctorName} ({success.specialty})</td>
                </tr>
                <tr>
                  <td><strong>Appointment Date:</strong></td>
                  <td><strong>{success.date}</strong></td>
                </tr>
                <tr>
                  <td><strong>Time Slot:</strong></td>
                  <td><strong>{success.time}</strong></td>
                </tr>
                {success.reason && (
                  <tr>
                    <td><strong>Reason for Visit:</strong></td>
                    <td>{success.reason}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p style={{ fontSize: "12px", color: "#666", marginTop: "12px" }}>
              Please arrive 15 minutes before your scheduled appointment time. Present this confirmation at the reception desk.
            </p>
          </PrintableDocument>

          <button
            type="button"
            className="button button-secondary"
            style={{ marginTop: "12px" }}
            onClick={() => setSuccess(null)}
          >
            + Book Another Appointment
          </button>
        </div>
      )}

      {!success && (
        <form className="appointment-layout" onSubmit={handleSubmit}>
          <section className="card">
            <div className="card-header">
              <h2>1. Select Patient</h2>
              <p>Search for an existing registered patient.</p>
            </div>
            <PatientSearch selectedPatient={patient} onSelect={setPatient} />
          </section>

          <section className="card">
            <div className="card-header">
              <h2>2. Doctor & Date</h2>
              <p>Select the physician and consultation date.</p>
            </div>

            <div className="form-grid">
              <DoctorSelector
                doctors={doctors}
                value={doctorId}
                onChange={handleDoctorChange}
                loading={doctorsLoading}
              />

              <div className="form-field">
                <label htmlFor="date">Appointment Date</label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  min={today}
                  onChange={(event) => handleDateChange(event.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>3. Available Times</h2>
              <p>Availability is verified dynamically by the hospital scheduler.</p>
            </div>

            <SlotGrid
              slots={slots}
              selectedSlot={selectedSlot}
              onSelect={handleSlotSelect}
              loading={availabilityLoading}
              hasDate={Boolean(doctorId && date)}
            />
          </section>

          <section className="card">
            <div className="card-header">
              <h2>4. Reason & Clinical Notes</h2>
              <p>Add context regarding the patient&apos;s symptoms or visit purpose.</p>
            </div>

            <AppointmentForm
              reason={reason}
              notes={notes}
              onReasonChange={setReason}
              onNotesChange={setNotes}
            />
          </section>

          <section className="appointment-submit" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {selectedSlot ? (
                <p style={{ margin: 0, fontSize: "14px" }}>
                  Selected Slot:{" "}
                  <strong style={{ color: "var(--primary)" }}>
                    {selectedSlot.startTime} – {selectedSlot.endTime}
                  </strong>
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  Please select an available time slot above
                </p>
              )}
            </div>

            <button
              className="button button-primary button-large"
              type="submit"
              disabled={submitting || !selectedSlot}
            >
              {submitting ? "Booking Appointment..." : "Confirm & Book Appointment →"}
            </button>
          </section>
        </form>
      )}
    </AppShell>
  );
}

export default AppointmentAvailability;
