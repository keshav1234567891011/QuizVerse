import assert from "node:assert/strict";
import test from "node:test";
import { assignmentFixture } from "../test-support/assignmentFixture.js";
import { createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt } from "../src/services/assignmentService.js";
import { get } from "../src/controllers/assignmentAttemptController.js";
import { submitAttempt } from "../src/controllers/attemptController.js";
import Attempt from "../src/models/Attempt.js";

async function publish(f, settings = {}) {
  const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA", ...settings });
  await updateAssignment(f.teacher, a.token, { action: "publish" });
  return a.token;
}
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; } });
test("assignment sessions resume without consuming another attempt; quota is independent of standalone attempts", async t => {
  const f = assignmentFixture(t), token = await publish(f);
  f.state.attempts.push({ assignment: null, user: f.student._id, status: "submitted" });
  const first = await startAssignedAttempt(f.student, token), resumed = await startAssignedAttempt(f.student, token);
  assert.equal(first.publicId, resumed.publicId);
  assert.equal(first.attemptNumber, 1);
  await mutateAssignedAttempt(f.student, first.publicId, "submit");
  await assert.rejects(startAssignedAttempt(f.student, token), { status: 409 });
  await assert.rejects(mutateAssignedAttempt(f.student, first.publicId, "submit"), { status: 409 });
});
test("saved answers are scored from the frozen key; posted answers and scores cannot override grading", async t => {
  const f = assignmentFixture(t), token = await publish(f), active = await startAssignedAttempt(f.student, token);
  await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 0 });
  f.state.quizzes[0].questions[0].correctOption = 1;
  f.state.quizzes[0].questions[0].marks = 100;
  const result = await mutateAssignedAttempt(f.student, active.publicId, "submit", { score: 1000,
    answers: [{ questionId: f.state.quizzes[0].questions[1]._id, selectedOption: 1 }] });
  assert.equal(result.score, 5); assert.equal(result.totalMarks, 10); assert.equal(result.percentage, 50);
  assert.equal(result.correctAnswers, 1);
  const payload = JSON.stringify(result);
  assert.ok(!payload.includes("correctOption")); assert.ok(!payload.includes("isCorrect")); assert.ok(!payload.includes("questionId"));
});
test("only assigned students can start; only the attempt owner can save, submit or fetch", async t => {
  const f = assignmentFixture(t), token = await publish(f);
  for (const user of [f.teacher, f.admin, f.outsider]) await assert.rejects(startAssignedAttempt(user, token), { status: 403 });
  const active = await startAssignedAttempt(f.student, token);
  for (const action of ["answer", "submit"]) await assert.rejects(mutateAssignedAttempt(f.outsider, active.publicId, action, { key: "0", selectedOption: 0 }), { status: 403 });
  const denied = response(); await get({ user: f.outsider, params: { publicId: active.publicId } }, denied); assert.equal(denied.code, 403);
  const allowed = response(); await get({ user: f.student, params: { publicId: active.publicId } }, allowed); assert.equal(allowed.code, 200);
  assert.ok(!JSON.stringify(allowed.body).includes("correctOption"));
  f.state.groups[0].students = [];
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "submit"), { status: 403 });
});
test("draft, upcoming, overdue and manually closed assignments deny starts and submissions", async t => {
  const f = assignmentFixture(t), token = await publish(f);
  for (const change of [{ opensAt: new Date(Date.now() + 60000) }, { opensAt: null, dueAt: new Date(Date.now() - 1000) }, { dueAt: null, status: "closed" }]) {
    Object.assign(f.state.assignments[0], change); await assert.rejects(startAssignedAttempt(f.student, token), { status: 403 });
  }
  f.state.assignments[0].status = "published";
  const active = await startAssignedAttempt(f.student, token);
  await updateAssignment(f.teacher, token, { action: "close" });
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "submit"), { status: 403 });
  await updateAssignment(f.teacher, token, { action: "reopen" });
  f.state.assignments[0].dueAt = new Date(Date.now() - 1000);
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 0 }), { status: 403 });
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "submit"), { status: 403 });
});
test("per-question windows are enforced by server time and cannot be rewound by refresh", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].timerMode = "per-question";
  const token = await publish(f), active = await startAssignedAttempt(f.student, token);
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "1", selectedOption: 1 }), { status: 409 });
  await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 0 });
  f.state.attempts[0].questionClosesAt = new Date(Date.now() - 1000);
  const resumed = await startAssignedAttempt(f.student, token);
  assert.equal(resumed.currentQuestionIndex, 1);
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 1 }), { status: 409 });
  await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "1", selectedOption: 1 });
  assert.equal((await mutateAssignedAttempt(f.student, active.publicId, "submit")).percentage, 100);
});
test("whole-quiz timer blocks late answers but permits grading previously saved responses", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].timerMode = "whole-quiz"; f.state.quizzes[0].totalTimeLimit = 10;
  const token = await publish(f), active = await startAssignedAttempt(f.student, token);
  await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 0 });
  f.state.attempts[0].expiresAt = new Date(Date.now() - 1);
  await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "1", selectedOption: 1 }), { status: 409 });
  assert.equal((await mutateAssignedAttempt(f.student, active.publicId, "submit")).percentage, 50);
});
test("started assignments cannot shorten deadlines, change opening times or reduce limits", async t => {
  const f = assignmentFixture(t), dueAt = new Date(Date.now() + 120000), token = await publish(f, { dueAt, attemptLimit: 2 });
  await startAssignedAttempt(f.student, token);
  for (const change of [{ dueAt: new Date(Date.now() + 10000) }, { attemptLimit: 1 }, { opensAt: new Date() }]) {
    await assert.rejects(updateAssignment(f.teacher, token, change), { status: 409 });
  }
  const next = await updateAssignment(f.teacher, token, { dueAt: new Date(Date.now() + 240000), attemptLimit: 3 });
  assert.equal(next.attemptLimit, 3);
});
test("legacy submission route cannot bypass assignment status or inject replacement answers", async t => {
  const f = assignmentFixture(t), token = await publish(f), active = await startAssignedAttempt(f.student, token);
  const stored = f.state.attempts[0];
  const res = response();
  await submitAttempt({ user: f.student, params: { attemptId: stored._id }, body: { answers: [{ questionId: f.state.quizzes[0].questions[0]._id, selectedOption: 0 }] } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.result.score, 0);
  assert.equal(res.body.result.publicId, active.publicId);
});
test("serialized simultaneous starts and submissions reuse one session and count one completed attempt", async t => {
  const f = assignmentFixture(t), token = await publish(f);
  const started = await Promise.all([startAssignedAttempt(f.student, token), startAssignedAttempt(f.student, token)]);
  assert.equal(started[0].publicId, started[1].publicId); assert.equal(f.state.attempts.length, 1);
  const submitted = await Promise.allSettled([mutateAssignedAttempt(f.student, started[0].publicId, "submit"), mutateAssignedAttempt(f.student, started[0].publicId, "submit")]);
  assert.equal(submitted.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(submitted.find(x => x.status === "rejected").reason.status, 409);
});
test("answer selection rejects invalid question keys and out-of-range options", async t => {
  const f = assignmentFixture(t), token = await publish(f), active = await startAssignedAttempt(f.student, token);
  for (const body of [{ key: "99", selectedOption: 0 }, { key: "0", selectedOption: 9 }, { key: "0", selectedOption: "0" }]) {
    await assert.rejects(mutateAssignedAttempt(f.student, active.publicId, "answer", body), { status: 400 });
  }
});
test("submitted assignment results remain available after classroom removal; snapshot content stays filtered", async t => {
  const f = assignmentFixture(t), token = await publish(f), active = await startAssignedAttempt(f.student, token);
  await mutateAssignedAttempt(f.student, active.publicId, "submit"); f.state.groups = [];
  const res = response(); await get({ user: f.student, params: { publicId: active.publicId } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.result.assignment.token, token);
});
test("legacy attempts need no public-ID backfill; new standalone and assignment attempts gain a UUID", async () => {
  const ids = { quiz: "507f1f77bcf86cd799439012", user: "507f1f77bcf86cd799439011" };
  const legacy = Attempt.hydrate(ids); await legacy.validate(); assert.equal(legacy.publicId, undefined); assert.equal(legacy.assignment, null);
  const standalone = new Attempt(ids); await standalone.validate(); assert.match(standalone.publicId, /^[a-f0-9-]{36}$/);
  const assigned = new Attempt({ ...ids, assignment: "507f1f77bcf86cd799439019", attemptNumber: 1 });
  await assigned.validate(); assert.match(assigned.publicId, /^[a-f0-9-]{36}$/);
});
test("deleting the source quiz does not change published assignment play or grading", async t => {
  const f = assignmentFixture(t), token = await publish(f);
  f.state.quizzes = [];
  const active = await startAssignedAttempt(f.student, token);
  assert.equal(active.quiz.questions[0].questionText, "One plus one?");
  await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: "0", selectedOption: 0 });
  assert.equal((await mutateAssignedAttempt(f.student, active.publicId, "submit")).percentage, 50);
});
