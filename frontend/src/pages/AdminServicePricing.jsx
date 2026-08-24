import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { get, put, patch, getServicePriceHistory } from "../services/api";
import { useDebounce } from "../hooks/useDebounce";

function AdminServicePricing() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Edit Modal State
  const [selectedService, setSelectedService] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Price History Modal
  const [historyModalService, setHistoryModalService] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.append("search", debouncedSearch);
        if (categoryFilter !== "ALL") params.append("category", categoryFilter);

        const res = await get(`/services?${params.toString()}`);
        if (!cancelled) {
          setServices(res.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load service catalog.");
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, categoryFilter, reloadKey]);

  async function handleOpenEdit(srv) {
    setSelectedService(srv);
    setEditPrice(srv.price);
    setEditActive(srv.is_active);
  }

  async function handleSavePrice(e) {
    e.preventDefault();
    if (!selectedService) return;

    const numPrice = parseFloat(editPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      setError("Please enter a valid non-negative price in ETB.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await put(`/services/${selectedService.id}`, {
        price: numPrice,
        isActive: editActive,
      });

      setSuccess(`Price for ${selectedService.name} updated to ${numPrice.toLocaleString()} ETB.`);
      setSelectedService(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to update service pricing.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(srv) {
    try {
      setError("");
      setSuccess("");
      await patch(`/services/${srv.id}`, {
        isActive: !srv.is_active,
      });
      setSuccess(`Service ${srv.name} ${!srv.is_active ? "activated" : "deactivated"} successfully.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Failed to toggle service status.");
    }
  }

  async function handleViewHistory(srv) {
    try {
      setHistoryModalService(srv);
      setLoadingHistory(true);
      const res = await getServicePriceHistory(srv.id);
      setPriceHistory(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load price history.");
    } finally {
      setLoadingHistory(false);
    }
  }

  const categories = ["ALL", ...new Set(services.map((s) => s.category).filter(Boolean))];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Administration & Chargemaster</p>
          <h1>Service Pricing Management</h1>
          <p className="page-description">
            Configure authoritative standard tariffs, consultation charges, diagnostics, procedures, and bed rates in Ethiopian Birr (ETB).
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="status">
          {success}
        </div>
      )}

      <div className="card" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "12px", flex: 1, minWidth: "280px" }}>
            <input
              type="search"
              placeholder="Live search by service name or code (e.g. CBC, X-Ray, Bed)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ width: "180px" }}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  Category: {cat}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Standard Hospital Currency: <strong style={{ color: "#38bdf8" }}>ETB (Ethiopian Birr)</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Master Hospital Chargemaster ({services.length} Services)</h2>
          <p>Historical patient invoices maintain price snapshots at the time of charge creation.</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading chargemaster services...</div>
        ) : services.length === 0 ? (
          <div className="empty-state">No hospital services found matching filters.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Service Name</th>
                  <th>Category</th>
                  <th>Department</th>
                  <th>Payment Location</th>
                  <th>Current Price</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((srv) => (
                  <tr key={srv.id}>
                    <td>
                      <code style={{ fontFamily: "monospace", color: "#38bdf8" }}>{srv.code}</code>
                    </td>
                    <td>
                      <strong>{srv.name}</strong>
                      {srv.description && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{srv.description}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">{srv.category}</span>
                    </td>
                    <td>{srv.department_name || srv.department_code}</td>
                    <td>
                      <span className="badge badge-neutral">{srv.payment_location}</span>
                    </td>
                    <td>
                      <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                        {parseFloat(srv.price).toLocaleString()} ETB
                      </strong>
                    </td>
                    <td>
                      <span className={`status ${srv.is_active ? "status-active" : "status-inactive"}`}>
                        {srv.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {srv.updated_at ? new Date(srv.updated_at).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleOpenEdit(srv)}
                        >
                          Edit Price
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleViewHistory(srv)}
                          title="View Price Audit History"
                        >
                          📜 History
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-sm"
                          onClick={() => handleToggleStatus(srv)}
                        >
                          {srv.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Service Price Modal */}
      {selectedService && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedService(null)}
          title={`Edit Service Price — ${selectedService.name}`}
        >
          <form onSubmit={handleSavePrice}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
              Updating this service price sets the authoritative fee for new patient charges. Existing orders preserve historic prices.
            </p>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Service Code</label>
              <input type="text" value={selectedService.code} disabled style={{ opacity: 0.7 }} />
            </div>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>Service Name</label>
              <input type="text" value={selectedService.name} disabled style={{ opacity: 0.7 }} />
            </div>

            <div className="form-field" style={{ marginBottom: "12px" }}>
              <label>New Price (ETB) *</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 600, color: "#38bdf8" }}>ETB</span>
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <span>Service is Active and Billable</span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedService(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={saving || !editPrice}
              >
                {saving ? "Saving Price..." : "Save New Price (ETB)"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Price Audit History Modal */}
      {historyModalService && (
        <Modal
          isOpen={true}
          onClose={() => setHistoryModalService(null)}
          title={`Price History Audit — ${historyModalService.name}`}
        >
          <div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
              Immutable audit log of historical price adjustments for <strong style={{ color: "#38bdf8" }}>{historyModalService.code}</strong>.
            </p>

            {loadingHistory ? (
              <div className="loading-state">Loading history...</div>
            ) : priceHistory.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px" }}>
                No price modifications recorded since master baseline. Current price: {parseFloat(historyModalService.price).toLocaleString()} ETB.
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date / Time</th>
                      <th>Previous Price</th>
                      <th>New Price</th>
                      <th>Modified By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistory.map((h) => (
                      <tr key={h.id}>
                        <td>{new Date(h.created_at).toLocaleString()}</td>
                        <td style={{ color: "var(--text-muted)" }}>{parseFloat(h.old_price).toLocaleString()} ETB</td>
                        <td>
                          <strong style={{ color: "#38bdf8" }}>{parseFloat(h.new_price).toLocaleString()} ETB</strong>
                        </td>
                        <td>{h.changed_by_username || h.staff_first_name || "Admin"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setHistoryModalService(null)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

export default AdminServicePricing;
