import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import { useAuth } from "../context/useAuth";
import { useCalendar } from "../context/useCalendar";
import { useDebounce } from "../hooks/useDebounce";
import { getPatients, deletePatient } from "../services/patientService";

function Patients() {
  const navigate = useNavigate();
  const { formatDate } = useCalendar();
  const [searchParams, setSearchParams] = useSearchParams();
  const registeredFilter = searchParams.get("registered") || searchParams.get("date") || "";

  const { user } = useAuth();
  const canManagePatients = user?.role === "ADMIN" || user?.role === "REGISTRAR";

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Delete modal state
  const [patientToDelete, setPatientToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await getPatients({
          page,
          limit: 15,
          search: debouncedSearch.trim(),
          registered: registeredFilter || undefined,
        });
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
  }, [page, debouncedSearch, registeredFilter]);

  async function handleDeleteConfirm() {
    if (!patientToDelete) return;
    try {
      setDeleting(true);
      setError("");
      await deletePatient(patientToDelete.id);
      setSuccessMsg(`Patient ${patientToDelete.first_name} ${patientToDelete.last_name} record has been removed.`);
      setPatientToDelete(null);
      // Reload current page
      const res = await getPatients({ page, limit: 15, search: debouncedSearch.trim() });
      setPatients(res.data || []);
      setTotal(res.pagination?.total || 0);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch (err) {
      setError(err.message || "Failed to delete patient record.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Patient Management</p>
          <h1>Patients Directory</h1>
          <p className="page-description">
            Search, view clinical charts, and manage hospital patient database.
          </p>
        </div>

        {/* New Registration Button - Strictly ADMIN and REGISTRAR */}
        {canManagePatients && (
          <div className="page-actions">
            <Link to="/patients/new" className="button button-primary button-large">
              + Register New Patient
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" role="status">
          {successMsg}
        </div>
      )}

      {/* Live Search Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        {registeredFilter && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--primary-light)", padding: "8px 12px", borderRadius: "6px", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)" }}>
               Showing patients registered today ({registeredFilter})
            </span>
            <button
              type="button"
              className="button button-secondary"
              style={{ fontSize: "11px", padding: "3px 8px" }}
              onClick={() => setSearchParams({})}
            >
              Show All Patients ✕
            </button>
          </div>
        )}
        <div style={{ position: "relative" }}>
          <input
            type="search"
            placeholder="Live search by patient # (PAT-...), first name, last name, or phone..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            style={{ width: "100%", padding: "11px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </section>

      {/* Patients Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading patients database...</div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>No patients found</h3>
            <p>
              {debouncedSearch
                ? `No patient records match "${debouncedSearch}".`
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
                  <th>Age / Gender</th>
                  <th>Phone</th>
                  <th>Registration Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const displayAge = p.age !== undefined && p.age !== null ? `${p.age} yrs` : p.date_of_birth ? `${new Date().getFullYear() - new Date(p.date_of_birth).getFullYear()} yrs` : "—";

                  return (
                    <tr
                      key={p.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      <td>
                        <strong style={{ fontFamily: "monospace", color: "var(--primary-dark)" }}>
                          {p.patient_number}
                        </strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>
                          {p.first_name} {p.last_name}
                        </span>
                      </td>
                      <td>
                        {displayAge} • {p.gender}
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{p.phone}</td>
                      <td>{formatDate(p.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
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

                          {/* Delete Patient - Strictly ADMIN and REGISTRAR */}
                          {canManagePatients && (
                            <button
                              type="button"
                              className="button button-danger"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPatientToDelete(p);
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
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

      {/* Delete Patient Confirmation Modal */}
      <Modal
        isOpen={Boolean(patientToDelete)}
        onClose={() => setPatientToDelete(null)}
        title="Confirm Patient Record Deletion"
      >
        {patientToDelete && (
          <div>
            <p style={{ fontSize: "14px", color: "var(--text)", marginBottom: "14px" }}>
              Are you sure you want to deactivate and remove patient record for{" "}
              <strong>{patientToDelete.first_name} {patientToDelete.last_name}</strong> (
              <span style={{ fontFamily: "monospace" }}>{patientToDelete.patient_number}</span>)?
            </p>
            <p style={{ fontSize: "12px", color: "#e11d48", background: "#fff1f2", padding: "10px", borderRadius: "6px" }}>
              Warning: This will mark the patient as inactive and prevent future appointment bookings or encounters.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setPatientToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={deleting}
                onClick={handleDeleteConfirm}
              >
                {deleting ? "Deleting..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

export default Patients;
