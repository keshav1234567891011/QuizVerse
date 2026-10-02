import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import Notification from "../src/models/Notification.js";
import { communicationsFixture } from "../test-support/communicationsFixture.js";
import { sendMessage, history } from "../src/services/groupMessageService.js";
const body = (message = "Hello", type = "normal") => ({ message, type, clientMessageId: crypto.randomUUID() });
test("members exchange persistent messages; unrelated students and teachers cannot read or send", async t => {
  const f = communicationsFixture(t);
  await sendMessage(f.student, "GRP-AAAAAAAA", body());
  await sendMessage(f.teacher, "GRP-AAAAAAAA", body("Welcome"));
  await sendMessage(f.admin, "GRP-AAAAAAAA", body("Admin update"));
  assert.equal((await history(f.student, "GRP-AAAAAAAA")).messages.length, 3);
  for (const user of [f.outsider, f.studentB, f.otherTeacher]) {
    await assert.rejects(history(user, "GRP-AAAAAAAA"), { status: 403 });
    await assert.rejects(sendMessage(user, "GRP-AAAAAAAA", body()), { status: 403 });
  }
  assert.equal((await history(f.studentB, "GRP-BBBBBBBB")).messages.length, 0);
  const safe = JSON.stringify(await history(f.student, "GRP-AAAAAAAA"));
  assert.ok(!safe.includes('"_id"')); assert.ok(!safe.includes(f.student._id)); assert.ok(safe.includes(f.student.publicId));
});
test("teacher/admin announcements notify only classroom recipients; student announcements are denied", async t => {
  const f = communicationsFixture(t);
  await assert.rejects(sendMessage(f.student, "GRP-AAAAAAAA", body("Fake", "announcement")), { status: 403 });
  await sendMessage(f.teacher, "GRP-AAAAAAAA", body("Class starts soon", "announcement"));
  assert.equal(f.state.notifications.length, 1); assert.equal(f.state.notifications[0].recipient, f.student._id);
  await sendMessage(f.admin, "GRP-AAAAAAAA", body("Platform notice", "announcement"));
  assert.equal(f.state.notifications.length, 3);
  assert.ok(!f.state.notifications.some(n => n.recipient === f.studentB._id || n.recipient === f.outsider._id));
});
test("identical retry returns one message and one announcement notification; altered retry is rejected", async t => {
  const f = communicationsFixture(t), input = body("Announcement", "announcement");
  const first = await sendMessage(f.teacher, "GRP-AAAAAAAA", input);
  const second = await sendMessage(f.teacher, "GRP-AAAAAAAA", input);
  assert.equal(first.publicId, second.publicId); assert.equal(f.state.messages.length, 1); assert.equal(f.state.notifications.length, 1);
  await assert.rejects(sendMessage(f.teacher, "GRP-AAAAAAAA", { ...input, message: "Changed" }), { status: 409 });
});
test("archived classrooms are read-only, deleted classrooms deny chat, and removed members lose access", async t => {
  const f = communicationsFixture(t); await sendMessage(f.student, "GRP-AAAAAAAA", body());
  f.state.groups[0].status = "archived";
  assert.equal((await history(f.student, "GRP-AAAAAAAA")).messages.length, 1);
  await assert.rejects(sendMessage(f.student, "GRP-AAAAAAAA", body()), { status: 404 });
  f.state.groups[0].status = "active"; f.state.groups[0].students = [];
  await assert.rejects(history(f.student, "GRP-AAAAAAAA"), { status: 403 });
  f.state.groups = f.state.groups.filter(g => g.groupCode !== "GRP-AAAAAAAA");
  await assert.rejects(history(f.admin, "GRP-AAAAAAAA"), { status: 404 });
});
test("pagination stays within one classroom and does not skip newer messages", async t => {
  const f = communicationsFixture(t);
  for (let i = 0; i < 5; i++) await sendMessage(f.student, "GRP-AAAAAAAA", body(`Message ${i}`));
  const page = await history(f.student, "GRP-AAAAAAAA", { limit: 2 });
  const older = await history(f.student, "GRP-AAAAAAAA", { limit: 2, before: page.nextCursor });
  assert.equal(new Set([...page.messages, ...older.messages].map(m => m.publicId)).size, 4);
  await assert.rejects(history(f.studentB, "GRP-BBBBBBBB", { before: page.nextCursor }), { status: 404 });
  const newer = await history(f.student, "GRP-AAAAAAAA", { after: older.messages.at(-1).publicId });
  assert.equal(newer.messages.length, 2);
});
test("database-backed message limit allows idempotent retries but denies new messages after 20 per minute", async t => {
  const f = communicationsFixture(t), input = body();
  await sendMessage(f.student, "GRP-AAAAAAAA", input);
  for (let i = 1; i < 20; i++) await sendMessage(f.student, "GRP-AAAAAAAA", body());
  await assert.rejects(sendMessage(f.student, "GRP-AAAAAAAA", body()), { status: 429 });
  await sendMessage(f.student, "GRP-AAAAAAAA", input);
  for (const row of f.state.messages) row.createdAt = new Date(Date.now() - 61000);
  await sendMessage(f.student, "GRP-AAAAAAAA", body());
});
test("invalid text and references are rejected; notification failure rolls back an announcement", async t => {
  const f = communicationsFixture(t);
  for (const input of [body(" "), body("a".repeat(2001)), { ...body(), message: {} }, { ...body(), clientMessageId: "invalid" }]) await assert.rejects(sendMessage(f.student, "GRP-AAAAAAAA", input), { status: 400 });
  t.mock.method(Notification, "bulkWrite", async () => { throw new Error("Notification write failed"); });
  await assert.rejects(sendMessage(f.teacher, "GRP-AAAAAAAA", body("Notice", "announcement")), /Notification write failed/);
  assert.equal(f.state.messages.length, 0); assert.equal(f.state.notifications.length, 0);
});
