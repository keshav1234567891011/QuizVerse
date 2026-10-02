import { API_URL } from "./api.js";
export async function adminApi(path, { body, ...options } = {}) {
  const response = await fetch(`${API_URL}/api/admin/${path}`, { credentials: "include", ...options,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "The admin request could not be completed.");
  return data;
}
export const adminDate = value => value ? new Date(value).toLocaleString() : "Not set";
export const recordReference = (resource, row) => resource === "users" ? row.publicId : resource === "groups" ? row.groupCode : resource === "assignments" ? row.token : row.reference;
