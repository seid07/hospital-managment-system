import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import StatusBadge from "../components/common/StatusBadge";
import Pagination from "../components/common/Pagination";
import Modal from "../components/common/Modal";
import PrintableDocument from "../components/common/PrintableDocument";
import {
  getPrescriptions,
  dispenseMultiplePrescriptions,
} from "../services/pharmacyService";
import { useAuth } from "../context/useAuth";
import { useDebounce } from "../hooks/useDebounce";
import { formatCurrency } from "../utils/currency";
import { useCalendar } from "../context/useCalendar";

function PrescriptionsList() {
  const { user } = useAuth();
  const { formatDate, formatDateTime } = useCalendar();
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
  const debouncedSearch = useDebounce(searchInput, 300);

  // Multi-dispense selection per patient: { [patientId]: Set<rxId> }
  const [selectedRxsByPatient, setSelectedRxsByPatient] = useState({});
  // Expanded patient profile cards: { [patientId]: boolean }
  const [expandedPatients, setExpandedPatients] = useState({});

  // Payment & Dispense modal for grouped selection
  const [groupDispenseTarget, setGroupDispenseTarget] = useState(null); // { patient, rxs: [...] }
  const [payMethod, setPayMethod] = useState("CASH");
  const [txRef, setTxRef] = useState("");
  const [dispenseNotes, setDispenseNotes] = useState("");
  const [dispensing, setDispensing] = useState(false);
  const [dispenseError, setDispenseError] = useState("");

  // Receipt prompt state (Requirement 4)
  const [showDispenseReceiptPrompt, setShowDispenseReceiptPrompt] = useState(false);
  const [paidDispenseReceiptData, setPaidDispenseReceiptData] = useState(null);
  const [showDispensePrintModal, setShowDispensePrintModal] = useState(false);

  // Print modal
  const [printTarget, setPrintTarget] = useState(null);

  // Real-time polling every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setReloadKey((prev) => prev + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPrescriptions() {
      try {
        setError("");
        const res = await getPrescriptions({
          page,
          limit: 50,
          status: statusFilter,
          search: debouncedSearch.trim(),
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
  }, [page, statusFilter, debouncedSearch, reloadKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
  }

  function togglePatientExpand(patientId) {
    setExpandedPatients((prev) => ({
      ...prev,
      [patientId]: !prev[patientId],
    }));
  }

  // Toggle selection of an individual prescription for a patient
  function handleToggleRx(patientId, rxId) {
    setSelectedRxsByPatient((prev) => {
      const currentSet = new Set(prev[patientId] || []);
      if (currentSet.has(rxId)) {
        currentSet.delete(rxId);
      } else {
        currentSet.add(rxId);
      }
      return { ...prev, [patientId]: currentSet };
    });
  }

  // Toggle select all active prescriptions for a patient
  function handleToggleSelectAll(patientId, patientRxs) {
    const activeRxs = patientRxs.filter((r) => ["ACTIVE", "PAID"].includes(r.status));
    setSelectedRxsByPatient((prev) => {
      const currentSet = prev[patientId] || new Set();
      const allSelected = activeRxs.length > 0 && activeRxs.every((r) => currentSet.has(r.id));
      if (allSelected) {
        return { ...prev, [patientId]: new Set() };
      }
      return { ...prev, [patientId]: new Set(activeRxs.map((r) => r.id)) };
    });
  }

  function handleOpenGroupDispense(patientGroup) {
    const selectedIds = selectedRxsByPatient[patientGroup.patient_id] || new Set();
    const activeSelected = patientGroup.prescriptions.filter((r) => selectedIds.has(r.id));
    if (activeSelected.length === 0) return;

    setGroupDispenseTarget({
      patient: patientGroup,
      rxs: activeSelected,
    });
    setPayMethod("CASH");
    setTxRef("");
    setDispenseNotes("");
    setDispenseError("");
  }

  async function handleGroupDispenseSubmit(e) {
    e.preventDefault();
    setDispenseError("");
    if (!groupDispenseTarget || groupDispenseTarget.rxs.length === 0) return;

    try {
      setDispensing(true);
      const rxIds = groupDispenseTarget.rxs.map((r) => r.id);
      const totalPaid = groupDispenseTarget.rxs.reduce(
        (sum, r) => sum + (parseFloat(r.unit_price || 25) * parseInt(r.quantity || 1, 10)),
        0
      );

      await dispenseMultiplePrescriptions({
        prescriptionIds: rxIds,
        paymentMethod: payMethod,
        transactionReference: txRef || null,
        dispensedNotes: dispenseNotes || `Dispensed ${rxIds.length} medications`,
      });

      const receipt = {
        receiptNumber: `PHARM-REC-${Date.now().toString().slice(-6)}`,
        patientName: `${groupDispenseTarget.patient.patient_first_name} ${groupDispenseTarget.patient.patient_last_name}`,
        patientNumber: groupDispenseTarget.patient.patient_number,
        doctorName: groupDispenseTarget.patient.doctor_first_name
          ? `Dr. ${groupDispenseTarget.patient.doctor_first_name} ${groupDispenseTarget.patient.doctor_last_name}`
          : "Attending Doctor",
        totalPaid,
        paymentMethod: payMethod,
        transactionReference: txRef || "—",
        date: new Date().toLocaleString(),
        items: groupDispenseTarget.rxs,
        count: rxIds.length,
      };

      setPaidDispenseReceiptData(receipt);
      setSuccess(`Successfully dispensed ${rxIds.length} medication(s) for ${groupDispenseTarget.patient.patient_first_name} ${groupDispenseTarget.patient.patient_last_name}.`);
      setGroupDispenseTarget(null);
      // Clear patient selection
      setSelectedRxsByPatient((prev) => ({ ...prev, [groupDispenseTarget.patient.patient_id]: new Set() }));
      setReloadKey((prev) => prev + 1);
      setShowDispenseReceiptPrompt(true);
    } catch (err) {
      setDispenseError(err.response?.data?.message || err.message || "Failed to dispense medications.");
    } finally {
      setDispensing(false);
    }
  }

  function handleOpenDispense(rx) {
    setGroupDispenseTarget({
      patient: {
        patient_id: rx.patient_id,
        patient_number: rx.patient_number,
        patient_first_name: rx.patient_first_name,
        patient_last_name: rx.patient_last_name,
        doctor_first_name: rx.doctor_first_name,
        doctor_last_name: rx.doctor_last_name,
      },
      rxs: [rx],
    });
    setPayMethod("CASH");
    setTxRef("");
    setDispenseNotes("");
    setDispenseError("");
  }

  // Group prescriptions by patient & calculate latest order time
  const patientGroups = prescriptions.reduce((acc, rx) => {
    const key = rx.patient_id;
    if (!acc[key]) {
      acc[key] = {
        patient_id: rx.patient_id,
        patient_number: rx.patient_number,
        patient_first_name: rx.patient_first_name,
        patient_last_name: rx.patient_last_name,
        doctor_first_name: rx.doctor_first_name,
        doctor_last_name: rx.doctor_last_name,
        created_at: rx.created_at,
        latest_order_at: rx.created_at,
        prescriptions: [],
      };
    }
    acc[key].prescriptions.push(rx);
    if (new Date(rx.created_at) > new Date(acc[key].latest_order_at)) {
      acc[key].latest_order_at = rx.created_at;
    }
    return acc;
  }, {});

  // Sort patients so the one with the latest order is at the very TOP
  const groupedList = Object.values(patientGroups).sort(
    (a, b) => new Date(b.latest_order_at) - new Date(a.latest_order_at)
  );

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Pharmacy & Formulary Station</p>
          <h1>Medication Prescriptions & Dispensing</h1>
          <p className="page-description">
            Grouped patient prescriptions queue (sorted by latest doctor order in real-time). Click a patient to view and select medicines.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setReloadKey((k) => k + 1)}
            style={{ fontSize: "12px" }}
          >
            ↻ Live Refresh
          </button>
          <Link to="/pharmacy/inventory" className="button button-secondary">
             Formulary Inventory
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
            placeholder="Live search by patient name, PAT #, Rx #, or medication..."
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
            <option value="ACTIVE">Active (Pending Payment / Dispensing)</option>
            <option value="PAID">Paid (Awaiting Handover)</option>
            <option value="DISPENSED">Dispensed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <button type="submit" className="button button-primary">
            Search
          </button>
        </form>
      </section>

      {/* Grouped Prescription Cards by Patient Profile */}
      <section>
        {loading ? (
          <div className="loading-state">Loading pharmacy queue...</div>
        ) : groupedList.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"></div>
              <h3>No prescriptions found</h3>
              <p>Doctor prescribed medications will appear here automatically grouped by patient.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {groupedList.map((group, index) => {
              const isExpanded = expandedPatients[group.patient_id] !== undefined ? expandedPatients[group.patient_id] : (index === 0);
              const selectedIds = selectedRxsByPatient[group.patient_id] || new Set();
              const activeRxs = group.prescriptions.filter((r) => ["ACTIVE", "PAID"].includes(r.status));
              const selectedRxs = group.prescriptions.filter((r) => selectedIds.has(r.id));
              const selectedTotal = selectedRxs.reduce((sum, r) => {
                const price = parseFloat(r.unit_price || 25);
                const qty = parseInt(r.quantity || 1, 10);
                return sum + price * qty;
              }, 0);
              const totalActiveDue = activeRxs.reduce((sum, r) => {
                const price = parseFloat(r.unit_price || 25);
                const qty = parseInt(r.quantity || 1, 10);
                return sum + price * qty;
              }, 0);
              const allActiveSelected = activeRxs.length > 0 && activeRxs.every((r) => selectedIds.has(r.id));

              return (
                <div
                  key={group.patient_id}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${activeRxs.length > 0 ? "var(--primary)" : "var(--border)"}`,
                    padding: "0",
                    overflow: "hidden",
                  }}
                >
                  {/* Patient Profile Header (Click to expand/collapse) */}
                  <div
                    onClick={() => togglePatientExpand(group.patient_id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 20px",
                      background: isExpanded ? "var(--surface-muted)" : "var(--surface)",
                      cursor: "pointer",
                      borderBottom: isExpanded ? "1px solid var(--border)" : "none",
                      flexWrap: "wrap",
                      gap: "12px",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <div
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "16px",
                          flexShrink: 0,
                        }}
                      >
                        {group.patient_first_name ? group.patient_first_name[0].toUpperCase() : "P"}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>
                            {group.patient_first_name} {group.patient_last_name}
                          </h2>
                          <span style={{ fontFamily: "monospace", fontSize: "12px", background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                            {group.patient_number}
                          </span>
                          {index === 0 && (
                            <span style={{ fontSize: "10px", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                              LATEST ORDER
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                          Doctor: <strong>Dr. {group.doctor_first_name} {group.doctor_last_name}</strong> • Last Ordered:{" "}
                          <span style={{ color: "var(--primary-dark)", fontWeight: 600 }}>
                            {formatDateTime(group.latest_order_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                          {group.prescriptions.length} Med{group.prescriptions.length !== 1 ? "s" : ""} ({activeRxs.length} pending)
                        </div>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: activeRxs.length > 0 ? "var(--success)" : "var(--text-muted)", fontFamily: "monospace" }}>
                          {formatCurrency(totalActiveDue)}
                        </div>
                      </div>

                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-light)", padding: "6px 12px", borderRadius: "6px" }}>
                        {isExpanded ? "▲ Hide Medicines" : "▼ View Medicines"}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Medicine List with Checkboxes & Total Calculation */}
                  {isExpanded && (
                    <div style={{ padding: "18px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                          Prescribed Medication Items:
                        </div>
                        {activeRxs.length > 1 && ["ADMIN", "PHARMACIST"].includes(user?.role) && (
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ fontSize: "11px", padding: "4px 10px" }}
                            onClick={() => handleToggleSelectAll(group.patient_id, group.prescriptions)}
                          >
                            {allActiveSelected ? "Deselect All" : "Select All Active"}
                          </button>
                        )}
                      </div>

                      <div className="table-wrapper" style={{ margin: 0 }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              {["ADMIN", "PHARMACIST"].includes(user?.role) && <th style={{ width: "45px" }}>Select</th>}
                              <th>Rx #</th>
                              <th>Medication & Regimen</th>
                              <th>Qty</th>
                              <th>Stock</th>
                              <th>Unit Price</th>
                              <th>Total Due</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.prescriptions.map((rx) => {
                              const unitPrice = parseFloat(rx.unit_price || 25);
                              const qty = parseInt(rx.quantity || 1, 10);
                              const lineTotal = unitPrice * qty;
                              const isSelected = selectedIds.has(rx.id);
                              const isLowStock = rx.current_stock !== undefined && rx.current_stock !== null && rx.current_stock < 15;
                              const canSelect = ["ACTIVE", "PAID"].includes(rx.status) && ["ADMIN", "PHARMACIST"].includes(user?.role);

                              return (
                                <tr key={rx.id} style={{ background: isSelected ? "var(--primary-light)" : "transparent" }}>
                                  {["ADMIN", "PHARMACIST"].includes(user?.role) && (
                                    <td>
                                      {canSelect ? (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => handleToggleRx(group.patient_id, rx.id)}
                                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                                        />
                                      ) : (
                                        <span style={{ color: "var(--text-muted)" }}>—</span>
                                      )}
                                    </td>
                                  )}
                                  <td>
                                    <strong style={{ fontFamily: "monospace", color: "var(--primary)" }}>
                                      {rx.prescription_number}
                                    </strong>
                                  </td>
                                  <td>
                                    <strong>{rx.medication_name}</strong> {rx.dosage && `(${rx.dosage})`}
                                    <br />
                                    <small style={{ color: "var(--text-muted)" }}>
                                      {rx.frequency} • {rx.route} • {rx.duration || "as directed"}
                                      {rx.instructions && ` • Note: ${rx.instructions}`}
                                    </small>
                                  </td>
                                  <td style={{ fontWeight: 700 }}>{rx.quantity}</td>
                                  <td>
                                    {rx.current_stock !== undefined && rx.current_stock !== null ? (
                                      <span style={{ fontWeight: 600, color: isLowStock ? "var(--danger)" : "var(--success)" }}>
                                        {rx.current_stock} {isLowStock && <span className="badge badge-danger" style={{ fontSize: "9px", marginLeft: "4px" }}>LOW &lt; 15</span>}
                                      </span>
                                    ) : (
                                      <span style={{ color: "var(--text-muted)" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ fontFamily: "monospace" }}>{formatCurrency(unitPrice)}</td>
                                  <td>
                                    <strong style={{ color: "var(--success)", fontFamily: "monospace" }}>
                                      {formatCurrency(lineTotal)}
                                    </strong>
                                  </td>
                                  <td>
                                    <StatusBadge status={rx.status} />
                                  </td>
                                  <td>
                                    <div style={{ display: "flex", gap: "6px" }}>
                                      {["ACTIVE", "PAID"].includes(rx.status) && ["ADMIN", "PHARMACIST"].includes(user?.role) && (
                                        <button
                                          type="button"
                                          className="button button-primary"
                                          style={{ padding: "3px 8px", fontSize: "11px", fontWeight: 600 }}
                                          onClick={() => handleOpenDispense(rx)}
                                        >
                                          {rx.status === "ACTIVE" ? "Pay & Dispense" : "Dispense"}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="button button-secondary"
                                        style={{ padding: "3px 8px", fontSize: "11px" }}
                                        onClick={() => setPrintTarget(rx)}
                                      >
                                        Print
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary & Real-time Total Calculation for Selected Medicines */}
                      {["ADMIN", "PHARMACIST"].includes(user?.role) && activeRxs.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: "14px",
                            padding: "12px 16px",
                            background: "var(--surface-sunken)",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            flexWrap: "wrap",
                            gap: "10px",
                          }}
                        >
                          <div style={{ fontSize: "13px" }}>
                            Selected Medications: <strong>{selectedRxs.length}</strong> of {activeRxs.length}
                            <span style={{ marginLeft: "16px" }}>
                              Selected Total:{" "}
                              <strong style={{ color: "var(--success)", fontSize: "16px", fontFamily: "monospace" }}>
                                {formatCurrency(selectedTotal)}
                              </strong>
                            </span>
                          </div>

                          <button
                            type="button"
                            className="button button-primary"
                            disabled={selectedRxs.length === 0 || dispensing}
                            onClick={() => handleOpenGroupDispense(group)}
                          >
                            Collect Payment & Dispense Selected ({selectedRxs.length}) →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={(p) => setPage(p)}
        />
      </section>

      {/* Modal: Group Dispensing & Pharmacy Counter Payment */}
      <Modal
        isOpen={Boolean(groupDispenseTarget)}
        onClose={() => setGroupDispenseTarget(null)}
        title="Collect Pharmacy Payment & Dispense Medications"
        maxWidth="650px"
      >
        {dispenseError && <div className="alert alert-error">{dispenseError}</div>}
        {groupDispenseTarget && (
          <form onSubmit={handleGroupDispenseSubmit}>
            <div style={{ background: "var(--primary-light)", padding: "14px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "13px" }}>
              <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px" }}>
                Patient: {groupDispenseTarget.patient.patient_first_name} {groupDispenseTarget.patient.patient_last_name} ({groupDispenseTarget.patient.patient_number})
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                Doctor: Dr. {groupDispenseTarget.patient.doctor_first_name} {groupDispenseTarget.patient.doctor_last_name}
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>Selected Medications to Dispense ({groupDispenseTarget.rxs.length}):</h4>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", lineHeight: "1.6" }}>
                {groupDispenseTarget.rxs.map((r) => {
                  const unitPrice = parseFloat(r.unit_price || 25);
                  const qty = parseInt(r.quantity || 1, 10);
                  return (
                    <li key={r.id}>
                      <strong>{r.medication_name}</strong> ({r.dosage || "Standard"}) — {qty} units @ {formatCurrency(unitPrice)} = <strong style={{ color: "var(--success)" }}>{formatCurrency(unitPrice * qty)}</strong>
                    </li>
                  );
                })}
              </ul>
              <div style={{ marginTop: "10px", textAlign: "right", fontSize: "15px" }}>
                Total Payment Due: <strong style={{ color: "var(--success)", fontSize: "17px", fontFamily: "monospace" }}>
                  {formatCurrency(
                    groupDispenseTarget.rxs.reduce((sum, r) => sum + (parseFloat(r.unit_price || 25) * parseInt(r.quantity || 1, 10)), 0)
                  )}
                </strong>
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", padding: "12px", borderRadius: "8px", marginBottom: "14px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: "var(--primary)" }}>Payment Collection Details</h4>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className="form-field">
                  <label>Payment Method *</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                    <option value="CARD">Card / POS</option>
                    <option value="BANK">Bank Transfer</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Transaction / Ref #</label>
                  <input
                    placeholder="e.g. TXN-123456"
                    value={txRef}
                    onChange={(e) => setTxRef(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-field">
              <label>Pharmacist Verification Notes</label>
              <textarea
                rows="2"
                placeholder="Dosage verified. Patient instructed on administration precautions."
                value={dispenseNotes}
                onChange={(e) => setDispenseNotes(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" className="button button-secondary" onClick={() => setGroupDispenseTarget(null)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={dispensing}>
                {dispensing ? "Processing Dispense..." : "✓ Confirm Payment & Dispense Selected"}
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
            date={formatDate(printTarget.created_at)}
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
                Pharmacist Signature
              </div>
            </div>
          </PrintableDocument>
        )}
      </Modal>

      {/* Requirement 4: Pharmacy Dispense Receipt Prompt Modal */}
      {showDispenseReceiptPrompt && paidDispenseReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => setShowDispenseReceiptPrompt(false)}
          title="Medications Dispensed — Do You Want a Receipt?"
        >
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>💊</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--success)" }}>Medications Dispensed & Payment Recorded!</h3>
            <p style={{ fontSize: "14px", color: "var(--text-main)", marginBottom: "14px" }}>
              Payment of <strong>{formatCurrency(paidDispenseReceiptData.totalPaid)}</strong> recorded and{" "}
              <strong>{paidDispenseReceiptData.count}</strong> medication(s) dispensed for{" "}
              <strong>{paidDispenseReceiptData.patientName}</strong> ({paidDispenseReceiptData.patientNumber}).
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>
              Do you want to print an official dispensary transaction receipt for the patient?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowDispenseReceiptPrompt(false)}
                style={{ minWidth: "150px" }}
              >
                No, Return to Queue
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setShowDispenseReceiptPrompt(false);
                  setShowDispensePrintModal(true);
                }}
                style={{ minWidth: "150px" }}
              >
                🖨 Yes, Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable Pharmacy Dispensary Receipt Modal */}
      {showDispensePrintModal && paidDispenseReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => setShowDispensePrintModal(false)}
          title="Print Pharmacy Dispensary Receipt"
        >
          <PrintableDocument
            title="OFFICIAL PHARMACY DISPENSARY RECEIPT"
            subtitle="Department of Pharmacy Operations"
            documentNumber={paidDispenseReceiptData.receiptNumber}
            date={paidDispenseReceiptData.date}
          >
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div>
                  <strong>Patient Name:</strong> {paidDispenseReceiptData.patientName}<br />
                  <strong>Patient Number:</strong> {paidDispenseReceiptData.patientNumber}
                </div>
                <div>
                  <strong>Payment Method:</strong> {paidDispenseReceiptData.paymentMethod}<br />
                  <strong>Reference #:</strong> {paidDispenseReceiptData.transactionReference}
                </div>
              </div>

              <table className="data-table" style={{ width: "100%", marginBottom: "16px" }}>
                <thead>
                  <tr>
                    <th>Medication Name</th>
                    <th>Dosage & Instructions</th>
                    <th>Qty</th>
                    <th style={{ textAlign: "right" }}>Price (ETB)</th>
                  </tr>
                </thead>
                <tbody>
                  {paidDispenseReceiptData.items?.map((item, idx) => {
                    const price = parseFloat(item.unit_price || 25) * parseInt(item.quantity || 1, 10);
                    return (
                      <tr key={idx}>
                        <td><strong>{item.medication_name}</strong></td>
                        <td>{item.dosage} • {item.frequency}</td>
                        <td>{item.quantity}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="3">Total Amount Paid</th>
                    <th style={{ textAlign: "right", color: "var(--success)", fontSize: "15px" }}>
                      {formatCurrency(paidDispenseReceiptData.totalPaid)}
                    </th>
                  </tr>
                </tfoot>
              </table>

              <div style={{ marginTop: "24px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b" }}>
                <span>Prescribed by: {paidDispenseReceiptData.doctorName}</span>
                <span style={{ borderTop: "1px solid #94a3b8", width: "180px", textAlign: "center", paddingTop: "4px" }}>
                  Dispensing Pharmacist
                </span>
              </div>
            </div>
          </PrintableDocument>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowDispensePrintModal(false)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

export default PrescriptionsList;
