import { consumeLimit } from "../services/rateLimitService.js";
export const authRateLimit = ({ production, consume = consumeLimit }) => async (req, res, next) => {
  const path = req.path.toLowerCase().replace(/\/+$/, "");
  if (!production || req.method !== "POST" || !["/login", "/register"].includes(path)) return next();
  try {
    // Forwarding headers are untrusted. Proxy peers share this coarse ceiling
    // until platform client-IP provenance is verified at deployment.
    const address = req.socket.remoteAddress || "unknown", login = path === "/login";
    const limits = [[login ? "login-peer" : "register-peer", address, login ? 300 : 30]];
    if (login && typeof req.body?.email === "string") limits.push(["login-account", req.body.email.trim().toLowerCase(), 10]);
    for (const [scope, identity, limit] of limits) {
      const result = await consume(scope, identity, { limit, windowMs: 15 * 60000 });
      if (!result.allowed) return res.set("Retry-After", String(result.retryAfter)).status(429).json({ success: false, message: "Too many requests. Please try again later." });
    }
    next();
  } catch (error) { error.status = 503; next(error); }
};
