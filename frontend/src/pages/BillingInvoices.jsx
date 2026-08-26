import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import PatientSearch from "../components/appointments/PatientSearch";
import {
  getInvoices,
  getInvoice,
  createInvoice,
  recordPayment,
  getServices,
} from "../services/billingService";
import { useAuth } from "../context/useAuth";
import { formatCurrency } from "../utils/currency";
import { useDebounce } from "../hooks/useDebounce";

function BillingInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Create Invoice Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [servicesCatalog, setServicesCatalog] = useState([]);
  const [lineItems, setLineItems] = useState([
    { itemType: "CONSULTATION", description: "General Consultation", unitPrice: 50.0, quantity: 1 },
  ]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");

  // Record Payment Modal
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Print Invoice Modal
  const [printTarget, setPrintTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInvoices() {
      try {
        setError("");
        const res = await getInvoices({
          page,
          limit: 15,
          status: statusFilter,
          search: debouncedSearch.trim(),
        });
        if (!cancelled && res.data) {
          setInvoices(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load invoices.");
          setLoading(false);
        }
      }
    }
    loadInvoices();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, debouncedSearch, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await getServices({ limit: 100 });
        if (!cancelled && res.data) setServicesCatalog(res.data);
      } catch {
        // silent
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
  }

  function handleAddLineItem() {
    setLineItems((prev) => [
      ...prev,
      { itemType: "SERVICE", description: "", unitPrice: 0, quantity: 1 },
    ]);
  }

  function handleRemoveLineItem(idx) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleItemChange(idx, field, value) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  const estimatedSubtotal = lineItems.reduce(
    (sum, item) => sum + (parseFloat(item.quantity) || 1) * (parseFloat(item.unitPrice) || 0),
    0
  );
  const estimatedTotal = Math.max(
    0,
    estimatedSubtotal - (parseFloat(discountAmount) || 0) + (parseFloat(taxAmount) || 0)
  );

  async function handleCreateSubmit(e) {
    e.preventDefault();
    setCreateError("");
    if (!selectedPatient) {
      setCreateError("Please select a patient for the invoice.");
      return;
    }
    if (lineItems.length === 0) {
      setCreateError("Invoice must contain at least one line item.");
      return;
    }

    try {
      setCreateSubmitting(true);
      await createInvoice({
        patientId: selectedPatient.id,
        items: lineItems,
        discountAmount: parseFloat(discountAmount) || 0,
        taxAmount: parseFloat(taxAmount) || 0,
        notes: invoiceNotes,
      });

      setSuccess("Invoice generated successfully.");
      setShowCreateModal(false);
      setSelectedPatient(null);
      setLineItems([{ itemType: "CONSULTATION", description: "General Consultation", unitPrice: 50.0, quantity: 1 }]);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setCreateError(err.message || "Failed to create invoice.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  function handleOpenPayment(invoice) {
    setPaymentTarget(invoice);
    setPayAmount(invoice.balance_amount);
    setPaymentMethod("CASH");
    setPaymentRef("");
    setPaymentNotes("");
    setPaymentError("");
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    setPaymentError("");
    try {
      setPaymentSubmitting(true);
      await recordPayment({
        invoiceId: paymentTarget.id,
        amount: parseFloat(payAmount),
        paymentMethod,
        transactionReference: paymentRef,
        notes: paymentNotes,
      });
      setSuccess(`Payment of ${formatCurrency(payAmount)} recorded for Invoice #${paymentTarget.invoice_number}.`);
      setPaymentTarget(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  async function handleOpenPrint(invoiceId) {
    try {
      const res = await getInvoice(invoiceId);
      if (res.data) setPrintTarget(res.data);
    } catch (err) {
      setError(err.message || "Failed to load invoice details.");
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Financial & Invoicing</p>
          <h1>Billing, Invoices & Payments</h1>
          <p className="page-description">
            Generate hospital invoices, track receivables, and issue official payment receipts.
          </p>
        </div>

        <div className="page-actions">
          {["ADMIN", "FINANCE", "REGISTRAR"].includes(user?.role) && (
            <button
              type="button"
              className="button button-primary button-large"
              onClick={() => setShowCreateModal(true)}
            >
              + Create New Invoice
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filter Bar */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="search"
            placeholder="Search by invoice #, patient number, or patient name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: "180px", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending (Unpaid)</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid in Full</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"></div>
            <h3>No invoices found</h3>
            <p>No invoices match your search filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Subtotal</th>
                  <th>Discount / Tax</th>
                  <th>Total Amount</th>
                  <th>Balance Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>{inv.invoice_number}</strong>
                    </td>
                    <td>
                      <Link to={`/patients/${inv.patient_id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {inv.patient_first_name} {inv.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{inv.patient_number}</small>
                    </td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    <td>{formatCurrency(inv.subtotal)}</td>
                    <td>
                      <small>-{formatCurrency(inv.discount_amount)} / +{formatCurrency(inv.tax_amount)}</small>
                    </td>
                    <td>
                      <strong style={{ color: "var(--primary)" }}>{formatCurrency(inv.total_amount)}</strong>
                    </td>
                    <td>
                      <strong style={{ color: parseFloat(inv.balance_amount) > 0 ? "var(--danger)" : "var(--success)" }}>
                        {formatCurrency(inv.balance_amount)}
                      </strong>
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {parseFloat(inv.balance_amount) > 0 && ["ADMIN", "FINANCE", "REGISTRAR"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleOpenPayment(inv)}
                          >
                            Receive Payment →
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => handleOpenPrint(inv.id)}
                        >
                          View / Print
                        </button>
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

      {/* Modal: Create Invoice */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Hospital Invoice" maxWidth="750px">
        {createError && <div className="alert alert-error">{createError}</div>}
        <form onSubmit={handleCreateSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Select Patient *</label>
            <PatientSearch selectedPatient={selectedPatient} onSelect={setSelectedPatient} />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong>Itemized Charges & Services</strong>
              <button type="button" className="button button-secondary" onClick={handleAddLineItem} style={{ fontSize: "12px", padding: "4px 8px" }}>
                + Add Line Item
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lineItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "130px 1fr 100px 70px 40px",
                    gap: "8px",
                    alignItems: "center",
                    padding: "8px",
                    background: "var(--surface-muted)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <select
                    value={item.itemType}
                    onChange={(e) => handleItemChange(idx, "itemType", e.target.value)}
                  >
                    <option value="CONSULTATION">Consultation</option>
                    <option value="LAB_TEST">Lab Test</option>
                    <option value="MEDICATION">Medication</option>
                    <option value="PROCEDURE">Procedure</option>
                    <option value="SERVICE">Service</option>
                  </select>

                  <input
                    placeholder="Description (or pick from chargemaster)"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                    required
                  />

                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit Price (ETB)"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                    required
                  />

                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                    required
                  />

                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ padding: "4px 8px", color: "var(--danger)" }}
                    onClick={() => handleRemoveLineItem(idx)}
                    disabled={lineItems.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {servicesCatalog.length > 0 && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                Quick chargemaster suggestions:{" "}
                {servicesCatalog.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setLineItems((prev) => [
                        ...prev,
                        { itemType: s.category || "SERVICE", description: s.name, unitPrice: s.standard_fee, quantity: 1 },
                      ])
                    }
                    style={{ background: "none", border: "none", color: "var(--primary)", textDecoration: "underline", cursor: "pointer", marginRight: "8px" }}
                  >
                    + {s.name} ({formatCurrency(s.standard_fee)})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-grid" style={{ marginBottom: "16px" }}>
            <div className="form-field">
              <label>Discount Amount (ETB)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Tax Amount (ETB)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
          </div>

          <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <span>Subtotal: <strong>{formatCurrency(estimatedSubtotal)}</strong></span>
            <span>Total Payable: <strong style={{ color: "var(--primary)", fontSize: "16px" }}>{formatCurrency(estimatedTotal)}</strong></span>
          </div>

          <div className="form-field" style={{ marginBottom: "16px" }}>
            <label>Invoice Notes</label>
            <input
              placeholder="e.g. Outpatient clinic consultation and routine labs"
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={createSubmitting || !selectedPatient}>
              {createSubmitting ? "Generating..." : "Generate Invoice →"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Record Payment */}
      <Modal isOpen={Boolean(paymentTarget)} onClose={() => setPaymentTarget(null)} title="Record Payment for Invoice">
        {paymentError && <div className="alert alert-error">{paymentError}</div>}
        {paymentTarget && (
          <form onSubmit={handlePaymentSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Invoice #:</strong> {paymentTarget.invoice_number}</div>
              <div><strong>Patient:</strong> {paymentTarget.patient_first_name} {paymentTarget.patient_last_name} ({paymentTarget.patient_number})</div>
              <div><strong>Total Amount:</strong> {formatCurrency(paymentTarget.total_amount)} | <strong>Outstanding Balance:</strong> <strong style={{ color: "var(--danger)" }}>{formatCurrency(paymentTarget.balance_amount)}</strong></div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Payment Amount (ETB) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentTarget.balance_amount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>Payment Method *</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="INSURANCE">Health Insurance</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Payment</option>
                </select>
              </div>
            </div>

            <div className="form-field" style={{ marginTop: "14px" }}>
              <label>Transaction Reference / Card Authorization</label>
              <input
                placeholder="e.g. TXN-982183 or Card Auth #4912"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>

            <div className="form-field" style={{ marginTop: "14px" }}>
              <label>Receipt Notes</label>
              <input
                placeholder="e.g. Cash received at cashier front desk"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setPaymentTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={paymentSubmitting}>
                {paymentSubmitting ? "Processing..." : "✓ Confirm Payment & Issue Receipt"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: View / Print Invoice */}
      <Modal isOpen={Boolean(printTarget)} onClose={() => setPrintTarget(null)} title="Print Hospital Tax Invoice & Receipt" maxWidth="750px">
        {printTarget && (
          <PrintableDocument
            title="HOSPITAL TAX INVOICE"
            subtitle="Financial Accounts Department"
            documentNumber={printTarget.invoice_number}
            date={new Date(printTarget.created_at).toLocaleDateString()}
          >
            <div style={{ borderBottom: "1px solid #eee", paddingBottom: "12px", marginBottom: "16px" }}>
              <table style={{ width: "100%", fontSize: "13px" }}>
                <tbody>
                  <tr>
                    <td><strong>Billed To:</strong> {printTarget.patient_first_name} {printTarget.patient_last_name}</td>
                    <td><strong>Patient ID:</strong> {printTarget.patient_number}</td>
                  </tr>
                  <tr>
                    <td><strong>Phone:</strong> {printTarget.patient_phone || "—"}</td>
                    <td><strong>Status:</strong> {printTarget.status}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ margin: "16px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>Type</th>
                    <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>Description</th>
                    <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>Qty</th>
                    <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>Unit Price</th>
                    <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printTarget.items?.map((it, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{it.item_type}</td>
                      <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{it.description}</td>
                      <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{it.quantity}</td>
                      <td style={{ padding: "8px", border: "1px solid #e2e8f0" }}>{formatCurrency(it.unit_price)}</td>
                      <td style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>{formatCurrency(it.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                <table style={{ width: "240px", fontSize: "13px" }}>
                  <tbody>
                    <tr><td>Subtotal:</td><td style={{ textAlign: "right" }}>{formatCurrency(printTarget.subtotal)}</td></tr>
                    <tr><td>Discount:</td><td style={{ textAlign: "right" }}>-{formatCurrency(printTarget.discount_amount)}</td></tr>
                    <tr><td>Tax:</td><td style={{ textAlign: "right" }}>+{formatCurrency(printTarget.tax_amount)}</td></tr>
                    <tr style={{ fontWeight: 700, fontSize: "14px", borderTop: "1px solid #333" }}>
                      <td>Total Due:</td><td style={{ textAlign: "right" }}>{formatCurrency(printTarget.total_amount)}</td>
                    </tr>
                    <tr style={{ color: "green" }}><td>Total Paid:</td><td style={{ textAlign: "right" }}>{formatCurrency(printTarget.paid_amount)}</td></tr>
                    <tr style={{ fontWeight: 700, color: parseFloat(printTarget.balance_amount) > 0 ? "red" : "green" }}>
                      <td>Balance Remaining:</td><td style={{ textAlign: "right" }}>{formatCurrency(printTarget.balance_amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {printTarget.payments && printTarget.payments.length > 0 && (
              <div style={{ marginTop: "24px", paddingTop: "12px", borderTop: "1px dashed #cbd5e1" }}>
                <h4>Payment Receipts Record</h4>
                <ul style={{ fontSize: "12px", margin: 0, paddingLeft: "20px" }}>
                  {printTarget.payments.map((p) => (
                    <li key={p.id}>
                      Receipt #{p.payment_number}: {formatCurrency(p.amount)} paid via {p.payment_method} on {new Date(p.created_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </PrintableDocument>
        )}
      </Modal>
    </AppShell>
  );
}

export default BillingInvoices;
