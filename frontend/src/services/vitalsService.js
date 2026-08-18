import { get, post } from "./api";

export async function recordVitals(data) {
  return post("/vitals", data);
}

export async function getPatientVitals(patientId) {
  return get(`/vitals/patient/${patientId}`);
}

export async function getTriageQueue() {
  return get("/vitals/triage/queue");
}
