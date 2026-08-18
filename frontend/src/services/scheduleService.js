import { get, post, del } from "./api";

export async function getDoctors() {
  return get("/schedules/doctors");
}

export async function getDoctorSchedules(doctorId) {
  return get(`/schedules/doctors/${doctorId}`);
}

export async function createSchedule(doctorId, data) {
  return post(`/schedules/doctors/${doctorId}`, data);
}

export async function deleteSchedule(id) {
  return del(`/schedules/${id}`);
}
