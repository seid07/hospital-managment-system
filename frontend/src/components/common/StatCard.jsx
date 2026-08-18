function StatCard({ label, value, icon, description, badge }) {
  return (
    <article className="dashboard-card">
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
      </div>
    </article>
  );
}

export default StatCard;
