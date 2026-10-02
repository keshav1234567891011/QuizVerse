import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { communicationsFixture } from "../test-support/communicationsFixture.js";
import { notify, inbox, markRead } from "../src/services/notificationService.js";
import { count, readAll } from "../src/controllers/notificationController.js";
const response = () => ({ status() { return this; }, json(data) { this.body = data; } });
const emit = async (f, key = "event") => {
  // Fixture bulk writer checks the transaction session: production events use it.
  const mongoose = await import("mongoose");
  await mongoose.default.connection.transaction(session => notify({ recipients: [f.student._id, f.studentB._id, f.student._id, f.teacher._id], actor: f.teacher,
    type: "classroom-announcement", title: "Class update", message: "Hello", related: { groupCode: "GRP-AAAAAAAA" }, eventKey: key, session }));
};
test("recipient isolation applies to list, count, mark-read and mark-all; admins cannot inspect another inbox", async t => {
  const f = communicationsFixture(t); await emit(f);
  assert.equal((await inbox(f.student)).notifications.length, 1);
  assert.equal((await inbox(f.admin)).notifications.length, 0);
  const row = f.state.notifications.find(n => n.recipient === f.student._id);
  await assert.rejects(markRead(f.admin, row.publicId), { status: 404 });
  await assert.rejects(markRead(f.studentB, row.publicId), { status: 404 });
  const res = response(); await count({ user: f.student }, res); assert.equal(res.body.unreadCount, 1);
  const read = await markRead(f.student, row.publicId); assert.equal(read.read, true);
  const original = row.readAt; await markRead(f.student, row.publicId); assert.equal(row.readAt, original);
  await count({ user: f.student }, res); assert.equal(res.body.unreadCount, 0);
  await emit(f, "second"); await readAll({ user: f.student }, res);
  assert.equal((await inbox(f.student, { unread: "true" })).notifications.length, 0);
  await count({ user: f.studentB }, res); assert.equal(res.body.unreadCount, 2);
  const safe = JSON.stringify(await inbox(f.student));
  for (const field of ['"_id"', '"recipient"', '"eventKey"', f.teacher._id]) assert.ok(!safe.includes(field));
});
test("event writes deduplicate recipients and retries and do not notify the actor", async t => {
  const f = communicationsFixture(t); await emit(f); await emit(f);
  assert.equal(f.state.notifications.length, 2);
  assert.ok(!f.state.notifications.some(n => n.recipient === f.teacher._id));
});
test("notification pagination handles timestamp ties and rejects another recipient's cursor", async t => {
  const f = communicationsFixture(t);
  for (let i = 0; i < 4; i++) { await emit(f, `event${i}`); for (const row of f.state.notifications) { row._id ||= crypto.randomBytes(12).toString("hex"); row.createdAt = new Date("2030-01-01"); } }
  const first = await inbox(f.student, { limit: 2 }), second = await inbox(f.student, { limit: 2, before: first.nextCursor });
  assert.equal(first.notifications.length, 2); assert.equal(second.notifications.length, 2);
  assert.equal(new Set([...first.notifications, ...second.notifications].map(n => n.publicId)).size, 4);
  await assert.rejects(inbox(f.studentB, { before: first.nextCursor }), { status: 404 });
  await assert.rejects(inbox(f.student, { limit: 101 }), { status: 400 });
});
