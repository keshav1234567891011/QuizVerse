import assert from "node:assert/strict";
import test from "node:test";
import { adminFixture } from "../test-support/adminFixture.js";
import { users, userDetails, changeUser, userView } from "../src/services/adminService.js";

test("user search is literal, bounded, filtered and explicitly serialized; missing status is active", async t => {
  const f = adminFixture(t); f.student.password = "not-a-real-password-hash";
  const result = await users(f.admin, { search: "student@example.test", role: "student", status: "active", limit: "1" });
  assert.equal(result.total, 1); assert.equal(result.items[0].accountStatus, "active");
  assert.ok(!JSON.stringify(result).includes("password")); assert.ok(!JSON.stringify(result).includes('"_id"'));
  assert.equal((await users(f.admin, { search: ".*" })).total, 0);
  assert.equal((await users(f.admin, { search: f.student.publicId })).total, 1);
  const details = await userDetails(f.admin, f.student.publicId); assert.equal(details.counts.memberships, 1); assert.equal(details.counts.attempts, 1);
  assert.deepEqual(Object.keys(userView(f.student)).sort(), ["publicId", "name", "role", "email", "accountStatus", "createdAt", "updatedAt"].sort());
  for (const query of [{ page: 0 }, { limit: 51 }, { role: "owner" }, { search: {} }, { status: "deleted" }]) await assert.rejects(users(f.admin, query), { status: 400 });
});
test("student to teacher preserves ordinary memberships, historical attempts, frozen rosters and notifications", async t => {
  const f = adminFixture(t); f.state.notifications.push({ recipient: f.student._id });
  const history = structuredClone({ groups: f.state.groups, attempts: f.state.attempts, assignments: f.state.assignments, notifications: f.state.notifications });
  const updated = await changeUser(f.admin, f.student.publicId, "role", "teacher"); assert.equal(updated.role, "teacher");
  assert.deepEqual({ groups: f.state.groups, attempts: f.state.attempts, assignments: f.state.assignments, notifications: f.state.notifications }, history);
  const reverted = await changeUser(f.admin, f.student.publicId, "role", "student"); assert.equal(reverted.role, "student");
});
test("teacher demotion blocks active teaching ownership but permits archived/closed/unpublished history", async t => {
  const f = adminFixture(t);
  await assert.rejects(changeUser(f.admin, f.teacher.publicId, "role", "student"), { status: 409 });
  f.state.groups[0].status = "archived";
  await assert.rejects(changeUser(f.admin, f.teacher.publicId, "role", "student"), { status: 409 });
  f.state.assignments[0].status = "closed";
  await assert.rejects(changeUser(f.admin, f.teacher.publicId, "role", "student"), { status: 409 });
  f.state.quizzes[0].status = "draft";
  assert.equal((await changeUser(f.admin, f.teacher.publicId, "role", "student")).role, "student");
});
test("admin promotion, admin demotion, self-mutation and suspension of any admin are denied", async t => {
  const f = adminFixture(t);
  await assert.rejects(changeUser(f.admin, f.student.publicId, "role", "admin"), { status: 400 });
  for (const [field, value] of [["role", "student"], ["role", "teacher"], ["accountStatus", "suspended"], ["accountStatus", "active"]]) await assert.rejects(changeUser(f.admin, f.admin.publicId, field, value), { status: 403 });
  for (const actor of [f.student, f.teacher]) await assert.rejects(changeUser(actor, f.student.publicId, "role", "teacher"), { status: 403 });
  assert.equal((await changeUser(f.admin, f.student.publicId, "accountStatus", "suspended")).accountStatus, "suspended");
  assert.equal((await changeUser(f.admin, f.student.publicId, "accountStatus", "active")).accountStatus, "active");
  await assert.rejects(changeUser(f.admin, f.student.publicId, "password", "anything"), { status: 400 });
});
