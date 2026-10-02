import mongoose from "mongoose";
import Group from "../models/Group.js";
import User from "../models/User.js";
import GroupInvitation from "../models/GroupInvitation.js";

export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function identifier(value, prefix) {
  if (typeof value !== "string" || !new RegExp(`^${prefix}-[A-F0-9]{8}$`).test(value.trim().toUpperCase())) {
    fail(400, `Enter a valid ${prefix === "QV" ? "QuizVerse ID" : "group code"}.`);
  }
  return value.trim().toUpperCase();
}
export const canManage = (group, user) => user.role === "admin" ||
  (user.role === "teacher" && String(group.teacher?._id || group.teacher) === String(user._id));

// All membership mutations write the group first, serializing competing
// requests, removals and deletion under MongoDB transaction retries.
export async function lockGroup(code, session) {
  const group = await Group.findOneAndUpdate(
    { groupCode: code, status: "active" }, { $inc: { membershipRevision: 1 } }, { new: true, session },
  );
  if (!group) fail(404, "Active classroom not found.");
  return group;
}
export async function createMembershipRequest({ user, code, publicId, kind }) {
  if (!["invitation", "join-request"].includes(kind)) fail(400, "Invalid membership request type.");
  code = identifier(code, "GRP");
  if (kind === "invitation") publicId = identifier(publicId, "QV");
  return mongoose.connection.transaction(async (session) => {
    const group = await lockGroup(code, session);
    if (kind === "invitation" && !canManage(group, user)) fail(403, "You cannot invite students to this classroom.");
    if (kind === "join-request" && user.role !== "student") fail(403, "Only students can request to join.");
    const student = kind === "invitation"
      ? await User.findOne({ publicId, role: "student" }).session(session) : user;
    if (!student) fail(404, "Student not found.");
    if (group.students.some(id => String(id) === String(student._id))) fail(409, "Student is already a member.");
    if (await GroupInvitation.exists({ group: group._id, student: student._id, status: "pending" }).session(session)) {
      fail(409, "An invitation or join request is already pending for this classroom.");
    }
    const [request] = await GroupInvitation.create([{
      group: group._id, student: student._id, invitedBy: user._id, kind,
    }], { session });
    return request;
  });
}
export async function respondToRequest({ user, publicId, decision }) {
  if (!["accepted", "declined"].includes(decision)) fail(400, "Choose Accept or Decline.");
  if (typeof publicId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(publicId)) fail(400, "Invalid request reference.");
  return mongoose.connection.transaction(async (session) => {
    const request = await GroupInvitation.findOne({ publicId }).session(session);
    if (!request) fail(404, "Invitation or request not found.");
    const original = await Group.findById(request.group).session(session);
    if (!original) fail(404, "Classroom no longer exists.");
    const group = await lockGroup(original.groupCode, session);
    if (request.kind === "invitation") {
      if (user.role !== "student" || String(request.student) !== String(user._id)) fail(403, "Only the invited student can respond.");
    } else if (!canManage(group, user)) fail(403, "You cannot review requests for this classroom.");
    if (request.status !== "pending") fail(409, "This request has already been resolved.");
    if (decision === "accepted") {
      const student = await User.findOne({ _id: request.student, role: "student" }).session(session);
      if (!student) fail(409, "This account is no longer a student.");
      await Group.updateOne({ _id: group._id }, { $addToSet: { students: request.student } }, { session });
    }
    request.status = decision;
    request.respondedAt = new Date();
    await request.save({ session });
    return request;
  });
}
