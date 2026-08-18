import { get } from "./api";

export async function getDashboardKPIs() {
  return get("/reports/dashboard-kpis");
}

export async function getAnalyticsReport(type, params = {}) {
  const query = new URLSearchParams({
    type,
    ...(params.startDate ? { startDate: params.startDate } : {}),
    ...(params.endDate ? { endDate: params.endDate } : {}),
    ...(params.doctorId ? { doctorId: params.doctorId } : {}),
  });

  return get(`/reports/analytics?${query.toString()}`);
}
