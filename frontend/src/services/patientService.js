import { get, post, put } from "./api";

export async function searchPatients(query, pagination = {}) {
  const params = new URLSearchParams({
    q: query,
    ...(pagination.page ? { page: pagination.page } : {}),
    ...(pagination.limit ? { limit: pagination.limit } : {}),
  });

  return get(`/patients/search?${params}`);
}

export async function getPatients(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.search) params.append("search", query.search);

  return get(`/patients?${params.toString()}`);
}

export async function createPatient(patient) {
  return post("/patients", patient);
}

export async function updatePatient(id, patient) {
  return put(`/patients/${id}`, patient);
}

export async function getPatient(id) {
  return get(`/patients/${id}`);
}

export async function getPatientRecord(id) {
  return get(`/patients/${id}/record`);
}
