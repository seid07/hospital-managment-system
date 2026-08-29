import { useEffect } from "react";

function ToastPrompt({ message, type = "success", onClose, duration = 4000 }) {
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
        zIndex: 9999,
        minWidth: "320px",
        maxWidth: "460px",
        background: isSuccess ? "#064e3b" : "#7f1d1d",
        color: "#ffffff",
        borderRadius: "8px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
        overflow: "hidden",
        animation: "toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        display: "flex",
        flexDirection: "column",
        border: isSuccess ? "1px solid #059669" : "1px solid #dc2626",
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
        <span style={{ fontSize: "20px", lineHeight: 1 }}>
          {isSuccess ? "✓" : "⚠️"}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px", letterSpacing: "0.2px" }}>
            {isSuccess ? "Success Notification" : "Error Alert"}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.95, lineHeight: 1.4 }}>
            {message}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 255, 255, 0.8)",
            fontSize: "18px",
            cursor: "pointer",
            padding: "0 4px",
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* 4-second Countdown Progress Bar */}
      <div
        style={{
          height: "3px",
          background: isSuccess ? "#34d399" : "#f87171",
          animation: `toastProgress ${duration}ms linear forwards`,
        }}
      />

      <style>{`
        @keyframes toastSlideIn {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes toastProgress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}

export default ToastPrompt;
