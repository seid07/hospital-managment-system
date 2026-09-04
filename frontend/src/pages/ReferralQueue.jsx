import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import { useAuth } from "../context/useAuth";
import { useCalendar } from "../context/useCalendar";
import {
  getReferralQueue,
  getSentReferrals,
  createReferral,
  viewReferral,
  respondToReferral,
  getReferralMessages,
  sendReferralMessage,
} from "../services/referralService";
import { getPatients, searchPatients } from "../services/patientService";
import { getDoctors } from "../services/scheduleService";
import { useDebounce } from "../hooks/useDebounce";
import {
  Inbox, Send, UserPlus, AlertTriangle, Clock, CheckCircle,
  ChevronDown, ChevronUp, MessageSquare, FileCheck, Search, RefreshCw,
  Stethoscope
} from "lucide-react";



const URGENCY_CONFIG = {
  EMERGENCY: { label: "EMERGENCY", color: "#ef4444", bg: "#fef2f2", icon: AlertTriangle },
  URGENT:    { label: "URGENT",    color: "#f59e0b", bg: "#fffbeb", icon: Clock },
  ROUTINE:   { label: "ROUTINE",   color: "#6366f1", bg: "#eef2ff", icon: CheckCircle },
};

const STATUS_CONFIG = {
  PENDING:   { label: "Pending",   color: "#f59e0b", bg: "#fffbeb" },
  VIEWED:    { label: "Viewed",    color: "#6366f1", bg: "#eef2ff" },
  RESPONDED: { label: "Responded", color: "#10b981", bg: "#ecfdf5" },
};

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.ROUTINE;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700,
    }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

function StatusBadgeItem({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
      borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  );
}

export default function ReferralQueue() {
  const { formatDate, formatDateTime } = useCalendar();
  const [activeTab, setActiveTab] = useState("inbox"); // 'inbox' | 'sent' | 'new'

  // Queue state (Inbox)
  const [queue, setQueue] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxError, setInboxError] = useState("");

  // Sent state (Outbox)
  const [sentList, setSentList] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentError, setSentError] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Response modal
  const { user } = useAuth();
  const messagesEndRef = useRef(null);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [respondingReferral, setRespondingReferral] = useState(null);
  const [responseForm, setResponseForm] = useState({
    assessment: "",
    recommendation: "",
    nextStep: "",
    treatmentRecommendation: "",
    followupRecommendation: "",
  });
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState("");

  // Messages modal
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [activeReferral, setActiveReferral] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgError, setMsgError] = useState("");


  // New Referral Form state
  const [doctorsList, setDoctorsList] = useState([]);
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const debouncedPatSearch = useDebounce(patientSearchTerm, 300);
  const [patientOptions, setPatientOptions] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [newReferralForm, setNewReferralForm] = useState({
    receivingDoctorId: "",
    urgency: "ROUTINE",
    symptoms: "",
    findings: "",
    diagnosis: "",
    investigationInfo: "",
    treatmentProvided: "",
    caseNote: "",
  });
  const [submittingReferral, setSubmittingReferral] = useState(false);
  const [referralSuccessMsg, setReferralSuccessMsg] = useState("");
  const [referralSubmitError, setReferralSubmitError] = useState("");

  const refreshQueue = useCallback(() => setRefreshTrigger((k) => k + 1), []);

  // 1. Load Inbox
  useEffect(() => {
    let cancelled = false;
    async function loadInbox() {
      try {
        setInboxError("");
        const res = await getReferralQueue();
        if (!cancelled) {
          setQueue(res.data || []);
          setLoadingInbox(false);
        }
      } catch (err) {
        if (!cancelled) {
          setInboxError(err.message || "Unable to load referral inbox.");
          setLoadingInbox(false);
        }
      }
    }
    loadInbox();
    const interval = setInterval(loadInbox, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshTrigger]);

  // 2. Load Sent
  useEffect(() => {
    let cancelled = false;
    async function loadSent() {
      try {
        setLoadingSent(true);
        setSentError("");
        const res = await getSentReferrals();
        if (!cancelled) {
          setSentList(res.data || []);
          setLoadingSent(false);
        }
      } catch (err) {
        if (!cancelled) {
          setSentError(err.message || "Unable to load sent referrals.");
          setLoadingSent(false);
        }
      }
    }
    if (activeTab === "sent") {
      loadSent();
    }
    return () => { cancelled = true; };
  }, [activeTab, refreshTrigger]);

  // 3. Load Doctors for New Referral form
  useEffect(() => {
    let cancelled = false;
    async function loadDocs() {
      try {
        const res = await getDoctors();
        if (!cancelled && res.data) {
          setDoctorsList(res.data);
        }
      } catch { /* non-fatal */ }
    }
    loadDocs();
    return () => { cancelled = true; };
  }, []);

  // 4. Search Patients for New Referral
  useEffect(() => {
    let cancelled = false;
    async function findPatients() {
      if (!debouncedPatSearch || debouncedPatSearch.trim().length < 1) {
        try {
          const res = await getPatients({ limit: 10 });
          if (!cancelled && res.data) setPatientOptions(res.data);
        } catch { /* non-fatal */ }
        return;
      }
      try {
        setSearchingPatients(true);
        const res = await searchPatients(debouncedPatSearch.trim());
        if (!cancelled && res.data) {
          setPatientOptions(res.data);
          setSearchingPatients(false);
        }
      } catch {
        if (!cancelled) setSearchingPatients(false);
      }
    }
    if (activeTab === "new") {
      findPatients();
    }
    return () => { cancelled = true; };
  }, [debouncedPatSearch, activeTab]);

  const filteredQueue = queue.filter((r) => {
    const matchStatus = !filterStatus || r.status === filterStatus;
    const search = debouncedSearch.toLowerCase();
    const matchSearch = !search || (
      `${r.patient_first_name} ${r.patient_last_name}`.toLowerCase().includes(search) ||
      `${r.referring_first_name} ${r.referring_last_name}`.toLowerCase().includes(search) ||
      (r.patient_number || "").toLowerCase().includes(search) ||
      (r.case_note || "").toLowerCase().includes(search)
    );
    return matchStatus && matchSearch;
  });

  const filteredSent = sentList.filter((r) => {
    const matchStatus = !filterStatus || r.status === filterStatus;
    const search = debouncedSearch.toLowerCase();
    const matchSearch = !search || (
      `${r.patient_first_name} ${r.patient_last_name}`.toLowerCase().includes(search) ||
      `${r.receiving_first_name} ${r.receiving_last_name}`.toLowerCase().includes(search) ||
      (r.patient_number || "").toLowerCase().includes(search) ||
      (r.case_note || "").toLowerCase().includes(search)
    );
    return matchStatus && matchSearch;
  });

  async function handleExpand(referral) {
    if (expandedId === referral.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(referral.id);
    if (activeTab === "inbox" && referral.status === "PENDING") {
      try {
        await viewReferral(referral.id);
        setQueue((prev) => prev.map((r) =>
          r.id === referral.id ? { ...r, status: "VIEWED" } : r
        ));
      } catch { /* non-fatal */ }
    }
  }

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (showMessagesModal) {
      scrollToBottom();
    }
  }, [messages, showMessagesModal]);

  // Polling for active referral chat messages (every 4s)
  useEffect(() => {
    let timer = null;
    if (showMessagesModal && activeReferral?.id) {
      timer = setInterval(async () => {
        try {
          const res = await getReferralMessages(activeReferral.id);
          if (res.data) {
            setMessages(res.data);
          }
        } catch {
          // silent polling fail
        }
      }, 4000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showMessagesModal, activeReferral]);

  async function handleOpenMessages(referral) {
    setActiveReferral(referral);
    setMsgError("");
    setNewMessage("");
    try {
      const res = await getReferralMessages(referral.id);
      setMessages(res.data || []);
    } catch (err) {
      setMsgError(err.message || "Failed to load messages.");
    }
    setShowMessagesModal(true);
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      setSendingMsg(true);
      setMsgError("");
      const res = await sendReferralMessage(activeReferral.id, newMessage.trim());
      setMessages((prev) => [...prev, res.data]);
      setNewMessage("");
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      setMsgError(err.message || "Failed to send message.");
    } finally {
      setSendingMsg(false);
    }
  }


  function handleOpenRespond(referral) {
    setRespondingReferral(referral);
    setResponseForm({
      assessment: referral.response_assessment || "",
      recommendation: referral.response_recommendation || "",
      nextStep: referral.response_next_step || "",
      treatmentRecommendation: "",
      followupRecommendation: "",
    });
    setResponseError("");
    setShowResponseModal(true);
  }

  async function handleRespondSubmit(e) {
    e.preventDefault();
    if (!responseForm.assessment.trim() && !responseForm.recommendation.trim()) {
      setResponseError("Please provide an assessment or recommendation.");
      return;
    }
    try {
      setResponding(true);
      setResponseError("");
      await respondToReferral(respondingReferral.id, responseForm);
      setShowResponseModal(false);
      refreshQueue();
    } catch (err) {
      setResponseError(err.message || "Failed to submit response.");
    } finally {
      setResponding(false);
    }
  }

  async function handleCreateReferralSubmit(e) {
    e.preventDefault();
    setReferralSubmitError("");
    setReferralSuccessMsg("");

    if (!selectedPatient) {
      setReferralSubmitError("Please select a patient to refer.");
      return;
    }
    if (!newReferralForm.receivingDoctorId) {
      setReferralSubmitError("Please select the receiving doctor.");
      return;
    }
    if (!newReferralForm.caseNote.trim()) {
      setReferralSubmitError("Case note / referral reason is required.");
      return;
    }

    try {
      setSubmittingReferral(true);
      await createReferral({
        patientId: selectedPatient.id,
        ...newReferralForm,
      });
      setReferralSuccessMsg(`Referral successfully created and sent for patient ${selectedPatient.first_name} ${selectedPatient.last_name}!`);
      // Reset form
      setSelectedPatient(null);
      setPatientSearchTerm("");
      setNewReferralForm({
        receivingDoctorId: "",
        urgency: "ROUTINE",
        symptoms: "",
        findings: "",
        diagnosis: "",
        investigationInfo: "",
        treatmentProvided: "",
        caseNote: "",
      });
      refreshQueue();
      // Switch to sent tab after brief pause
      setTimeout(() => {
        setActiveTab("sent");
        setReferralSuccessMsg("");
      }, 1500);
    } catch (err) {
      setReferralSubmitError(err.message || "Failed to create referral.");
    } finally {
      setSubmittingReferral(false);
    }
  }

  return (
    <AppShell title="Doctor Referrals Center">
      {/* Header & Tabs */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Stethoscope size={24} color="var(--primary)" /> Doctor-to-Doctor Referrals
            </h1>
            <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0", fontSize: "14px" }}>
              Manage clinical consults, incoming referral cases, and seamlessly refer patients to specialists.
            </p>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={refreshQueue}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={14} /> Live Sync
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid var(--border)", paddingBottom: "2px" }}>
          <button
            type="button"
            onClick={() => { setActiveTab("inbox"); setExpandedId(null); }}
            style={{
              padding: "10px 18px",
              border: "none",
              borderBottom: activeTab === "inbox" ? "3px solid var(--primary)" : "3px solid transparent",
              background: "none",
              fontWeight: activeTab === "inbox" ? 700 : 500,
              color: activeTab === "inbox" ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Inbox size={16} /> Referral Inbox (Incoming)
            {queue.filter(r => r.status === "PENDING").length > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 700 }}>
                {queue.filter(r => r.status === "PENDING").length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("sent"); setExpandedId(null); }}
            style={{
              padding: "10px 18px",
              border: "none",
              borderBottom: activeTab === "sent" ? "3px solid var(--primary)" : "3px solid transparent",
              background: "none",
              fontWeight: activeTab === "sent" ? 700 : 500,
              color: activeTab === "sent" ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Send size={16} /> Sent Referrals (Outbox)
            <span style={{ background: "var(--surface-muted)", color: "var(--text-secondary)", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 600 }}>
              {sentList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("new"); setReferralSubmitError(""); }}
            style={{
              padding: "10px 18px",
              border: "none",
              borderBottom: activeTab === "new" ? "3px solid var(--primary)" : "3px solid transparent",
              background: "none",
              fontWeight: activeTab === "new" ? 700 : 500,
              color: activeTab === "new" ? "var(--primary)" : "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <UserPlus size={16} /> + Refer Patient to Doctor
          </button>
        </div>
      </div>

      {/* TAB 1: INCOMING REFERRALS INBOX */}
      {activeTab === "inbox" && (
        <section>
          {inboxError && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              {inboxError}
            </div>
          )}

          {/* Search & Filter */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}>
              <Search size={15} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search patient, referring doctor, case note..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input"
                style={{ paddingLeft: "32px", width: "100%" }}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input"
              style={{ width: "160px" }}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="VIEWED">Viewed</option>
              <option value="RESPONDED">Responded</option>
            </select>
          </div>

          {loadingInbox ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Loading referral inbox...</div>
          ) : filteredQueue.length === 0 ? (
            <div className="card" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
              <Inbox size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <h3 style={{ margin: "0 0 6px" }}>No Incoming Referrals Found</h3>
              <p style={{ margin: 0, fontSize: "14px" }}>
                {filterStatus || searchInput ? "Try clearing your filters." : "You have no incoming patient referrals assigned to you at this time."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredQueue.map((referral) => {
                const isExpanded = expandedId === referral.id;
                return (
                  <div
                    key={referral.id}
                    className="card"
                    style={{
                      padding: "16px",
                      border: referral.urgency === "EMERGENCY" ? "1.5px solid #ef4444" : "1px solid var(--border)",
                      borderLeft: referral.urgency === "EMERGENCY" ? "4px solid #ef4444" : "4px solid var(--primary)",
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "16px" }}>
                            {referral.patient_first_name} {referral.patient_last_name}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", background: "var(--surface-muted)", padding: "1px 6px", borderRadius: "4px" }}>
                            {referral.patient_number}
                          </span>
                          <UrgencyBadge urgency={referral.urgency} />
                          <StatusBadgeItem status={referral.status} />
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                          Referred by <strong>Dr. {referral.referring_first_name} {referral.referring_last_name}</strong> ({referral.referring_specialty || "General Medicine"}) • {formatDateTime(referral.created_at)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOpenMessages(referral)}
                          style={{ fontSize: "12px", padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <MessageSquare size={13} /> Messages
                        </button>

                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleOpenRespond(referral)}
                          style={{ fontSize: "12px", padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <FileCheck size={13} /> {referral.status === "RESPONDED" ? "Update Response" : "Respond"}
                        </button>

                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleExpand(referral)}
                          style={{ fontSize: "12px", padding: "6px 10px" }}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Case Note Snippet */}
                    <div style={{ marginTop: "10px", fontSize: "13px", color: "var(--text-main)", background: "var(--surface-muted)", padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
                      <strong>Case Summary:</strong> {referral.case_note}
                    </div>

                    {/* Expanded Clinical Details */}
                    {isExpanded && (
                      <div style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                          {referral.diagnosis && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Provisional Diagnosis</span>
                              <div style={{ fontSize: "13px", fontWeight: 600 }}>{referral.diagnosis}</div>
                            </div>
                          )}
                          {referral.symptoms && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Symptoms & Presentation</span>
                              <div style={{ fontSize: "13px" }}>{referral.symptoms}</div>
                            </div>
                          )}
                          {referral.findings && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Clinical Findings</span>
                              <div style={{ fontSize: "13px" }}>{referral.findings}</div>
                            </div>
                          )}
                          {referral.treatment_provided && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Treatment Provided</span>
                              <div style={{ fontSize: "13px" }}>{referral.treatment_provided}</div>
                            </div>
                          )}
                        </div>

                        {/* Existing Response Details if already responded */}
                        {referral.response_assessment && (
                          <div style={{ background: "#ecfdf5", border: "1px solid #10b98140", borderRadius: "var(--radius-sm)", padding: "10px 14px", marginTop: "10px" }}>
                            <strong style={{ color: "#065f46", fontSize: "13px" }}>✓ Specialist Response:</strong>
                            <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Assessment:</strong> {referral.response_assessment}</p>
                            {referral.response_recommendation && <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Recommendation:</strong> {referral.response_recommendation}</p>}
                            {referral.response_next_step && <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Next Step:</strong> {referral.response_next_step}</p>}
                          </div>
                        )}

                        <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                          <Link
                            to={`/patients/${referral.patient_id}`}
                            className="button button-secondary"
                            style={{ fontSize: "12px" }}
                          >
                            Open Full Patient Chart →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: SENT REFERRALS (OUTBOX) */}
      {activeTab === "sent" && (
        <section>
          {sentError && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              {sentError}
            </div>
          )}

          {/* Search & Filter */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 260px" }}>
              <Search size={15} style={{ position: "absolute", left: "10px", top: "11px", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search patient, receiving doctor, case note..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input"
                style={{ paddingLeft: "32px", width: "100%" }}
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input"
              style={{ width: "160px" }}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="VIEWED">Viewed</option>
              <option value="RESPONDED">Responded</option>
            </select>
          </div>

          {loadingSent ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Loading sent referrals...</div>
          ) : filteredSent.length === 0 ? (
            <div className="card" style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-muted)" }}>
              <Send size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <h3 style={{ margin: "0 0 6px" }}>No Sent Referrals</h3>
              <p style={{ margin: 0, fontSize: "14px" }}>
                You have not initiated any patient referrals yet. Click "+ Refer Patient to Doctor" to send a case.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {filteredSent.map((referral) => {
                const isExpanded = expandedId === referral.id;
                return (
                  <div
                    key={referral.id}
                    className="card"
                    style={{
                      padding: "16px",
                      border: "1px solid var(--border)",
                      borderLeft: "4px solid #6366f1",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "16px" }}>
                            {referral.patient_first_name} {referral.patient_last_name}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", background: "var(--surface-muted)", padding: "1px 6px", borderRadius: "4px" }}>
                            {referral.patient_number}
                          </span>
                          <UrgencyBadge urgency={referral.urgency} />
                          <StatusBadgeItem status={referral.status} />
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                          Referred to <strong>Dr. {referral.receiving_first_name} {referral.receiving_last_name}</strong> ({referral.receiving_specialty || "Specialist"}) • {formatDateTime(referral.created_at)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleOpenMessages(referral)}
                          style={{ fontSize: "12px", padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}
                        >
                          <MessageSquare size={13} /> Messages
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleExpand(referral)}
                          style={{ fontSize: "12px", padding: "6px 10px" }}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: "10px", fontSize: "13px", background: "var(--surface-muted)", padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
                      <strong>Case Summary:</strong> {referral.case_note}
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                          {referral.diagnosis && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Provisional Diagnosis</span>
                              <div style={{ fontSize: "13px", fontWeight: 600 }}>{referral.diagnosis}</div>
                            </div>
                          )}
                          {referral.symptoms && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Symptoms & Presentation</span>
                              <div style={{ fontSize: "13px" }}>{referral.symptoms}</div>
                            </div>
                          )}
                          {referral.findings && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Clinical Findings</span>
                              <div style={{ fontSize: "13px" }}>{referral.findings}</div>
                            </div>
                          )}
                          {referral.treatment_provided && (
                            <div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase" }}>Treatment Provided</span>
                              <div style={{ fontSize: "13px" }}>{referral.treatment_provided}</div>
                            </div>
                          )}
                        </div>

                        {referral.response_assessment && (
                          <div style={{ background: "#ecfdf5", border: "1px solid #10b98140", borderRadius: "var(--radius-sm)", padding: "10px 14px", marginTop: "10px" }}>
                            <strong style={{ color: "#065f46", fontSize: "13px" }}>✓ Specialist Feedback:</strong>
                            <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Assessment:</strong> {referral.response_assessment}</p>
                            {referral.response_recommendation && <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Recommendation:</strong> {referral.response_recommendation}</p>}
                            {referral.response_next_step && <p style={{ margin: "4px 0", fontSize: "13px" }}><strong>Next Step:</strong> {referral.response_next_step}</p>}
                          </div>
                        )}

                        <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                          <Link
                            to={`/patients/${referral.patient_id}`}
                            className="button button-secondary"
                            style={{ fontSize: "12px" }}
                          >
                            Open Patient Chart →
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: REFER PATIENT TO DOCTOR (NEW REFERRAL FORM) */}
      {activeTab === "new" && (
        <section className="card" style={{ maxWidth: "800px", margin: "0 auto", padding: "24px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <UserPlus size={20} color="var(--primary)" /> Write Patient Referral to Specialist
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
            Refer a patient to another physician or specialist doctor, automatically linking the case to their medical chart.
          </p>

          {referralSuccessMsg && (
            <div className="alert alert-success" style={{ marginBottom: "16px" }}>
              {referralSuccessMsg}
            </div>
          )}

          {referralSubmitError && (
            <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
              {referralSubmitError}
            </div>
          )}

          <form onSubmit={handleCreateReferralSubmit}>
            {/* Step 1: Patient Selection */}
            <div style={{ marginBottom: "18px" }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                1. Select Patient *
              </label>
              {selectedPatient ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--primary-light)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--primary)40" }}>
                  <div>
                    <strong style={{ color: "var(--primary)" }}>{selectedPatient.first_name} {selectedPatient.last_name}</strong> ({selectedPatient.patient_number})
                    <span style={{ marginLeft: "10px", fontSize: "12px", color: "var(--text-secondary)" }}>
                      {selectedPatient.gender} • {selectedPatient.phone}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setSelectedPatient(null)}
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                  >
                    Change Patient
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="Search patient by name or PAT number..."
                    value={patientSearchTerm}
                    onChange={(e) => setPatientSearchTerm(e.target.value)}
                    className="input"
                    style={{ width: "100%", marginBottom: "6px" }}
                  />
                  {searchingPatients ? (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "4px" }}>Searching...</div>
                  ) : patientOptions.length > 0 ? (
                    <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                      {patientOptions.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPatient(p)}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "13px",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <span><strong>{p.first_name} {p.last_name}</strong> ({p.patient_number})</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{p.phone}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "4px" }}>No matching patients found.</div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Receiving Doctor & Urgency */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>2. Receiving Doctor / Specialist *</label>
                <select
                  value={newReferralForm.receivingDoctorId}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, receivingDoctorId: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                  required
                >
                  <option value="">Select Receiving Doctor...</option>
                  {doctorsList.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      Dr. {doc.first_name} {doc.last_name} ({doc.specialty || doc.department || "Physician"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>3. Clinical Urgency *</label>
                <select
                  value={newReferralForm.urgency}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, urgency: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                  required
                >
                  <option value="ROUTINE">Routine (Standard consult)</option>
                  <option value="URGENT">Urgent (Review within 24 hours)</option>
                  <option value="EMERGENCY">Emergency (Immediate review required)</option>
                </select>
              </div>
            </div>

            {/* Step 3: Clinical Findings & Diagnosis */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
              <div>
                <label className="form-label">Provisional Diagnosis</label>
                <input
                  type="text"
                  placeholder="e.g. Uncontrolled Hypertension / Suspected Appendicitis"
                  value={newReferralForm.diagnosis}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, diagnosis: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label className="form-label">Key Symptoms & Presentation</label>
                <input
                  type="text"
                  placeholder="e.g. Acute right lower quadrant abdominal pain x 2 days"
                  value={newReferralForm.symptoms}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, symptoms: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
              <div>
                <label className="form-label">Physical & Clinical Findings</label>
                <input
                  type="text"
                  placeholder="e.g. Guarding at McBurney's point, Rebound tenderness"
                  value={newReferralForm.findings}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, findings: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label className="form-label">Treatment / Interventions Provided So Far</label>
                <input
                  type="text"
                  placeholder="e.g. IV Normal Saline 1L, IV Ceftriaxone 1g administered"
                  value={newReferralForm.treatmentProvided}
                  onChange={(e) => setNewReferralForm({ ...newReferralForm, treatmentProvided: e.target.value })}
                  className="input"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Step 4: Detailed Case Note */}
            <div style={{ marginBottom: "20px" }}>
              <label className="form-label" style={{ fontWeight: 600 }}>
                4. Detailed Case Note / Reason for Referral *
              </label>
              <textarea
                rows={4}
                placeholder="Describe clinical background, reason for specialist referral, and specific questions or requests for the receiving doctor..."
                value={newReferralForm.caseNote}
                onChange={(e) => setNewReferralForm({ ...newReferralForm, caseNote: e.target.value })}
                className="input"
                style={{ width: "100%" }}
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setActiveTab("inbox")}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={submittingReferral}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Send size={15} /> {submittingReferral ? "Sending Referral..." : "Submit & Send Referral"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Response Modal */}
      {showResponseModal && (
        <Modal
          title={`Respond to Referral — ${respondingReferral?.patient_first_name} ${respondingReferral?.patient_last_name}`}
          isOpen={showResponseModal}
          onClose={() => setShowResponseModal(false)}
        >
          {responseError && <div className="alert alert-danger" style={{ marginBottom: "12px" }}>{responseError}</div>}
          <form onSubmit={handleRespondSubmit}>
            <div style={{ marginBottom: "14px" }}>
              <label className="form-label" style={{ fontWeight: 600 }}>Specialist Assessment *</label>
              <textarea
                rows={3}
                placeholder="Enter your clinical assessment of the case..."
                value={responseForm.assessment}
                onChange={(e) => setResponseForm({ ...responseForm, assessment: e.target.value })}
                className="input"
                style={{ width: "100%" }}
                required
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label className="form-label">Clinical Recommendation</label>
              <textarea
                rows={2}
                placeholder="Enter treatment or procedural recommendations..."
                value={responseForm.recommendation}
                onChange={(e) => setResponseForm({ ...responseForm, recommendation: e.target.value })}
                className="input"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label className="form-label">Next Step / Disposition</label>
              <input
                type="text"
                placeholder="e.g. Schedule for OR / Transfer to Inpatient Ward / Follow-up in 2 weeks"
                value={responseForm.nextStep}
                onChange={(e) => setResponseForm({ ...responseForm, nextStep: e.target.value })}
                className="input"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" className="button button-secondary" onClick={() => setShowResponseModal(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={responding}>
                {responding ? "Saving..." : "Submit Response"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Telegram-style Doctor-to-Doctor Referral Chat Modal (Requirement 5) */}
      {showMessagesModal && (
        <Modal
          title={`Doctor Case Discussion — ${activeReferral?.patient_first_name} ${activeReferral?.patient_last_name} (${activeReferral?.patient_number || "MRN"})`}
          isOpen={showMessagesModal}
          onClose={() => setShowMessagesModal(false)}
        >
          {/* Referral Context Header Banner */}
          <div
            style={{
              background: "var(--surface-muted, #f8fafc)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "12px",
            }}
          >
            <div>
              <span style={{ color: "var(--text-muted)" }}>Referring: </span>
              <strong>Dr. {activeReferral?.referring_first_name} {activeReferral?.referring_last_name}</strong>
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>➔</span>
              <span style={{ color: "var(--text-muted)" }}>Receiving: </span>
              <strong>Dr. {activeReferral?.receiving_first_name} {activeReferral?.receiving_last_name}</strong>
            </div>
            <div>
              <UrgencyBadge urgency={activeReferral?.urgency} />
            </div>
          </div>

          {msgError && (
            <div className="alert alert-error" style={{ marginBottom: "12px", fontSize: "12px" }}>
              {msgError}
            </div>
          )}

          {/* Telegram-Style Chat Messages Stream */}
          <div
            style={{
              height: "360px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              padding: "16px",
              background: "var(--surface-subtle, #0f172a10)",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              marginBottom: "12px",
            }}
          >
            {messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 10px", fontSize: "13px" }}>
                <Stethoscope size={36} color="var(--primary)" style={{ opacity: 0.5, margin: "0 auto 8px auto" }} />
                <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: "4px" }}>
                  Clinical Case Discussion Thread
                </div>
                <div>No messages exchanged yet. Send a direct consultation note below.</div>
              </div>
            ) : (
              messages.map((m, idx) => {
                const currentStaffId = user?.staffId || user?.staff_id;
                const isSentByMe = m.sender_id === currentStaffId;

                // Date separator logic
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const showDateSeparator =
                  !prevMsg ||
                  new Date(m.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                const msgDateStr = formatDate(m.created_at);

                return (
                  <div key={m.id || idx} style={{ display: "flex", flexDirection: "column" }}>
                    {showDateSeparator && (
                      <div
                        style={{
                          textAlign: "center",
                          margin: "10px 0",
                          position: "relative",
                        }}
                      >
                        <span
                          style={{
                            background: "var(--surface, #1e293b)",
                            border: "1px solid var(--border)",
                            color: "var(--text-muted)",
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 10px",
                            borderRadius: "10px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {msgDateStr}
                        </span>
                      </div>
                    )}

                    {/* Chat Bubble */}
                    <div
                      style={{
                        alignSelf: isSentByMe ? "flex-end" : "flex-start",
                        maxWidth: "78%",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      {/* Sender label for received messages */}
                      {!isSentByMe && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--primary, #38bdf8)",
                            paddingLeft: "4px",
                          }}
                        >
                          Dr. {m.sender_first_name} {m.sender_last_name} ({m.sender_role || "Doctor"})
                        </span>
                      )}

                      <div
                        style={{
                          padding: "9px 13px",
                          borderRadius: isSentByMe
                            ? "14px 14px 2px 14px"
                            : "14px 14px 14px 2px",
                          background: isSentByMe
                            ? "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
                            : "var(--surface, #ffffff)",
                          color: isSentByMe ? "#ffffff" : "var(--text-main)",
                          border: isSentByMe ? "none" : "1px solid var(--border)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          fontSize: "13px",
                          lineHeight: "1.4",
                          wordBreak: "break-word",
                        }}
                      >
                        <div>{m.message}</div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "10px",
                            color: isSentByMe ? "rgba(255,255,255,0.75)" : "var(--text-muted)",
                            marginTop: "4px",
                          }}
                        >
                          <span>
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isSentByMe && <span>✓✓</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box */}
          <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Type your clinical notes or question... (Press Enter to send)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="input"
              style={{ flex: 1, padding: "10px 14px", borderRadius: "20px" }}
              disabled={sendingMsg}
              autoFocus
            />
            <button
              type="submit"
              className="button button-primary"
              disabled={sendingMsg || !newMessage.trim()}
              style={{
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                padding: 0,
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
              title="Send message (Enter)"
            >
              <Send size={16} />
            </button>
          </form>
        </Modal>
      )}
    </AppShell>
  );

}
