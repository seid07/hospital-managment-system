import { get, post, patch } from "./api";

export async function createReferral(data) {
  return post("/referrals", data);
}

export async function getReferralQueue() {
  return get("/referrals/queue");
}

export async function getSentReferrals() {
  return get("/referrals/sent");
}

export async function getReferral(id) {
  return get(`/referrals/${id}`);
}

export async function viewReferral(id) {
  return patch(`/referrals/${id}/view`, {});
}

export async function respondToReferral(id, responseData) {
  return patch(`/referrals/${id}/respond`, responseData);
}

export async function getReferralMessages(id) {
  return get(`/referrals/${id}/messages`);
}

export async function sendReferralMessage(id, message) {
  return post(`/referrals/${id}/messages`, { message });
}

export async function getPatientReferrals(patientId) {
  return get(`/patients/${patientId}/referrals`);
}

export async function getAvailableDates(doctorId, days = 30) {
  return get(`/schedules/doctors/${doctorId}/available-dates?days=${days}`);
}

export async function getPendingCashierOrdersGrouped(query = {}) {
  const params = new URLSearchParams();
  if (query.search) params.append("search", query.search);
  return get(`/billing/pending-orders-grouped?${params.toString()}`);
}
