import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Quiz from "../models/Quiz.js";

// Preserve creator access; admin promotion is available only through this CLI.
export async function migrateRoles(email, { users = User, quizzes = Quiz, connection = mongoose.connection } = {}) {
  const adminEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!adminEmail) throw new Error("Provide the email of an existing account to assign as admin.");
  return connection.transaction(async session => {
    const admin = await users.findOne({ email: adminEmail }).session(session);
    if (!admin) throw new Error("Admin account not found. No roles were changed.");
    const creatorIds = await quizzes.distinct("creator").session(session);
    const teachers = await users.updateMany(
      { role: "user", _id: { $in: creatorIds } }, { $set: { role: "teacher" } },
      { session, runValidators: true },
    );
    const students = await users.updateMany(
      { role: "user" }, { $set: { role: "student" } }, { session, runValidators: true },
    );
    await users.updateOne(
      { _id: admin._id }, { $set: { role: "admin" } }, { session, runValidators: true },
    );
    return { teachers: teachers.modifiedCount, students: students.modifiedCount, adminEmail };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]?.trim()) throw new Error("Usage: npm run migrate:roles -- owner@example.com");
    await connectDB({ autoIndex: false });
    const result = await migrateRoles(process.argv[2]);
    console.log(`Teachers migrated: ${result.teachers}`);
    console.log(`Students migrated: ${result.students}`);
    console.log(`Admin role assigned to ${result.adminEmail}`);
  } catch (error) {
    console.error("Role migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
