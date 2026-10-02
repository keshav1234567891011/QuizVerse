import mongoose from "mongoose";

export function createConnector(driver = mongoose, env = process.env) {
  let pending, connected = false;
  return function connectDB(options = {}) {
    if (connected && driver.connection.readyState === 0) { pending = undefined; connected = false; }
    if (pending) return pending;
    if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI || "")) return Promise.reject(new Error("Invalid configuration: MONGO_URI."));
    const production = env.NODE_ENV === "production";
    const settings = { maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000,
      socketTimeoutMS: 30000, bufferCommands: false, ...options,
      ...(production ? { autoIndex: false, autoCreate: false } : {}) };
    pending = Promise.resolve().then(() => driver.connect(env.MONGO_URI, settings)).then(result => { connected = true; return result; }).catch(error => { pending = undefined; connected = false; throw error; });
    return pending;
  };
}
export default createConnector();
