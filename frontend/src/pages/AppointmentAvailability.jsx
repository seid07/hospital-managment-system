import { useEffect, useState } from "react";

import PatientSearch from "../components/appointments/PatientSearch";
import DoctorSelector from "../components/appointments/DoctorSelector";
import SlotGrid from "../components/appointments/SlotGrid";
import AppointmentForm from "../components/appointments/AppointmentForm";

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
        setDoctorsLoading(true);
        setError("");

        const response = await getDoctors();

        if (cancelled) {
          return;
        }

        const doctorList = response.data || [];

        setDoctors(doctorList);
      } catch (error) {
        if (!cancelled) {
          setError(error.message || "Unable to load doctors.");
        }
      } finally {
        if (!cancelled) {
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

        if (cancelled) {
          return;
        }

        setSlots(response.data || []);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setError(error.message || "Unable to load availability.");

        setSlots([]);
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
      (slot) => `${slot.startTime}-${slot.endTime}` === selectedSlotKey,
    ) || null;

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
    if (!slot?.available) {
      return;
    }

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

      setSuccess(response.data);

      const availability = await getAvailability(doctorId, date);

      setSlots(availability.data || []);

      setSelectedSlotKey("");
      setReason("");
      setNotes("");
    } catch (error) {
      setError(error.message || "Unable to create appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Appointments</p>

          <h1>New Appointment</h1>

          <p className="page-description">
            Schedule an appointment for an existing patient.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="status">
          <strong>Appointment booked successfully.</strong>

          <span>Appointment number: {success.appointment_number}</span>
        </div>
      )}

      <form className="appointment-layout" onSubmit={handleSubmit}>
        <section className="card">
          <div className="card-header">
            <h2>Patient</h2>

            <p>Search for an existing patient.</p>
          </div>

          <PatientSearch selectedPatient={patient} onSelect={setPatient} />
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Doctor & Date</h2>

            <p>Select the doctor and appointment date.</p>
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
            <h2>Available Times</h2>

            <p>Availability is calculated by the hospital server.</p>
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
            <h2>Appointment Details</h2>

            <p>Add information about the visit.</p>
          </div>

          <AppointmentForm
            reason={reason}
            notes={notes}
            onReasonChange={setReason}
            onNotesChange={setNotes}
          />
        </section>

        <section className="appointment-submit">
          <div>
            {selectedSlot && (
              <p>
                Selected:
                <strong>
                  {" "}
                  {selectedSlot.startTime}
                  {" – "}
                  {selectedSlot.endTime}
                </strong>
              </p>
            )}
          </div>

          <button
            className="button button-primary button-large"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Booking..." : "Book Appointment"}
          </button>
        </section>
      </form>
    </main>
  );
}

export default AppointmentAvailability;
