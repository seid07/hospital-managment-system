import { useEffect, useState } from "react";
import AppShell from "../components/layout/AppShell";
import StatCard from "../components/common/StatCard";
import PrintableDocument from "../components/common/PrintableDocument";
import Modal from "../components/common/Modal";
import { getAnalyticsReport } from "../services/reportService";
import { formatCurrency } from "../utils/currency";

function getInitialStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

function getInitialEndDate() {
  return new Date().toISOString().split("T")[0];
}

function Reports() {
  const [reportType, setReportType] = useState("APPOINTMENTS");
  const [startDate, setStartDate] = useState(getInitialStartDate);
  const [endDate, setEndDate] = useState(getInitialEndDate);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      try {
        setError("");
        const res = await getAnalyticsReport(reportType, { startDate, endDate });
        if (!cancelled && res.data) {
          setData(res.data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to generate analytics report.");
          setLoading(false);
        }
      }
    }

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [reportType, startDate, endDate, reloadKey]);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Hospital Intelligence</p>
          <h1>Analytics & Operational Reports</h1>
          <p className="page-description">
            Aggregate clinical volumes, physician workloads, diagnostic statistics, and financial performance.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() => setShowPrintModal(true)}
          >
            🖨 Print Executive Report
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Report Filter Controls */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ minWidth: "220px" }}>
            <label>Report Domain</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="APPOINTMENTS">Appointments & Doctor Utilization</option>
              <option value="REVENUE">Revenue & Financial Transactions</option>
              <option value="CLINICAL">Clinical Diagnoses, Pharmacy & Labs</option>
            </select>
          </div>

          <div className="form-field">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={() => setReloadKey((prev) => prev + 1)}
            style={{ marginBottom: "2px" }}
          >
            Generate Report
          </button>
        </div>
      </section>

      {loading ? (
        <div className="loading-state">Aggregating hospital analytics...</div>
      ) : !data ? (
        <div className="empty-state">No report data generated.</div>
      ) : (
        <>
          {/* APPOINTMENTS REPORT */}
          {reportType === "APPOINTMENTS" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="dashboard-grid">
                {data.statusBreakdown?.map((s, i) => (
                  <StatCard
                    key={i}
                    label={`Status: ${s.status}`}
                    value={s.count}
                    icon="□"
                    description={`Total ${s.status.toLowerCase()} visits`}
                  />
                ))}
              </div>

              <section className="card">
                <div className="card-header">
                  <h2>Physician Productivity & Utilization</h2>
                  <p>Completed consultations and cancellations by practitioner.</p>
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Doctor Name</th>
                        <th>Department</th>
                        <th>Total Scheduled</th>
                        <th>Completed</th>
                        <th>Cancelled</th>
                        <th>No Show</th>
                        <th>Completion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.doctorUtilization?.map((d) => {
                        const total = parseInt(d.total_appointments, 10) || 0;
                        const completed = parseInt(d.completed_count, 10) || 0;
                        const rate = total > 0 ? ((completed / total) * 100).toFixed(0) : "0";
                        return (
                          <tr key={d.doctor_id}>
                            <td><strong>Dr. {d.first_name} {d.last_name}</strong></td>
                            <td>{d.department || "General"}</td>
                            <td>{d.total_appointments}</td>
                            <td style={{ color: "var(--success)", fontWeight: 600 }}>{d.completed_count}</td>
                            <td>{d.cancelled_count}</td>
                            <td>{d.no_show_count}</td>
                            <td><strong>{rate}%</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* REVENUE REPORT */}
          {reportType === "REVENUE" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="dashboard-grid">
                <StatCard
                  label="Total Collections"
                  value={formatCurrency(data.summary?.total_collected || 0)}
                  icon="💳"
                  description={`${data.summary?.payment_count || 0} total payments processed`}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <section className="card">
                  <div className="card-header">
                    <h2>Payment Methods Breakdown</h2>
                    <p>Collections by payment channel.</p>
                  </div>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Payment Method</th>
                          <th>Transactions</th>
                          <th>Total Collected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.methodBreakdown?.map((m, i) => (
                          <tr key={i}>
                            <td><strong>{m.payment_method}</strong></td>
                            <td>{m.count}</td>
                            <td><strong>{formatCurrency(m.total)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <h2>Invoice Status Summary</h2>
                    <p>Accounts receivables and collection progress.</p>
                  </div>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Count</th>
                          <th>Total Billed</th>
                          <th>Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.invoiceStatus?.map((inv, i) => (
                          <tr key={i}>
                            <td><strong>{inv.status}</strong></td>
                            <td>{inv.count}</td>
                            <td>{formatCurrency(inv.total_invoiced)}</td>
                            <td style={{ color: parseFloat(inv.total_balance) > 0 ? "var(--danger)" : "var(--success)" }}>
                              {formatCurrency(inv.total_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* CLINICAL REPORT */}
          {reportType === "CLINICAL" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "20px" }}>
              <section className="card">
                <div className="card-header">
                  <h2>Top Diagnoses</h2>
                  <p>Most common patient conditions.</p>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                  {data.topDiagnoses?.map((d, i) => (
                    <li key={i} style={{ marginBottom: "8px" }}>
                      <strong>{d.description}</strong> {d.code && `(${d.code})`} —{" "}
                      <span className="badge badge-info">{d.frequency} cases</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>Diagnostic Test Volume</h2>
                  <p>Laboratory ordering volume.</p>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                  {data.labVolume?.map((l, i) => (
                    <li key={i} style={{ marginBottom: "8px" }}>
                      <strong>{l.test_name}</strong> ({l.category}) —{" "}
                      <span className="badge badge-info">{l.order_count} tests</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>Prescription Volume</h2>
                  <p>Top medications dispensed.</p>
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                  {data.prescriptionVolume?.map((p, i) => (
                    <li key={i} style={{ marginBottom: "8px" }}>
                      <strong>{p.medication_name}</strong> —{" "}
                      <span className="badge badge-info">{p.prescribed_count} orders</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </>
      )}

      {/* Modal: Print Summary */}
      <Modal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} title="Print Hospital Operations Report" maxWidth="800px">
        <PrintableDocument
          title={`HOSPITAL OPERATIONS & ${reportType} REPORT`}
          subtitle={`Reporting Period: ${startDate} to ${endDate}`}
          date={new Date().toLocaleDateString()}
        >
          <div style={{ fontSize: "13px" }}>
            <p>
              This report summarizes institutional activity across departments for the selected date range ({startDate} to {endDate}).
            </p>

            {reportType === "APPOINTMENTS" && data?.doctorUtilization && (
              <div>
                <h4>Physician Utilization</h4>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: "6px", border: "1px solid #cbd5e1" }}>Doctor</th>
                      <th style={{ padding: "6px", border: "1px solid #cbd5e1" }}>Department</th>
                      <th style={{ padding: "6px", border: "1px solid #cbd5e1" }}>Scheduled</th>
                      <th style={{ padding: "6px", border: "1px solid #cbd5e1" }}>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.doctorUtilization.map((d) => (
                      <tr key={d.doctor_id}>
                        <td style={{ padding: "6px", border: "1px solid #cbd5e1" }}>Dr. {d.first_name} {d.last_name}</td>
                        <td style={{ padding: "6px", border: "1px solid #cbd5e1" }}>{d.department}</td>
                        <td style={{ padding: "6px", border: "1px solid #cbd5e1" }}>{d.total_appointments}</td>
                        <td style={{ padding: "6px", border: "1px solid #cbd5e1" }}>{d.completed_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === "REVENUE" && data?.summary && (
              <div>
                <h4>Financial Summary</h4>
                <p>Total Payments Received: <strong>{formatCurrency(data.summary.total_collected)}</strong> ({data.summary.payment_count} transactions)</p>
              </div>
            )}

            {reportType === "CLINICAL" && (
              <div>
                <h4>Top Diagnoses</h4>
                <ul>
                  {data?.topDiagnoses?.map((d, i) => (
                    <li key={i}>{d.description} ({d.frequency} patients)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </PrintableDocument>
      </Modal>
    </AppShell>
  );
}

export default Reports;
