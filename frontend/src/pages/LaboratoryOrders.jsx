import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import {
  getLabOrders,
  collectSpecimen,
  enterResults,
  verifyResults,
} from "../services/laboratoryService";
import { useAuth } from "../context/useAuth";
import { useDebounce } from "../hooks/useDebounce";

function LaboratoryOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Results entry modal
  const [resultTarget, setResultTarget] = useState(null);
  const [resultForm, setResultForm] = useState({
    resultValue: "",
    unit: "",
    referenceRange: "",
    isAbnormal: false,
    comments: "",
  });
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [resultError, setResultError] = useState("");

  // Print modal
  const [printTarget, setPrintTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOrders() {
      try {
        setError("");
        const res = await getLabOrders({
          page,
          limit: 15,
          status: statusFilter,
          priority: priorityFilter,
          search: debouncedSearch.trim(),
        });
        if (!cancelled && res.data) {
          setOrders(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load laboratory orders.");
          setLoading(false);
        }
      }
    }
    loadOrders();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, priorityFilter, debouncedSearch, reloadKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
  }

  async function handleCollectSpecimen(orderId) {
    try {
      setError("");
      setSuccess("");
      await collectSpecimen(orderId);
      setSuccess("Specimen collected and registered in lab.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to collect specimen.");
    }
  }

  async function handleVerify(orderId) {
    try {
      setError("");
      setSuccess("");
      await verifyResults(orderId);
      setSuccess("Laboratory results verified and released to physician.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to verify lab result.");
    }
  }

  async function handleResultSubmit(e) {
    e.preventDefault();
    setResultError("");
    try {
      setResultSubmitting(true);
      await enterResults(resultTarget.id, resultForm);
      setSuccess(`Results recorded for Order #${resultTarget.order_number}.`);
      setResultTarget(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setResultError(err.message || "Failed to enter laboratory results.");
    } finally {
      setResultSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Diagnostic Services</p>
          <h1>Laboratory Orders & Diagnostics Queue</h1>
          <p className="page-description">
            Process specimen collection, record findings, and verify diagnostic reports.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/laboratory/catalog" className="button button-secondary">
            🧪 Test Catalog
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filter Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} className="form-grid" style={{ gridTemplateColumns: "1fr 180px 180px 100px", gap: "10px" }}>
          <input
            type="search"
            placeholder="Search by order #, test, patient name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ORDERED">Ordered (Pending Specimen)</option>
            <option value="SPECIMEN_COLLECTED">Specimen Collected</option>
            <option value="PROCESSING">Processing</option>
            <option value="RESULTED">Resulted (Pending Verification)</option>
            <option value="VERIFIED">Verified & Released</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Priorities</option>
            <option value="ROUTINE">Routine</option>
            <option value="URGENT">Urgent</option>
            <option value="STAT">STAT (Emergency)</option>
          </select>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading laboratory queue...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔬</div>
            <h3>No laboratory orders found</h3>
            <p>No orders match the selected filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Patient</th>
                  <th>Test & Category</th>
                  <th>Ordering Doctor</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Result / Finding</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.order_number}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {new Date(o.created_at).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      <Link to={`/patients/${o.patient_id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {o.patient_first_name} {o.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{o.patient_number}</small>
                    </td>
                    <td>
                      <strong>{o.test_name}</strong> ({o.test_code})
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{o.test_category}</small>
                    </td>
                    <td>Dr. {o.doctor_first_name} {o.doctor_last_name}</td>
                    <td>
                      <StatusBadge status={o.priority} />
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      {o.result_value ? (
                        <div>
                          <strong style={{ color: o.is_abnormal ? "var(--danger)" : "var(--text)" }}>
                            {o.result_value} {o.result_unit || ""}
                          </strong>
                          {o.is_abnormal && (
                            <span className="badge badge-danger" style={{ marginLeft: "4px", fontSize: "10px" }}>
                              ABN
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {o.status === "ORDERED" && ["ADMIN", "LAB_TECH", "NURSE"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleCollectSpecimen(o.id)}
                          >
                            Collect Specimen
                          </button>
                        )}

                        {["ORDERED", "SPECIMEN_COLLECTED", "PROCESSING"].includes(o.status) &&
                          ["ADMIN", "LAB_TECH"].includes(user?.role) && (
                            <button
                              type="button"
                              className="button button-primary"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => {
                                setResultTarget(o);
                                setResultForm({
                                  resultValue: o.result_value || "",
                                  unit: o.result_unit || o.standard_unit || "",
                                  referenceRange: o.result_reference_range || o.standard_reference_range || "",
                                  isAbnormal: Boolean(o.is_abnormal),
                                  comments: o.result_comments || "",
                                });
                              }}
                            >
                              Enter Result →
                            </button>
                          )}

                        {o.status === "RESULTED" && ["ADMIN", "LAB_TECH", "DOCTOR"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleVerify(o.id)}
                          >
                            ✓ Verify & Release
                          </button>
                        )}

                        {o.status === "VERIFIED" && (
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => setPrintTarget(o)}
                          >
                            Print Report
                          </button>
                        )}
                      </div>
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

      {/* Modal: Enter Results */}
      <Modal
        isOpen={Boolean(resultTarget)}
        onClose={() => setResultTarget(null)}
        title="Enter Laboratory Diagnostics Result"
      >
        {resultError && <div className="alert alert-error">{resultError}</div>}
        {resultTarget && (
          <form onSubmit={handleResultSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Test:</strong> {resultTarget.test_name} ({resultTarget.test_code})</div>
              <div><strong>Patient:</strong> {resultTarget.patient_first_name} {resultTarget.patient_last_name} ({resultTarget.patient_number})</div>
              <div><strong>Ordering Doctor:</strong> Dr. {resultTarget.doctor_first_name} {resultTarget.doctor_last_name}</div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Observed Result Value *</label>
                <input
                  placeholder="e.g. 138 mg/dL or Negative"
                  value={resultForm.resultValue}
                  onChange={(e) => setResultForm({ ...resultForm, resultValue: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Measurement Unit</label>
                <input
                  placeholder="e.g. mg/dL, mmol/L, %"
                  value={resultForm.unit}
                  onChange={(e) => setResultForm({ ...resultForm, unit: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Reference Normal Range</label>
                <input
                  placeholder="e.g. 70 - 99 mg/dL"
                  value={resultForm.referenceRange}
                  onChange={(e) => setResultForm({ ...resultForm, referenceRange: e.target.value })}
                />
              </div>

              <div className="form-field" style={{ display: "flex", alignItems: "center", paddingTop: "24px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={resultForm.isAbnormal}
                    onChange={(e) => setResultForm({ ...resultForm, isAbnormal: e.target.checked })}
                  />
                  <strong style={{ color: resultForm.isAbnormal ? "var(--danger)" : "inherit" }}>
                    Flag as Clinically Abnormal
                  </strong>
                </label>
              </div>
            </div>

            <div className="form-field" style={{ marginTop: "14px" }}>
              <label>Technician Comments / Method Notes</label>
              <textarea
                rows="2"
                placeholder="Methodology, specimen condition, remarks..."
                value={resultForm.comments}
                onChange={(e) => setResultForm({ ...resultForm, comments: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setResultTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={resultSubmitting}>
                {resultSubmitting ? "Saving..." : "Save Findings"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Print Lab Report */}
      <Modal
        isOpen={Boolean(printTarget)}
        onClose={() => setPrintTarget(null)}
        title="Print Diagnostic Laboratory Report"
        maxWidth="750px"
      >
        {printTarget && (
          <PrintableDocument
            title="OFFICIAL LABORATORY DIAGNOSTIC REPORT"
            subtitle="Department of Pathology & Clinical Laboratory"
            documentNumber={printTarget.order_number}
            date={new Date(printTarget.result_entered_at || printTarget.created_at).toLocaleDateString()}
          >
            <div style={{ borderBottom: "1px solid #eee", paddingBottom: "12px", marginBottom: "16px" }}>
              <table style={{ width: "100%", fontSize: "13px" }}>
                <tbody>
                  <tr>
                    <td><strong>Patient Name:</strong> {printTarget.patient_first_name} {printTarget.patient_last_name}</td>
                    <td><strong>Patient ID:</strong> {printTarget.patient_number}</td>
                  </tr>
                  <tr>
                    <td><strong>Ordering Doctor:</strong> Dr. {printTarget.doctor_first_name} {printTarget.doctor_last_name}</td>
                    <td><strong>Priority:</strong> {printTarget.priority}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ margin: "16px 0" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: "16px", color: "#1769aa" }}>
                Test: {printTarget.test_name} ({printTarget.test_code})
              </h3>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Observed Value</th>
                    <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Unit</th>
                    <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Reference Range</th>
                    <th style={{ padding: "8px", border: "1px solid #cbd5e1" }}>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", fontWeight: 700 }}>
                      {printTarget.result_value}
                    </td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1" }}>{printTarget.result_unit || "—"}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1" }}>{printTarget.result_reference_range || "—"}</td>
                    <td style={{ padding: "8px", border: "1px solid #cbd5e1", color: printTarget.is_abnormal ? "red" : "green", fontWeight: 700 }}>
                      {printTarget.is_abnormal ? "ABNORMAL" : "NORMAL"}
                    </td>
                  </tr>
                </tbody>
              </table>

              {printTarget.result_comments && (
                <p style={{ marginTop: "12px", fontSize: "12px", color: "#475569" }}>
                  <strong>Technician Remarks:</strong> {printTarget.result_comments}
                </p>
              )}
            </div>

            <div style={{ marginTop: "32px", fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div>Entered By: {printTarget.entered_by_username || "Lab Technician"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>Verified By: <strong>{printTarget.verified_by_username || "Pathologist"}</strong></div>
                <div style={{ color: "#64748b" }}>Status: RELEASED</div>
              </div>
            </div>
          </PrintableDocument>
        )}
      </Modal>
    </AppShell>
  );
}

export default LaboratoryOrders;
