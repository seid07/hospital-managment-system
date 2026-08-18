function StatusBadge({ status }) {
  if (!status) return null;

  const normalized = String(status).toUpperCase();

  let variant = "badge-info";

  if (["COMPLETED", "PAID", "VERIFIED", "DISPENSED", "ACTIVE", "NORMAL"].includes(normalized)) {
    variant = "badge-success";
  } else if (
    ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "PARTIALLY_PAID", "PARTIALLY_DISPENSED", "SPECIMEN_COLLECTED", "PROCESSING", "RESULTED", "URGENT", "MODERATE"].includes(
      normalized
    )
  ) {
    variant = "badge-warning";
  } else if (
    ["CANCELLED", "NO_SHOW", "EMERGENCY", "CRITICAL", "STAT", "SEVERE", "INACTIVE"].includes(
      normalized
    )
  ) {
    variant = "badge-danger";
  }

  const label = normalized.replace(/_/g, " ");

  return <span className={`badge ${variant}`}>{label}</span>;
}

export default StatusBadge;
