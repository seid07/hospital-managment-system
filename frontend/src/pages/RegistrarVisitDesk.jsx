import { useState, useEffect } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { searchPatients, createPatient } from "../services/patientService";
import { serviceCatalogService } from "../services/serviceCatalogService";
import { visitService } from "../services/visitService";
import { serviceOrderService } from "../services/serviceOrderService";
import { recordPayment } from "../services/billingService";

export default function RegistrarVisitDesk() {
  // Search & Patient selection
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // New Patient Modal state
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "Male",
    phone: "+251-",
    email: "",
    address: "Addis Ababa",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  // Services Catalog
  const [catalog, setCatalog] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Visit & Order options
  const [visitType, setVisitType] = useState("OUTPATIENT");
  const [visitNotes, setVisitNotes] = useState("");
  const [emergencyOverride, setEmergencyOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // Payment Options
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [transactionRef, setTransactionRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Workflow processing states
  const [processing, setProcessing] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const data = await serviceCatalogService.getServices({ activeOnly: true });
        if (!cancelled) {
          setCatalog(data || []);
          setLoadingCatalog(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load catalog:", err);
          setLoadingCatalog(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      setIsSearching(true);
      const res = await searchPatients(searchQuery.trim());
      setSearchResults(res.patients || []);
    } catch (err) {
      console.error("Patient search error:", err);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleCreatePatientSubmit(e) {
    e.preventDefault();
    try {
      setProcessing(true);
      const created = await createPatient(newPatient);
      setSelectedPatient(created);
      setShowNewPatientModal(false);
      setErrorMessage("");
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || "Failed to register patient.");
    } finally {
      setProcessing(false);
    }
  }

  function toggleServiceSelection(service) {
    if (selectedServices.some((s) => s.id === service.id)) {
      setSelectedServices(selectedServices.filter((s) => s.id !== service.id));
    } else {
      setSelectedServices([...selectedServices, { ...service, notes: "" }]);
    }
  }

  const subtotal = selectedServices.reduce((sum, s) => sum + parseFloat(s.price || 0), 0);

  async function handleProcessVisitWorkflow(e) {
    e.preventDefault();
    if (!selectedPatient) {
      setErrorMessage("Please select or register a patient first.");
      return;
    }
    if (selectedServices.length === 0) {
      setErrorMessage("Please select at least one service from the catalog.");
      return;
    }
    if (emergencyOverride && !overrideReason.trim()) {
      setErrorMessage("Please provide a clinical override reason for emergency triage.");
      return;
    }

    try {
      setProcessing(true);
      setErrorMessage("");

      // 1. Create Visit
      const visit = await visitService.createVisit({
        patientId: selectedPatient.id,
        visitType: emergencyOverride ? "EMERGENCY" : visitType,
        emergencyOverride,
        overrideReason: emergencyOverride ? overrideReason : null,
        notes: visitNotes || null,
      });

      // 2. Create Service Orders
      const orderItems = selectedServices.map((s) => ({
        serviceId: s.id,
        price: parseFloat(s.price),
        notes: s.notes || null,
      }));

      const orderResult = await serviceOrderService.createServiceOrders({
        visitId: visit.id,
        patientId: selectedPatient.id,
        items: orderItems,
        emergencyOverride,
        overrideReason,
        generateInvoice: !emergencyOverride && subtotal > 0,
      });

      let paymentResult = null;

      // 3. Process Cashier Payment if not emergency and payable
      if (!emergencyOverride && orderResult.invoice && subtotal > 0) {
        paymentResult = await recordPayment({
          invoiceId: orderResult.invoice.id,
          amount: subtotal,
          paymentMethod,
          transactionReference: transactionRef || null,
          notes: payNotes || "Front desk registration payment",
        });
      }

      // 4. Fetch full visit journey details with queue numbers
      const finalVisit = await visitService.getVisitById(visit.id);

      setSuccessReceipt({
        visit: finalVisit,
        patient: selectedPatient,
        orders: finalVisit.serviceOrders || orderResult.serviceOrders,
        invoice: orderResult.invoice,
        payment: paymentResult?.payment,
        emergencyOverride,
      });

      // Reset form
      setSelectedServices([]);
      setVisitNotes("");
      setOverrideReason("");
      setEmergencyOverride(false);
      setTransactionRef("");
      setPayNotes("");
    } catch (err) {
      console.error("Workflow processing error:", err);
      setErrorMessage(err.response?.data?.message || err.message || "Failed to process visit workflow.");
    } finally {
      setProcessing(false);
    }
  }

  // Group catalog by category
  const categories = Array.from(new Set(catalog.map((c) => c.category)));

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Front Desk & Intake</p>
          <h1>Registrar & Service Desk</h1>
          <p className="page-description">
            Service-first patient intake, service ordering, cashier payment collection, and instant department queue routing.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            onClick={() => setShowNewPatientModal(true)}
            className="button button-primary button-large"
          >
            + Register New Patient
          </button>
        </div>
      </div>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Success Receipt Modal / Banner */}
      {successReceipt && (
        <div className="receipt-banner">
          <div className="receipt-banner-header">
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--success)" }}>
                {successReceipt.emergencyOverride
                  ? "🚨 Emergency Visit Authorized & Routed!"
                  : "✓ Visit Created & Services Authorized!"}
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                Visit: <strong style={{ fontFamily: "monospace" }}>{successReceipt.visit.visit_number}</strong> | Patient:{" "}
                <strong>
                  {successReceipt.patient.first_name} {successReceipt.patient.last_name}
                </strong>{" "}
                ({successReceipt.patient.patient_number})
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="button button-primary"
                onClick={() => window.print()}
              >
                🖨️ Print Routing Slip
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSuccessReceipt(null)}
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="receipt-routing-grid">
            {successReceipt.orders.map((ord, idx) => (
              <div key={idx} className="receipt-routing-card">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span>{ord.department_name || ord.department_code}</span>
                  <span className="badge badge-success">{ord.status}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: "13px", marginTop: "4px", color: "var(--text)" }}>
                  {ord.service_name}
                </div>
                <div style={{ marginTop: "8px", borderTop: "1px solid var(--border)", paddingTop: "6px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Queue Token:</div>
                  <div className="receipt-token-badge">
                    {ord.queue_number || "ROUTED"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main 2-Column Desk Layout */}
      <div className="desk-layout">
        {/* Left Column: Patient Lookup & Emergency Options */}
        <div className="desk-left-col">
          {/* Patient Lookup Card */}
          <div className="patient-search-card">
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>🔍 Patient Lookup</h2>
            <form onSubmit={handleSearch} className="search-input-group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, Phone, or PAT-..."
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={isSearching} className="button button-primary">
                {isSearching ? "..." : "Find"}
              </button>
            </form>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && !selectedPatient && (
              <div className="search-results-list">
                {searchResults.map((pat) => (
                  <div
                    key={pat.id}
                    onClick={() => {
                      setSelectedPatient(pat);
                      setSearchResults([]);
                    }}
                    className="search-result-item"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: "13px" }}>
                      <span>{pat.first_name} {pat.last_name}</span>
                      <span style={{ color: "var(--primary)", fontFamily: "monospace", fontSize: "11px" }}>
                        {pat.patient_number}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {pat.gender} • DOB: {pat.date_of_birth ? new Date(pat.date_of_birth).toLocaleDateString() : "N/A"} • {pat.phone}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Patient Banner */}
            {selectedPatient && (
              <div className="selected-patient-banner">
                <div className="selected-patient-header">
                  <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--primary)" }}>
                    Selected Patient
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPatient(null)}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "12px", cursor: "pointer" }}
                  >
                    Change ✕
                  </button>
                </div>
                <div className="selected-patient-name">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </div>
                <div className="selected-patient-meta">
                  <div>ID: {selectedPatient.patient_number}</div>
                  <div>Phone: {selectedPatient.phone}</div>
                  <div>Gender: {selectedPatient.gender}</div>
                  <div>DOB: {selectedPatient.date_of_birth ? new Date(selectedPatient.date_of_birth).toLocaleDateString() : "N/A"}</div>
                </div>
              </div>
            )}
          </div>

          {/* Emergency Override Box */}
          <div className={`emergency-card ${emergencyOverride ? "active" : ""}`}>
            <div className="emergency-card-header">
              <label className="emergency-switch-label">
                <input
                  type="checkbox"
                  checked={emergencyOverride}
                  onChange={(e) => setEmergencyOverride(e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <span>🚨 Emergency Override</span>
              </label>
            </div>

            {emergencyOverride && (
              <div style={{ marginTop: "10px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#e11d48", lineHeight: 1.4 }}>
                  Authorizes immediate clinical care without upfront cashier payment. Must be clinically justified.
                </p>
                <textarea
                  rows="2"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Clinical reason (e.g. severe trauma, acute respiratory failure)..."
                  required
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Catalog & Order Checkout */}
        <div className="desk-right-col">
          {/* Service Catalog Selector */}
          <div className="catalog-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                🏥 Hospital Service Catalog ({catalog.length} Services)
              </h2>
              <span className="badge badge-info">{selectedServices.length} Selected</span>
            </div>

            {loadingCatalog ? (
              <div className="loading-state">Loading service catalog...</div>
            ) : (
              <div style={{ maxHeight: "360px", overflowY: "auto", paddingRight: "4px" }}>
                {categories.map((cat) => (
                  <div key={cat}>
                    <div className="catalog-category-header">{cat}</div>
                    <div className="service-grid">
                      {catalog
                        .filter((s) => s.category === cat)
                        .map((srv) => {
                          const isSelected = selectedServices.some((s) => s.id === srv.id);
                          return (
                            <div
                              key={srv.id}
                              onClick={() => toggleServiceSelection(srv)}
                              className={`service-item-card ${isSelected ? "selected" : ""}`}
                            >
                              <div className="service-item-info">
                                <div className="service-item-name">
                                  {isSelected && "✓ "}
                                  {srv.name}
                                </div>
                                <div className="service-item-dept">{srv.department_name}</div>
                              </div>
                              <div className="service-item-price">
                                <div className="service-price-amount">
                                  {parseFloat(srv.price) === 0 ? "Billed at Rx" : `${srv.price} ${srv.currency}`}
                                </div>
                                <div className="service-price-location">{srv.payment_location}</div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cashier Payment & Visit Completion */}
          <div className="checkout-card">
            <div className="checkout-header">
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                Order Summary & Cashier Payment
              </h2>
              <div>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginRight: "8px" }}>Total Due:</span>
                <span className="checkout-total-value">{subtotal.toFixed(2)} ETB</span>
              </div>
            </div>

            {!emergencyOverride && subtotal > 0 && (
              <div className="checkout-form-row">
                <div className="form-field">
                  <label>Payment Method *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CBE_BIRR">CBE Birr</option>
                    <option value="BANK">Bank Transfer</option>
                    <option value="CARD">Card / POS</option>
                    <option value="INSURANCE">Insurance</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Transaction / Ref #</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. TXN-987654"
                  />
                </div>

                <div className="form-field">
                  <label>Payment Notes</label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Receipt notes..."
                  />
                </div>

                <div className="form-field">
                  <label>Visit Type</label>
                  <select
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value)}
                  >
                    <option value="OUTPATIENT">Outpatient Consultation</option>
                    <option value="EMERGENCY">Emergency Intake</option>
                    <option value="INPATIENT">Inpatient Admission</option>
                  </select>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleProcessVisitWorkflow}
              disabled={processing || !selectedPatient || selectedServices.length === 0}
              className={`button ${emergencyOverride ? "button-danger" : "button-primary"} checkout-action-btn`}
            >
              {processing ? (
                "Authorizing & Routing Services..."
              ) : emergencyOverride ? (
                "🚨 Authorize Immediate Emergency Care"
              ) : (
                `💳 Collect Payment & Authorize Services (${subtotal.toFixed(2)} ETB)`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* New Patient Registration Modal */}
      <Modal
        isOpen={showNewPatientModal}
        onClose={() => setShowNewPatientModal(false)}
        title="Register New Patient"
      >
        <form onSubmit={handleCreatePatientSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>First Name *</label>
              <input
                type="text"
                required
                value={newPatient.firstName}
                onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Last Name *</label>
              <input
                type="text"
                required
                value={newPatient.lastName}
                onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>Date of Birth *</label>
              <input
                type="date"
                required
                value={newPatient.dateOfBirth}
                onChange={(e) => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Gender *</label>
              <select
                value={newPatient.gender}
                onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label>Phone Number *</label>
              <input
                type="text"
                required
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Address / City</label>
              <input
                type="text"
                value={newPatient.address}
                onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowNewPatientModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={processing}>
              {processing ? "Saving..." : "Save Patient"}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
