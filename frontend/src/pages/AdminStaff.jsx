import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://localhost:5000/api";

function AdminStaff() {
  const token =
    localStorage.getItem("hospital_token");

  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    specialty: "",
    role: "DOCTOR",
    username: "",
    password: "",
  });

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const [staffResponse, rolesResponse] =
        await Promise.all([
          fetch(`${API_URL}/staff`, {
            headers,
          }),

          fetch(`${API_URL}/staff/roles`, {
            headers,
          }),
        ]);

      const staffData =
        await staffResponse.json();

      const rolesData =
        await rolesResponse.json();

      if (!staffResponse.ok) {
        throw new Error(
          staffData.message ||
            "Unable to load staff."
        );
      }

      setStaff(staffData.data);
      setRoles(rolesData.data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

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

      const response = await fetch(
        `${API_URL}/staff`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to create staff."
        );
      }

      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        department: "",
        specialty: "",
        role: "DOCTOR",
        username: "",
        password: "",
      });

      await loadData();
    } catch (error) {
      setError(error.message);
    }
  }

  async function toggleStatus(member) {
    try {
      const response = await fetch(
        `${API_URL}/staff/${member.id}/status`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            isActive: !member.is_active,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to update staff."
        );
      }

      await loadData();
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <main>
      <h1>Staff Management</h1>

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      <section>
        <h2>Create Staff Account</h2>

        <form onSubmit={handleSubmit}>
          <input
            name="firstName"
            placeholder="First name"
            value={form.firstName}
            onChange={handleChange}
            required
          />

          <input
            name="lastName"
            placeholder="Last name"
            value={form.lastName}
            onChange={handleChange}
            required
          />

          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />

          <input
            name="phone"
            placeholder="Phone"
            value={form.phone}
            onChange={handleChange}
            required
          />

          <input
            name="department"
            placeholder="Department"
            value={form.department}
            onChange={handleChange}
          />

          <input
            name="specialty"
            placeholder="Specialty"
            value={form.specialty}
            onChange={handleChange}
          />

          <select
            name="role"
            value={form.role}
            onChange={handleChange}
          >
            {roles.map((role) => (
              <option
                key={role.id}
                value={role.name}
              >
                {role.name}
              </option>
            ))}
          </select>

          <input
            name="username"
            placeholder="Username"
            value={form.username}
            onChange={handleChange}
            required
          />

          <input
            name="password"
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={handleChange}
            required
          />

          <button type="submit">
            Create Staff
          </button>
        </form>
      </section>

      <section>
        <h2>Staff Members</h2>

        {loading ? (
          <p>Loading staff...</p>
        ) : (
          <table>
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
                    {member.first_name}{" "}
                    {member.last_name}
                  </td>

                  <td>
                    {member.username || "-"}
                  </td>

                  <td>{member.role}</td>

                  <td>
                    {member.department || "-"}
                  </td>

                  <td>
                    {member.is_active
                      ? "Active"
                      : "Inactive"}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        toggleStatus(member)
                      }
                    >
                      {member.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default AdminStaff;
