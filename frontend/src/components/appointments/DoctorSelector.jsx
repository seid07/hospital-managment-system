function DoctorSelector({
  doctors,
  value,
  onChange,
  loading,
}) {
  return (
    <div className="form-field">
      <label htmlFor="doctor">
        Doctor
      </label>

      <select
        id="doctor"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        disabled={loading}
      >
        <option value="">
          Select a doctor
        </option>

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
    </div>
  );
}

export default DoctorSelector;
