import { get } from "./api";

export async function getAuditLogs(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.action) params.append("action", query.action);
  if (query.entity) params.append("entity", query.entity);
  if (query.search) params.append("search", query.search);
  if (query.startDate) params.append("startDate", query.startDate);
  if (query.endDate) params.append("endDate", query.endDate);

  return get(`/audit-logs?${params.toString()}`);
}
