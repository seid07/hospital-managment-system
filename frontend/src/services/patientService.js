import {
  get,
  post,
} from "./api";

export async function searchPatients(
  query
) {
  const params =
    new URLSearchParams({
      q: query,
    });

  return get(
    `/patients/search?${params}`
  );
}

export async function createPatient(
  patient
) {
  return post(
    "/patients",
    patient
  );
}

export async function getPatient(id) {
  return get(`/patients/${id}`);
}
