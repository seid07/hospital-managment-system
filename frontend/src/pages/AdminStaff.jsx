import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  department: "",
  specialty: "",
  role: "DOCTOR",
  username: "",
  password: "",
};

function AdminStaff() {
  const token = localStorage.getItem("hospital_token");

  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(INITIAL_FORM);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        setLoading(true);
        setError("");

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [staffResponse, rolesResponse] = await Promise.all([
          fetch(`${API_URL}/staff`, {
            headers,
          }),

          fetch(`${API_URL}/staff/roles`, {
            headers,
          }),
        ]);

        const staffData = await staffResponse.json();

        const rolesData = await rolesResponse.json();

        if (!staffResponse.ok) {
          throw new Error(staffData.message || "Unable to load staff.");
        }

        if (!rolesResponse.ok) {
          throw new Error(rolesData.message || "Unable to load roles.");
        }

        if (!cancelled) {
          setStaff(staffData.data || []);
          setRoles(rolesData.data || []);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error.message || "Unable to load staff data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function refreshData() {
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [staffResponse, rolesResponse] = await Promise.all([
        fetch(`${API_URL}/staff`, {
          headers,
        }),

        fetch(`${API_URL}/staff/roles`, {
          headers,
        }),
      ]);

      const staffData = await staffResponse.json();

      const rolesData = await rolesResponse.json();

      if (!staffResponse.ok) {
        throw new Error(staffData.message || "Unable to load staff.");
      }

      if (!rolesResponse.ok) {
        throw new Error(rolesData.message || "Unable to load roles.");
      }

      setStaff(staffData.data || []);
      setRoles(rolesData.data || []);
    } catch (error) {
      throw new Error(error.message || "Unable to refresh staff data.", {
        cause: error,
      });
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    try {
      setSubmitting(true);

      const response = await fetch(`${API_URL}/staff`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create staff.");
      }

      setForm({
        ...INITIAL_FORM,
      });

      setSuccess("Staff account created successfully.");

      await refreshData();
    } catch (error) {
      setError(error.message || "Unable to create staff.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(member) {
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/staff/${member.id}/status`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          isActive: !member.is_active,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to update staff.");
      }

      setSuccess(
        `Staff member ${
          member.is_active ? "deactivated" : "activated"
        } successfully.`,
      );

      await refreshData();
    } catch (error) {
      setError(error.message || "Unable to update staff.");
    }
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Administration</p>

          <h1>Staff Management</h1>

          <p className="page-description">
            Create and manage hospital staff accounts and access roles.
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
          <h2>Create Staff Account</h2>

          <p>Create a staff profile and application login.</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="firstName">First name</label>

            <input
              id="firstName"
              name="firstName"
              placeholder="First name"
              value={form.firstName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="lastName">Last name</label>

            <input
              id="lastName"
              name="lastName"
              placeholder="Last name"
              value={form.lastName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="phone">Phone</label>

            <input
              id="phone"
              name="phone"
              placeholder="Phone"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="department">Department</label>

            <input
              id="department"
              name="department"
              placeholder="Department"
              value={form.department}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="specialty">Specialty</label>

            <input
              id="specialty"
              name="specialty"
              placeholder="Specialty"
              value={form.specialty}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label htmlFor="role">Role</label>

            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="username">Username</label>

            <input
              id="username"
              name="username"
              placeholder="Username"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Temporary password</label>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="Temporary password"
              value={form.password}
              onChange={handleChange}
              minLength={8}
              required
            />
          </div>

          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create Staff"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Staff Members</h2>

          <p>Current hospital staff accounts.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading staff...</div>
        ) : staff.length === 0 ? (
          <div className="empty-state">No staff members found.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                    </td>

                    <td>{member.username || "-"}</td>

                    <td>
                      <span className="badge">{member.role}</span>
                    </td>

                    <td>{member.department || "-"}</td>

                    <td>
                      <span
                        className={`status ${
                          member.is_active ? "status-active" : "status-inactive"
                        }`}
                      >
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => toggleStatus(member)}
                      >
                        {member.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default AdminStaff;
