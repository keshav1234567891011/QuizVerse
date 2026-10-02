import assert from "node:assert/strict";
import test from "node:test";
import { adminFixture } from "../test-support/adminFixture.js";
import { assignmentFixture, mixedQuestions, mixedResponses } from "../test-support/assignmentFixture.js";
import * as admin from "../src/services/adminService.js";
import { createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt, eligible } from "../src/services/assignmentService.js";
import { messageAccess } from "../src/services/groupMessageService.js";
import User from "../src/models/User.js";
import Quiz from "../src/models/Quiz.js";
const noSecrets = body => {
  const json = JSON.stringify(body);
  for (const key of ['"_id"', "password", "correctOption", "acceptedAnswers", "correctNumber", "numericTolerance", "quizSnapshot", '"answers"']) assert.ok(!json.includes(key), key);
};
test("dashboard counts use actual collections and bounded metadata activity, never private messages", async t => {
  const f = adminFixture(t); f.state.notifications.push({ message: "Private inbox" }); f.state.messages.push({ message: "Private chat" });
  const overview = await admin.dashboard(f.admin);
  assert.equal(overview.metrics.totalUsers, 3); assert.equal(overview.metrics.students, 1); assert.equal(overview.metrics.teachers, 1); assert.equal(overview.metrics.admins, 1);
  for (const key of ["totalQuizzes", "publishedQuizzes", "groups", "activeGroups", "assignments", "attempts", "submittedAttempts", "notifications", "messages"]) assert.equal(overview.metrics[key], 1, key);
  assert.equal(overview.metrics.inProgressAttempts, 0); assert.equal(overview.metrics.suspendedUsers, 0);
  noSecrets(overview); assert.ok(!JSON.stringify(overview).includes("Private"));
  for (const collection of ["users", "quizzes", "assignments"]) assert.ok(overview.recent[collection].length <= 5);
  assert.equal(User.find.mock.calls.length, 1); assert.equal(User.countDocuments.mock.calls.length, 5);
  assert.equal(Quiz.find.mock.calls.length, 1); assert.equal(Quiz.countDocuments.mock.calls.length, 2);
});
test("all admin collections paginate deterministically, apply availability boundaries and reject bad dates", async t => {
  const f = adminFixture(t), original = f.state.assignments[0], now = Date.now();
  f.state.assignments.push({ ...structuredClone(original), _id: f.id(), shareToken: "a".repeat(48), groupSnapshot: { name: "Other class", groupCode: "GRP-BBBBBBBB" }, opensAt: new Date(now + 3600000) });
  const first = await admin.assignments(f.admin, { limit: 1, page: 1 }), second = await admin.assignments(f.admin, { limit: 1, page: 2 });
  assert.equal(first.total, 2); assert.equal(first.items.length, 1); assert.notEqual(first.items[0].token, second.items[0].token);
  assert.equal((await admin.assignments(f.admin, { state: "upcoming" })).total, 1);
  assert.equal((await admin.assignments(f.admin, { state: "open" })).total, 1);
  original.dueAt = new Date(now - 1000);
  assert.equal((await admin.assignments(f.admin, { state: "overdue" })).total, 1);
  assert.equal((await admin.assignments(f.admin, { groupCode: "GRP-BBBBBBBB" })).total, 1);
  assert.equal((await admin.assignmentReport(f.admin, f.state.assignments[1].shareToken)).completedStudents, 0);
  assert.equal((await admin.attempts(f.admin, { from: new Date(now - 10000).toISOString(), to: new Date(now + 10000).toISOString() })).total, 1);
  for (const query of [{ from: "invalid" }, { from: "2030-01-01", to: "2020-01-01" }]) await assert.rejects(admin.attempts(f.admin, query), { status: 400 });
  assert.equal((await admin.groups(f.admin, { status: "archived" })).total, 0);
  assert.equal((await admin.quizzes(f.admin, { status: "draft" })).total, 0);
});
test("restoring active teaching resources requires a current teacher/admin owner", async t => {
  const f = adminFixture(t); f.state.groups[0].status = "archived"; f.teacher.role = "student";
  await assert.rejects(admin.archiveGroup(f.admin, "GRP-AAAAAAAA", "active"), { status: 409 });
  await assert.rejects(admin.moderateQuiz(f.admin, f.state.quizzes[0].publicId, "publish"), { status: 409 });
});
test("quiz moderation is reversible and validated; metadata omits all six grading keys", async t => {
  const f = adminFixture(t), ref = f.state.quizzes[0].publicId;
  const before = structuredClone(f.state.assignments);
  const restricted = await admin.moderateQuiz(f.admin, ref, "restrict"); assert.equal(restricted.status, "draft"); assert.equal(restricted.moderationState, "restricted");
  await assert.rejects(admin.moderateQuiz(f.admin, ref, "publish"), { status: 409 });
  const restored = await admin.moderateQuiz(f.admin, ref, "restore"); assert.equal(restored.status, "draft"); assert.equal(restored.moderationState, "active");
  assert.equal((await admin.moderateQuiz(f.admin, ref, "publish")).status, "published");
  assert.deepEqual(f.state.assignments, before);
  noSecrets(await admin.quizzes(f.admin, {})); noSecrets(await admin.quizDetails(f.admin, ref));
  f.state.quizzes[0].questions = []; await assert.rejects(admin.moderateQuiz(f.admin, ref, "publish"), { status: 400 });
  await assert.rejects(admin.moderateQuiz(f.admin, ref, "delete"), { status: 400 });
});
test("classroom archive preserves data and messages, denies attempts, and can be restored", async t => {
  const f = adminFixture(t), snapshot = structuredClone({ assignments: f.state.assignments, attempts: f.state.attempts });
  await admin.archiveGroup(f.admin, "GRP-AAAAAAAA", "archived");
  assert.equal(f.state.groups[0].status, "archived"); assert.equal(messageAccess(f.state.groups[0], f.student), false);
  assert.throws(() => eligible(f.state.assignments[0], f.state.groups[0], f.student), { status: 403 });
  assert.deepEqual({ assignments: f.state.assignments, attempts: f.state.attempts }, snapshot);
  await assert.rejects(admin.archiveGroup(f.admin, "GRP-AAAAAAAA", "archived"), { status: 409 });
  await admin.archiveGroup(f.admin, "GRP-AAAAAAAA", "active"); assert.equal(f.state.groups[0].status, "active");
  noSecrets(await admin.groups(f.admin, { search: f.teacher.publicId })); noSecrets(await admin.groupDetails(f.admin, "GRP-AAAAAAAA"));
  assert.throws(() => messageAccess(null, f.student), { status: 404 });
});
test("assignment and attempt oversight reuse safe serializers and isolated frozen-roster analytics", async t => {
  const f = adminFixture(t), token = f.state.assignments[0].shareToken;
  noSecrets(await admin.assignments(f.admin, {})); noSecrets(await admin.assignmentDetails(f.admin, token));
  const report = await admin.assignmentReport(f.admin, token); assert.equal(report.completedStudents, 1); assert.equal(report.averageScore, 100); noSecrets(report);
  noSecrets(await admin.attempts(f.admin, { studentPublicId: f.student.publicId }));
  const result = await admin.attemptDetails(f.admin, f.state.attempts[0].publicId); assert.equal(result.review.length, 1); noSecrets(result);
  f.state.attempts[0].status = "in-progress"; assert.deepEqual((await admin.attemptDetails(f.admin, result.reference)).review, []);
  f.state.groups = []; f.state.quizzes = [];
  const historical = await admin.assignmentDetails(f.admin, token); assert.equal(historical.classroomExists, false); assert.equal(historical.quiz, null);
  assert.equal((await admin.assignmentReport(f.admin, token)).assignedStudents, 1);
});
test("restricted source cannot publish a new assignment, but frozen mixed assignment stays playable and gradeable", async t => {
  const f = assignmentFixture(t); f.state.quizzes[0].questions = mixedQuestions();
  const a = await createAssignment(f.teacher, { groupCode: "GRP-AAAAAAAA", quizId: f.state.quizzes[0]._id }); await updateAssignment(f.teacher, a.token, { action: "publish" });
  f.state.quizzes[0].moderationState = "restricted";
  const b = await createAssignment(f.teacher, { groupCode: "GRP-AAAAAAAA", quizId: f.state.quizzes[0]._id });
  await assert.rejects(updateAssignment(f.teacher, b.token, { action: "publish" }), { status: 409 });
  const attempt = await startAssignedAttempt(f.student, a.token);
  for (const [index, response] of mixedResponses().entries()) await mutateAssignedAttempt(f.student, attempt.publicId, "answer", { key: String(index), ...response });
  const result = await mutateAssignedAttempt(f.student, attempt.publicId, "submit"); assert.equal(result.score, 12);
});
