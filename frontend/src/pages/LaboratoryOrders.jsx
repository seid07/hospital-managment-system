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
import { post } from "../services/api";
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

  // Timeline / Details modal
  const [detailOrder, setDetailOrder] = useState(null);

  // Print modal
  const [printTarget, setPrintTarget] = useState(null);

  // Tracks the order ID currently mid-request for a row action (collect
  // specimen / start processing / verify), so the triggering button can be
  // disabled and a double-click can't fire the same action twice.
  const [actionInFlight, setActionInFlight] = useState(null);

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
    if (actionInFlight) return; // guard against a double-click firing this twice
    try {
      setActionInFlight(orderId);
      setError("");
      setSuccess("");
      await collectSpecimen(orderId);
      setSuccess("Specimen collected and registered in laboratory.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to collect specimen.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleStartProcessing(orderId) {
    if (actionInFlight) return;
    try {
      setActionInFlight(orderId);
      setError("");
      setSuccess("");
      await post(`/laboratory/orders/${orderId}/process`);
      setSuccess("Laboratory analyzer processing initiated.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to start processing.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleVerify(orderId) {
    if (actionInFlight) return;
    try {
      setActionInFlight(orderId);
      setError("");
      setSuccess("");
      await verifyResults(orderId);
      setSuccess("Laboratory results verified and released to physician.");
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setError(err.message || "Failed to verify lab result.");
    } finally {
      setActionInFlight(null);
    }
  }

  async function handleResultSubmit(e) {
    e.preventDefault();
    setResultError("");
    try {
      setResultSubmitting(true);
      await enterResults(resultTarget.id, resultForm);
      setSuccess(`Results recorded and actual turnaround time calculated for Order #${resultTarget.order_number}.`);
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
            Process specimen collection, record findings, track real turnaround times (TAT), and verify diagnostic reports.
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
            placeholder="Live search by order #, test, patient name..."
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
                  <th>Payment Auth</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Result / Finding</th>
                  <th>Turnaround Time (TAT)</th>
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
                      <span
                        className={`badge ${
                          o.service_payment_status === "PAID" || o.payment_authorized_at
                            ? "badge-success"
                            : "badge-warning"
                        }`}
                      >
                        {o.service_payment_status === "PAID" || o.payment_authorized_at ? "✓ Authorized" : "Waiting Pay"}
                      </span>
                    </td>
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
                      {o.actual_turnaround_formatted ? (
                        <div>
                          <strong style={{ color: "#38bdf8", fontSize: "12px" }}>
                            ⏱️ {o.actual_turnaround_formatted}
                          </strong>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                            Target: ~{o.expected_turnaround_hours || 24}h
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          Target: ~{o.expected_turnaround_hours || 24}h
                          <div style={{ fontSize: "10px", color: "#f59e0b" }}>In Progress</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {o.status === "ORDERED" && ["ADMIN", "LAB_TECH", "NURSE"].includes(user?.role) && (
                          (o.service_payment_status === "PAID" || o.payment_authorized_at) ? (
                            <button
                              type="button"
                              className="button button-primary button-sm"
                              disabled={actionInFlight === o.id}
                              onClick={() => handleCollectSpecimen(o.id)}
                            >
                              {actionInFlight === o.id ? "Collecting..." : "Collect Specimen"}
                            </button>
                          ) : (
                            <span
                              className="badge badge-warning"
                              title="This test has not been paid for at the cashier yet. Refer the patient to Registrar Finance."
                            >
                              🔒 Awaiting Payment
                            </span>
                          )
                        )}

                        {o.status === "SPECIMEN_COLLECTED" && ["ADMIN", "LAB_TECH"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            disabled={actionInFlight === o.id}
                            onClick={() => handleStartProcessing(o.id)}
                          >
                            {actionInFlight === o.id ? "Starting..." : "Start Processing"}
                          </button>
                        )}

                        {["SPECIMEN_COLLECTED", "PROCESSING", "ORDERED"].includes(o.status) &&
                          ["ADMIN", "LAB_TECH"].includes(user?.role) && (
                            <button
                              type="button"
                              className="button button-primary button-sm"
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
                            className="button button-primary button-sm"
                            disabled={actionInFlight === o.id}
                            onClick={() => handleVerify(o.id)}
                          >
                            {actionInFlight === o.id ? "Verifying..." : "✓ Verify & Release"}
                          </button>
                        )}

                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => setDetailOrder(o)}
                          title="View Turnaround Timestamps"
                        >
                          ⏱️ Details
                        </button>

                        {o.status === "VERIFIED" && (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => setPrintTarget(o)}
                          >
                            🖨️ Report
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

      {/* Enter Results Modal */}
      <Modal
        isOpen={Boolean(resultTarget)}
        onClose={() => setResultTarget(null)}
        title={resultTarget ? `Enter Results for ${resultTarget.test_name} (${resultTarget.order_number})` : "Enter Results"}
      >
        {resultError && <div className="alert alert-error">{resultError}</div>}
        {resultTarget && (
          <form onSubmit={handleResultSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "16px", fontSize: "13px" }}>
              <div><strong>Patient:</strong> {resultTarget.patient_first_name} {resultTarget.patient_last_name} ({resultTarget.patient_number})</div>
              <div><strong>Ordered By:</strong> Dr. {resultTarget.doctor_first_name} {resultTarget.doctor_last_name}</div>
              <div><strong>Standard Reference:</strong> {resultTarget.standard_reference_range || "N/A"} {resultTarget.standard_unit || ""}</div>
              {resultTarget.sample_collected_at && (
                <div><strong>Sample Collected:</strong> {new Date(resultTarget.sample_collected_at).toLocaleTimeString()}</div>
              )}
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Test Result Value *</label>
                <input
                  type="text"
                  placeholder="e.g. 14.5, Negative, 120"
                  value={resultForm.resultValue}
                  onChange={(e) => setResultForm({ ...resultForm, resultValue: e.target.value })}
                  required
                />
              </div>

              <div className="form-field">
                <label>Measurement Unit</label>
                <input
                  type="text"
                  placeholder="e.g. g/dL, mg/dL, %"
                  value={resultForm.unit}
                  onChange={(e) => setResultForm({ ...resultForm, unit: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Reference Range</label>
                <input
                  type="text"
                  placeholder="e.g. 13.5 - 17.5"
                  value={resultForm.referenceRange}
                  onChange={(e) => setResultForm({ ...resultForm, referenceRange: e.target.value })}
                />
              </div>

              <div className="form-field" style={{ display: "flex", alignItems: "center", paddingTop: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={resultForm.isAbnormal}
                    onChange={(e) => setResultForm({ ...resultForm, isAbnormal: e.target.checked })}
                  />
                  <strong style={{ color: resultForm.isAbnormal ? "var(--danger)" : "inherit" }}>
                    Flag as Critical / Abnormal
                  </strong>
                </label>
              </div>
            </div>

            <div className="form-field" style={{ marginTop: "14px" }}>
              <label>Technician Comments / Observations</label>
              <textarea
                rows="3"
                placeholder="Diagnostic observations, analyzer calibration notes, or follow-up recommendations..."
                value={resultForm.comments}
                onChange={(e) => setResultForm({ ...resultForm, comments: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setResultTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={resultSubmitting}>
                {resultSubmitting ? "Calculating TAT & Saving..." : "Save Result (Compute TAT)"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Details / TAT Timeline Modal */}
      {detailOrder && (
        <Modal
          isOpen={true}
          onClose={() => setDetailOrder(null)}
          title={`Order #${detailOrder.order_number} Diagnostic Lifecycle & TAT`}
        >
          <div>
            <div style={{ background: "var(--surface-muted)", padding: "14px", borderRadius: "8px", marginBottom: "16px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                {detailOrder.test_name} ({detailOrder.test_code})
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Patient: {detailOrder.patient_first_name} {detailOrder.patient_last_name} ({detailOrder.patient_number}) • Clinician: Dr. {detailOrder.doctor_first_name} {detailOrder.doctor_last_name}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>1. Order Placed</span>
                <strong>{detailOrder.created_at ? new Date(detailOrder.created_at).toLocaleString() : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>2. Specimen Collected</span>
                <strong>{detailOrder.sample_collected_at || detailOrder.specimen_collected_at ? new Date(detailOrder.sample_collected_at || detailOrder.specimen_collected_at).toLocaleString() : "Pending"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>3. Processing Started</span>
                <strong>{detailOrder.processing_started_at ? new Date(detailOrder.processing_started_at).toLocaleString() : "—"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>4. Result Completed</span>
                <strong>{detailOrder.result_completed_at || detailOrder.resulted_at ? new Date(detailOrder.result_completed_at || detailOrder.resulted_at).toLocaleString() : "Pending"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>5. Verified & Released</span>
                <strong>{detailOrder.result_verified_at || detailOrder.verified_at ? new Date(detailOrder.result_verified_at || detailOrder.verified_at).toLocaleString() : "Pending"}</strong>
              </div>
            </div>

            <div style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid #38bdf8", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Actual Elapsed Turnaround Time (TAT)</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#38bdf8" }}>
                {detailOrder.actual_turnaround_formatted || "In Progress (Awaiting Result)"}
              </div>
            </div>

            <div style={{ marginTop: "18px", textAlign: "right" }}>
              <button type="button" className="button button-secondary" onClick={() => setDetailOrder(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Print Report Modal */}
      <Modal isOpen={Boolean(printTarget)} onClose={() => setPrintTarget(null)} title="Print Laboratory Report" maxWidth="750px">
        {printTarget && (
          <PrintableDocument
            title="OFFICIAL LABORATORY REPORT"
            subtitle="Department of Pathology & Clinical Diagnostics"
            documentNumber={printTarget.order_number}
            date={new Date(printTarget.verified_at || printTarget.resulted_at || new Date()).toLocaleDateString()}
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

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
              <thead>
                <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dee2e6", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>Test Name</th>
                  <th style={{ padding: "8px" }}>Result</th>
                  <th style={{ padding: "8px" }}>Reference Range</th>
                  <th style={{ padding: "8px" }}>Unit</th>
                  <th style={{ padding: "8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>{printTarget.test_name}</td>
                  <td style={{ padding: "8px", fontWeight: "bold", color: printTarget.is_abnormal ? "#dc3545" : "inherit" }}>
                    {printTarget.result_value}
                  </td>
                  <td style={{ padding: "8px" }}>{printTarget.result_reference_range || printTarget.standard_reference_range || "—"}</td>
                  <td style={{ padding: "8px" }}>{printTarget.result_unit || printTarget.standard_unit || "—"}</td>
                  <td style={{ padding: "8px" }}>{printTarget.is_abnormal ? "ABNORMAL" : "NORMAL"}</td>
                </tr>
              </tbody>
            </table>

            {printTarget.result_comments && (
              <div style={{ background: "#f8f9fa", padding: "10px", borderRadius: "4px", marginBottom: "20px", fontSize: "13px" }}>
                <strong>Comments:</strong> {printTarget.result_comments}
              </div>
            )}

            <div style={{ marginTop: "30px", display: "flex", justifyContent: "space-between", fontSize: "12px", borderTop: "1px solid #eee", paddingTop: "12px" }}>
              <div>Turnaround Time: <strong>{printTarget.actual_turnaround_formatted || "Completed"}</strong></div>
              <div>Verified By: <strong>{printTarget.verified_by_username || "Verified Laboratory Specialist"}</strong></div>
            </div>
          </PrintableDocument>
        )}
      </Modal>
    </AppShell>
  );
}

export default LaboratoryOrders;
