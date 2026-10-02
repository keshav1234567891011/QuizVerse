import crypto from "node:crypto";
import mongoose from "mongoose";
import Group from "../models/Group.js";
import User from "../models/User.js";
import GroupInvitation from "../models/GroupInvitation.js";
import { canManage, identifier, fail, lockGroup, createMembershipRequest, respondToRequest } from "../services/groupService.js";

export const groupHandler = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : error.name === "ValidationError" ? 400 : 500);
    if (status === 500) console.error("Classroom operation failed:", error.message);
    res.status(status).json({ success: false, message: error.status ? error.message :
      status === 409 ? "A matching pending request or code already exists. Refresh and try again." :
      status === 400 ? "Check the classroom details and try again." : "Could not complete the classroom operation. Please try again." });
  }
};
const person = user => user ? { name: user.name, publicId: user.publicId, role: user.role } : null;
const groupView = (group, user) => ({ name: group.name, description: group.description,
  groupCode: group.groupCode, status: group.status, teacher: person(group.teacher),
  students: group.students.map(person), memberCount: group.students.length, canManage: canManage(group, user) });
const populateGroup = query => query.populate("teacher", "name publicId role").populate("students", "name publicId role");

export const createGroup = groupHandler(async (req, res) => {
  const { name, description = "", teacherPublicId } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 || typeof description !== "string" || description.length > 500) fail(400, "Use a classroom name of 2 to 100 characters and description up to 500 characters.");
  let teacher = req.user._id;
  if (req.user.role === "admin" && teacherPublicId) {
    const selected = await User.findOne({ publicId: identifier(teacherPublicId, "QV"), role: { $in: ["teacher", "admin"] } });
    if (!selected) fail(404, "Teacher not found.");
    teacher = selected._id;
  }
  const group = await Group.create({ name: name.trim(), description: description.trim(), teacher,
    createdBy: req.user._id, groupCode: `GRP-${crypto.randomBytes(4).toString("hex").toUpperCase()}` });
  await group.populate("teacher", "name publicId role");
  res.status(201).json({ success: true, group: groupView(group, req.user) });
});
export const getMyGroups = groupHandler(async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { $or: [{ teacher: req.user._id }, { students: req.user._id }] };
  const groups = await populateGroup(Group.find(filter)).sort({ createdAt: -1 });
  res.json({ success: true, groups: groups.map(group => groupView(group, req.user)) });
});
export const getGroupByCode = groupHandler(async (req, res) => {
  const group = await populateGroup(Group.findOne({ groupCode: identifier(req.params.code, "GRP") }));
  if (!group) fail(404, "Classroom not found.");
  if (!canManage(group, req.user) && !group.students.some(student => student && String(student._id) === String(req.user._id))) fail(403, "You are not a member of this classroom.");
  res.json({ success: true, group: groupView(group, req.user) });
});
export const inviteStudent = groupHandler(async (req, res) => {
  const request = await createMembershipRequest({ user: req.user, code: req.params.code, publicId: req.body?.publicId, kind: "invitation" });
  res.status(201).json({ success: true, request: { publicId: request.publicId, status: request.status } });
});
export const requestToJoin = groupHandler(async (req, res) => {
  const request = await createMembershipRequest({ user: req.user, code: req.body?.groupCode, kind: "join-request" });
  res.status(201).json({ success: true, request: { publicId: request.publicId, status: request.status } });
});
export const respond = groupHandler(async (req, res) => {
  const request = await respondToRequest({ user: req.user, publicId: req.params.publicId, decision: req.body?.decision });
  res.json({ success: true, request: { publicId: request.publicId, status: request.status } });
});
export const listRequests = groupHandler(async (req, res) => {
  let filter;
  if (req.user.role === "student") filter = { student: req.user._id };
  else if (req.user.role === "admin") filter = {};
  else filter = { group: { $in: await Group.find({ teacher: req.user._id }).distinct("_id") } };
  const requests = await GroupInvitation.find(filter).populate("group", "name groupCode teacher status")
    .populate("student invitedBy", "name publicId role").sort({ createdAt: -1 });
  res.json({ success: true, requests: requests.map(request => ({
    publicId: request.publicId, kind: request.kind, status: request.status, respondedAt: request.respondedAt,
    createdAt: request.createdAt, group: request.group ? { name: request.group.name, groupCode: request.group.groupCode } : null,
    student: person(request.student), invitedBy: person(request.invitedBy),
    canRespond: request.status === "pending" && request.group?.status === "active" && (request.kind === "invitation"
      ? req.user.role === "student" && String(request.student?._id) === String(req.user._id)
      : canManage(request.group, req.user)),
  })) });
});
export const removeStudentFromGroup = groupHandler(async (req, res) => {
  const code = identifier(req.params.code, "GRP"), publicId = identifier(req.params.publicId, "QV");
  await mongoose.connection.transaction(async session => {
    const group = await lockGroup(code, session);
    if (!canManage(group, req.user)) fail(403, "You cannot manage this classroom.");
    const student = await User.findOne({ publicId }).session(session);
    if (!student) fail(404, "Student not found.");
    await Group.updateOne({ _id: group._id }, { $pull: { students: student._id } }, { session });
  });
  res.json({ success: true });
});
export const deleteGroup = groupHandler(async (req, res) => {
  const code = identifier(req.params.code, "GRP");
  await mongoose.connection.transaction(async session => {
    const group = await lockGroup(code, session);
    if (!canManage(group, req.user)) fail(403, "You cannot delete this classroom.");
    await GroupInvitation.updateMany({ group: group._id, status: "pending" }, { $set: { status: "cancelled", respondedAt: new Date() } }, { session });
    await Group.deleteOne({ _id: group._id }, { session });
  });
  res.json({ success: true });
});
