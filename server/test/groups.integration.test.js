import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import Group from "../src/models/Group.js";
import GroupInvitation from "../src/models/GroupInvitation.js";
import { createMembershipRequest, respondToRequest } from "../src/services/groupService.js";

// Never uses MONGO_URI or the application database. Opt in with a dedicated test
// replica-set URI; this test creates and removes only a randomly named database.
test("MongoDB transactions prevent competing requests and duplicate membership", {
  skip: !process.env.TEST_MONGO_URI,
  timeout: 60000,
}, async t => {
  const database = `quizverse_branch4_test_${randomUUID().replaceAll("-", "")}`;
  t.after(async () => {
    try {
      if (mongoose.connection.name === database && /^quizverse_branch4_test_[a-f0-9]{32}$/.test(database)) {
        await mongoose.connection.dropDatabase();
      }
    } finally { await mongoose.disconnect(); }
  });
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  await Promise.all([Notification.init(), User.init(), Group.init(), GroupInvitation.init()]);
  const [teacher, student, outsider] = await User.create([
    { name: "Test Teacher", email: "teacher@example.test", password: "test-hash-placeholder", role: "teacher" },
    { name: "Test Student", email: "student@example.test", password: "test-hash-placeholder", role: "student" },
    { name: "Other Student", email: "other@example.test", password: "test-hash-placeholder", role: "student" },
  ]);
  const group = await Group.create({ name: "Test classroom", teacher: teacher._id, createdBy: teacher._id, groupCode: "GRP-1234ABCD" });

  const competing = await Promise.allSettled([
    createMembershipRequest({ user: teacher, code: group.groupCode, publicId: student.publicId, kind: "invitation" }),
    createMembershipRequest({ user: student, code: group.groupCode, kind: "join-request" }),
  ]);
  assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(competing.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(await GroupInvitation.countDocuments({ group: group._id, student: student._id, status: "pending" }), 1);
  assert.equal((await Group.findById(group._id)).students.length, 0);
  const pending = competing.find(result => result.status === "fulfilled").value;
  const responder = pending.kind === "invitation" ? student : teacher;
  await assert.rejects(respondToRequest({ user: outsider, publicId: pending.publicId, decision: "accepted" }), error => error.status === 403);

  const accepted = await Promise.allSettled([
    respondToRequest({ user: responder, publicId: pending.publicId, decision: "accepted" }),
    respondToRequest({ user: responder, publicId: pending.publicId, decision: "accepted" }),
  ]);
  assert.equal(accepted.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(accepted.find(result => result.status === "rejected").reason.status, 409);
  assert.deepEqual((await Group.findById(group._id)).students.map(String), [String(student._id)]);
  assert.equal((await GroupInvitation.findById(pending._id)).status, "accepted");

  const invitation = await createMembershipRequest({ user: teacher, code: group.groupCode, publicId: outsider.publicId, kind: "invitation" });
  await respondToRequest({ user: outsider, publicId: invitation.publicId, decision: "declined" });
  assert.deepEqual((await Group.findById(group._id)).students.map(String), [String(student._id)]);
  const join = await createMembershipRequest({ user: outsider, code: group.groupCode, kind: "join-request" });
  await respondToRequest({ user: teacher, publicId: join.publicId, decision: "accepted" });
  assert.equal((await Group.findById(group._id)).students.length, 2);
});
