import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markAsRead, markAllAsRead } from "../../services/notificationService";
import { useCalendar } from "../../context/useCalendar";
import { useToast } from "../../context/useToast";
import { Calendar } from "lucide-react";

function getInitials(user) {
  const first = user?.first_name?.charAt(0) || "";
  const last = user?.last_name?.charAt(0) || "";
  return `${first}${last}`.toUpperCase() || "U";
}

function formatRole(role) {
  if (!role) return "User";
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Topbar({ user, logout, onToggleSidebar }) {
  const navigate = useNavigate();
  const { calendarSystem, setCalendarSystem, todayFormatted } = useCalendar();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef(null);


  useEffect(() => {
    let cancelled = false;
    async function loadNotes() {
      try {
        const res = await getNotifications(10);
        if (!cancelled && res.data) {
          setNotifications(res.data);
          setUnreadCount(res.unreadCount || 0);
        }
      } catch {
        // Silently fail if not loaded
      }
    }
    loadNotes();
    const interval = setInterval(loadNotes, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  async function handleMarkRead(id) {
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="button button-secondary mobile-menu-button"
          onClick={onToggleSidebar}
          style={{ display: "none" }}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>

        <div>
          <h2 className="topbar-title">Clinical Operations</h2>
          <div className="topbar-subtitle">Hospital Management System</div>
        </div>
      </div>

      <div className="topbar-right">
        {/* Notification Bell */}
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ position: "relative", padding: "8px 12px", minHeight: "36px" }}
            aria-label="View notifications"
          >
            🔔
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  background: "var(--danger)",
                  color: "#fff",
                  borderRadius: "50%",
                  fontSize: "10px",
                  fontWeight: 700,
                  width: "18px",
                  height: "18px",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: "320px",
                maxHeight: "400px",
                overflowY: "auto",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow)",
                zIndex: 50,
                padding: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: "8px",
                  borderBottom: "1px solid var(--border)",
                  marginBottom: "8px",
                }}
              >
                <strong style={{ fontSize: "13px" }}>Notifications</strong>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "11px", cursor: "pointer" }}
                    onClick={handleMarkAllRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                  No new notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && handleMarkRead(n.id)}
                    style={{
                      padding: "8px",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "6px",
                      background: n.is_read ? "transparent" : "var(--primary-light)",
                      cursor: n.is_read ? "default" : "pointer",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>{n.title}</div>
                    <div style={{ color: "var(--text-secondary)", marginTop: "2px", fontSize: "11px" }}>{n.message}</div>
                    <div style={{ color: "var(--text-muted)", marginTop: "4px", fontSize: "10px" }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="topbar-user">
          <div className="topbar-avatar">{getInitials(user)}</div>
          <div className="topbar-user-info">
            <span className="topbar-user-name">
              {user?.first_name} {user?.last_name}
            </span>
            <span className="topbar-user-role">{formatRole(user?.role)}</span>
          </div>
        </div>

        {/* Real-time Ethiopian / Gregorian Calendar Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "2px 8px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <Calendar size={14} color={calendarSystem === "EC" ? "#059669" : "#0284c7"} style={{ marginRight: "4px" }} />
            <select
              value={calendarSystem}
              onChange={(e) => {
                const newSys = e.target.value;
                setCalendarSystem(newSys);
                toast.info(`Calendar switched to ${newSys === "EC" ? "Ethiopian Calendar (E.C.)" : "Gregorian Calendar (G.C.)"}`, 4000);
              }}
              style={{
                border: "none",
                background: "transparent",
                fontWeight: 700,
                fontSize: "12px",
                color: "#1e293b",
                cursor: "pointer",
                outline: "none",
                padding: "4px 2px",
              }}
              aria-label="Switch System Calendar"
              title="Toggle between Ethiopian Calendar (EC) and Gregorian Calendar (GC)"
            >
              <option value="EC">EC (Ethiopian Calendar)</option>
              <option value="GC">GC (Gregorian Calendar)</option>
            </select>
          </div>

          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "5px 9px",
              borderRadius: "6px",
              background: calendarSystem === "EC" ? "#ecfdf5" : "#f0f9ff",
              color: calendarSystem === "EC" ? "#065f46" : "#0369a1",
              border: `1px solid ${calendarSystem === "EC" ? "#a7f3d0" : "#bae6fd"}`,
              whiteSpace: "nowrap",
            }}
            title="Real-time today date in active calendar"
          >
            {todayFormatted}
          </span>
        </div>

        <button
          type="button"
          className="button button-secondary"
          onClick={() => navigate("/change-password")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
          aria-label="Change Password"
          title="Update your account password"
        >
          Change Password
        </button>

        <button
          type="button"
          className="button button-secondary"
          onClick={logout}
          aria-label="Logout"
        >
          Logout
        </button>

      </div>
    </header>
  );
}

export default Topbar;
