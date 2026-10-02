import assert from "node:assert/strict";
import test from "node:test";
import Notification from "../src/models/Notification.js";
import { classroomFixture } from "../test-support/classroomFixture.js";
import { assignmentFixture } from "../test-support/assignmentFixture.js";
import { createMembershipRequest, respondToRequest } from "../src/services/groupService.js";
import { createAssignment, updateAssignment } from "../src/services/assignmentService.js";
import { removeStudentFromGroup, deleteGroup } from "../src/controllers/groupController.js";
const response = () => ({ code: 200, status(n) { this.code = n; return this; }, json(data) { this.body = data; } });
test("invitation creation notifies student; acceptance/decline notify inviter and teacher without duplicates", async t => {
  const f = classroomFixture(t);
  const invitation = await createMembershipRequest({ user: f.teacher, code: f.state.group.groupCode, publicId: f.student.publicId, kind: "invitation" });
  assert.equal(f.state.notifications[0].recipient, f.student._id); assert.equal(f.state.notifications[0].type, "invitation-received");
  await respondToRequest({ user: f.student, publicId: invitation.publicId, decision: "accepted" });
  assert.equal(f.state.notifications[1].recipient, f.teacher._id); assert.equal(f.state.notifications[1].type, "invitation-accepted");
  await assert.rejects(respondToRequest({ user: f.student, publicId: invitation.publicId, decision: "accepted" }), { status: 409 });
  assert.equal(f.state.notifications.length, 2);
  const declined = await createMembershipRequest({ user: f.admin, code: f.state.group.groupCode, publicId: f.otherStudent.publicId, kind: "invitation" });
  await respondToRequest({ user: f.otherStudent, publicId: declined.publicId, decision: "declined" });
  assert.deepEqual(f.state.notifications.filter(n => n.type === "invitation-declined").map(n => n.recipient).sort(), [f.admin._id, f.teacher._id].sort());
});
test("join requests notify the teacher; accepted/declined outcomes notify the intended student", async t => {
  const f = classroomFixture(t);
  const request = await createMembershipRequest({ user: f.student, code: f.state.group.groupCode, kind: "join-request" });
  assert.equal(f.state.notifications[0].recipient, f.teacher._id); assert.equal(f.state.notifications[0].type, "join-request-received");
  await respondToRequest({ user: f.teacher, publicId: request.publicId, decision: "declined" });
  assert.equal(f.state.notifications[1].recipient, f.student._id); assert.equal(f.state.notifications[1].type, "join-request-declined");
  const accepted = await createMembershipRequest({ user: f.student, code: f.state.group.groupCode, kind: "join-request" });
  await respondToRequest({ user: f.admin, publicId: accepted.publicId, decision: "accepted" });
  assert.deepEqual(f.state.notifications.filter(n => n.type === "join-request-accepted").map(n => n.recipient).sort(), [f.student._id, f.teacher._id].sort());
});
test("assignment publication notifies the frozen roster only; reopening does not republish notifications", async t => {
  const f = assignmentFixture(t);
  const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" });
  assert.equal(f.state.notifications.length, 0);
  await updateAssignment(f.teacher, a.token, { action: "publish" });
  assert.equal(f.state.notifications.length, 1); assert.equal(f.state.notifications[0].recipient, f.student._id);
  assert.equal(f.state.notifications[0].related.assignmentToken, a.token);
  await updateAssignment(f.teacher, a.token, { action: "close" });
  await updateAssignment(f.teacher, a.token, { action: "reopen" });
  assert.equal(f.state.notifications.length, 1);
});
test("failed notification writes roll back invitations", async t => {
  const f = classroomFixture(t);
  t.mock.method(Notification, "bulkWrite", async () => { throw new Error("Unavailable"); });
  await assert.rejects(createMembershipRequest({ user: f.teacher, code: f.state.group.groupCode, publicId: f.student.publicId, kind: "invitation" }), /Unavailable/);
  assert.equal(f.state.requests.length, 0); assert.equal(f.state.notifications.length, 0);
});
test("failed notification writes roll back assignment publication and its snapshot", async t => {
  const f = assignmentFixture(t);
  const a = await createAssignment(f.teacher, { quizId: f.state.quizzes[0]._id, groupCode: "GRP-AAAAAAAA" });
  t.mock.method(Notification, "bulkWrite", async () => { throw new Error("Unavailable"); });
  await assert.rejects(updateAssignment(f.teacher, a.token, { action: "publish" }), /Unavailable/);
  assert.equal(f.state.assignments[0].status, "draft");
  assert.equal(f.state.assignments[0].assignedStudents.length, 0);
  assert.equal(f.state.notifications.length, 0);
});
test("membership removal and classroom deletion notify affected users", async t => {
  const f = classroomFixture(t); f.state.group.students = [f.student._id, f.otherStudent._id];
  const res = response(); await removeStudentFromGroup({ user: f.teacher, params: { code: f.state.group.groupCode, publicId: f.student.publicId } }, res);
  assert.equal(res.code, 200); assert.equal(f.state.notifications[0].type, "membership-removed"); assert.equal(f.state.notifications[0].recipient, f.student._id);
  await deleteGroup({ user: f.teacher, params: { code: f.state.group.groupCode } }, res);
  assert.equal(res.code, 200); assert.equal(f.state.notifications[1].type, "classroom-deleted"); assert.equal(f.state.notifications[1].recipient, f.otherStudent._id);
});
