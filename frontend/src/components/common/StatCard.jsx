import { useNavigate } from "react-router-dom";

function StatCard({ label, value, icon, description, badge, to, onClick }) {
  const navigate = useNavigate();
  const isClickable = Boolean(to || onClick);

  function handleClick() {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    }
  }

  function handleKeyDown(e) {
    if (isClickable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <article
      className={`dashboard-card ${isClickable ? "dashboard-card-clickable" : ""}`}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `${label}: ${value}. Click to view details` : undefined}
      style={{
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
        transition: "all 150ms ease",
      }}
    >
      <div className="dashboard-card-header">
        <span className="dashboard-card-label">{label}</span>
        {icon && <span className="dashboard-card-icon">{icon}</span>}
      </div>

      <div className="dashboard-card-value">
        {value !== undefined && value !== null ? value : "—"}
      </div>

      <div className="dashboard-card-description">
        {description}
        {badge && <span style={{ marginLeft: "8px" }}>{badge}</span>}
        {isClickable && (
          <span style={{ float: "right", fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>
            View →
          </span>
        )}
      </div>
    </article>
  );
}

export default StatCard;
