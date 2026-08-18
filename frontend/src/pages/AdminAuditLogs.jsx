import { useEffect, useState, useTransition } from "react";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import { getAuditLogs } from "../services/auditService";

function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, startTransition] = useTransition();

  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchLogs() {
      try {
        setError("");
        const res = await getAuditLogs({
          page,
          limit: 20,
          action: actionFilter,
          entity: entityFilter,
          search: searchTerm,
        });
        if (!cancelled && res.data) {
          setLogs(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load system audit trail.");
          setLoading(false);
        }
      }
    }

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [page, actionFilter, entityFilter, searchTerm]);

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
          <p className="page-eyebrow">Security & Compliance</p>
          <h1>Hospital System Audit Trail</h1>
          <p className="page-description">
            Complete tamper-evident log of medical record access, clinical encounters, and financial events.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} className="form-grid" style={{ gridTemplateColumns: "1fr 200px 180px 100px", gap: "10px" }}>
          <input
            type="search"
            placeholder="Search by username, entity ID, or keyword..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="PATIENT_CREATED">PATIENT_CREATED</option>
            <option value="PATIENT_UPDATED">PATIENT_UPDATED</option>
            <option value="APPOINTMENT_CREATED">APPOINTMENT_CREATED</option>
            <option value="APPOINTMENT_STATUS_UPDATED">APPOINTMENT_STATUS_UPDATED</option>
            <option value="APPOINTMENT_RESCHEDULED">APPOINTMENT_RESCHEDULED</option>
            <option value="VITALS_RECORDED">VITALS_RECORDED</option>
            <option value="ENCOUNTER_CREATED">ENCOUNTER_CREATED</option>
            <option value="ENCOUNTER_COMPLETED">ENCOUNTER_COMPLETED</option>
            <option value="PRESCRIPTION_CREATED">PRESCRIPTION_CREATED</option>
            <option value="PRESCRIPTION_DISPENSED">PRESCRIPTION_DISPENSED</option>
            <option value="LAB_ORDER_CREATED">LAB_ORDER_CREATED</option>
            <option value="LAB_RESULT_ENTERED">LAB_RESULT_ENTERED</option>
            <option value="LAB_RESULT_VERIFIED">LAB_RESULT_VERIFIED</option>
            <option value="INVOICE_CREATED">INVOICE_CREATED</option>
            <option value="PAYMENT_RECORDED">PAYMENT_RECORDED</option>
            <option value="STAFF_CREATED">STAFF_CREATED</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Entities</option>
            <option value="users">users</option>
            <option value="patients">patients</option>
            <option value="appointments">appointments</option>
            <option value="vitals">vitals</option>
            <option value="encounters">encounters</option>
            <option value="prescriptions">prescriptions</option>
            <option value="lab_orders">lab_orders</option>
            <option value="invoices">invoices</option>
            <option value="payments">payments</option>
            <option value="staff">staff</option>
          </select>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading audit trail...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No audit records found</h3>
            <p>No audit events match the selected criteria.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Details Preview</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <small style={{ color: "var(--text-secondary)" }}>
                        {new Date(log.created_at).toLocaleString()}
                      </small>
                    </td>
                    <td>
                      <StatusBadge status={log.action} />
                    </td>
                    <td>
                      <code>{log.entity}</code>
                    </td>
                    <td>
                      <strong>{log.username || "System"}</strong>
                      {log.staff_first_name && (
                        <small style={{ display: "block", color: "var(--text-muted)" }}>
                          {log.staff_first_name} {log.staff_last_name}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{log.user_role || "SYSTEM"}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {log.details ? JSON.stringify(log.details).slice(0, 50) + "..." : "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => setSelectedLog(log)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </section>

      {/* Modal: View Details */}
      <Modal isOpen={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} title="Audit Event Metadata">
        {selectedLog && (
          <div>
            <div style={{ marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Action:</strong> {selectedLog.action}</div>
              <div><strong>Entity:</strong> {selectedLog.entity} (ID: <code>{selectedLog.entity_id || "—"}</code>)</div>
              <div><strong>User:</strong> {selectedLog.username || "System"} ({selectedLog.user_role})</div>
              <div><strong>Timestamp:</strong> {new Date(selectedLog.created_at).toLocaleString()}</div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Event Payload (JSON):</label>
              <pre
                style={{
                  background: "#1e293b",
                  color: "#f8fafc",
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                  overflowX: "auto",
                  maxHeight: "300px",
                }}
              >
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="button button-primary" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

export default AdminAuditLogs;
