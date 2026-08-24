import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import { getMedications, addMedication, updateStock } from "../services/pharmacyService";
import { getInventoryTransactions } from "../services/api";
import { useAuth } from "../context/useAuth";
import { formatCurrency } from "../utils/currency";
import { useDebounce } from "../hooks/useDebounce";

const INITIAL_MED_FORM = {
  name: "",
  code: "",
  form: "Tablet",
  strength: "",
  unitPrice: "",
  stockQuantity: 100,
  reorderLevel: 15,
};

function PharmacyInventory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("CATALOG"); // 'CATALOG', 'LOW_STOCK', 'TRANSACTIONS'

  // Medication Catalog State
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Transactions Audit State
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txTotal, setTxTotal] = useState(0);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(INITIAL_MED_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  const [adjustTarget, setAdjustTarget] = useState(null);
  const [stockDelta, setStockDelta] = useState(20);
  const [newSellingPrice, setNewSellingPrice] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (activeTab === "TRANSACTIONS") {
        try {
          const res = await getInventoryTransactions({
            page: txPage,
            limit: 15,
          });
          if (!cancelled && res.data) {
            setTransactions(res.data || []);
            setTxTotal(res.pagination?.total || 0);
            setTxTotalPages(res.pagination?.totalPages || 1);
            setLoadingTx(false);
          }
        } catch {
          if (!cancelled) setLoadingTx(false);
        }
      } else {
        try {
          const isLowStock = activeTab === "LOW_STOCK";
          const res = await getMedications({
            page,
            limit: 15,
            search: debouncedSearch.trim(),
            lowStock: isLowStock ? "true" : undefined,
          });
          if (!cancelled && res.data) {
            setMedications(res.data);
            setTotal(res.pagination?.total || 0);
            setTotalPages(res.pagination?.totalPages || 1);
            setLoading(false);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err.message || "Unable to load medication inventory.");
            setLoading(false);
          }
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeTab, page, txPage, debouncedSearch, reloadKey]);

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError("");
    try {
      setAddSubmitting(true);
      await addMedication({
        name: addForm.name,
        code: addForm.code || `MED-${addForm.name.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
        form: addForm.form,
        strength: addForm.strength,
        unitPrice: parseFloat(addForm.unitPrice) || 0,
        stockQuantity: parseInt(addForm.stockQuantity, 10) || 0,
        reorderLevel: 15,
      });
      setSuccess(`Medication "${addForm.name}" added to hospital formulary.`);
      setShowAddModal(false);
      setAddForm(INITIAL_MED_FORM);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setAddError(err.message || "Failed to add medication.");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleAdjustSubmit(e) {
    e.preventDefault();
    setAdjustError("");
    try {
      setAdjustSubmitting(true);
      await updateStock(adjustTarget.id, {
        quantityChange: parseInt(stockDelta, 10) || 0,
        unitPrice: newSellingPrice !== "" ? parseFloat(newSellingPrice) : undefined,
        notes: adjustNotes || undefined,
      });
      setSuccess(`Inventory & pricing updated for ${adjustTarget.name}.`);
      setAdjustTarget(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setAdjustError(err.message || "Failed to update stock quantity.");
    } finally {
      setAdjustSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Pharmacy & Formulary</p>
          <h1>Medication Inventory & Stock Control</h1>
          <p className="page-description">
            Track real-time stock levels, low-stock threshold alerts (&lt; 15 units), and itemized movement audit logs.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/prescriptions" className="button button-secondary">
            💊 Prescriptions & Cashier
          </Link>
          {["ADMIN", "PHARMACIST"].includes(user?.role) && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowAddModal(true)}
            >
              + Add Formulary Drug
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", marginBottom: "20px" }}>
        <button
          type="button"
          className={`button ${activeTab === "CATALOG" ? "button-primary" : "button-secondary"}`}
          onClick={() => {
            setActiveTab("CATALOG");
            setPage(1);
          }}
        >
          📦 All Formulary Medications
        </button>
        <button
          type="button"
          className={`button ${activeTab === "LOW_STOCK" ? "button-danger" : "button-secondary"}`}
          onClick={() => {
            setActiveTab("LOW_STOCK");
            setPage(1);
          }}
        >
          ⚠️ Low Stock Alerts (&lt; 15 Units)
        </button>
        <button
          type="button"
          className={`button ${activeTab === "TRANSACTIONS" ? "button-primary" : "button-secondary"}`}
          onClick={() => {
            setActiveTab("TRANSACTIONS");
            setTxPage(1);
          }}
        >
          📜 Stock Movement Transactions
        </button>
      </div>

      {activeTab !== "TRANSACTIONS" && (
        <>
          {/* Filters */}
          <section className="card" style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <input
                type="search"
                placeholder="Live search medications by brand name, code, or strength..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                style={{ flex: 1 }}
              />
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Low Stock Threshold: <strong>&lt; 15 units</strong> (14 or below triggers alert)
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="card">
            <div className="card-header">
              <h2>
                {activeTab === "LOW_STOCK" ? "⚠️ Low Stock Medications (< 15 Units)" : "Hospital Formulary Catalog"} ({total})
              </h2>
              <p>
                {activeTab === "LOW_STOCK"
                  ? "Items requiring urgent restocking from pharmaceutical suppliers."
                  : "Authoritative hospital formulary catalog with live database stock accounting."}
              </p>
            </div>

            {loading ? (
              <div className="loading-state">Loading formulary inventory...</div>
            ) : medications.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>{activeTab === "LOW_STOCK" ? "No Low Stock Alerts" : "No medications found"}</h3>
                <p>
                  {activeTab === "LOW_STOCK"
                    ? "All medication stocks are at or above 15 units."
                    : "No formulary items match your search criteria."}
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Brand Name</th>
                      <th>Form & Strength</th>
                      <th>Current Stock</th>
                      <th>Threshold</th>
                      <th>Selling Price</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medications.map((m) => {
                      // Strictly < 15 is low stock (14 or below)
                      const isLowStock = m.stock_quantity < 15;
                      return (
                        <tr key={m.id} style={{ background: isLowStock ? "rgba(239, 68, 68, 0.08)" : "transparent" }}>
                          <td>
                            <code style={{ fontFamily: "monospace", color: "#38bdf8" }}>{m.code}</code>
                          </td>
                          <td>
                            <strong style={{ color: "var(--text-primary)" }}>{m.name}</strong>
                          </td>
                          <td>
                            {m.form} {m.strength && `(${m.strength})`}
                          </td>
                          <td>
                            <strong style={{ fontSize: "14px", color: isLowStock ? "var(--danger)" : "var(--success)" }}>
                              {m.stock_quantity} units
                            </strong>
                            {isLowStock && (
                              <span className="badge badge-danger" style={{ marginLeft: "8px", fontSize: "10px" }}>
                                LOW (&lt; 15)
                              </span>
                            )}
                          </td>
                          <td>15 units</td>
                          <td>
                            <strong style={{ color: "#38bdf8" }}>{formatCurrency(m.unit_price)}</strong>
                          </td>
                          <td>
                            <span className={`status ${m.is_active ? "status-active" : "status-inactive"}`}>
                              {m.is_active ? "In Formulary" : "Discontinued"}
                            </span>
                          </td>
                          <td>
                            {["ADMIN", "PHARMACIST"].includes(user?.role) && (
                              <button
                                type="button"
                                className="button button-secondary button-sm"
                                onClick={() => {
                                  setAdjustTarget(m);
                                  setStockDelta(20);
                                  setNewSellingPrice(m.unit_price);
                                  setAdjustNotes("");
                                }}
                              >
                                Adjust Stock / Price
                              </button>
                            )}
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
              onPageChange={(p) => setPage(p)}
            />
          </section>
        </>
      )}

      {activeTab === "TRANSACTIONS" && (
        <section className="card">
          <div className="card-header">
            <h2>Inventory Stock Movement Audit Ledger ({txTotal})</h2>
            <p>Every medication dispensing, restocking, and manual adjustment is tracked in real-time.</p>
          </div>

          {loadingTx ? (
            <div className="loading-state">Loading stock transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📜</div>
              <h3>No Inventory Transactions Yet</h3>
              <p>Transactions will appear automatically when medications are dispensed or restocked.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Medicine</th>
                    <th>Type</th>
                    <th>Prev Qty</th>
                    <th>Change</th>
                    <th>New Qty</th>
                    <th>Patient / Prescription</th>
                    <th>Staff</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td>
                        <strong>{tx.medicine_name}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{tx.medicine_code}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            tx.transaction_type === "DISPENSE"
                              ? "badge-warning"
                              : tx.transaction_type === "RESTOCK"
                              ? "badge-success"
                              : "badge-info"
                          }`}
                        >
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td>{tx.previous_quantity}</td>
                      <td>
                        <strong style={{ color: tx.quantity_changed < 0 ? "var(--danger)" : "var(--success)" }}>
                          {tx.quantity_changed > 0 ? `+${tx.quantity_changed}` : tx.quantity_changed}
                        </strong>
                      </td>
                      <td>
                        <strong>{tx.new_quantity}</strong>
                      </td>
                      <td>
                        {tx.patient_number ? (
                          <div>
                            <div>{tx.patient_first_name} {tx.patient_last_name}</div>
                            <small style={{ color: "var(--text-muted)" }}>{tx.patient_number}</small>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>General Adjustment</span>
                        )}
                        {tx.prescription_number && (
                          <div style={{ fontSize: "11px", color: "#38bdf8" }}>Rx: {tx.prescription_number}</div>
                        )}
                      </td>
                      <td>{tx.staff_username || "Staff"}</td>
                      <td style={{ fontSize: "12px" }}>{tx.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={txPage}
            totalPages={txTotalPages}
            total={txTotal}
            onPageChange={(p) => setTxPage(p)}
          />
        </section>
      )}

      {/* Modal: Add Medication */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Medication to Hospital Formulary">
        {addError && <div className="alert alert-error">{addError}</div>}
        <form onSubmit={handleAddSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Brand / Trade Name *</label>
              <input
                placeholder="e.g. Paracetamol"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Drug Code *</label>
              <input
                placeholder="e.g. MED-PCM-500"
                value={addForm.code}
                onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Dosage Form</label>
              <select
                value={addForm.form}
                onChange={(e) => setAddForm({ ...addForm, form: e.target.value })}
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Injection">Injection</option>
                <option value="Syrup">Syrup</option>
                <option value="IV Infusion">IV Infusion</option>
                <option value="Ointment">Ointment</option>
                <option value="Inhaler">Inhaler</option>
              </select>
            </div>

            <div className="form-field">
              <label>Strength</label>
              <input
                placeholder="e.g. 500mg"
                value={addForm.strength}
                onChange={(e) => setAddForm({ ...addForm, strength: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Unit Selling Price (ETB) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 15.00"
                value={addForm.unitPrice}
                onChange={(e) => setAddForm({ ...addForm, unitPrice: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Initial Stock Quantity *</label>
              <input
                type="number"
                min="0"
                value={addForm.stockQuantity}
                onChange={(e) => setAddForm({ ...addForm, stockQuantity: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={addSubmitting}>
              {addSubmitting ? "Saving..." : "Add to Formulary"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adjust Stock and Pricing */}
      <Modal isOpen={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title="Adjust Stock Quantity & Selling Price">
        {adjustError && <div className="alert alert-error">{adjustError}</div>}
        {adjustTarget && (
          <form onSubmit={handleAdjustSubmit}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
              Current stock for <strong>{adjustTarget.name}</strong> ({adjustTarget.strength}):{" "}
              <strong style={{ color: "#38bdf8" }}>{adjustTarget.stock_quantity} units</strong>. Current Price:{" "}
              <strong>{formatCurrency(adjustTarget.unit_price)}</strong>.
            </p>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Stock Delta to Add (+) or Deduct (-)</label>
              <input
                type="number"
                value={stockDelta}
                onChange={(e) => setStockDelta(e.target.value)}
                required
              />
              <small style={{ color: "var(--text-muted)", marginTop: "4px" }}>
                Positive number to restock (e.g. +50), negative to write-off (e.g. -5).
              </small>
            </div>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Selling Price (ETB)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={adjustTarget.unit_price}
                value={newSellingPrice}
                onChange={(e) => setNewSellingPrice(e.target.value)}
              />
            </div>

            <div className="form-field" style={{ marginBottom: "16px" }}>
              <label>Adjustment Reason / Notes</label>
              <input
                type="text"
                placeholder="e.g. Periodic batch supplier delivery"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" className="button button-secondary" onClick={() => setAdjustTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={adjustSubmitting}>
                {adjustSubmitting ? "Updating..." : "Save Stock & Price"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

export default PharmacyInventory;
