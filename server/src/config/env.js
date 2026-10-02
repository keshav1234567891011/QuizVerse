const invalid = name => { throw Object.assign(new Error(`Invalid configuration: ${name}.`), { configField: name }); };
const localHost = host => host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || ["[::1]", "0.0.0.0"].includes(host);
export function readEnvironment(env = process.env, { requireSecrets = true } = {}) {
  const mode = env.NODE_ENV || "development";
  if (!["development", "test", "production"].includes(mode)) invalid("NODE_ENV");
  const production = mode === "production";
  const origins = (env.CLIENT_URL || (production ? "" : "http://localhost:5173")).split(",").map(v => v.trim());
  if (!origins.length || origins.some(v => !v)) invalid("CLIENT_URL");
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { invalid("CLIENT_URL"); }
    if (url.origin !== origin || url.username || url.password || !["http:", "https:"].includes(url.protocol)) invalid("CLIENT_URL");
    if (production && (url.protocol !== "https:" || localHost(url.hostname))) invalid("CLIENT_URL");
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid("PORT");
  if (requireSecrets) {
    if (!/^mongodb(?:\+srv)?:\/\/[^\s]+$/.test(env.MONGO_URI || "")) invalid("MONGO_URI");
    if (typeof env.JWT_SECRET !== "string" || Buffer.byteLength(env.JWT_SECRET) < 32) invalid("JWT_SECRET");
    if (!/^[a-f0-9]{64}$/i.test(env.ADMIN_REFERENCE_SECRET || "")) invalid("ADMIN_REFERENCE_SECRET");
  }
  return { production, mode, origins: [...new Set(origins)], port };
}
