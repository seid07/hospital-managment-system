import { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

function ToastPrompt({ message, type = "success", onClose, duration = 5000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const isSuccess = type === "success";

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 99999,
        minWidth: "320px",
        maxWidth: "460px",
        background: "#ffffff",
        color: "#0f172a",
        borderRadius: "10px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        animation: "toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
        borderLeft: isSuccess ? "5px solid #059669" : "5px solid #dc2626",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "14px 16px",
        }}
      >
        <span style={{ marginTop: "2px", flexShrink: 0 }}>
          {isSuccess ? (
            <CheckCircle2 size={20} color="#059669" />
          ) : (
            <AlertCircle size={20} color="#dc2626" />
          )}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: isSuccess ? "#065f46" : "#991b1b", marginBottom: "2px" }}>
            {isSuccess ? "Success" : "Error Alert"}
          </div>
          <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.4 }}>
            {message}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>

      {/* 5-second Countdown Progress Bar */}
      <div
        style={{
          height: "3px",
          background: isSuccess ? "#10b981" : "#ef4444",
          animation: `toastProgress ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

export default ToastPrompt;
