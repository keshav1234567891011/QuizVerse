import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import User from "../models/User.js";

class BootstrapError extends Error {}

function validate(env) {
  let database;
  try {
    if (typeof env.MONGO_URI !== "string" || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI)) throw new Error();
    // Parse with the existing MongoDB driver; this performs no network request.
    database = new mongoose.mongo.MongoClient(env.MONGO_URI).options.dbName;
  } catch { throw new BootstrapError("Invalid MONGO_URI."); }
  if (database !== "quizverse_prod") throw new BootstrapError("Database must be quizverse_prod.");
  const email = typeof env.ADMIN_EMAIL === "string" ? env.ADMIN_EMAIL.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BootstrapError("Invalid ADMIN_EMAIL.");
  const password = env.ADMIN_PASSWORD;
  if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
    throw new BootstrapError("ADMIN_PASSWORD must be at least 6 characters and at most 72 UTF-8 bytes.");
  }
  return { email, password };
}

// Explicit CLI only: no dotenv, HTTP route, index preparation, or migrations.
// Run once under a single operator; do not run competing bootstrap processes.
export async function bootstrapAdmin({ env = process.env, driver = mongoose, Model = User, hash = bcrypt.hash, output = console.log } = {}) {
  let result, exitCode = 0;
  try {
    const { email, password } = validate(env);
    await driver.connect(env.MONGO_URI, { dbName: "quizverse_prod", autoIndex: false, autoCreate: false,
      bufferCommands: false, maxPoolSize: 5, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 30000 });
    const existing = await Model.findOne({ email }).select("email role publicId").lean();
    if (existing && existing.role !== "admin") throw new BootstrapError("Email belongs to a non-admin; separate explicit promotion approval is required.");
    if (await Model.exists({ role: "admin", email: { $ne: email } })) throw new BootstrapError("Another admin already exists; bootstrap stopped.");
    if (existing) {
      result = { success: true, state: "already-exists", database: "quizverse_prod", email, publicId: existing.publicId, role: "admin" };
    } else {
      const user = await Model.create({ email, name: "Keshav Bansal", role: "admin", accountStatus: "active", password: await hash(password, 12) });
      result = { success: true, state: "created", database: "quizverse_prod", email, publicId: user.publicId, role: "admin" };
    }
  } catch (error) {
    exitCode = 1;
    result = { success: false, message: error instanceof BootstrapError ? error.message : "Admin bootstrap failed; inspect configuration and database permissions privately." };
  } finally {
    try { await driver.disconnect(); }
    catch { exitCode = 1; result = { success: false, message: "Database disconnect failed." }; }
  }
  output(JSON.stringify(result));
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await bootstrapAdmin();
}
