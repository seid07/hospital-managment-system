import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function DoctorSchedules() {
  const token =
    localStorage.getItem("hospital_token");

  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] =
    useState("");

  const [schedules, setSchedules] = useState([]);

  const [form, setForm] = useState({
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "12:00",
    slotDurationMinutes: 30,
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadDoctors() {
    const response = await fetch(
      `${API_URL}/schedules/doctors`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Unable to load doctors."
      );
    }

    setDoctors(data.data);

    if (
      data.data.length > 0 &&
      !selectedDoctor
    ) {
      setSelectedDoctor(data.data[0].id);
    }
  }

  async function loadSchedules(doctorId) {
    if (!doctorId) return;

    const response = await fetch(
      `${API_URL}/schedules/doctors/${doctorId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Unable to load schedules."
      );
    }

    setSchedules(data.data);
  }

  useEffect(() => {
    loadDoctors().catch((error) => {
      setError(error.message);
    });
  }, []);

  useEffect(() => {
    if (selectedDoctor) {
      loadSchedules(selectedDoctor).catch(
        (error) => {
          setError(error.message);
        }
      );
    }
  }, [selectedDoctor]);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setError("");
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
            slotDurationMinutes: Number(
              form.slotDurationMinutes
            ),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to create schedule."
        );
      }

      await loadSchedules(selectedDoctor);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSchedule(id) {
    if (
      !window.confirm(
        "Delete this schedule?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/schedules/${id}`,
        {
          method: "DELETE",

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to delete schedule."
        );
      }

      await loadSchedules(selectedDoctor);
    } catch (error) {
      setError(error.message);
    }
  }

  const doctor = doctors.find(
    (item) => item.id === selectedDoctor
  );

  return (
    <main>
      <h1>Doctor Scheduling</h1>

      {error && (
        <p role="alert">{error}</p>
      )}

      <section>
        <h2>Select Doctor</h2>

        <select
          value={selectedDoctor}
          onChange={(event) =>
            setSelectedDoctor(event.target.value)
          }
        >
          {doctors.map((item) => (
            <option
              key={item.id}
              value={item.id}
            >
              Dr. {item.first_name}{" "}
              {item.last_name}
              {item.specialty
                ? ` — ${item.specialty}`
                : ""}
            </option>
          ))}
        </select>

        {doctor && (
          <p>
            {doctor.department || "General"}
            {" — "}
            {doctor.specialty ||
              "General Practice"}
          </p>
        )}
      </section>

      <section>
        <h2>Add Availability</h2>

        <form onSubmit={handleSubmit}>
          <select
            name="dayOfWeek"
            value={form.dayOfWeek}
            onChange={handleChange}
          >
            {DAYS.map((day) => (
              <option
                key={day.value}
                value={day.value}
              >
                {day.label}
              </option>
            ))}
          </select>

          <input
            name="startTime"
            type="time"
            value={form.startTime}
            onChange={handleChange}
            required
          />

          <input
            name="endTime"
            type="time"
            value={form.endTime}
            onChange={handleChange}
            required
          />

          <select
            name="slotDurationMinutes"
            value={form.slotDurationMinutes}
            onChange={handleChange}
          >
            <option value="15">
              15 minutes
            </option>

            <option value="30">
              30 minutes
            </option>

            <option value="45">
              45 minutes
            </option>

            <option value="60">
              60 minutes
            </option>
          </select>

          <button
            type="submit"
            disabled={
              loading || !selectedDoctor
            }
          >
            {loading
              ? "Saving..."
              : "Add Schedule"}
          </button>
        </form>
      </section>

      <section>
        <h2>Current Availability</h2>

        {schedules.length === 0 ? (
          <p>
            No schedule configured.
          </p>
        ) : (
          <table>
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
                  (item) =>
                    item.value ===
                    Number(
                      schedule.day_of_week
                    )
                );

                return (
                  <tr key={schedule.id}>
                    <td>
                      {day?.label}
                    </td>

                    <td>
                      {schedule.start_time}
                    </td>

                    <td>
                      {schedule.end_time}
                    </td>

                    <td>
                      {
                        schedule.slot_duration_minutes
                      }{" "}
                      min
                    </td>

                    <td>
                      <button
                        onClick={() =>
                          deleteSchedule(
                            schedule.id
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );

}

export default DoctorSchedules;
