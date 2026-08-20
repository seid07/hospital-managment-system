import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import PatientSearch from "../components/appointments/PatientSearch";
import PrintableDocument from "../components/common/PrintableDocument";

import {
  getDoctors,
  getDoctorUpcomingAvailability,
} from "../services/scheduleService";
import {
  getAvailability,
  createAppointment,
} from "../services/appointmentService";

function AppointmentAvailability() {
  const [mode, setMode] = useState("BY_DOCTOR"); // "BY_DOCTOR" (Option B) or "BY_DATE" (Option A)
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [patient, setPatient] = useState(null);

  // Selection states
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotKey, setSelectedSlotKey] = useState("");

  // Option B: Upcoming availability schedule matrix
  const [upcomingSchedule, setUpcomingSchedule] = useState(null);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  // Option A: Single date slot grid
  const [slots, setSlots] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Form notes
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const today = new Date().toISOString().split("T")[0];

  // Load doctors (optionally filtered by date in BY_DATE mode)
  useEffect(() => {
    let cancelled = false;

    async function loadDoctorList() {
      try {
        setDoctorsLoading(true);
        setError("");
        const params = {};
        if (mode === "BY_DATE" && selectedDate) {
          params.date = selectedDate;
        }
        const res = await getDoctors(params);
        if (!cancelled) {
          const list = res.data || [];
          setDoctors(list);
          setDoctorsLoading(false);

          // If current selected doctor is not in the filtered list, reset
          if (selectedDoctorId && !list.some((d) => d.id === selectedDoctorId)) {
            setSelectedDoctorId("");
            setSelectedSlotKey("");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load doctors.");
          setDoctorsLoading(false);
        }
      }
    }

    loadDoctorList();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedDate, selectedDoctorId]);

  // Option B: Load upcoming availability matrix when doctor is selected
  useEffect(() => {
    if (mode !== "BY_DOCTOR" || !selectedDoctorId) {
      return;
    }

    let cancelled = false;
    async function loadDoctorUpcoming() {
      try {
        setUpcomingLoading(true);
        setError("");
        const res = await getDoctorUpcomingAvailability(selectedDoctorId, 14);
        if (!cancelled) {
          setUpcomingSchedule(res.data || null);
          setUpcomingLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load doctor schedule.");
          setUpcomingLoading(false);
        }
      }
    }

    loadDoctorUpcoming();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedDoctorId]);

  // Option A: Load slots when both doctor and date are chosen
  useEffect(() => {
    if (mode !== "BY_DATE" || !selectedDoctorId || !selectedDate) {
      return;
    }

    let cancelled = false;
    async function loadSlots() {
      try {
        setAvailabilityLoading(true);
        setError("");
        const res = await getAvailability(selectedDoctorId, selectedDate);
        if (!cancelled) {
          setSlots(res.data || []);
          setAvailabilityLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load availability.");
          setAvailabilityLoading(false);
        }
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedDoctorId, selectedDate]);

  function handleSlotSelect(dateStr, slot) {
    if (!slot?.available) return;
    setSelectedDate(dateStr);
    setSelectedSlotKey(`${dateStr}_${slot.startTime}-${slot.endTime}`);
  }

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) || upcomingSchedule?.doctor;

  let selectedSlotTimes = null;
  if (selectedSlotKey) {
    const parts = selectedSlotKey.split("_");
    if (parts.length === 2) {
      const [start, end] = parts[1].split("-");
      selectedSlotTimes = { startTime: start, endTime: end };
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    if (!patient) {
      setError("Please select or search for a patient first.");
      return;
    }

    if (!selectedDoctorId) {
      setError("Please select a doctor.");
      return;
    }

    if (!selectedDate) {
      setError("Please select an appointment date.");
      return;
    }

    if (!selectedSlotTimes) {
      setError("Please select an available consultation time slot.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await createAppointment({
        patientId: patient.id,
        doctorId: selectedDoctorId,
        appointmentDate: selectedDate,
        startTime: selectedSlotTimes.startTime,
        endTime: selectedSlotTimes.endTime,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      });

      setSuccess({
        ...response.data,
        patientName: `${patient.first_name} ${patient.last_name}`,
        patientNumber: patient.patient_number,
        doctorName: selectedDoctor ? `Dr. ${selectedDoctor.first_name} ${selectedDoctor.last_name}` : "Doctor",
        specialty: selectedDoctor?.specialty || "General Consultation",
        date: selectedDate,
        time: `${selectedSlotTimes.startTime} – ${selectedSlotTimes.endTime}`,
      });

      // Reload availability
      if (mode === "BY_DOCTOR") {
        const res = await getDoctorUpcomingAvailability(selectedDoctorId, 14);
        setUpcomingSchedule(res.data);
      } else {
        const res = await getAvailability(selectedDoctorId, selectedDate);
        setSlots(res.data || []);
      }

      setSelectedSlotKey("");
      setReason("");
      setNotes("");
    } catch (err) {
      setError(err.message || "Unable to create appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Appointments & Capacity</p>
          <h1>Book Doctor Appointment</h1>
          <p className="page-description">
            Schedule a physician consultation. Double-booking prevention is enforced in real-time.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className={`button ${mode === "BY_DOCTOR" ? "button-primary" : "button-secondary"}`}
            onClick={() => {
              setMode("BY_DOCTOR");
              setSelectedSlotKey("");
            }}
          >
            👨‍⚕️ Search by Doctor (Option B)
          </button>
          <button
            type="button"
            className={`button ${mode === "BY_DATE" ? "button-primary" : "button-secondary"}`}
            onClick={() => {
              setMode("BY_DATE");
              setSelectedSlotKey("");
            }}
          >
            📅 Search by Date (Option A)
          </button>
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
            <strong>✓ Appointment booked successfully! Ref: {success.appointment_number}</strong>
          </div>

          <PrintableDocument
            title="APPOINTMENT CONFIRMATION SLIP"
            subtitle="Hospital Outpatient Department"
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
          {/* 1. Patient Selection */}
          <section className="card">
            <div className="card-header">
              <h2>1. Select Patient</h2>
              <p>Search for an existing patient record.</p>
            </div>
            <PatientSearch selectedPatient={patient} onSelect={setPatient} />
          </section>

          {/* 2. Doctor & Date Selection */}
          <section className="card">
            <div className="card-header">
              <h2>
                2. {mode === "BY_DOCTOR" ? "Select Doctor to View Available Dates" : "Select Date to View Available Doctors"}
              </h2>
              <p>
                {mode === "BY_DOCTOR"
                  ? "Selecting a doctor immediately displays their next available dates and times."
                  : "Selecting a date filters the doctor list to show only doctors with active shifts on that day."}
              </p>
            </div>

            {mode === "BY_DOCTOR" ? (
              <div>
                <div className="form-field" style={{ marginBottom: "16px" }}>
                  <label htmlFor="doctorSelect">Select Physician *</label>
                  <select
                    id="doctorSelect"
                    value={selectedDoctorId}
                    onChange={(e) => {
                      setSelectedDoctorId(e.target.value);
                      setSelectedSlotKey("");
                      setSelectedDate("");
                    }}
                    disabled={doctorsLoading}
                  >
                    <option value="">-- Choose a Doctor --</option>
                    {doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        Dr. {doc.first_name} {doc.last_name} — {doc.specialty || doc.department || "General Practice"}
                      </option>
                    ))}
                  </select>
                </div>

                {upcomingLoading && <div className="loading-state">Loading doctor's upcoming schedule...</div>}

                {selectedDoctorId && !upcomingLoading && upcomingSchedule && (
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "16px 0 10px" }}>
                      Upcoming Available Dates & Consultation Slots for Dr. {upcomingSchedule.doctor?.first_name}{" "}
                      {upcomingSchedule.doctor?.last_name}:
                    </h3>

                    {upcomingSchedule.availableDates.length === 0 ? (
                      <div className="empty-state">
                        <p>Dr. {upcomingSchedule.doctor?.first_name} {upcomingSchedule.doctor?.last_name} has no available appointment slots in the next 14 days.</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {upcomingSchedule.availableDates.map((dayGroup) => (
                          <div
                            key={dayGroup.date}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              padding: "12px",
                              background: dayGroup.hasAvailableSlots ? "var(--surface)" : "var(--surface-muted)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <strong style={{ fontSize: "13px", color: "var(--primary-dark)" }}>
                                📅 {dayGroup.formattedDate} ({dayGroup.date})
                              </strong>
                              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                {dayGroup.slots.filter((s) => s.available).length} slots available
                              </span>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px" }}>
                              {dayGroup.slots.map((slot) => {
                                const slotKey = `${dayGroup.date}_${slot.startTime}-${slot.endTime}`;
                                const isSelected = selectedSlotKey === slotKey;
                                return (
                                  <button
                                    key={slotKey}
                                    type="button"
                                    disabled={!slot.available}
                                    onClick={() => handleSlotSelect(dayGroup.date, slot)}
                                    className={`slot-pill ${isSelected ? "slot-pill-selected" : slot.available ? "slot-pill-available" : "slot-pill-booked"}`}
                                    style={{
                                      padding: "8px",
                                      borderRadius: "6px",
                                      border: `1px solid ${isSelected ? "var(--primary)" : slot.available ? "#cbd5e1" : "#e2e8f0"}`,
                                      background: isSelected ? "var(--primary)" : slot.available ? "#f8fafc" : "#f1f5f9",
                                      color: isSelected ? "#ffffff" : slot.available ? "var(--text)" : "var(--text-muted)",
                                      cursor: slot.available ? "pointer" : "not-allowed",
                                      fontWeight: isSelected ? 700 : 500,
                                      fontSize: "12px",
                                    }}
                                  >
                                    {slot.startTime} – {slot.endTime}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Option A: By Date */
              <div>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="dateSelect">Select Date *</label>
                    <input
                      id="dateSelect"
                      type="date"
                      min={today}
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setSelectedSlotKey("");
                      }}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="doctorSelectDate">Available Doctors on {selectedDate || "Selected Date"} *</label>
                    <select
                      id="doctorSelectDate"
                      value={selectedDoctorId}
                      onChange={(e) => {
                        setSelectedDoctorId(e.target.value);
                        setSelectedSlotKey("");
                      }}
                      disabled={!selectedDate || doctorsLoading}
                      required
                    >
                      <option value="">-- Choose Available Doctor --</option>
                      {doctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          Dr. {doc.first_name} {doc.last_name} — {doc.specialty || doc.department || "General Practice"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {availabilityLoading && <div className="loading-state">Checking available consultation slots...</div>}

                {selectedDoctorId && selectedDate && !availabilityLoading && (
                  <div style={{ marginTop: "16px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>
                      Available Times for Dr. {selectedDoctor?.first_name} {selectedDoctor?.last_name} on {selectedDate}:
                    </h3>

                    {slots.length === 0 ? (
                      <div className="empty-state">No slots available for this doctor on {selectedDate}.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
                        {slots.map((slot) => {
                          const slotKey = `${selectedDate}_${slot.startTime}-${slot.endTime}`;
                          const isSelected = selectedSlotKey === slotKey;
                          return (
                            <button
                              key={slotKey}
                              type="button"
                              disabled={!slot.available}
                              onClick={() => handleSlotSelect(selectedDate, slot)}
                              style={{
                                padding: "8px",
                                borderRadius: "6px",
                                border: `1px solid ${isSelected ? "var(--primary)" : slot.available ? "#cbd5e1" : "#e2e8f0"}`,
                                background: isSelected ? "var(--primary)" : slot.available ? "#f8fafc" : "#f1f5f9",
                                color: isSelected ? "#ffffff" : slot.available ? "var(--text)" : "var(--text-muted)",
                                cursor: slot.available ? "pointer" : "not-allowed",
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: "12px",
                              }}
                            >
                              {slot.startTime} – {slot.endTime}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. Reason & Notes */}
          <section className="card">
            <div className="card-header">
              <h2>3. Visit Reason & Notes</h2>
              <p>Optional details for the doctor prior to consultation.</p>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="reason">Chief Complaint / Visit Reason</label>
                <input
                  id="reason"
                  type="text"
                  placeholder="e.g. Hypertension check, fever, follow-up"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="notes">Additional Clinical Notes</label>
                <input
                  id="notes"
                  type="text"
                  placeholder="e.g. Patient referred from regional clinic"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Submit Action */}
          <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "16px 20px" }}>
            <div>
              {selectedSlotTimes && selectedDate ? (
                <p style={{ margin: 0, fontSize: "14px" }}>
                  Selected Consultation:{" "}
                  <strong style={{ color: "var(--primary-dark)" }}>
                    {selectedDate} ({selectedSlotTimes.startTime} – {selectedSlotTimes.endTime})
                  </strong>{" "}
                  with Dr. {selectedDoctor?.first_name} {selectedDoctor?.last_name}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  Please choose a doctor and click an available time slot above
                </p>
              )}
            </div>

            <button
              className="button button-primary button-large"
              type="submit"
              disabled={submitting || !selectedSlotTimes || !patient}
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
