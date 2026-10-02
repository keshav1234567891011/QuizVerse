import assert from "node:assert/strict";
import test from "node:test";
import { communicationsFixture } from "../test-support/communicationsFixture.js";
import { createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt } from "../src/services/assignmentService.js";
import { dueSoon, syncReminders } from "../src/services/notificationReminderService.js";
test("due-soon boundaries exclude due-now, overdue, draft/closed and beyond 24 hours", () => {
  const now = new Date("2030-01-01T12:00:00Z");
  const a = { status: "published", dueAt: new Date(now.getTime() + 86400000) };
  assert.equal(dueSoon(a, now), true);
  for (const change of [{ dueAt: now }, { dueAt: new Date(now.getTime() - 1) }, { dueAt: new Date(now.getTime() + 86400001) }, { dueAt: null }, { status: "draft" }, { status: "closed" }]) assert.equal(dueSoon({ ...a, ...change }, now), false);
});
test("reminders are caller-specific, deduplicated per deadline and never notify nonmembers or completed students", async t => {
  const f = communicationsFixture(t);
  const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA", dueAt: new Date(Date.now() + 3600000) });
  await updateAssignment(f.teacher, a.token, { action: "publish" });
  await syncReminders(f.outsider); await syncReminders(f.admin); assert.equal(f.state.notifications.length, 1);
  await syncReminders(f.student); await syncReminders(f.student);
  assert.equal(f.state.notifications.filter(n => n.type === "assignment-due-soon").length, 1);
  await updateAssignment(f.teacher, a.token, { dueAt: new Date(Date.now() + 7200000) });
  await syncReminders(f.student); assert.equal(f.state.notifications.filter(n => n.type === "assignment-due-soon").length, 2);
  const active = await startAssignedAttempt(f.student, a.token); await mutateAssignedAttempt(f.student, active.publicId, "submit");
  await updateAssignment(f.teacher, a.token, { dueAt: new Date(Date.now() + 10800000) });
  await syncReminders(f.student); assert.equal(f.state.notifications.filter(n => n.type === "assignment-due-soon").length, 2);
});
test("removed/archived membership and closed assignments cannot produce due reminders", async t => {
  const f = communicationsFixture(t);
  const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA", dueAt: new Date(Date.now() + 3600000) });
  await updateAssignment(f.teacher, a.token, { action: "publish" });
  f.state.groups[0].students = []; await syncReminders(f.student);
  f.state.groups[0].students = [f.student._id]; f.state.groups[0].status = "archived"; await syncReminders(f.student);
  f.state.groups[0].status = "active"; await updateAssignment(f.teacher, a.token, { action: "close" }); await syncReminders(f.student);
  assert.equal(f.state.notifications.filter(n => n.type === "assignment-due-soon").length, 0);
});
