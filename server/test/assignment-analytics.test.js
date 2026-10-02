import assert from "node:assert/strict";
import test from "node:test";
import { assignmentFixture } from "../test-support/assignmentFixture.js";
import { analytics, createAssignment, updateAssignment, startAssignedAttempt, mutateAssignedAttempt } from "../src/services/assignmentService.js";
test("the same quiz assigned to two classrooms produces completely isolated analytics", async t => {
  const f = assignmentFixture(t), quizId = f.state.quizzes[0]._id;
  const a = await createAssignment(f.teacher, { quizId, groupCode: "GRP-AAAAAAAA", attemptLimit: 2 });
  const b = await createAssignment(f.teacher, { quizId, groupCode: "GRP-BBBBBBBB" });
  await updateAssignment(f.teacher, a.token, { action: "publish" });
  await updateAssignment(f.teacher, b.token, { action: "publish" });
  const first = await startAssignedAttempt(f.student, a.token);
  await mutateAssignedAttempt(f.student, first.publicId, "answer", { key: "0", selectedOption: 0 });
  await mutateAssignedAttempt(f.student, first.publicId, "submit");
  const second = await startAssignedAttempt(f.student, a.token);
  await mutateAssignedAttempt(f.student, second.publicId, "submit");
  await startAssignedAttempt(f.studentB, b.token);
  const reportA = analytics(f.state.assignments[0], f.state.attempts);
  const reportB = analytics(f.state.assignments[1], f.state.attempts);
  assert.equal(reportA.completedStudents, 1); assert.equal(reportA.completionPercentage, 100); assert.equal(reportA.averageScore, 50);
  assert.equal(reportA.rows[0].attemptCount, 2); assert.equal(reportA.rows[0].bestScore, 50); assert.equal(reportA.rows[0].latestScore, 0);
  assert.equal(reportB.attemptedStudents, 1); assert.equal(reportB.completedStudents, 0); assert.equal(reportB.completionPercentage, 0);
  assert.equal(reportB.averageScore, 0); assert.equal(reportB.rows[0].bestScore, null);
  assert.equal(reportB.rows[0].publicId, f.studentB.publicId);
  f.state.groups[0].students.push(f.outsider._id); f.state.groups[0].students = f.state.groups[0].students.filter(id => id !== f.student._id);
  assert.equal(analytics(f.state.assignments[0], f.state.attempts).assignedStudents, 1);
  assert.equal(analytics(f.state.assignments[0], f.state.attempts).completedStudents, 1);
});
test("empty roster analytics contain finite zero metrics and exclude non-roster attempts", () => {
  const a = { _id: "a", assignedStudents: [] };
  assert.deepEqual(analytics(a, [{ assignment: "a", user: "outsider", status: "submitted", percentage: 100 }]), {
    assignedStudents: 0, attemptedStudents: 0, completedStudents: 0, completionPercentage: 0, averageScore: 0, rows: [],
  });
});
