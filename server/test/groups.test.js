import assert from "node:assert/strict";
import test from "node:test";
import GroupInvitation from "../src/models/GroupInvitation.js";
import { createMembershipRequest, respondToRequest, identifier, canManage } from "../src/services/groupService.js";
import { deleteGroup, removeStudentFromGroup } from "../src/controllers/groupController.js";
import { classroomFixture } from "../test-support/classroomFixture.js";

const invite = f => createMembershipRequest({ user: f.teacher, code: f.state.group.groupCode, publicId: f.student.publicId, kind: "invitation" });
const join = f => createMembershipRequest({ user: f.student, code: f.state.group.groupCode, kind: "join-request" });
const respond = (user, request, decision = "accepted") => respondToRequest({ user, publicId: request.publicId, decision });
const rejectsWith = (promise, status) => assert.rejects(promise, error => error.status === status);
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });

test("public identifiers normalize case and reject database IDs", () => {
  assert.equal(identifier(" qv-aabb1234 ", "QV"), "QV-AABB1234");
  assert.equal(identifier("grp-aabb1234", "GRP"), "GRP-AABB1234");
  for (const value of [null, {}, "507f1f77bcf86cd799439011", "QV-123", "GRP-XXXXXXXX"]) {
    assert.throws(() => identifier(value, "QV"), error => error.status === 400);
  }
});

test("one partial unique index covers pending invitations AND join requests", () => {
  assert.ok(GroupInvitation.schema.indexes().some(([keys, options]) =>
    keys.group === 1 && keys.student === 1 && !keys.kind && options.unique && options.partialFilterExpression.status === "pending"));
});

test("invitations stay pending without adding a member; intended student accepts once", async t => {
  const f = classroomFixture(t), request = await invite(f);
  assert.equal(request.status, "pending");
  assert.equal(request.invitedBy, f.teacher._id);
  assert.deepEqual(f.state.group.students, []);
  await respond(f.student, request);
  assert.deepEqual(f.state.group.students, [f.student._id]);
  assert.equal(request.status, "accepted");
  assert.ok(request.respondedAt instanceof Date);
  await rejectsWith(respond(f.student, request), 409);
  assert.deepEqual(f.state.group.students, [f.student._id]);
});

test("declining an invitation never adds membership and permits a later invitation", async t => {
  const f = classroomFixture(t), request = await invite(f);
  await respond(f.student, request, "declined");
  assert.deepEqual(f.state.group.students, []);
  assert.equal(request.status, "declined");
  assert.ok(request.respondedAt instanceof Date);
  assert.equal((await invite(f)).status, "pending");
});

test("another student, teacher, and admin cannot respond to a student's invitation", async t => {
  const f = classroomFixture(t), request = await invite(f);
  for (const user of [f.otherStudent, f.teacher, f.admin]) await rejectsWith(respond(user, request), 403);
  assert.equal(f.state.requests[0].status, "pending");
  assert.deepEqual(f.state.group.students, []);
});

test("only the owning teacher or admin may invite", async t => {
  const f = classroomFixture(t);
  for (const user of [f.otherTeacher, f.student]) {
    await rejectsWith(createMembershipRequest({ user, code: f.state.group.groupCode, publicId: f.student.publicId, kind: "invitation" }), 403);
  }
  const request = await createMembershipRequest({ user: f.admin, code: f.state.group.groupCode, publicId: f.student.publicId, kind: "invitation" });
  assert.equal(request.invitedBy, f.admin._id);
  assert.equal(canManage({ teacher: { _id: f.teacher._id } }, f.teacher), true);
});

test("only students may request to join; owning teacher approves", async t => {
  const f = classroomFixture(t);
  await rejectsWith(createMembershipRequest({ user: f.teacher, code: f.state.group.groupCode, kind: "join-request" }), 403);
  const request = await join(f);
  assert.deepEqual(f.state.group.students, []);
  for (const user of [f.student, f.otherStudent, f.otherTeacher]) await rejectsWith(respond(user, request), 403);
  await respond(f.teacher, request);
  assert.deepEqual(f.state.group.students, [f.student._id]);
});

test("admin may approve or decline join requests", async t => {
  const f = classroomFixture(t), request = await join(f);
  await respond(f.admin, request, "declined");
  assert.deepEqual(f.state.group.students, []);
  const replacement = await join(f);
  await respond(f.admin, replacement);
  assert.deepEqual(f.state.group.students, [f.student._id]);
});

test("duplicate and cross-kind pending requests are rejected in both directions", async t => {
  const f = classroomFixture(t), request = await invite(f);
  await rejectsWith(invite(f), 409);
  await rejectsWith(join(f), 409);
  await respond(f.student, request, "declined");
  await join(f);
  await rejectsWith(join(f), 409);
  await rejectsWith(invite(f), 409);
  assert.equal(f.state.requests.filter(row => row.status === "pending").length, 1);
});

test("existing members cannot be invited or request to join", async t => {
  const f = classroomFixture(t);
  f.state.group.students.push(f.student._id);
  await rejectsWith(invite(f), 409);
  await rejectsWith(join(f), 409);
  assert.equal(f.state.requests.length, 0);
});

test("missing classroom, invalid kind, and non-student invite target are rejected", async t => {
  const f = classroomFixture(t);
  await rejectsWith(createMembershipRequest({ user: f.student, code: "GRP-FFFFFFFF", kind: "join-request" }), 404);
  await rejectsWith(createMembershipRequest({ user: f.student, code: f.state.group.groupCode, kind: "anything" }), 400);
  await rejectsWith(createMembershipRequest({ user: f.teacher, code: f.state.group.groupCode, publicId: f.otherTeacher.publicId, kind: "invitation" }), 404);
});

test("archived classrooms and changed student roles cannot gain new members", async t => {
  const f = classroomFixture(t), request = await invite(f);
  f.state.users.find(user => user._id === f.student._id).role = "teacher";
  await rejectsWith(respond({ ...f.student, role: "student" }, request), 409);
  f.state.group.status = "archived";
  await rejectsWith(respond({ ...f.student, role: "student" }, request), 404);
  assert.deepEqual(f.state.group.students, []);
});

test("invalid decisions/references fail without membership changes", async t => {
  const f = classroomFixture(t), request = await invite(f);
  await rejectsWith(respond(f.student, request, "cancelled"), 400);
  await rejectsWith(respondToRequest({ user: f.student, publicId: "-".repeat(36), decision: "accepted" }), 400);
  assert.deepEqual(f.state.group.students, []);
});

test("acceptance uses set semantics even if the member already exists", async t => {
  const f = classroomFixture(t), request = await invite(f);
  f.state.group.students.push(f.student._id);
  await respond(f.student, request);
  assert.deepEqual(f.state.group.students, [f.student._id]);
});

test("deleting a classroom cancels pending requests and prevents later acceptance", async t => {
  const f = classroomFixture(t), request = await invite(f), res = response();
  await deleteGroup({ user: f.otherTeacher, params: { code: f.state.group.groupCode } }, res);
  assert.equal(res.code, 403);
  const deleted = response();
  await deleteGroup({ user: f.teacher, params: { code: f.state.group.groupCode } }, deleted);
  assert.equal(deleted.code, 200);
  assert.equal(f.state.group, null);
  assert.equal(f.state.requests[0].status, "cancelled");
  assert.ok(f.state.requests[0].respondedAt instanceof Date);
  await rejectsWith(respond(f.student, request), 404);
});

test("member removal is authorized and uses the student's public ID", async t => {
  const f = classroomFixture(t);
  f.state.group.students.push(f.student._id);
  const params = { code: f.state.group.groupCode, publicId: f.student.publicId };
  const denied = response();
  await removeStudentFromGroup({ user: f.otherTeacher, params }, denied);
  assert.equal(denied.code, 403);
  assert.deepEqual(f.state.group.students, [f.student._id]);
  const removed = response();
  await removeStudentFromGroup({ user: f.admin, params }, removed);
  assert.equal(removed.code, 200);
  assert.deepEqual(f.state.group.students, []);
});
