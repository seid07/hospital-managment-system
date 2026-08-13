import { useAuth } from "../context/AuthContext";

function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <main>
      <h1>Hospital Management System</h1>

      <section>
        <h2>Dashboard</h2>

        <p>
          Welcome, {user?.first_name}{" "}
          {user?.last_name}
        </p>

        <p>
          Role: <strong>{user?.role}</strong>
        </p>

        <p>
          Username: {user?.username}
        </p>

        <button onClick={logout}>
          Logout
        </button>
      </section>
    </main>
  );
}

export default Dashboard;
