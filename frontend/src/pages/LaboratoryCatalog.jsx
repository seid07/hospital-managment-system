import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import { getTestCatalog, addCatalogTest } from "../services/laboratoryService";
import { useAuth } from "../context/useAuth";
import { formatCurrency } from "../utils/currency";
import { useDebounce } from "../hooks/useDebounce";

const INITIAL_TEST_FORM = {
  code: "",
  name: "",
  category: "Hematology",
  referenceRange: "",
  unit: "",
  price: "",
  turnaroundTimeHours: 24,
};

function LaboratoryCatalog() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(INITIAL_TEST_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        setError("");
        const res = await getTestCatalog({
          page,
          limit: 15,
          category: categoryFilter,
          search: debouncedSearch.trim(),
        });
        if (!cancelled && res.data) {
          setCatalog(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load laboratory catalog.");
          setLoading(false);
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [page, categoryFilter, debouncedSearch, reloadKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    setAddError("");
    try {
      setAddSubmitting(true);
      await addCatalogTest(addForm);
      setSuccess(`Test "${addForm.name}" added to laboratory catalog.`);
      setShowAddModal(false);
      setAddForm(INITIAL_TEST_FORM);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setAddError(err.message || "Failed to add laboratory test.");
    } finally {
      setAddSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Diagnostic Services</p>
          <h1>Laboratory Test Catalog & Chargemaster</h1>
          <p className="page-description">
            Configured lab test panels, standard reference intervals, and clinical pricing.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/laboratory" className="button button-secondary">
            🔬 Lab Orders Queue
          </Link>
          {["ADMIN", "LAB_TECH"].includes(user?.role) && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => setShowAddModal(true)}
            >
              + Add New Test
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
            placeholder="Search test name or code..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          />

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: "200px", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
          >
            <option value="">All Categories</option>
            <option value="Hematology">Hematology</option>
            <option value="Biochemistry">Biochemistry</option>
            <option value="Endocrinology">Endocrinology</option>
            <option value="Immunology">Immunology & Serology</option>
            <option value="Microbiology">Microbiology</option>
            <option value="Urinalysis">Urinalysis</option>
          </select>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Table */}
      <section className="card">
        {loading ? (
          <div className="loading-state">Loading test catalog...</div>
        ) : catalog.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧪</div>
            <h3>No laboratory tests found</h3>
            <p>No tests match your search criteria.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Test Name</th>
                  <th>Category</th>
                  <th>Standard Reference Range</th>
                  <th>Unit</th>
                  <th>Turnaround Time</th>
                  <th>Fee / Price</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="badge badge-info">{t.code}</span>
                    </td>
                    <td>
                      <strong style={{ color: "var(--primary)" }}>{t.name}</strong>
                    </td>
                    <td>{t.category}</td>
                    <td>{t.reference_range || "—"}</td>
                    <td>{t.unit || "—"}</td>
                    <td>{t.turnaround_time_hours} hours</td>
                    <td><strong>{formatCurrency(t.price)}</strong></td>
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

      {/* Modal: Add Lab Test */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Laboratory Test to Catalog">
        {addError && <div className="alert alert-error">{addError}</div>}
        <form onSubmit={handleAddSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Test Code *</label>
              <input
                placeholder="e.g. CBC, LIPID, TSH"
                value={addForm.code}
                onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Test Name *</label>
              <input
                placeholder="e.g. Complete Blood Count"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Category *</label>
              <select
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
              >
                <option value="Hematology">Hematology</option>
                <option value="Biochemistry">Biochemistry</option>
                <option value="Endocrinology">Endocrinology</option>
                <option value="Immunology">Immunology & Serology</option>
                <option value="Microbiology">Microbiology</option>
                <option value="Urinalysis">Urinalysis</option>
              </select>
            </div>

            <div className="form-field">
              <label>Standard Reference Range</label>
              <input
                placeholder="e.g. 4.5 - 11.0 x10^9/L"
                value={addForm.referenceRange}
                onChange={(e) => setAddForm({ ...addForm, referenceRange: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Unit of Measurement</label>
              <input
                placeholder="e.g. mg/dL, g/dL"
                value={addForm.unit}
                onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Fee / Price (ETB) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 150.00"
                value={addForm.price}
                onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Turnaround Time (Hours)</label>
              <input
                type="number"
                value={addForm.turnaroundTimeHours}
                onChange={(e) => setAddForm({ ...addForm, turnaroundTimeHours: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={addSubmitting}>
              {addSubmitting ? "Saving..." : "Add Test to Catalog"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

export default LaboratoryCatalog;
