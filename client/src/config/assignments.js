import { API_URL } from "./api.js";

export async function assignmentApi(path, options = {}) {
  const response = await fetch(`${API_URL}/api/${path}`, { credentials: "include", ...options,
    headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not complete this request.");
  return data;
}
export const dateLabel = value => value ? new Date(value).toLocaleString() : "No time set";
export const localDate = value => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
