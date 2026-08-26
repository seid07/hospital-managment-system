import { useEffect, useState, useCallback } from "react";
import AppShell from "../components/layout/AppShell";
import Modal from "../components/common/Modal";
import {
  getReferralQueue,
  viewReferral,
  respondToReferral,
  getReferralMessages,
  sendReferralMessage,
} from "../services/referralService";
import { useDebounce } from "../hooks/useDebounce";
import {
  Inbox, AlertTriangle, Clock, CheckCircle, ChevronDown, ChevronUp,
  MessageSquare, Send, FileCheck, Filter, Search, RefreshCw
} from "lucide-react";

const URGENCY_CONFIG = {
  EMERGENCY: { label: "EMERGENCY", color: "#ef4444", bg: "#fef2f2", icon: AlertTriangle },
  URGENT:    { label: "URGENT",    color: "#f59e0b", bg: "#fffbeb", icon: Clock },
  ROUTINE:   { label: "ROUTINE",   color: "#6366f1", bg: "#eef2ff", icon: CheckCircle },
};

const STATUS_CONFIG = {
  PENDING:   { label: "Pending",   color: "#f59e0b" },
  VIEWED:    { label: "Viewed",    color: "#6366f1" },
  RESPONDED: { label: "Responded", color: "#10b981" },
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

export default function ReferralQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Response modal
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

  const refreshQueue = useCallback(() => setRefreshTrigger((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError("");
        const res = await getReferralQueue();
        if (!cancelled) {
          setQueue(res.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load referral queue.");
          setLoading(false);
        }
      }
    }
    load();
    // Poll every 30 seconds
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshTrigger]);

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

  async function handleExpand(referral) {
    if (expandedId === referral.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(referral.id);
    // Auto-mark as viewed when opening
    if (referral.status === "PENDING") {
      try {
        await viewReferral(referral.id);
        setQueue((prev) => prev.map((r) =>
          r.id === referral.id ? { ...r, status: "VIEWED" } : r
        ));
      } catch { /* non-fatal */ }
    }
  }

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
    } catch (err) {
      setMsgError(err.message || "Failed to send message.");
    } finally {
      setSendingMsg(false);
    }
  }

  function handleOpenResponse(referral) {
    setRespondingReferral(referral);
    setResponseForm({ assessment: "", recommendation: "", nextStep: "", treatmentRecommendation: "", followupRecommendation: "" });
    setResponseError("");
    setShowResponseModal(true);
  }

  async function handleSubmitResponse(e) {
    e.preventDefault();
    if (!responseForm.assessment.trim()) {
      setResponseError("Clinical assessment is required.");
      return;
    }
    try {
      setResponding(true);
      setResponseError("");
      await respondToReferral(respondingReferral.id, responseForm);
      setQueue((prev) => prev.map((r) =>
        r.id === respondingReferral.id ? { ...r, status: "RESPONDED" } : r
      ));
      setShowResponseModal(false);
      setRespondingReferral(null);
    } catch (err) {
      setResponseError(err.message || "Failed to submit response.");
    } finally {
      setResponding(false);
    }
  }

  const pendingCount = queue.filter((r) => r.status === "PENDING").length;
  const urgentCount = queue.filter((r) => r.urgency === "EMERGENCY" || r.urgency === "URGENT").length;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Clinical Workflow</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Inbox size={24} /> Referral Inbox
          </h1>
          <p className="page-description">
            Referrals sent to you from other doctors. Open a referral to mark it viewed, then submit your clinical response.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" onClick={refreshQueue}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Referrals", value: queue.length, color: "#6366f1" },
          { label: "Awaiting Review", value: pendingCount, color: "#f59e0b" },
          { label: "Urgent/Emergency", value: urgentCount, color: "#ef4444" },
          { label: "Responded", value: queue.filter((r) => r.status === "RESPONDED").length, color: "#10b981" },
        ].map((s) => (
          <div key={s.label} style={{
            flex: "1 1 140px", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "12px", padding: "14px 18px", textAlign: "center"
          }}>
            <div style={{ fontSize: "26px", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="search"
            placeholder="Search by patient, doctor, or case note..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ paddingLeft: "32px", width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Filter size={14} style={{ color: "var(--text-muted)" }} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ minWidth: "130px" }}>
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="VIEWED">Viewed</option>
            <option value="RESPONDED">Responded</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>Loading referrals...</div>
      ) : filteredQueue.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
          <Inbox size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
          <p style={{ fontWeight: 600 }}>No referrals found</p>
          <p style={{ fontSize: "13px" }}>Your referral inbox is clear.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredQueue.map((referral) => {
            const isExpanded = expandedId === referral.id;
            const statusCfg = STATUS_CONFIG[referral.status] || STATUS_CONFIG.PENDING;
            const ago = new Date(referral.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

            return (
              <div key={referral.id} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderLeft: `4px solid ${URGENCY_CONFIG[referral.urgency]?.color || "#6366f1"}`,
                borderRadius: "10px", overflow: "hidden",
                boxShadow: isExpanded ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
              }}>
                {/* Header row */}
                <div
                  style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}
                  onClick={() => handleExpand(referral)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <UrgencyBadge urgency={referral.urgency} />
                      <span style={{
                        background: statusCfg.color + "20", color: statusCfg.color,
                        borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700,
                      }}>
                        {statusCfg.label}
                      </span>
                      <strong style={{ fontSize: "14px" }}>
                        {referral.patient_first_name} {referral.patient_last_name}
                      </strong>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {referral.patient_number}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      From Dr. {referral.referring_first_name} {referral.referring_last_name}
                      {referral.referring_specialty ? ` — ${referral.referring_specialty}` : ""} · {ago}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {referral.status !== "RESPONDED" && (
                      <button
                        className="button button-primary"
                        style={{ fontSize: "12px", padding: "5px 12px" }}
                        onClick={(e) => { e.stopPropagation(); handleOpenResponse(referral); }}
                      >
                        <FileCheck size={12} /> Respond
                      </button>
                    )}
                    <button
                      className="button button-secondary"
                      style={{ fontSize: "12px", padding: "5px 10px" }}
                      onClick={(e) => { e.stopPropagation(); handleOpenMessages(referral); }}
                    >
                      <MessageSquare size={12} /> Messages
                    </button>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "16px 18px", background: "var(--bg)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "12px" }}>
                      {[
                        { label: "Chief Complaint / Symptoms", value: referral.symptoms },
                        { label: "Clinical Findings", value: referral.findings },
                        { label: "Working Diagnosis", value: referral.diagnosis },
                        { label: "Investigations Done", value: referral.investigation_info },
                        { label: "Treatment Provided", value: referral.treatment_provided },
                      ].filter((f) => f.value).map((field) => (
                        <div key={field.label}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{field.label}</div>
                          <div style={{ fontSize: "13px", marginTop: "4px" }}>{field.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Case Note / Referral Reason</div>
                      <div style={{ fontSize: "13px", lineHeight: 1.6 }}>{referral.case_note}</div>
                    </div>

                    {referral.status === "RESPONDED" && (
                      <div style={{ marginTop: "12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "12px" }}>
                        <div style={{ fontWeight: 700, color: "#15803d", fontSize: "12px", marginBottom: "8px" }}>
                          <CheckCircle size={12} /> Your Response — {new Date(referral.responded_at).toLocaleDateString()}
                        </div>
                        {[
                          { label: "Assessment", value: referral.response_assessment },
                          { label: "Recommendation", value: referral.response_recommendation },
                          { label: "Next Step", value: referral.response_next_step },
                          { label: "Treatment", value: referral.response_treatment },
                          { label: "Follow-up", value: referral.response_followup },
                        ].filter((f) => f.value).map((f) => (
                          <div key={f.label} style={{ marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#15803d" }}>{f.label}: </span>
                            <span style={{ fontSize: "13px" }}>{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Response Modal */}
      {showResponseModal && respondingReferral && (
        <Modal title="Submit Referral Response" onClose={() => setShowResponseModal(false)}>
          <div style={{ marginBottom: "12px", padding: "10px", background: "var(--bg)", borderRadius: "8px", fontSize: "13px" }}>
            <strong>Patient:</strong> {respondingReferral.patient_first_name} {respondingReferral.patient_last_name} ({respondingReferral.patient_number})<br />
            <strong>Urgency:</strong> <UrgencyBadge urgency={respondingReferral.urgency} />
          </div>
          {responseError && <div className="alert alert-error" style={{ marginBottom: "12px" }}>{responseError}</div>}
          <form onSubmit={handleSubmitResponse}>
            {[
              { key: "assessment", label: "Clinical Assessment *", required: true, placeholder: "Your clinical assessment of this patient..." },
              { key: "recommendation", label: "Recommendation", required: false, placeholder: "Management recommendation..." },
              { key: "nextStep", label: "Next Steps", required: false, placeholder: "Suggested next steps..." },
              { key: "treatmentRecommendation", label: "Treatment Recommendation", required: false, placeholder: "Recommended treatment..." },
              { key: "followupRecommendation", label: "Follow-up Plan", required: false, placeholder: "Follow-up schedule or plan..." },
            ].map((field) => (
              <div key={field.key} className="form-group">
                <label className="form-label">{field.label}</label>
                <textarea
                  rows={3}
                  placeholder={field.placeholder}
                  value={responseForm[field.key]}
                  onChange={(e) => setResponseForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  required={field.required}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="button button-secondary" onClick={() => setShowResponseModal(false)}>Cancel</button>
              <button type="submit" className="button button-primary" disabled={responding}>
                {responding ? "Submitting..." : <><FileCheck size={14} /> Submit Response</>}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Messages Modal */}
      {showMessagesModal && activeReferral && (
        <Modal title={`Messages — ${activeReferral.patient_first_name} ${activeReferral.patient_last_name}`} onClose={() => setShowMessagesModal(false)}>
          {msgError && <div className="alert alert-error">{msgError}</div>}
          <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px", fontSize: "13px" }}>
                No messages yet. Start the conversation below.
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} style={{
                background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px",
              }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                  Dr. {msg.sender_first_name} {msg.sender_last_name} · {new Date(msg.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: "13px" }}>{msg.message}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="button button-primary" disabled={sendingMsg || !newMessage.trim()}>
              <Send size={14} /> Send
            </button>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
