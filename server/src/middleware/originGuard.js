export const originGuard = config => (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if ((config.production && !origin) || (origin && !config.origins.includes(origin))) return res.status(403).json({ success: false, message: "Request origin is not allowed." });
  const hasBody = Number(req.get("Content-Length")) > 0 || !!req.get("Transfer-Encoding");
  if (hasBody && !req.is("application/json")) return res.status(415).json({ success: false, message: "Use application/json for this request." });
  next();
};
