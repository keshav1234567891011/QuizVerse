import { API_URL } from "./api.js";
export async function communicationsApi(path, options = {}) {
  const response = await fetch(`${API_URL}/api/${path}`, { credentials: "include", ...options,
    headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not complete this request.");
  return data;
}
export function notificationLink(notification) {
  const related = notification.related || {};
  if (related.assignmentToken) return `/a/${related.assignmentToken}`;
  if (related.requestPublicId) return "/groups#requests";
  if (related.groupCode && notification.type !== "classroom-deleted" && notification.type !== "membership-removed") return `/groups/${related.groupCode}/chat`;
  return "/groups";
}
