const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(endpoint, options = {}) {
  const token = localStorage.getItem("hospital_token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  let data = null;

  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    throw new Error(data?.message || "Request failed.");
  }

  return data;
}

export function get(endpoint, options = {}) {
  return request(endpoint, {
    ...options,
    method: "GET",
  });
}

export function post(endpoint, body, options = {}) {
  return request(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function put(endpoint, body, options = {}) {
  return request(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function patch(endpoint, body, options = {}) {
  return request(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function del(endpoint, options = {}) {
  return request(endpoint, {
    ...options,
    method: "DELETE",
  });
}

export async function checkSystemStatus() {
  return get("/auth/status");
}

export async function setupAdmin(data) {
  return post("/auth/setup-admin", data);
}

export async function login(username, password) {
  return post("/auth/login", {
    username,
    password,
  });
}

export async function forgotPassword(identityData) {
  return post("/auth/forgot-password", typeof identityData === "string" ? { username: identityData } : identityData);
}

export async function resetPassword(token, newPassword) {
  return post("/auth/reset-password", { token, newPassword });
}

export async function getProtectedData() {
  return get("/test/protected");
}

export async function recordSelectivePayment(paymentData) {
  return post("/billing/payments/selective", paymentData);
}

export async function reversePayment(paymentId, reason) {
  return post(`/billing/payments/${paymentId}/reverse`, { reason });
}

export async function getInventoryTransactions(params = {}) {
  const query = new URLSearchParams(params).toString();
  return get(`/pharmacy/inventory-transactions${query ? `?${query}` : ""}`);
}

export async function getServicePriceHistory(serviceId) {
  return get(`/services/${serviceId}/history`);
}

const api = {
  get,
  post,
  put,
  patch,
  del,
  request,
  checkSystemStatus,
  setupAdmin,
  login,
  forgotPassword,
  resetPassword,
  recordSelectivePayment,
  reversePayment,
  getInventoryTransactions,
  getServicePriceHistory,
};

export default api;
