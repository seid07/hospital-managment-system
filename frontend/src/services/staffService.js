import { get, post, put, patch, del } from "./api";

export async function getRoles() {
  return get("/staff/roles");
}

export async function checkEmailAvailability(email, excludeStaffId = null) {
  const params = new URLSearchParams();
  if (email) params.append("email", email);
  if (excludeStaffId) params.append("excludeStaffId", excludeStaffId);
  return get(`/staff/check-email?${params.toString()}`);
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

export async function deleteStaffPermanently(id) {
  return del(`/staff/${id}/permanent`);
}

export async function updateStaffStatus(id, isActive, options = {}) {
  return patch(`/staff/${id}/status`, { isActive, ...options });
}

export async function sendStaffEmailVerification(email) {
  return post("/staff/send-email-verification", { email });
}

export async function verifyStaffEmail(token) {
  return post("/auth/verify-email", { token });
}

export async function resendStaffCredentials(staffId) {
  return post(`/staff/${staffId}/resend-credentials`, {});
}

export async function getDoctorScheduledAppointments(id, startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  return get(`/staff/${id}/scheduled-appointments?${params.toString()}`);
}

