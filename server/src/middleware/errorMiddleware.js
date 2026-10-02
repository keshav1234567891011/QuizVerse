import { logError } from "../utils/logger.js";
export const notFound = (req, res) => res.status(404).json({ success: false, message: "API route not found." });
export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500, message = "Could not complete the request.";
  if (error.type === "entity.parse.failed") { status = 400; message = "Invalid JSON body."; }
  else if (error.type === "entity.too.large") { status = 413; message = "Request body is too large."; }
  else if (error.type === "encoding.unsupported" || error.type === "charset.unsupported") { status = 415; message = "Unsupported request encoding."; }
  else if (error.status === 503) { status = 503; message = "Service temporarily unavailable. Please try again."; }
  if (status >= 500) logError("api-request-failed", error);
  res.status(status).json({ success: false, message });
}
