import { useState, useCallback, useEffect, useMemo } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { ToastContext } from "./toast-context";

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type, message, duration = 5000) => {
      if (!message) return;
      const id = Date.now() + Math.random().toString(36).substring(2, 9);
      const newToast = { id, type, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toast = useMemo(
    () => ({
      success: (msg, dur = 5000) => addToast("success", msg, dur),
      error: (msg, dur = 5000) => addToast("error", msg, dur),
      info: (msg, dur = 5000) => addToast("info", msg, dur),
      warning: (msg, dur = 5000) => addToast("warning", msg, dur),
    }),
    [addToast]
  );

  useEffect(() => {
    window.toast = toast;
  }, [toast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Global Floating Toast Container */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          right: "20px",
          zIndex: 999999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxWidth: "420px",
          width: "calc(100% - 40px)",
          pointerEvents: "none",
        }}
        aria-live="polite"
      >
        {toasts.map((t) => {
          const isSuccess = t.type === "success";
          const isError = t.type === "error";
          const isWarning = t.type === "warning";

          let borderLeftColor = "#0284c7";
          let bg = "#ffffff";
          let textColor = "#0f172a";
          let progressColor = "#0284c7";
          let IconComponent = Info;
          let iconColor = "#0284c7";

          if (isSuccess) {
            borderLeftColor = "#059669";
            progressColor = "#10b981";
            IconComponent = CheckCircle2;
            iconColor = "#059669";
          } else if (isError) {
            borderLeftColor = "#dc2626";
            progressColor = "#ef4444";
            IconComponent = AlertCircle;
            iconColor = "#dc2626";
          } else if (isWarning) {
            borderLeftColor = "#d97706";
            progressColor = "#f59e0b";
            IconComponent = AlertTriangle;
            iconColor = "#d97706";
          }

          return (
            <div
              key={t.id}
              className="toast-item"
              onClick={() => removeToast(t.id)}
              style={{
                pointerEvents: "auto",
                background: bg,
                border: "1px solid #e2e8f0",
                borderLeft: `5px solid ${borderLeftColor}`,
                borderRadius: "10px",
                padding: "14px 16px",
                color: textColor,
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ flexShrink: 0, marginTop: "2px" }}>
                <IconComponent size={20} color={iconColor} />
              </div>

              <div style={{ flex: 1, fontSize: "13px", fontWeight: 600, lineHeight: 1.4 }}>
                {t.message}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(t.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "2px",
                  cursor: "pointer",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>

              {/* 5-Second Countdown Progress Bar */}
              {t.duration > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    height: "3px",
                    background: progressColor,
                    width: "100%",
                    animation: `toastProgress ${t.duration}ms linear forwards`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
