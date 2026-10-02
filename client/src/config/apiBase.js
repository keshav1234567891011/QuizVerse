export function resolveApiBase(value, production) {
  const base = typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
  if (!base) return production ? "" : "http://localhost:5000";
  // Existing callers already append /api; accepting /api would duplicate it.
  if (base === "/api") return "";
  let url;
  try { url = new URL(base); } catch { throw new Error("VITE_API_URL must be empty, /api, or an API origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== base || url.username || url.password) throw new Error("VITE_API_URL must be an API origin.");
  const localHost = url.hostname === "localhost" || url.hostname.endsWith(".localhost") || /^127\./.test(url.hostname) || ["[::1]", "0.0.0.0"].includes(url.hostname);
  if (production && (url.protocol !== "https:" || localHost)) throw new Error("Production VITE_API_URL must not use localhost or insecure HTTP.");
  return base;
}
