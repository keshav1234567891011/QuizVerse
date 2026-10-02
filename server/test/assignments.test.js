import assert from "node:assert/strict";
import test from "node:test";
import { assignmentFixture } from "../test-support/assignmentFixture.js";
import { createAssignment, updateAssignment, assignmentState, assignmentView, playableQuiz, eligible } from "../src/services/assignmentService.js";
import { detail, report } from "../src/controllers/assignmentController.js";
import Assignment from "../src/models/Assignment.js";

const create = f => createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" });
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; } });
test("students cannot create assignments; teachers must own both teaching resources", async t => {
  const f = assignmentFixture(t), input = { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" };
  await assert.rejects(createAssignment(f.student, input), { status: 403 });
  await assert.rejects(createAssignment(f.otherTeacher, input), { status: 403 });
  f.state.quizzes[0].creator = f.otherTeacher._id;
  await assert.rejects(createAssignment(f.teacher, input), { status: 403 });
  const admin = await createAssignment(f.admin, input);
  assert.equal(admin.state, "draft");
  await updateAssignment(f.admin, admin.token, { action: "publish" });
  assert.equal(f.state.assignments[0].status, "published");
});
test("publication freezes questions and a public-ID roster; API serializers exclude answer keys and database IDs", async t => {
  const f = assignmentFixture(t), created = await create(f);
  await updateAssignment(f.teacher, created.token, { action: "publish" });
  const a = f.state.assignments[0];
  f.state.quizzes[0].questions[0].correctOption = 1;
  f.state.quizzes[0].questions[0].questionText = "Changed";
  f.state.groups[0].students.push(f.outsider._id);
  assert.equal(a.quizSnapshot.questions[0].correctOption, 0);
  assert.equal(a.quizSnapshot.questions[0].questionText, "One plus one?");
  assert.equal(a.assignedStudents.length, 1);
  assert.equal(a.assignedStudents[0].publicId, f.student.publicId);
  await assert.rejects(updateAssignment(f.teacher, created.token, { action: "publish" }), { status: 409 });
  assert.throws(() => eligible(a, f.state.groups[0], f.outsider), { status: 403 });
  const safe = JSON.stringify({ assignment: assignmentView(a), quiz: playableQuiz(a.quizSnapshot) });
  for (const forbidden of ["correctOption", "quizSnapshot", "assignedStudents", "_id", f.state.quizzes[0]._id, a.quizSnapshot.questions[0]._id]) assert.ok(!safe.includes(forbidden), forbidden);
});
test("assignment token authorization denies nonmembers and other teachers; admin sees assignment analytics", async t => {
  const f = assignmentFixture(t), created = await create(f);
  await updateAssignment(f.teacher, created.token, { action: "publish" });
  for (const user of [f.outsider, f.otherTeacher]) {
    const res = response(); await detail({ user, params: { token: created.token } }, res); assert.equal(res.code, 403);
  }
  const student = response(); await detail({ user: f.student, params: { token: created.token } }, student); assert.equal(student.code, 200);
  const denied = response(); await report({ user: f.student, params: { token: created.token } }, denied); assert.equal(denied.code, 403);
  const allowed = response(); await report({ user: f.admin, params: { token: created.token } }, allowed); assert.equal(allowed.code, 200);
  const bad = response(); await detail({ user: f.student, params: { token: f.state.assignments[0]._id } }, bad); assert.equal(bad.code, 400);
});
test("opening, due and closed states use server time with exclusive due boundary", () => {
  const now = new Date("2030-01-01T12:00:00Z");
  const a = { status: "published", opensAt: new Date("2030-01-01T13:00:00Z"), dueAt: new Date("2030-01-02T12:00:00Z") };
  assert.equal(assignmentState(a, now), "upcoming");
  assert.equal(assignmentState(a, a.opensAt), "open");
  assert.equal(assignmentState(a, a.dueAt), "overdue");
  assert.equal(assignmentState({ ...a, status: "draft" }, now), "draft");
  assert.equal(assignmentState({ ...a, status: "closed" }, now), "closed");
});
test("assignment schedule and attempt limit validation reject malformed settings", async t => {
  const f = assignmentFixture(t), input = { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" };
  for (const settings of [{ opensAt: "invalid" }, { attemptLimit: 0 }, { attemptLimit: 1.5 }, { attemptLimit: 101 },
    { opensAt: "2030-01-02", dueAt: "2030-01-01" }]) await assert.rejects(createAssignment(f.teacher, { ...input, ...settings }), { status: 400 });
});
test("draft quizzes and invalid answer keys cannot be published as assignments", async t => {
  const f = assignmentFixture(t), a = await create(f);
  f.state.quizzes[0].status = "draft";
  await assert.rejects(updateAssignment(f.teacher, a.token, { action: "publish" }), { status: 409 });
  f.state.quizzes[0].status = "published"; f.state.quizzes[0].questions[0].correctOption = 99;
  await assert.rejects(updateAssignment(f.teacher, a.token, { action: "publish" }), { status: 400 });
});
test("snapshot stays select:false and model share tokens are random opaque identifiers", () => {
  assert.equal(Assignment.schema.path("quizSnapshot").options.select, false);
  const a = new Assignment(), b = new Assignment();
  assert.match(a.shareToken, /^[a-f0-9]{48}$/); assert.notEqual(a.shareToken, b.shareToken);
});
test("classroom deletion preserves historical reports for the original teacher and admin", async t => {
  const f = assignmentFixture(t), created = await create(f);
  await updateAssignment(f.teacher, created.token, { action: "publish" });
  f.state.groups = []; f.state.assignments[0].status = "closed";
  for (const user of [f.teacher, f.admin]) {
    const res = response(); await report({ user, params: { token: created.token } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.analytics.assignedStudents, 1);
  }
  const denied = response(); await report({ user: f.otherTeacher, params: { token: created.token } }, denied);
  assert.equal(denied.code, 403);
  await assert.rejects(updateAssignment(f.teacher, created.token, { action: "reopen" }), { status: 409 });
});
