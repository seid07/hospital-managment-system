import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import StatCard from "../components/common/StatCard";
import PrintableDocument from "../components/common/PrintableDocument";
import { searchPatients, createPatient, deletePatient } from "../services/patientService";
import { serviceCatalogService } from "../services/serviceCatalogService";
import { visitService } from "../services/visitService";
import { serviceOrderService } from "../services/serviceOrderService";
import { recordPayment, recordSelectivePayment, getPendingCashierOrders, getPendingCashierOrdersGrouped } from "../services/billingService";
import { getDashboardKPIs } from "../services/reportService";
import { getDoctors } from "../services/scheduleService";
import { getAvailability, createAppointment } from "../services/appointmentService";
import { formatCurrency } from "../utils/currency";
import { validateEthiopianPhone } from "../utils/phone";
import { useDebounce } from "../hooks/useDebounce";

export default function RegistrarVisitDesk() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  // Active Tab
  const [activeTab, setActiveTab] = useState(tabFromUrl === "PENDING_ORDERS" ? "PENDING_ORDERS" : "NEW_VISIT");

  // Keep activeTab in sync with the ?tab= URL param without a synchronous
  // setState-in-effect (which triggers an extra cascading render). Instead we
  // detect the param change during render itself, which React explicitly
  // supports and bails out of before painting.
  const [prevTabFromUrl, setPrevTabFromUrl] = useState(tabFromUrl);
  if (tabFromUrl !== prevTabFromUrl) {
    setPrevTabFromUrl(tabFromUrl);
    if (tabFromUrl === "PENDING_ORDERS") {
      setActiveTab("PENDING_ORDERS");
    }
  }

  // Activity KPIs
  const [kpis, setKpis] = useState(null);

  // Search & Patient selection
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // New Patient Modal state
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    age: "",
    gender: "Male",
    phone: "09",
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

  // Doctor-Ordered Services Cashier Queue
  const [pendingOrders, setPendingOrders] = useState([]);
  const [ordersSearchInput, setOrdersSearchInput] = useState("");
  const debouncedOrdersSearch = useDebounce(ordersSearchInput, 300);

  // Multi-service payment modal state for doctor orders
  const [showPayOrderModal, setShowPayOrderModal] = useState(false);
  const [selectedPatientForPay, setSelectedPatientForPay] = useState(null); // { patient_id, patient_name, ... }
  const [patientPendingOrders, setPatientPendingOrders] = useState([]); // all pending orders for this patient
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set()); // Set of service_order_id
  const [orderPayMethod, setOrderPayMethod] = useState("CASH");
  const [orderTxnRef, setOrderTxnRef] = useState("");
  const [orderPayNotes, setOrderPayNotes] = useState("");

  // Auto-Appointment Booking State
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [todayDoctors, setTodayDoctors] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Registration Card payment popup (shown immediately after patient creation)
  const [showCardPayModal, setShowCardPayModal] = useState(false);
  const [cardPayInfo, setCardPayInfo] = useState(null); // { patientName, patientNumber, orderId, price }
  const [cardPayMethod, setCardPayMethod] = useState("CASH");
  const [cardPayTxnRef, setCardPayTxnRef] = useState("");
  const [cardPayNotes, setCardPayNotes] = useState("");
  const [cardPayEmergency, setCardPayEmergency] = useState(false);
  const [cardPayProcessing, setCardPayProcessing] = useState(false);
  const [cardPayError, setCardPayError] = useState("");

  // Receipt prompts state (Requirement 1 & Requirement 3)
  const [showCardReceiptPrompt, setShowCardReceiptPrompt] = useState(false);
  const [paidCardReceiptData, setPaidCardReceiptData] = useState(null);
  const [showCardPrintModal, setShowCardPrintModal] = useState(false);

  const [showCashierReceiptPrompt, setShowCashierReceiptPrompt] = useState(false);
  const [paidCashierReceiptData, setPaidCashierReceiptData] = useState(null);
  const [showCashierPrintModal, setShowCashierPrintModal] = useState(false);

  // Registration Card payment notice (shown in cashier queue tab after patient creation)
  const [regCardNotice, setRegCardNotice] = useState(null); // { patientName, orderId, price }

  // Grouped pending orders (by patient) & selection states
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [showGroupedView, setShowGroupedView] = useState(true);
  const [expandedOrderPatients, setExpandedOrderPatients] = useState({});
  const [selectedOrderIdsByPatient, setSelectedOrderIdsByPatient] = useState({});

  // Workflow processing states
  const [processing, setProcessing] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  // Auto-refresh pending queue in real-time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger((k) => k + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load initial catalog, KPIs & pending doctor orders
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const [catData, kpiData, ordersData, groupedData] = await Promise.all([
          serviceCatalogService.getServices({ activeOnly: true }),
          getDashboardKPIs(),
          getPendingCashierOrders({ search: debouncedOrdersSearch.trim() || undefined }),
          getPendingCashierOrdersGrouped({ search: debouncedOrdersSearch.trim() || undefined }),
        ]);
        if (!cancelled) {
          setCatalog(catData || []);
          setKpis(kpiData?.data || null);
          setPendingOrders(ordersData?.data || []);
          setGroupedOrders(groupedData?.data || []);
          setLoadingCatalog(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message || "Failed to load registrar desk data. Please refresh the page.");
          setLoadingCatalog(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger, debouncedOrdersSearch]);

  // Live debounced patient search
  useEffect(() => {
    if (!debouncedSearch.trim() || selectedPatient) {
      return;
    }

    let cancelled = false;
    async function performSearch() {
      try {
        const res = await searchPatients(debouncedSearch.trim());
        if (!cancelled) {
          setSearchResults(res.patients || []);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message || "Patient search failed. Please try again.");
        }
      }
    }

    performSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, selectedPatient]);

  async function handleCreatePatientSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    if (!validateEthiopianPhone(newPatient.phone)) {
      setErrorMessage("Enter a valid Ethiopian phone number starting with 09, 07, or +251.");
      return;
    }

    const ageNum = parseInt(newPatient.age, 10);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
      setErrorMessage("Please enter a valid age.");
      return;
    }

    try {
      setProcessing(true);
      const res = await createPatient({
        ...newPatient,
        age: ageNum,
      });
      const created = res.data;
      setSelectedPatient(created);
      setShowNewPatientModal(false);
      setErrorMessage("");

      // If a registration card order was auto-created, show the card payment popup first
      if (created.registrationOrderId) {
        setCardPayInfo({
          patientName: `${created.first_name} ${created.last_name}`,
          patientNumber: created.patient_number,
          orderId: created.registrationOrderId,
          price: created.registrationPrice,
        });
        setCardPayMethod("CASH");
        setCardPayTxnRef("");
        setCardPayNotes("");
        setCardPayError("");
        setCardPayProcessing(false);
        setShowCardPayModal(true);
        setRefreshTrigger((k) => k + 1);
        return;
      }

      // No card order — open appointment offer directly
      await openAppointmentOffer();
    } catch (err) {
      setErrorMessage(err.message || "Failed to register patient.");
    } finally {
      setProcessing(false);
    }
  }

  // Helper: load doctors and open the appointment booking popup
  async function openAppointmentOffer() {
    try {
      const docRes = await getDoctors({ date: today });
      const docs = docRes.data || [];
      setTodayDoctors(docs);
      if (docs.length > 0) setSelectedDocId(docs[0].id);
      setShowAppointmentModal(true);
    } catch (docErr) {
      setErrorMessage(
        docErr.message || "Patient registered, but the doctor list for same-day booking could not be loaded."
      );
    }
  }

  // Cancel card fee payment: if routine, delete draft patient to enforce mandatory card payment
  async function handleCancelCardPay() {
    if (selectedPatient?.id && !cardPayEmergency) {
      try {
        await deletePatient(selectedPatient.id);
      } catch (e) {
        console.error("Cleanup cancelled patient draft:", e);
      }
    }
    setShowCardPayModal(false);
    setSelectedPatient(null);
    setCardPayInfo(null);
    setErrorMessage("Patient registration cancelled. Card fee payment is mandatory before booking consultation.");
    setRefreshTrigger((k) => k + 1);
  }

  // Pay the registration card fee then prompt for receipt before consultation booking
  async function handlePayCardFee(e) {
    e.preventDefault();
    if (!cardPayInfo) return;

    // If emergency override is selected, bypass immediate payment
    if (cardPayEmergency) {
      setShowCardPayModal(false);
      setRefreshTrigger((k) => k + 1);
      await openAppointmentOffer();
      return;
    }

    try {
      setCardPayProcessing(true);
      setCardPayError("");
      const res = await recordSelectivePayment({
        serviceOrderIds: [cardPayInfo.orderId],
        paymentMethod: cardPayMethod,
        transactionReference: cardPayTxnRef || null,
        notes: cardPayNotes || `Registration card fee — ${cardPayInfo.patientName}`,
      });

      const receipt = {
        receiptNumber: res?.data?.paymentNumber || `REC-${Date.now().toString().slice(-6)}`,
        patientName: cardPayInfo.patientName,
        patientNumber: cardPayInfo.patientNumber,
        amount: cardPayInfo.price,
        paymentMethod: cardPayMethod,
        transactionReference: cardPayTxnRef || "—",
        date: new Date().toLocaleString(),
        description: "Patient Registration Card Fee",
      };

      setPaidCardReceiptData(receipt);
      setShowCardPayModal(false);
      setRefreshTrigger((k) => k + 1);
      setShowCardReceiptPrompt(true);
    } catch (err) {
      setCardPayError(err.message || "Payment failed. Please try again.");
    } finally {
      setCardPayProcessing(false);
    }
  }

  // Load slots for appointment modal
  useEffect(() => {
    if (!showAppointmentModal || !selectedDocId) {
      return;
    }

    let cancelled = false;
    async function loadSlots() {
      try {
        setLoadingSlots(true);
        const res = await getAvailability(selectedDocId, today);
        if (!cancelled) {
          const avail = (res.data || []).filter((s) => s.available);
          setAvailableSlots(avail);
          setSelectedSlot(avail.length > 0 ? avail[0] : null);
          setLoadingSlots(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [showAppointmentModal, selectedDocId, today]);

  async function handleBookConsultationAppointment() {
    if (!selectedPatient || !selectedDocId || !selectedSlot) return;
    try {
      setProcessing(true);
      await createAppointment({
        patientId: selectedPatient.id,
        doctorId: selectedDocId,
        appointmentDate: today,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        reason: "Front Desk Consultation Intake",
      });
      setShowAppointmentModal(false);
      setRefreshTrigger((k) => k + 1);
    } catch (err) {
      setErrorMessage(err.message || "Failed to book consultation appointment.");
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
      setRefreshTrigger((k) => k + 1);
    } catch (err) {
      console.error("Workflow processing error:", err);
      setErrorMessage(err.message || "Failed to process visit workflow.");
    } finally {
      setProcessing(false);
    }
  }

  // Open cashier payment modal for a patient's pending orders
  function handleOpenPayOrdersForPatient(patientId, initialOrderId = null) {
    const orders = pendingOrders.filter((o) => o.patient_id === patientId);
    if (orders.length === 0) return;

    const patientInfo = {
      patient_id: orders[0].patient_id,
      patient_number: orders[0].patient_number,
      patient_first_name: orders[0].patient_first_name,
      patient_last_name: orders[0].patient_last_name,
      patient_phone: orders[0].patient_phone,
      doctor_first_name: orders[0].doctor_first_name,
      doctor_last_name: orders[0].doctor_last_name,
      department_name: orders[0].department_name,
      created_at: orders[0].created_at,
    };

    setSelectedPatientForPay(patientInfo);
    setPatientPendingOrders(orders);
    setSelectedOrderIds(new Set(initialOrderId ? [initialOrderId] : orders.map((o) => o.service_order_id)));
    setOrderPayMethod("CASH");
    setOrderTxnRef("");
    setOrderPayNotes("");
    setShowPayOrderModal(true);
  }

  function handleToggleOrderSelection(orderId) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  function handleToggleSelectAllPatientOrders() {
    setSelectedOrderIds((prev) => {
      if (prev.size === patientPendingOrders.length) {
        return new Set();
      }
      return new Set(patientPendingOrders.map((o) => o.service_order_id));
    });
  }

  function toggleOrderPatientExpand(patientId) {
    setExpandedOrderPatients((prev) => ({
      ...prev,
      [patientId]: !prev[patientId],
    }));
  }

  function handleTogglePatientOrderCheckbox(patientId, orderId) {
    setSelectedOrderIdsByPatient((prev) => {
      const currentSet = new Set(prev[patientId] || []);
      if (currentSet.has(orderId)) {
        currentSet.delete(orderId);
      } else {
        currentSet.add(orderId);
      }
      return { ...prev, [patientId]: currentSet };
    });
  }

  function handleToggleSelectAllForGroup(patientId, orders) {
    setSelectedOrderIdsByPatient((prev) => {
      const currentSet = prev[patientId] || new Set();
      const allSelected = orders.length > 0 && orders.every((o) => currentSet.has(o.service_order_id));
      if (allSelected) {
        return { ...prev, [patientId]: new Set() };
      }
      return { ...prev, [patientId]: new Set(orders.map((o) => o.service_order_id)) };
    });
  }

  function handleOpenPayForGroupSelected(grp) {
    const selectedIds = selectedOrderIdsByPatient[grp.patient_id] || new Set();
    const activeSelectedOrders = (grp.orders || []).filter((o) => selectedIds.has(o.service_order_id));
    if (activeSelectedOrders.length === 0) return;

    setSelectedPatientForPay(grp);
    setPatientPendingOrders(grp.orders || []);
    setSelectedOrderIds(new Set(activeSelectedOrders.map((o) => o.service_order_id)));
    setOrderPayMethod("CASH");
    setOrderTxnRef("");
    setOrderPayNotes("");
    setShowPayOrderModal(true);
  }

  // Pay selective doctor-ordered services atomically
  async function handlePayDoctorOrdersSubmit(e) {
    e.preventDefault();
    if (selectedOrderIds.size === 0) return;
    try {
      setProcessing(true);
      setErrorMessage("");

      const selectedIdsArray = Array.from(selectedOrderIds);
      const res = await recordSelectivePayment({
        serviceOrderIds: selectedIdsArray,
        paymentMethod: orderPayMethod,
        transactionReference: orderTxnRef || null,
        notes: orderPayNotes || `Cashier payment for ${selectedIdsArray.length} doctor-ordered service(s)`,
      });

      const selectedOrdersList = patientPendingOrders.filter((o) => selectedOrderIds.has(o.service_order_id));
      const receipt = {
        receiptNumber: res.data?.paymentNumber || `REC-${Date.now().toString().slice(-6)}`,
        patientName: `${selectedPatientForPay.patient_first_name} ${selectedPatientForPay.patient_last_name}`,
        patientNumber: selectedPatientForPay.patient_number,
        totalPaid: res.data?.amount || selectedOrdersList.reduce((sum, o) => sum + parseFloat(o.price), 0),
        paymentMethod: orderPayMethod,
        transactionReference: orderTxnRef || "—",
        date: new Date().toLocaleString(),
        items: selectedOrdersList,
        servicesCount: selectedIdsArray.length,
      };

      setPaidCashierReceiptData(receipt);
      setShowPayOrderModal(false);
      setSelectedPatientForPay(null);
      setPatientPendingOrders([]);
      setSelectedOrderIds(new Set());
      setOrderTxnRef("");
      setOrderPayNotes("");
      setRefreshTrigger((k) => k + 1);
      setShowCashierReceiptPrompt(true);
    } catch (err) {
      setErrorMessage(err.message || "Failed to record doctor order payments.");
    } finally {
      setProcessing(false);
    }
  }

  const categories = Array.from(new Set(catalog.map((c) => c.category)));

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Front Desk Operational Center</p>
          <h1>Registrar & Service Desk</h1>
          <p className="page-description">
            Service-first intake, cashier payment authorization, doctor-ordered services collection, and instant queue routing.
          </p>
        </div>

        <div className="page-actions" style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setShowNewPatientModal(true)}
            className="button button-primary button-large"
          >
            + Register New Patient
          </button>
        </div>
      </div>

      {/* Activity Summary StatCards */}
      <section className="dashboard-grid" style={{ marginBottom: "20px" }}>
        <StatCard
          label="Today's Appointments"
          value={kpis?.todayAppointments ?? "—"}
          icon="□"
          description="Total scheduled for today"
          to="/appointments?date=today"
        />
        <StatCard
          label="Checked In"
          value={kpis?.checkedInPatients ?? "—"}
          icon="🚶"
          description="Patients in clinic queue"
          to="/reception/queue"
        />
        <StatCard
          label="Registered Today"
          value={kpis?.registeredToday ?? "—"}
          icon="+"
          description="New patient intakes today"
          to="/patients?registered=today"
        />
        <StatCard
          label="Pending Doctor Orders"
          value={kpis?.pendingDoctorOrders ?? pendingOrders.length}
          icon="⏳"
          description="Doctor orders awaiting cashier"
          onClick={() => setActiveTab("PENDING_ORDERS")}
        />
      </section>

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Navigation Tabs between New Intake vs Pending Doctor Orders Queue */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "18px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
        <button
          type="button"
          className={`button ${activeTab === "NEW_VISIT" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("NEW_VISIT")}
        >
           New Patient Intake & Service Checkout
        </button>
        <button
          type="button"
          className={`button ${activeTab === "PENDING_ORDERS" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("PENDING_ORDERS")}
        >
           Doctor-Ordered Services Cashier Queue ({pendingOrders.length})
        </button>
      </div>

      {/* Success Receipt Modal / Banner */}
      {successReceipt && (
        <div className="receipt-banner">
          <div className="receipt-banner-header">
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--success)" }}>
                {successReceipt.emergencyOverride
                  ? " Emergency Visit Authorized & Routed!"
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
                Print️ Print Routing Slip
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

      {/* Tab 1: New Visit & Service Ordering */}
      {activeTab === "NEW_VISIT" && (
        <div className="desk-layout">
          {/* Left Column: Patient Search & Emergency Override */}
          <div className="desk-left-col">
            <div className="patient-search-card">
              <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>🔍 Live Patient Lookup</h2>
              <div className="search-input-group">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Live search by Name, Phone, or PAT-..."
                  style={{ flex: 1 }}
                />
              </div>

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && !selectedPatient && (
                <div className="search-results-list">
                  {searchResults.map((pat) => (
                    <div
                      key={pat.id}
                      onClick={() => {
                        setSelectedPatient(pat);
                        setSearchResults([]);
                        setSearchQuery("");
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
                        Age: {pat.age ? `${pat.age} yrs` : "—"} • {pat.gender} • {pat.phone}
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
                    <div>Age: {selectedPatient.age ? `${selectedPatient.age} yrs` : "—"}</div>
                    <div>Gender: {selectedPatient.gender}</div>
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
                  <span> Emergency Override</span>
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
                   Hospital Service Catalog ({catalog.length} Services)
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
                                    {parseFloat(srv.price) === 0 ? "Billed at Rx" : formatCurrency(srv.price)}
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
                  <span className="checkout-total-value">{formatCurrency(subtotal)}</span>
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
                  " Authorize Immediate Emergency Care"
                ) : (
                  ` Collect Payment & Authorize Services (${formatCurrency(subtotal)})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Doctor-Ordered Services Cashier Queue */}
      {activeTab === "PENDING_ORDERS" && (
        <section className="card">
          {/* Registration Card Payment Notice */}
          {regCardNotice && (
            <div style={{
              margin: "0 0 16px 0", padding: "14px 18px",
              background: "#fef9c3", border: "1px solid #fcd34d",
              borderLeft: "4px solid #f59e0b", borderRadius: "10px",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap"
            }}>
              <div>
                <strong style={{ color: "#92400e" }}>
                  Registration Card Payment Required
                </strong>
                <div style={{ fontSize: "13px", color: "#78350f", marginTop: "4px" }}>
                  New patient <strong>{regCardNotice.patientName}</strong> ({regCardNotice.patientNumber}) must pay the registration card fee
                  {regCardNotice.price ? ` of ${formatCurrency(regCardNotice.price)}` : ""} before being assigned to a doctor.
                  Their card order is now in the queue below.
                </div>
              </div>
              <button className="button button-secondary" style={{ fontSize: "12px" }} onClick={() => setRegCardNotice(null)}>
                Dismiss
              </button>
            </div>
          )}

          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2>Doctor-Ordered Services Awaiting Cashier Payment ({pendingOrders.length})</h2>
              <p>Lab tests, X-rays, Ultrasounds, ECG, and clinical procedures prescribed during doctor consultations.</p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className={`button ${showGroupedView ? "button-primary" : "button-secondary"}`}
                style={{ fontSize: "12px" }}
                onClick={() => setShowGroupedView(!showGroupedView)}
                title="Toggle between grouped-by-patient and flat list view"
              >
                {showGroupedView ? "Grouped by Patient" : "Flat List"}
              </button>
              <input
                type="search"
                placeholder="Live search by patient, PAT #, or order #..."
                value={ordersSearchInput}
                onChange={(e) => setOrdersSearchInput(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border)", minWidth: "260px" }}
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRefreshTrigger((k) => k + 1)}
              >
                 Refresh Orders
              </button>
            </div>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✓</div>
              <h3>No pending doctor orders</h3>
              <p>All prescribed services have been paid and authorized for department queues.</p>
            </div>
          ) : showGroupedView && groupedOrders.length > 0 ? (
            /* Grouped-by-patient profile queue */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {groupedOrders.map((grp, index) => {
                const isExpanded = expandedOrderPatients[grp.patient_id] !== undefined
                  ? expandedOrderPatients[grp.patient_id]
                  : (index === 0);
                const selectedIds = selectedOrderIdsByPatient[grp.patient_id] || new Set();
                const selectedOrders = (grp.orders || []).filter((o) => selectedIds.has(o.service_order_id));
                const selectedTotal = selectedOrders.reduce((sum, o) => sum + parseFloat(o.price || 0), 0);
                const totalGroupDue = (grp.orders || []).reduce((sum, o) => sum + parseFloat(o.price || 0), 0);
                const allSelected = (grp.orders || []).length > 0 && (grp.orders || []).every((o) => selectedIds.has(o.service_order_id));

                return (
                  <div
                    key={grp.patient_id}
                    className="card"
                    style={{
                      borderLeft: "4px solid var(--primary)",
                      padding: "0",
                      overflow: "hidden",
                    }}
                  >
                    {/* Patient Profile Header (Click to expand/collapse) */}
                    <div
                      onClick={() => toggleOrderPatientExpand(grp.patient_id)}
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
                          {grp.patient_first_name ? grp.patient_first_name[0].toUpperCase() : "P"}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>
                              {grp.patient_first_name} {grp.patient_last_name}
                            </h2>
                            <span style={{ fontFamily: "monospace", fontSize: "12px", background: "var(--primary-light)", color: "var(--primary)", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                              {grp.patient_number}
                            </span>
                            {index === 0 && (
                              <span style={{ fontSize: "10px", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                                LATEST DOCTOR ORDER
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                            {grp.patient_phone && <span>Phone: <strong>{grp.patient_phone}</strong> • </span>}
                            Last Ordered:{" "}
                            <span style={{ color: "var(--primary-dark)", fontWeight: 600 }}>
                              {new Date(grp.latest_order_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({new Date(grp.latest_order_at).toLocaleDateString()})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                            {grp.orders?.length || 0} Service{(grp.orders?.length || 0) !== 1 ? "s" : ""} Pending
                          </div>
                          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--success)", fontFamily: "monospace" }}>
                            {formatCurrency(totalGroupDue)}
                          </div>
                        </div>

                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", background: "var(--primary-light)", padding: "6px 12px", borderRadius: "6px" }}>
                          {isExpanded ? "▲ Hide Services" : "▼ View Services & Pay"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Doctor-Ordered Services List with Checkboxes */}
                    {isExpanded && (
                      <div style={{ padding: "18px 20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                            Doctor-Prescribed Clinical Services:
                          </div>
                          {(grp.orders || []).length > 1 && (
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ fontSize: "11px", padding: "4px 10px" }}
                              onClick={() => handleToggleSelectAllForGroup(grp.patient_id, grp.orders)}
                            >
                              {allSelected ? "Deselect All" : "Select All"}
                            </button>
                          )}
                        </div>

                        <div className="table-wrapper" style={{ margin: 0 }}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th style={{ width: "45px" }}>Select</th>
                                <th>Order #</th>
                                <th>Service</th>
                                <th>Department</th>
                                <th>Ordering Doctor</th>
                                <th>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(grp.orders || []).map((ord) => {
                                const isSelected = selectedIds.has(ord.service_order_id);
                                return (
                                  <tr key={ord.service_order_id} style={{ background: isSelected ? "var(--primary-light)" : "transparent" }}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleTogglePatientOrderCheckbox(grp.patient_id, ord.service_order_id)}
                                        style={{ width: "16px", height: "16px", cursor: "pointer" }}
                                      />
                                    </td>
                                    <td>
                                      <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "var(--primary)" }}>
                                        {ord.order_number}
                                      </span>
                                    </td>
                                    <td>
                                      <strong>{ord.service_name}</strong>
                                      <br />
                                      <small style={{ color: "var(--text-muted)" }}>{ord.service_code}{ord.clinical_notes ? ` • Note: ${ord.clinical_notes}` : ""}</small>
                                    </td>
                                    <td>
                                      <span className="badge badge-info">{ord.department_name}</span>
                                    </td>
                                    <td>
                                      {ord.doctor_first_name ? `Dr. ${ord.doctor_first_name} ${ord.doctor_last_name}` : "General OPD"}
                                    </td>
                                    <td>
                                      <strong style={{ color: "var(--success)", fontFamily: "monospace" }}>
                                        {formatCurrency(ord.price)}
                                      </strong>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary & Payment Action for Selected Services */}
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
                            Selected Services: <strong>{selectedOrders.length}</strong> of {(grp.orders || []).length}
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
                            disabled={selectedOrders.length === 0 || processing}
                            onClick={() => handleOpenPayForGroupSelected(grp)}
                          >
                            Collect Payment for Selected ({selectedOrders.length}) →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Patient</th>
                    <th>Prescribed Service</th>
                    <th>Department</th>
                    <th>Ordering Clinician</th>
                    <th>Amount Due</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map((ord) => (
                    <tr key={ord.service_order_id}>
                      <td>
                        <strong style={{ fontFamily: "monospace", color: "var(--primary-dark)" }}>
                          {ord.order_number}
                        </strong>
                      </td>
                      <td>
                        <strong>{ord.patient_first_name} {ord.patient_last_name}</strong>
                        <br />
                        <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{ord.patient_number}</small>
                      </td>
                      <td>
                        <strong>{ord.service_name}</strong>
                        <br />
                        <small style={{ color: "var(--text-muted)" }}>{ord.clinical_notes || "Clinical prescription"}</small>
                      </td>
                      <td>
                        <span className="badge badge-info">{ord.department_name}</span>
                      </td>
                      <td>
                        {ord.doctor_first_name ? `Dr. ${ord.doctor_first_name} ${ord.doctor_last_name}` : "General OPD"}
                      </td>
                      <td>
                        <strong style={{ color: "var(--success)", fontFamily: "monospace" }}>
                          {formatCurrency(ord.price)}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleOpenPayOrdersForPatient(ord.patient_id, ord.service_order_id)}
                        >
                           Pay & Authorize →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Multi-Service Doctor Order Payment Modal */}
      <Modal
        isOpen={showPayOrderModal}
        onClose={() => {
          setShowPayOrderModal(false);
          setSelectedPatientForPay(null);
          setPatientPendingOrders([]);
          setSelectedOrderIds(new Set());
        }}
        title={selectedPatientForPay ? `Cashier Service Authorization: ${selectedPatientForPay.patient_first_name} ${selectedPatientForPay.patient_last_name}` : "Cashier Payment"}
        maxWidth="750px"
      >
        {selectedPatientForPay && (
          <form onSubmit={handlePayDoctorOrdersSubmit}>
            {/* Patient Header Details */}
            <div style={{ background: "var(--primary-light)", padding: "14px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div>
                  <strong>Patient:</strong> {selectedPatientForPay.patient_first_name} {selectedPatientForPay.patient_last_name} (
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{selectedPatientForPay.patient_number}</span>)
                </div>
                <div>
                  <strong>Phone:</strong> {selectedPatientForPay.patient_phone || "—"}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <div><strong>Ordering Doctor:</strong> Dr. {selectedPatientForPay.doctor_first_name} {selectedPatientForPay.doctor_last_name} ({selectedPatientForPay.department_name})</div>
                <div><strong>Date:</strong> {new Date(selectedPatientForPay.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Unpaid / Pending Services Selection Table */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "14px" }}>
                  Select Services to Pay & Authorize ({selectedOrderIds.size} of {patientPendingOrders.length} selected):
                </h4>
                {patientPendingOrders.length > 1 && (
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={handleToggleSelectAllPatientOrders}
                  >
                    {selectedOrderIds.size === patientPendingOrders.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              <div className="table-wrapper" style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "6px" }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>Pay</th>
                      <th>Service Name</th>
                      <th>Department</th>
                      <th>Doctor</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientPendingOrders.map((ord) => {
                      const isSelected = selectedOrderIds.has(ord.service_order_id);
                      return (
                        <tr
                          key={ord.service_order_id}
                          style={{
                            background: isSelected ? "var(--primary-light)" : "transparent",
                            cursor: "pointer",
                          }}
                          onClick={() => handleToggleOrderSelection(ord.service_order_id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleOrderSelection(ord.service_order_id)}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                          </td>
                          <td>
                            <strong>{ord.service_name}</strong>
                            <br />
                            <small style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>{ord.order_number}</small>
                          </td>
                          <td>
                            <span className="badge badge-info">{ord.department_name}</span>
                          </td>
                          <td>Dr. {ord.doctor_first_name} {ord.doctor_last_name}</td>
                          <td>
                            <strong style={{ color: "var(--success)", fontFamily: "monospace" }}>
                              {formatCurrency(ord.price)}
                            </strong>
                          </td>
                          <td>
                            <span className="badge badge-warning">Waiting Pay</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dynamic Calculated Financial Summary */}
            {(() => {
              const selectedOrders = patientPendingOrders.filter((o) => selectedOrderIds.has(o.service_order_id));
              const selectedTotal = selectedOrders.reduce((sum, o) => sum + parseFloat(o.price), 0);
              const totalPatientDue = patientPendingOrders.reduce((sum, o) => sum + parseFloat(o.price), 0);
              const remainingBalance = totalPatientDue - selectedTotal;

              return (
                <div style={{ background: "var(--surface-sunken)", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Patient Orders</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "monospace" }}>{formatCurrency(totalPatientDue)}</div>
                  </div>
                  <div style={{ borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>Selected Payment Total</div>
                    <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--success)", fontFamily: "monospace" }}>{formatCurrency(selectedTotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Remaining Unpaid Balance</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: remainingBalance > 0 ? "var(--danger)" : "var(--text-muted)", fontFamily: "monospace" }}>
                      {formatCurrency(remainingBalance)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Payment Method & Reference Inputs */}
            <div className="form-grid" style={{ marginBottom: "16px" }}>
              <div className="form-field">
                <label>Payment Method *</label>
                <select
                  value={orderPayMethod}
                  onChange={(e) => setOrderPayMethod(e.target.value)}
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
                <label>Transaction / Deposit Ref #</label>
                <input
                  type="text"
                  placeholder="e.g. TXN-123456"
                  value={orderTxnRef}
                  onChange={(e) => setOrderTxnRef(e.target.value)}
                />
              </div>

              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Cashier Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="Payment remarks or receipt notes..."
                  value={orderPayNotes}
                  onChange={(e) => setOrderPayNotes(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setShowPayOrderModal(false);
                  setSelectedPatientForPay(null);
                  setPatientPendingOrders([]);
                  setSelectedOrderIds(new Set());
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={processing || selectedOrderIds.size === 0}
              >
                {processing
                  ? "Authorizing Payment..."
                  : `✓ Authorize Payment (${formatCurrency(
                      patientPendingOrders
                        .filter((o) => selectedOrderIds.has(o.service_order_id))
                        .reduce((sum, o) => sum + parseFloat(o.price), 0)
                    )})`}
              </button>
            </div>
          </form>
        )}
      </Modal>

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
              <label>Age (Years) *</label>
              <input
                type="number"
                min="0"
                max="130"
                required
                value={newPatient.age}
                onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
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
              <label>Phone Number (Ethiopian) *</label>
              <input
                type="text"
                required
                placeholder="09XXXXXXXX or +2519XXXXXXXX"
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Address / Sub-City</label>
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
              {processing ? "Saving..." : "Save Patient & Offer Appointment →"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ────────────────────────────────────────────────────────────
           Step 1/2: Registration Card Payment Popup
           Opens automatically after patient creation.
           On success → auto-opens Step 2 (appointment booking).
      ──────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showCardPayModal}
        onClose={handleCancelCardPay}
        title="Step 1 of 2 — Pay Registration Card Fee"
      >
        {cardPayInfo && (
          <form onSubmit={handlePayCardFee}>
            {/* Patient summary */}
            <div style={{
              background: "linear-gradient(135deg, #667eea22 0%, #764ba222 100%)",
              border: "1px solid #667eea44",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "15px" }}>
                    {cardPayInfo.patientName}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {cardPayInfo.patientNumber}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Registration Card Fee
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--primary)" }}>
                    {formatCurrency(cardPayInfo.price)}
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Collect the one-time registration card fee before assigning the patient to a doctor.
              After payment this window will automatically advance to consultation booking.
            </p>

            {cardPayError && (
              <div className="alert alert-error" style={{ marginBottom: "12px" }}>
                {cardPayError}
              </div>
            )}

            {/* Emergency Patient Override Option (Requirement 1) */}
            <div
              style={{
                background: cardPayEmergency ? "#fef2f2" : "var(--surface-muted)",
                border: cardPayEmergency ? "1px solid #ef4444" : "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                marginBottom: "14px",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: cardPayEmergency ? "#b91c1c" : "var(--text-main)",
                  fontSize: "13px",
                }}
              >
                <input
                  type="checkbox"
                  checked={cardPayEmergency}
                  onChange={(e) => setCardPayEmergency(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <span>🚨 Emergency Patient (Allow Pay Later / Defer Payment)</span>
              </label>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", marginLeft: "24px" }}>
                {cardPayEmergency
                  ? "Emergency override enabled: Patient may proceed to immediate consultation booking without upfront payment."
                  : "Registration fee payment is mandatory before booking consultation for routine patients."}
              </div>
            </div>

            {!cardPayEmergency && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="cardPayMethod">Payment Method *</label>
                    <select
                      id="cardPayMethod"
                      value={cardPayMethod}
                      onChange={(e) => setCardPayMethod(e.target.value)}
                      required
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="MOBILE_MONEY">Mobile Money (Telebirr / CBE Birr)</option>
                      <option value="POS">POS / Card</option>
                    </select>
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="cardPayTxnRef">Transaction / Receipt Ref</label>
                    <input
                      id="cardPayTxnRef"
                      placeholder="Optional reference number"
                      value={cardPayTxnRef}
                      onChange={(e) => setCardPayTxnRef(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field" style={{ marginBottom: "20px" }}>
                  <label htmlFor="cardPayNotes">Notes (optional)</label>
                  <input
                    id="cardPayNotes"
                    placeholder="e.g. Paid by relative, cash counted"
                    value={cardPayNotes}
                    onChange={(e) => setCardPayNotes(e.target.value)}
                  />
                </div>
              </>
            )}

            <div style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
            }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleCancelCardPay}
              >
                Cancel Registration
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={cardPayProcessing}
                style={{
                  minWidth: "220px",
                  background: cardPayEmergency ? "#b91c1c" : "var(--primary)",
                  borderColor: cardPayEmergency ? "#b91c1c" : "var(--primary)",
                }}
              >
                {cardPayProcessing
                  ? "Processing..."
                  : cardPayEmergency
                  ? "🚨 Authorize Emergency (Pay Later) → Book Consultation"
                  : `✓ Pay ${formatCurrency(cardPayInfo.price)} Received → Proceed`}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ────────────────────────────────────────────────────────────
           Requirement 1: Do You Want Receipt Prompt for Card Payment
      ──────────────────────────────────────────────────────────── */}
      {showCardReceiptPrompt && paidCardReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCardReceiptPrompt(false);
            openAppointmentOffer();
          }}
          title="Payment Received — Do You Want a Receipt?"
        >
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--success)" }}>Payment Recorded Successfully!</h3>
            <p style={{ fontSize: "14px", color: "var(--text-main)", marginBottom: "14px" }}>
              Registration Card payment of <strong>{formatCurrency(paidCardReceiptData.amount)}</strong> was recorded for{" "}
              <strong>{paidCardReceiptData.patientName}</strong> ({paidCardReceiptData.patientNumber}).
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>
              Would you like to print an official transaction receipt for the patient now?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setShowCardReceiptPrompt(false);
                  openAppointmentOffer();
                }}
                style={{ minWidth: "160px" }}
              >
                No, Skip to Consultation →
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setShowCardReceiptPrompt(false);
                  setShowCardPrintModal(true);
                }}
                style={{ minWidth: "160px" }}
              >
                🖨 Yes, Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable Card Receipt Modal */}
      {showCardPrintModal && paidCardReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowCardPrintModal(false);
            openAppointmentOffer();
          }}
          title="Print Registration Card Receipt"
        >
          <PrintableDocument
            title="OFFICIAL REGISTRATION CARD RECEIPT"
            documentNumber={paidCardReceiptData.receiptNumber}
            date={paidCardReceiptData.date}
          >
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div>
                  <strong>Patient Name:</strong> {paidCardReceiptData.patientName}<br />
                  <strong>Patient Number:</strong> {paidCardReceiptData.patientNumber}
                </div>
                <div>
                  <strong>Payment Method:</strong> {paidCardReceiptData.paymentMethod}<br />
                  <strong>Reference #:</strong> {paidCardReceiptData.transactionReference}
                </div>
              </div>

              <table className="data-table" style={{ width: "100%", marginBottom: "16px" }}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{paidCardReceiptData.description}</strong></td>
                    <td>REGISTRATION</td>
                    <td style={{ textAlign: "right" }}><strong>{formatCurrency(paidCardReceiptData.amount)}</strong></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="2">Total Paid (ETB)</th>
                    <th style={{ textAlign: "right", color: "var(--success)", fontSize: "15px" }}>{formatCurrency(paidCardReceiptData.amount)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PrintableDocument>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setShowCardPrintModal(false);
                openAppointmentOffer();
              }}
            >
              Continue to Book Consultation →
            </button>
          </div>
        </Modal>
      )}

      {/* ────────────────────────────────────────────────────────────
           Requirement 3: Do You Want Receipt Prompt for Cashier Queue
      ──────────────────────────────────────────────────────────── */}
      {showCashierReceiptPrompt && paidCashierReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => setShowCashierReceiptPrompt(false)}
          title="Payment Authorized — Do You Want a Receipt?"
        >
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ fontSize: "40px", marginBottom: "8px" }}>🧾</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--success)" }}>Payment Authorized!</h3>
            <p style={{ fontSize: "14px", color: "var(--text-main)", marginBottom: "14px" }}>
              Payment of <strong>{formatCurrency(paidCashierReceiptData.totalPaid)}</strong> authorized for{" "}
              <strong>{paidCashierReceiptData.patientName}</strong> ({paidCashierReceiptData.patientNumber}) covering{" "}
              <strong>{paidCashierReceiptData.servicesCount}</strong> doctor-ordered service(s).
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "24px" }}>
              Do you want to print an official transaction receipt for the patient?
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowCashierReceiptPrompt(false)}
                style={{ minWidth: "150px" }}
              >
                No, Return to Queue
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setShowCashierReceiptPrompt(false);
                  setShowCashierPrintModal(true);
                }}
                style={{ minWidth: "150px" }}
              >
                🖨 Yes, Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable Cashier Services Receipt Modal */}
      {showCashierPrintModal && paidCashierReceiptData && (
        <Modal
          isOpen={true}
          onClose={() => setShowCashierPrintModal(false)}
          title="Doctor-Ordered Services Payment Receipt"
        >
          <PrintableDocument
            title="OFFICIAL CASHIER SERVICES RECEIPT"
            documentNumber={paidCashierReceiptData.receiptNumber}
            date={paidCashierReceiptData.date}
          >
            <div style={{ padding: "12px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px", background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div>
                  <strong>Patient Name:</strong> {paidCashierReceiptData.patientName}<br />
                  <strong>Patient Number:</strong> {paidCashierReceiptData.patientNumber}
                </div>
                <div>
                  <strong>Payment Method:</strong> {paidCashierReceiptData.paymentMethod}<br />
                  <strong>Reference #:</strong> {paidCashierReceiptData.transactionReference}
                </div>
              </div>

              <table className="data-table" style={{ width: "100%", marginBottom: "16px" }}>
                <thead>
                  <tr>
                    <th>Service Name</th>
                    <th>Department</th>
                    <th style={{ textAlign: "right" }}>Price (ETB)</th>
                  </tr>
                </thead>
                <tbody>
                  {paidCashierReceiptData.items?.map((it, idx) => (
                    <tr key={idx}>
                      <td><strong>{it.service_name}</strong> ({it.service_code})</td>
                      <td>{it.department_name}</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(it.price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan="2">Total Paid</th>
                    <th style={{ textAlign: "right", color: "var(--success)", fontSize: "15px" }}>
                      {formatCurrency(paidCashierReceiptData.totalPaid)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PrintableDocument>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowCashierPrintModal(false)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* ────────────────────────────────────────────────────────────
           Step 2/2: Post-Registration Consultation Offer Modal
      ──────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showAppointmentModal}
        onClose={() => setShowAppointmentModal(false)}
        title="Step 2 of 2 — Book Today's Consultation"
      >
        {selectedPatient && (
          <div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px" }}>
              Recommend an available general physician consultation for today ({today}):
            </p>

            <div className="form-field" style={{ marginBottom: "14px" }}>
              <label>Available Doctor Today</label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
              >
                {todayDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {d.first_name} {d.last_name} ({d.specialty || d.department || "General"})
                  </option>
                ))}
              </select>
            </div>

            {loadingSlots ? (
              <div className="loading-state">Checking available times...</div>
            ) : availableSlots.length === 0 ? (
              <div className="empty-state">No slots available for this doctor today.</div>
            ) : (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                  Select Time Slot:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "6px" }}>
                  {availableSlots.map((slot) => {
                    const isSel = selectedSlot && selectedSlot.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        style={{
                          padding: "6px",
                          borderRadius: "6px",
                          border: `1px solid ${isSel ? "var(--primary)" : "#cbd5e1"}`,
                          background: isSel ? "var(--primary)" : "#ffffff",
                          color: isSel ? "#ffffff" : "var(--text)",
                          fontSize: "12px",
                          fontWeight: isSel ? 700 : 500,
                          cursor: "pointer",
                        }}
                      >
                        {slot.startTime}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <Link to={`/appointments/availability?patientId=${selectedPatient.id}`} className="button button-secondary">
                Choose Another Date
              </Link>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowAppointmentModal(false)}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={processing || !selectedSlot}
                  onClick={handleBookConsultationAppointment}
                >
                  {processing ? "Booking..." : "Confirm Today Appointment →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
