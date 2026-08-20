import { get, post, del } from "./api";

export async function getDoctors(params = {}) {
  const query = new URLSearchParams();
  if (params.date) query.append("date", params.date);
  if (params.specialty) query.append("specialty", params.specialty);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return get(`/schedules/doctors${qs}`);
}

export async function getDoctorSchedules(doctorId) {
  return get(`/schedules/doctors/${doctorId}`);
}

export async function getDoctorUpcomingAvailability(doctorId, days = 14) {
  return get(`/schedules/doctors/${doctorId}/upcoming?days=${days}`);
}

export async function createSchedule(doctorId, data) {
  return post(`/schedules/doctors/${doctorId}`, data);
}

export async function deleteSchedule(id) {
  return del(`/schedules/${id}`);
}
