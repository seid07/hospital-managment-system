import { get, post, patch } from "./api";

export async function createPrescription(data) {
  return post("/pharmacy/prescriptions", data);
}

export async function getPrescriptions(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.status) params.append("status", query.status);
  if (query.search) params.append("search", query.search);

  return get(`/pharmacy/prescriptions?${params.toString()}`);
}

export async function dispensePrescription(id, data = {}) {
  return post(`/pharmacy/prescriptions/${id}/dispense`, data);
}

export async function getMedications(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.search) params.append("search", query.search);
  if (query.lowStock) params.append("lowStock", query.lowStock);

  return get(`/pharmacy/medications?${params.toString()}`);
}

export async function addMedication(data) {
  return post("/pharmacy/medications", data);
}

export async function updateStock(id, data) {
  return patch(`/pharmacy/medications/${id}/stock`, data);
}
