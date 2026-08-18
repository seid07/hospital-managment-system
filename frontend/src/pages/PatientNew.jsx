import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { createPatient } from "../services/patientService";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "Male",
  phone: "",
  email: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

function PatientNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.firstName || !form.lastName || !form.dateOfBirth || !form.phone) {
      setError("Please fill in all required fields (Name, Date of Birth, Phone).");
      return;
    }

    try {
      setLoading(true);
      const res = await createPatient(form);
      const newPatient = res.data;
      navigate(`/patients/${newPatient.id}`);
    } catch (err) {
      setError(err.message || "Failed to register patient.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Patient Intake</p>
          <h1>New Patient Registration</h1>
          <p className="page-description">
            Register a new patient into the hospital information system.
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
                placeholder="First name"
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
                placeholder="Last name"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="dateOfBirth">
                Date of Birth <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                max={new Date().toISOString().split("T")[0]}
                value={form.dateOfBirth}
                onChange={handleChange}
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
                Phone Number <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="e.g. +1-555-0199"
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
            <label htmlFor="address">Residential Address</label>
            <textarea
              id="address"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Street address, City, Region..."
              rows="2"
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
                placeholder="Phone number"
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
            {loading ? "Registering..." : "Save Patient & Open Chart →"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

export default PatientNew;
