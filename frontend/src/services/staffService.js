import { get, post, put, patch } from "./api";

export async function getRoles() {
  return get("/staff/roles");
}

export async function getStaff(query = {}) {
  const params = new URLSearchParams();
  if (query.role) params.append("role", query.role);
  if (query.search) params.append("search", query.search);

  return get(`/staff?${params.toString()}`);
}

export async function createStaff(data) {
  return post("/staff", data);
}

export async function updateStaff(id, data) {
  return put(`/staff/${id}`, data);
}

export async function updateStaffStatus(id, isActive, options = {}) {
  return patch(`/staff/${id}/status`, { isActive, ...options });
}

export async function getDoctorScheduledAppointments(id, startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  return get(`/staff/${id}/scheduled-appointments?${params.toString()}`);
}
