// Only allow operational metadata. Never serialize an Error, request, or body.
export function logError(event, error, sink = console.error) {
  const knownNames = ["Error", "ValidationError", "CastError", "MongoServerError", "MongoNetworkError", "MongoServerSelectionError", "SyntaxError"];
  const fields = ["NODE_ENV", "PORT", "CLIENT_URL", "MONGO_URI", "JWT_SECRET", "ADMIN_REFERENCE_SECRET"];
  sink(JSON.stringify({ event, errorType: knownNames.includes(error?.name) ? error.name : "Error", ...(Number.isInteger(error?.code) ? { code: error.code } : {}), ...(fields.includes(error?.configField) ? { configField: error.configField } : {}) }));
}
