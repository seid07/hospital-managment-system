import { useEffect, useState, useTransition } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Pagination from "../components/common/Pagination";
import { getPatients } from "../services/patientService";

function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await getPatients({ page, limit: 15, search: searchTerm });
        if (!cancelled && res.data) {
          setPatients(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load patients.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [page, searchTerm]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    startTransition(() => {
      setSearchTerm(searchInput.trim());
    });
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Patient Management</p>
          <h1>Patients Directory</h1>
          <p className="page-description">
            Search, register, and manage patient medical records.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/patients/new" className="button button-primary button-large">
            + Register New Patient
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "10px" }}>
          <input
            type="search"
            placeholder="Search by patient number, name, or phone number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />
          <button type="submit" className="button button-primary">
            Search
          </button>
          {searchTerm && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </form>
      </section>

      <section className="card">
        {loading ? (
          <div className="loading-state">Loading patients database...</div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">♙</div>
            <h3>No patients found</h3>
            <p>
              {searchTerm
                ? "No patient records match your search criteria."
                : "No patients have been registered yet."}
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient #</th>
                  <th>Full Name</th>
                  <th>Date of Birth / Age</th>
                  <th>Gender</th>
                  <th>Phone</th>
                  <th>Registration Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const birthYear = p.date_of_birth
                    ? new Date(p.date_of_birth).getFullYear()
                    : null;
                  const age = birthYear
                    ? new Date().getFullYear() - birthYear
                    : "—";

                  return (
                    <tr
                      key={p.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      <td>
                        <strong>{p.patient_number}</strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>
                          {p.first_name} {p.last_name}
                        </span>
                      </td>
                      <td>
                        {p.date_of_birth} ({age} yrs)
                      </td>
                      <td>{p.gender}</td>
                      <td>{p.phone}</td>
                      <td>{new Date(p.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/patients/${p.id}`);
                          }}
                        >
                          Open Chart →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={(newPage) => setPage(newPage)}
        />
      </section>
    </AppShell>
  );
}

export default Patients;
