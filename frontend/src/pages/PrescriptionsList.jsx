import { useEffect, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import {
  getPrescriptions,
  dispensePrescription,
} from "../services/pharmacyService";
import { useAuth } from "../context/useAuth";

function PrescriptionsList() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [, startTransition] = useTransition();

  // Dispense modal
  const [dispenseTarget, setDispenseTarget] = useState(null);
  const [dispenseNotes, setDispenseNotes] = useState("");
  const [dispensing, setDispensing] = useState(false);
  const [dispenseError, setDispenseError] = useState("");

  // Print modal
  const [printTarget, setPrintTarget] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPrescriptions() {
      try {
        setError("");
        const res = await getPrescriptions({
          page,
          limit: 15,
          status: statusFilter,
          search: searchTerm,
        });
        if (!cancelled && res.data) {
          setPrescriptions(res.data);
          setTotal(res.pagination?.total || 0);
          setTotalPages(res.pagination?.totalPages || 1);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load prescriptions.");
          setLoading(false);
        }
      }
    }

    loadPrescriptions();
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, searchTerm, reloadKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    startTransition(() => {
      setSearchTerm(searchInput.trim());
    });
  }

  async function handleDispenseSubmit(e) {
    e.preventDefault();
    setDispenseError("");
    try {
      setDispensing(true);
      await dispensePrescription(dispenseTarget.id, dispenseNotes);
      setSuccess(`Prescription #${dispenseTarget.prescription_number} dispensed.`);
      setDispenseTarget(null);
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setDispenseError(err.message || "Failed to dispense medication.");
    } finally {
      setDispensing(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Pharmacy & Dispensing</p>
          <h1>Medication Prescriptions Queue</h1>
          <p className="page-description">
            Process physician prescriptions, review dosage regimens, and dispense medications.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/pharmacy/inventory" className="button button-secondary">
            📦 Formulary Inventory
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filters */}
      <section className="card" style={{ marginBottom: "20px" }}>
        <form onSubmit={handleSearchSubmit} className="form-grid" style={{ gridTemplateColumns: "1fr 200px 100px", gap: "10px" }}>
          <input
            type="search"
            placeholder="Search Rx #, medication, or patient name..."
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
            <option value="ACTIVE">Active (Pending Dispensing)</option>
            <option value="DISPENSED">Dispensed</option>
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
          <div className="loading-state">Loading pharmacy queue...</div>
        ) : prescriptions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💊</div>
            <h3>No prescriptions found</h3>
            <p>No prescriptions match your search criteria.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rx #</th>
                  <th>Patient</th>
                  <th>Medication & Strength</th>
                  <th>Dosage / Instructions</th>
                  <th>Quantity</th>
                  <th>Prescribing Doctor</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((rx) => (
                  <tr key={rx.id}>
                    <td>
                      <strong>{rx.prescription_number}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>
                        {new Date(rx.created_at).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      <Link to={`/patients/${rx.patient_id}`} style={{ fontWeight: 600, color: "var(--primary)" }}>
                        {rx.patient_first_name} {rx.patient_last_name}
                      </Link>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{rx.patient_number}</small>
                    </td>
                    <td>
                      <strong style={{ color: "var(--primary)" }}>{rx.medication_name}</strong>
                      <br />
                      <small style={{ color: "var(--text-muted)" }}>{rx.dosage}</small>
                    </td>
                    <td>
                      <span>{rx.frequency} ({rx.route})</span>
                      {rx.instructions && (
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          &ldquo;{rx.instructions}&rdquo;
                        </div>
                      )}
                    </td>
                    <td><strong>{rx.quantity}</strong> units</td>
                    <td>Dr. {rx.doctor_first_name} {rx.doctor_last_name}</td>
                    <td>
                      <StatusBadge status={rx.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {rx.status === "ACTIVE" && ["ADMIN", "PHARMACIST"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => {
                              setDispenseTarget(rx);
                              setDispenseNotes("");
                            }}
                          >
                            Dispense →
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => setPrintTarget(rx)}
                        >
                          Print Rx
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

      {/* Modal: Dispense */}
      <Modal isOpen={Boolean(dispenseTarget)} onClose={() => setDispenseTarget(null)} title="Dispense Prescription">
        {dispenseError && <div className="alert alert-error">{dispenseError}</div>}
        {dispenseTarget && (
          <form onSubmit={handleDispenseSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div><strong>Rx #:</strong> {dispenseTarget.prescription_number}</div>
              <div><strong>Medication:</strong> {dispenseTarget.medication_name} ({dispenseTarget.dosage})</div>
              <div><strong>Patient:</strong> {dispenseTarget.patient_first_name} {dispenseTarget.patient_last_name}</div>
              <div><strong>Quantity to Dispense:</strong> {dispenseTarget.quantity} units</div>
            </div>

            <div className="form-field">
              <label>Pharmacist Verification Notes / Batch #</label>
              <textarea
                rows="2"
                placeholder="e.g. Batch #EXP-2027-04 verified. Patient instructed on meal timing."
                value={dispenseNotes}
                onChange={(e) => setDispenseNotes(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setDispenseTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={dispensing}>
                {dispensing ? "Dispensing..." : "✓ Confirm Dispense & Deduct Stock"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Print Prescription Slip */}
      <Modal isOpen={Boolean(printTarget)} onClose={() => setPrintTarget(null)} title="Print Hospital Prescription Slip" maxWidth="700px">
        {printTarget && (
          <PrintableDocument
            title="OFFICIAL HOSPITAL MEDICAL PRESCRIPTION"
            subtitle="Department of Pharmacy & Clinical Pharmacology"
            documentNumber={printTarget.prescription_number}
            date={new Date(printTarget.created_at).toLocaleDateString()}
          >
            <div style={{ borderBottom: "1px solid #eee", paddingBottom: "12px", marginBottom: "16px" }}>
              <table style={{ width: "100%", fontSize: "13px" }}>
                <tbody>
                  <tr>
                    <td><strong>Patient Name:</strong> {printTarget.patient_first_name} {printTarget.patient_last_name}</td>
                    <td><strong>Patient ID:</strong> {printTarget.patient_number}</td>
                  </tr>
                  <tr>
                    <td><strong>Prescribing Physician:</strong> Dr. {printTarget.doctor_first_name} {printTarget.doctor_last_name}</td>
                    <td><strong>Specialty:</strong> {printTarget.doctor_specialty || "Clinical"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ margin: "20px 0", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#1769aa", marginBottom: "6px" }}>
                Rx: {printTarget.medication_name} ({printTarget.dosage})
              </div>
              <div style={{ fontSize: "14px", marginTop: "8px" }}>
                <strong>Sig / Regimen:</strong> {printTarget.frequency} via {printTarget.route} route for {printTarget.duration || "as directed"}.
              </div>
              <div style={{ fontSize: "14px", marginTop: "4px" }}>
                <strong>Dispense Quantity:</strong> {printTarget.quantity} units
              </div>
              {printTarget.instructions && (
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
                  <strong>Instructions:</strong> {printTarget.instructions}
                </div>
              )}
            </div>

            <div style={{ marginTop: "32px", fontSize: "12px", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div>Status: <strong>{printTarget.status}</strong></div>
              </div>
              <div style={{ textAlign: "right", borderTop: "1px solid #333", width: "200px", paddingTop: "4px" }}>
                Physician Signature
              </div>
            </div>
          </PrintableDocument>
        )}
      </Modal>
    </AppShell>
  );
}

export default PrescriptionsList;
