import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import Notification from "../src/models/Notification.js";
import GroupMessage from "../src/models/GroupMessage.js";
import { sendMessage } from "../src/services/groupMessageService.js";
// Both flags require separate approval. Never falls back to MONGO_URI.
test("MongoDB communications transactions deduplicate competing announcements and enforce distributed message limits", {
  skip: process.env.RUN_COMMUNICATIONS_MONGO_TESTS !== "1" || !process.env.TEST_MONGO_URI, timeout: 60000,
}, async t => {
  const database = `quizverse_branch6_test_${crypto.randomUUID().replaceAll("-", "")}`;
  t.after(async () => { try {
    if (mongoose.connection.name === database && /^quizverse_branch6_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); } });
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), Group.init(), Notification.init(), GroupMessage.init()]);
  const [teacher, student] = await User.create([
    { name: "Teacher", email: "teacher@example.test", password: "test-only-placeholder", role: "teacher" },
    { name: "Student", email: "student@example.test", password: "test-only-placeholder", role: "student" },
  ]);
  await Group.create({ name: "Class", groupCode: "GRP-AAAAAAAA", teacher: teacher._id, createdBy: teacher._id, students: [student._id] });
  const input = { message: "Notice", type: "announcement", clientMessageId: crypto.randomUUID() };
  const [a, b] = await Promise.all([sendMessage(teacher, "GRP-AAAAAAAA", input), sendMessage(teacher, "GRP-AAAAAAAA", input)]);
  assert.equal(a.publicId, b.publicId); assert.equal(await GroupMessage.countDocuments({}), 1); assert.equal(await Notification.countDocuments({}), 1);
  for (let i = 1; i < 19; i++) await sendMessage(teacher, "GRP-AAAAAAAA", { ...input, type: "normal", clientMessageId: crypto.randomUUID() });
  const competing = await Promise.allSettled([sendMessage(teacher, "GRP-AAAAAAAA", { ...input, type: "normal", clientMessageId: crypto.randomUUID() }), sendMessage(teacher, "GRP-AAAAAAAA", { ...input, type: "normal", clientMessageId: crypto.randomUUID() })]);
  assert.equal(competing.filter(x => x.status === "fulfilled").length, 1); assert.equal(competing.find(x => x.status === "rejected").reason.status, 429);
});
