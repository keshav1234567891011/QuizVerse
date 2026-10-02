import assert from "node:assert/strict";
import test from "node:test";
import { assignmentFixture, mixedQuestions, mixedResponses } from "../test-support/assignmentFixture.js";
import { createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt, analytics } from "../src/services/assignmentService.js";
import { get } from "../src/controllers/assignmentAttemptController.js";
const publish = async (f, groupCode = "GRP-AAAAAAAA") => { const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode }); await updateAssignment(f.teacher, a.token, { action: "publish" }); return a.token; };
test("mixed assignment answers persist/resume and grading stays frozen after source edits", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].questions = mixedQuestions();
  const token = await publish(f), active = await startAssignedAttempt(f.student, token), input = mixedResponses();
  assert.equal(active.quiz.questions.length, 6); assert.equal(active.quiz.questions[5].blankCount, 2);
  for (let i = 0; i < input.length; i++) await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: String(i), ...input[i] });
  const resumed = await startAssignedAttempt(f.student, token);
  assert.equal(resumed.publicId, active.publicId); assert.equal(resumed.answers[2].booleanAnswer, false); assert.equal(resumed.answers[4].numericAnswer, 0);
  f.state.quizzes[0].questions = mixedQuestions().map(q => ({ ...q, questionType: "shortAnswer", acceptedAnswers: ["changed"], marks: 100 }));
  const result = await mutateAssignedAttempt(f.student, active.publicId, "submit", { score: 9999, answers: [] });
  assert.equal(result.score, 12); assert.equal(result.totalMarks, 12); assert.equal(result.review.length, 6);
  const res = { json(body) { this.body = body; }, status() { return this; } };
  await get({ user: f.student, params: { publicId: active.publicId } }, res); assert.deepEqual(res.body.result.review, result.review);
  for (const name of ["correctOption", "acceptedAnswers", "correctNumber", "numericTolerance", "quizSnapshot", '"_id"']) assert.ok(!JSON.stringify({ active, resumed, result, saved: res.body }).includes(name), name);
});
test("mixed assignments of the same quiz retain separate rosters, attempts and analytics", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].questions = mixedQuestions();
  const a = await publish(f), b = await publish(f, "GRP-BBBBBBBB");
  const active = await startAssignedAttempt(f.student, a);
  for (const [i, response] of mixedResponses().entries()) await mutateAssignedAttempt(f.student, active.publicId, "answer", { key: String(i), ...response });
  await mutateAssignedAttempt(f.student, active.publicId, "submit");
  assert.equal(analytics(f.state.assignments[0], f.state.attempts).completionPercentage, 100);
  assert.equal(analytics(f.state.assignments[1], f.state.attempts).completedStudents, 0);
  await assert.rejects(startAssignedAttempt(f.student, b), { status: 403 });
});
test("typed assignment answers reject invalid shapes; clearing answers persists without granting credit", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].questions = mixedQuestions(); const token = await publish(f), a = await startAssignedAttempt(f.student, token);
  for (const body of [{ key: "1", selectedOptions: [0, 0] }, { key: "2", booleanAnswer: "false" }, { key: "3", textAnswer: {} }, { key: "4", numericAnswer: "0x10" }, { key: "5", blankAnswers: ["one"] }, { key: "99", selectedOption: 0 }]) await assert.rejects(mutateAssignedAttempt(f.student, a.publicId, "answer", body), { status: 400 });
  await mutateAssignedAttempt(f.student, a.publicId, "answer", { key: "3", textAnswer: "JS" });
  await mutateAssignedAttempt(f.student, a.publicId, "answer", { key: "3", textAnswer: "  " });
  const result = await mutateAssignedAttempt(f.student, a.publicId, "submit"); assert.equal(result.score, 0); assert.equal(result.review[3].state, "unanswered");
});
