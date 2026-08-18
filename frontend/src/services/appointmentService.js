import { get, post, patch } from "./api";

export async function getAvailability(doctorId, date) {
  const params = new URLSearchParams({
    doctorId,
    date,
  });

  return get(`/appointments/availability?${params}`);
}

export async function getAppointments(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.date) params.append("date", query.date);
  if (query.doctorId) params.append("doctorId", query.doctorId);
  if (query.patientId) params.append("patientId", query.patientId);
  if (query.status) params.append("status", query.status);
  if (query.search) params.append("search", query.search);

  return get(`/appointments?${params.toString()}`);
}

export async function getAppointment(id) {
  return get(`/appointments/${id}`);
}

export async function createAppointment(appointment) {
  return post("/appointments", appointment);
}

export async function updateAppointmentStatus(id, status, notes = "") {
  return patch(`/appointments/${id}/status`, { status, notes });
}

export async function rescheduleAppointment(id, data) {
  return post(`/appointments/${id}/reschedule`, data);
}
