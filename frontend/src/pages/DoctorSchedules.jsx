import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const DAYS = [
  {
    value: 0,
    label: "Sunday",
  },
  {
    value: 1,
    label: "Monday",
  },
  {
    value: 2,
    label: "Tuesday",
  },
  {
    value: 3,
    label: "Wednesday",
  },
  {
    value: 4,
    label: "Thursday",
  },
  {
    value: 5,
    label: "Friday",
  },
  {
    value: 6,
    label: "Saturday",
  },
];

const INITIAL_FORM = {
  dayOfWeek: 1,
  startTime: "08:00",
  endTime: "12:00",
  slotDurationMinutes: 30,
};

function DoctorSchedules() {
  const token = localStorage.getItem("hospital_token");

  const [doctors, setDoctors] = useState([]);

  const [selectedDoctor, setSelectedDoctor] = useState("");

  const [schedules, setSchedules] = useState([]);

  const [form, setForm] = useState(INITIAL_FORM);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(false);

  const [doctorsLoading, setDoctorsLoading] = useState(true);

  const loadSchedules = useCallback(
    async (doctorId) => {
      if (!doctorId) {
        return;
      }

      const response = await fetch(`${API_URL}/schedules/doctors/${doctorId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load schedules.");
      }

      setSchedules(data.data || []);
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDoctors() {
      try {
        setDoctorsLoading(true);
        setError("");

        const response = await fetch(`${API_URL}/schedules/doctors`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load doctors.");
        }

        if (cancelled) {
          return;
        }

        const doctorList = data.data || [];

        setDoctors(doctorList);

        if (doctorList.length > 0) {
          setSelectedDoctor(doctorList[0].id);
        }
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
  }, [token]);

  useEffect(() => {
    if (!selectedDoctor) {
      return undefined;
    }

    let cancelled = false;

    async function loadSelectedDoctorSchedules() {
      try {
        setError("");

        await loadSchedules(selectedDoctor);
      } catch (error) {
        if (!cancelled) {
          setError(error.message || "Unable to load schedules.");
        }
      }
    }

    loadSelectedDoctorSchedules();

    return () => {
      cancelled = true;
    };
  }, [selectedDoctor, loadSchedules]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedDoctor) {
      setError("Please select a doctor.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/schedules/doctors/${selectedDoctor}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            ...form,
            dayOfWeek: Number(form.dayOfWeek),
            slotDurationMinutes: Number(form.slotDurationMinutes),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create schedule.");
      }

      setSuccess("Doctor schedule created successfully.");

      setForm({
        ...INITIAL_FORM,
      });

      await loadSchedules(selectedDoctor);
    } catch (error) {
      setError(error.message || "Unable to create schedule.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSchedule(id) {
    const confirmed = window.confirm("Delete this schedule?");

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/schedules/${id}`, {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete schedule.");
      }

      setSuccess("Schedule deleted successfully.");

      await loadSchedules(selectedDoctor);
    } catch (error) {
      setError(error.message || "Unable to delete schedule.");
    }
  }

  const doctor = doctors.find((item) => item.id === selectedDoctor);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Administration</p>

          <h1>Doctor Scheduling</h1>

          <p className="page-description">
            Configure working hours and appointment slot durations.
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
          {success}
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Select Doctor</h2>

          <p>Choose a doctor to manage their availability.</p>
        </div>

        <div className="form-field">
          <label htmlFor="doctor">Doctor</label>

          <select
            id="doctor"
            value={selectedDoctor}
            onChange={(event) => setSelectedDoctor(event.target.value)}
            disabled={doctorsLoading}
          >
            <option value="">
              {doctorsLoading ? "Loading doctors..." : "Select a doctor"}
            </option>

            {doctors.map((item) => (
              <option key={item.id} value={item.id}>
                Dr. {item.first_name} {item.last_name}
                {item.specialty ? ` — ${item.specialty}` : ""}
              </option>
            ))}
          </select>
        </div>

        {doctor && (
          <div className="doctor-summary">
            <strong>
              Dr. {doctor.first_name} {doctor.last_name}
            </strong>

            <span>{doctor.department || "General"}</span>

            <span>{doctor.specialty || "General Practice"}</span>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Add Availability</h2>

          <p>Define the doctor's working hours for a weekday.</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="dayOfWeek">Day</label>

            <select
              id="dayOfWeek"
              name="dayOfWeek"
              value={form.dayOfWeek}
              onChange={handleChange}
              disabled={!selectedDoctor}
            >
              {DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="startTime">Start time</label>

            <input
              id="startTime"
              name="startTime"
              type="time"
              value={form.startTime}
              onChange={handleChange}
              required
              disabled={!selectedDoctor}
            />
          </div>

          <div className="form-field">
            <label htmlFor="endTime">End time</label>

            <input
              id="endTime"
              name="endTime"
              type="time"
              value={form.endTime}
              onChange={handleChange}
              required
              disabled={!selectedDoctor}
            />
          </div>

          <div className="form-field">
            <label htmlFor="slotDurationMinutes">Appointment duration</label>

            <select
              id="slotDurationMinutes"
              name="slotDurationMinutes"
              value={form.slotDurationMinutes}
              onChange={handleChange}
              disabled={!selectedDoctor}
            >
              <option value="15">15 minutes</option>

              <option value="30">30 minutes</option>

              <option value="45">45 minutes</option>

              <option value="60">60 minutes</option>
            </select>
          </div>

          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={loading || !selectedDoctor}
            >
              {loading ? "Saving..." : "Add Schedule"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Current Availability</h2>

          <p>Existing working schedules for this doctor.</p>
        </div>

        {schedules.length === 0 ? (
          <div className="empty-state">No schedule configured.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Slot</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {schedules.map((schedule) => {
                  const day = DAYS.find(
                    (item) => item.value === Number(schedule.day_of_week),
                  );

                  return (
                    <tr key={schedule.id}>
                      <td>{day?.label || "-"}</td>

                      <td>{schedule.start_time}</td>

                      <td>{schedule.end_time}</td>

                      <td>{schedule.slot_duration_minutes} min</td>

                      <td>
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => deleteSchedule(schedule.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default DoctorSchedules;
