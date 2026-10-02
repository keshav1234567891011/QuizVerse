import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import Quiz from "../src/models/Quiz.js";
import Group from "../src/models/Group.js";
import Assignment from "../src/models/Assignment.js";
import Attempt from "../src/models/Attempt.js";
import { createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt, analytics } from "../src/services/assignmentService.js";

// Disabled unless BOTH explicit opt-ins are set after approval of an isolated
// test database. No MONGO_URI fallback, server startup, or migration is used.
test("MongoDB assignment transactions isolate classrooms and serialize concurrent attempts", {
  skip: process.env.RUN_ASSIGNMENT_MONGO_TESTS !== "1" || !process.env.TEST_MONGO_URI,
  timeout: 60000,
}, async t => {
  const database = `quizverse_branch5_test_${crypto.randomUUID().replaceAll("-", "")}`;
  t.after(async () => {
    try {
      if (mongoose.connection.name === database && /^quizverse_branch5_test_[a-f0-9]{32}$/.test(database)) await mongoose.connection.dropDatabase();
    } finally { await mongoose.disconnect(); }
  });
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  await Promise.all([Notification.init(), User.init(), Quiz.init(), Group.init(), Assignment.init(), Attempt.init()]);
  const [teacher, student] = await User.create([
    { name: "Teacher", email: "teacher@example.test", password: "test-only-placeholder", role: "teacher" },
    { name: "Student", email: "student@example.test", password: "test-only-placeholder", role: "student" },
  ]);
  await Group.create(["GRP-AAAAAAAA", "GRP-BBBBBBBB"].map((groupCode, index) => ({ name: `Class ${index}`, groupCode,
    teacher: teacher._id, createdBy: teacher._id, students: [student._id] })));
  const quiz = await Quiz.create({ title: "Reusable Quiz", creator: teacher._id, category: "Test", status: "published",
    timerMode: "none", questions: [{ questionText: "Two plus two?", options: ["Four", "Five"], correctOption: 0, marks: 2, timeLimit: 10 }] });
  const a = await createAssignment(teacher, { quizId: String(quiz._id), groupCode: "GRP-AAAAAAAA" });
  const b = await createAssignment(teacher, { quizId: String(quiz._id), groupCode: "GRP-BBBBBBBB" });
  await updateAssignment(teacher, a.token, { action: "publish" });
  await updateAssignment(teacher, b.token, { action: "publish" });
  const sessions = await Promise.all([startAssignedAttempt(student, a.token), startAssignedAttempt(student, a.token)]);
  assert.equal(sessions[0].publicId, sessions[1].publicId);
  await mutateAssignedAttempt(student, sessions[0].publicId, "answer", { key: "0", selectedOption: 0 });
  await Quiz.updateOne({ _id: quiz._id }, { $set: { "questions.0.correctOption": 1 } });
  const results = await Promise.allSettled([mutateAssignedAttempt(student, sessions[0].publicId, "submit"), mutateAssignedAttempt(student, sessions[0].publicId, "submit")]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.find(x => x.status === "fulfilled").value.percentage, 100);
  await assert.rejects(startAssignedAttempt(student, a.token), { status: 409 });
  await startAssignedAttempt(student, b.token);
  const attempts = await Attempt.find({});
  const assignments = await Assignment.find({});
  const reportA = analytics(assignments.find(x => x.shareToken === a.token), attempts);
  const reportB = analytics(assignments.find(x => x.shareToken === b.token), attempts);
  assert.equal(reportA.completedStudents, 1); assert.equal(reportB.completedStudents, 0);
  assert.equal(reportA.rows[0].attemptCount, 1); assert.equal(reportB.rows[0].attemptCount, 1);
});
