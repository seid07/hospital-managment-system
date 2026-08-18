import { get, post } from "./api";

export async function getTestCatalog(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.search) params.append("search", query.search);
  if (query.category) params.append("category", query.category);

  return get(`/laboratory/catalog?${params.toString()}`);
}

export async function addCatalogTest(data) {
  return post("/laboratory/catalog", data);
}

export async function createLabOrder(data) {
  return post("/laboratory/orders", data);
}

export async function getLabOrders(query = {}) {
  const params = new URLSearchParams();
  if (query.page) params.append("page", query.page);
  if (query.limit) params.append("limit", query.limit);
  if (query.status) params.append("status", query.status);
  if (query.priority) params.append("priority", query.priority);
  if (query.search) params.append("search", query.search);

  return get(`/laboratory/orders?${params.toString()}`);
}

export async function getLabOrder(id) {
  return get(`/laboratory/orders/${id}`);
}

export async function collectSpecimen(id) {
  return post(`/laboratory/orders/${id}/specimen`, {});
}

export async function enterResults(id, data) {
  return post(`/laboratory/orders/${id}/results`, data);
}

export async function verifyResults(id) {
  return post(`/laboratory/orders/${id}/verify`, {});
}
