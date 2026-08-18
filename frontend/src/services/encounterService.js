import { get, post, put } from "./api";

export async function createEncounter(data) {
  return post("/encounters", data);
}

export async function updateEncounter(id, data) {
  return put(`/encounters/${id}`, data);
}

export async function completeEncounter(id) {
  return post(`/encounters/${id}/complete`, {});
}

export async function getEncounter(id) {
  return get(`/encounters/${id}`);
}

export async function getDoctorQueue(doctorId, date) {
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  return get(`/encounters/doctor/${doctorId}/queue${params}`);
}
