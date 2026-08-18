import { get, patch, post } from "./api";

export async function getNotifications(limit = 20) {
  return get(`/notifications?limit=${limit}`);
}

export async function markAsRead(id) {
  return patch(`/notifications/${id}/read`, {});
}

export async function markAllAsRead() {
  return post("/notifications/read-all", {});
}
