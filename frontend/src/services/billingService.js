import { get, post } from "./api";

export async function getServices(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.search) params.append("search", query.search);
  if (query.category) params.append("category", query.category);

  return get(`/billing/services?${params.toString()}`);
}

export async function addService(data) {
  return post("/billing/services", data);
}

export async function createInvoice(data) {
  return post("/billing/invoices", data);
}

export async function getInvoices(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.status) params.append("status", query.status);
  if (query.search) params.append("search", query.search);
  if (query.patientId) params.append("patientId", query.patientId);

  return get(`/billing/invoices?${params.toString()}`);
}

export async function getInvoice(id) {
  return get(`/billing/invoices/${id}`);
}

export async function recordPayment(data) {
  return post("/billing/payments", data);
}

export async function getPendingCashierOrders(query = {}) {
  const params = new URLSearchParams();
  if (query.search) params.append("search", query.search);
  return get(`/billing/pending-orders?${params.toString()}`);
}
