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

export async function login(username, password) {
  return post("/auth/login", {
    username,
    password,
  });
}

export async function forgotPassword(username) {
  return post("/auth/forgot-password", { username });
}

export async function resetPassword(token, newPassword) {
  return post("/auth/reset-password", { token, newPassword });
}

export async function getProtectedData() {
  return get("/test/protected");
}

const api = { get, post, put, patch, del, request, login, forgotPassword, resetPassword };
export default api;
