import { useEffect, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import { getMedications, addMedication, updateStock } from "../services/pharmacyService";
import { useAuth } from "../context/useAuth";

const INITIAL_MED_FORM = {
  name: "",
  genericName: "",
  category: "Antibiotics",
  dosageForm: "Tablet",
  strength: "",
  unitPrice: "",
  stockQuantity: 100,
  reorderLevel: 20,
};

function PharmacyInventory() {
  const { user } = useAuth();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, startTransition] = useTransition();

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(INITIAL_MED_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  const [adjustTarget, setAdjustTarget] = useState(null);
  const [stockDelta, setStockDelta] = useState(10);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMedications() {
      try {
        setError("");
        const res = await getMedications({
          page,
          limit: 15,
          search: searchTerm,
          lowStock: lowStockOnly ? "true" : undefined,
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

    loadMedications();
    return () => {
      cancelled = true;
    };
  }, [page, searchTerm, lowStockOnly, reloadKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    startTransition(() => {
      setSearchTerm(searchInput.trim());
    });
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError("");
    try {
      setAddSubmitting(true);
      await addMedication(addForm);
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
        quantityDelta: parseInt(stockDelta, 10),
      });
      setSuccess(`Inventory updated for ${adjustTarget.name}.`);
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
            Track stock levels, reorder thresholds, and hospital formulary catalog.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/prescriptions" className="button button-secondary">
            💊 Prescriptions Queue
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

      {/* Filters */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="search"
            placeholder="Search medications by brand or generic name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setLowStockOnly(e.target.checked);
                setPage(1);
              }}
            />
            Low Stock Alerts Only
          </label>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading formulary inventory...</div>
        ) : medications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <h3>No medications found</h3>
            <p>No drugs match your current search criteria.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th>Generic Name</th>
                  <th>Category</th>
                  <th>Strength & Form</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Unit Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((m) => {
                  const isLow = m.stock_quantity <= m.reorder_level;
                  return (
                    <tr key={m.id} style={{ background: isLow ? "var(--warning-bg, #fffbeb)" : "transparent" }}>
                      <td>
                        <strong style={{ color: "var(--primary)" }}>{m.name}</strong>
                      </td>
                      <td>{m.generic_name || "—"}</td>
                      <td>
                        <span className="badge badge-info">{m.category}</span>
                      </td>
                      <td>
                        {m.strength} ({m.dosage_form})
                      </td>
                      <td>
                        <strong style={{ color: isLow ? "var(--danger)" : "var(--success)" }}>
                          {m.stock_quantity}
                        </strong>{" "}
                        units
                        {isLow && (
                          <span className="badge badge-danger" style={{ marginLeft: "6px", fontSize: "10px" }}>
                            LOW
                          </span>
                        )}
                      </td>
                      <td>{m.reorder_level} units</td>
                      <td><strong>${m.unit_price}</strong></td>
                      <td>
                        {["ADMIN", "PHARMACIST"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => {
                              setAdjustTarget(m);
                              setStockDelta(20);
                            }}
                          >
                            Adjust Stock
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

      {/* Modal: Add Medication */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Medication to Formulary">
        {addError && <div className="alert alert-error">{addError}</div>}
        <form onSubmit={handleAddSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Brand / Trade Name *</label>
              <input
                placeholder="e.g. Lipitor"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Generic Name</label>
              <input
                placeholder="e.g. Atorvastatin"
                value={addForm.genericName}
                onChange={(e) => setAddForm({ ...addForm, genericName: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Category *</label>
              <select
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              >
                <option value="Antibiotics">Antibiotics</option>
                <option value="Cardiovascular">Cardiovascular</option>
                <option value="Analgesics">Analgesics & Pain</option>
                <option value="Endocrine">Endocrine & Diabetes</option>
                <option value="Respiratory">Respiratory</option>
                <option value="Gastrointestinal">Gastrointestinal</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label>Dosage Form</label>
              <select
                value={addForm.dosageForm}
                onChange={(e) => setAddForm({ ...addForm, dosageForm: e.target.value })}
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Injection">Injection</option>
                <option value="Syrup">Syrup</option>
                <option value="Ointment">Ointment</option>
                <option value="Inhaler">Inhaler</option>
              </select>
            </div>

            <div className="form-field">
              <label>Strength</label>
              <input
                placeholder="e.g. 20mg"
                value={addForm.strength}
                onChange={(e) => setAddForm({ ...addForm, strength: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Unit Selling Price ($) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="15.00"
                value={addForm.unitPrice}
                onChange={(e) => setAddForm({ ...addForm, unitPrice: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Initial Stock Quantity</label>
              <input
                type="number"
                value={addForm.stockQuantity}
                onChange={(e) => setAddForm({ ...addForm, stockQuantity: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Reorder Warning Level</label>
              <input
                type="number"
                value={addForm.reorderLevel}
                onChange={(e) => setAddForm({ ...addForm, reorderLevel: e.target.value })}
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

      {/* Modal: Adjust Stock */}
      <Modal isOpen={Boolean(adjustTarget)} onClose={() => setAdjustTarget(null)} title="Adjust Medication Stock Level">
        {adjustError && <div className="alert alert-error">{adjustError}</div>}
        {adjustTarget && (
          <form onSubmit={handleAdjustSubmit}>
            <p style={{ fontSize: "13px" }}>
              Current stock for <strong>{adjustTarget.name}</strong> ({adjustTarget.strength}):{" "}
              <strong>{adjustTarget.stock_quantity} units</strong>.
            </p>

            <div className="form-field" style={{ margin: "14px 0" }}>
              <label>Quantity Delta to Add (+) or Deduct (-)</label>
              <input
                type="number"
                value={stockDelta}
                onChange={(e) => setStockDelta(e.target.value)}
                required
              />
              <small style={{ color: "var(--text-muted)", marginTop: "4px" }}>
                Enter positive number to restock (e.g. 50) or negative number to write-off damaged/expired stock (e.g. -5).
              </small>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setAdjustTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={adjustSubmitting}>
                {adjustSubmitting ? "Updating..." : "Update Inventory"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}

export default PharmacyInventory;
