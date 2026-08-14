import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

function AppointmentAvailability() {
  const token =
    localStorage.getItem("hospital_token");

  const [doctors, setDoctors] = useState([]);

  const [selectedDoctor, setSelectedDoctor] =
    useState("");

  const [date, setDate] = useState("");

  const [slots, setSlots] = useState([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDoctors() {
      try {
        const response = await fetch(
          `${API_URL}/schedules/doctors`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Unable to load doctors."
          );
        }

        setDoctors(data.data);

        if (data.data.length > 0) {
          setSelectedDoctor(
            data.data[0].id
          );
        }
      } catch (error) {
        setError(error.message);
      }
    }

    loadDoctors();
  }, []);

  async function loadAvailability() {
    if (!selectedDoctor || !date) {
      setSlots([]);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        doctorId: selectedDoctor,
        date,
      });

      const response = await fetch(
        `${API_URL}/appointments/availability?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to load availability."
        );
      }

      setSlots(data.data);
    } catch (error) {
      setError(error.message);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAvailability();
  }, [selectedDoctor, date]);

  return (
    <main>
      <h1>Appointment Availability</h1>

      {error && (
        <p role="alert">{error}</p>
      )}

      <section>
        <label>
          Doctor
        </label>

        <select
          value={selectedDoctor}
          onChange={(event) =>
            setSelectedDoctor(
              event.target.value
            )
          }
        >
          {doctors.map((doctor) => (
            <option
              key={doctor.id}
              value={doctor.id}
            >
              Dr. {doctor.first_name}{" "}
              {doctor.last_name}
              {doctor.specialty
                ? ` — ${doctor.specialty}`
                : ""}
            </option>
          ))}
        </select>
      </section>

      <section>
        <label>
          Appointment Date
        </label>

        <input
          type="date"
          value={date}
          onChange={(event) =>
            setDate(event.target.value)
          }
        />
      </section>

      <section>
        <h2>Available Times</h2>

        {loading && (
          <p>Loading availability...</p>
        )}

        {!loading &&
          date &&
          slots.length === 0 && (
            <p>
              No appointments are available
              for this date.
            </p>
          )}

        <div>
          {slots.map((slot) => (
            <button
              key={`${slot.startTime}-${slot.endTime}`}
              disabled={!slot.available}
              type="button"
            >
              {slot.startTime} –{" "}
              {slot.endTime}

              {!slot.available &&
                " — Booked"}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export default AppointmentAvailability;
