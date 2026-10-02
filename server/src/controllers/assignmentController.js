import Assignment from "../models/Assignment.js";
import Attempt from "../models/Attempt.js";
import Group from "../models/Group.js";
import { fail } from "../services/groupService.js";
import { token, manager, assignmentView, createAssignment, updateAssignment, analytics, resultView } from "../services/assignmentService.js";

export const handler = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    const status = error.status || (error.code === 11000 ? 409 : error.name === "ValidationError" ? 400 : 500);
    if (status === 500) console.error("Assignment request failed:", error.message);
    res.status(status).json({ success: false, message: error.status ? error.message :
      status === 409 ? "A competing request was saved. Refresh and try again." :
      status === 400 ? "Please check the assignment settings." : "Could not complete the assignment request." });
  }
};
export const create = handler(async (req, res) => {
  res.status(201).json({ success: true, assignment: await createAssignment(req.user, req.body) });
});
export const update = handler(async (req, res) => {
  res.json({ success: true, assignment: await updateAssignment(req.user, req.params.token, req.body) });
});
export const mine = handler(async (req, res) => {
  let filter;
  if (req.user.role === "admin") filter = {};
  else if (req.user.role === "teacher") {
    const groups = await Group.find({ teacher: req.user._id });
    filter = { $or: [{ group: { $in: groups.map(g => g._id) } }, { teacher: req.user._id }] };
  } else {
    const groups = await Group.find({ students: req.user._id, status: "active" });
    filter = { group: { $in: groups.map(g => g._id) }, "assignedStudents.user": req.user._id, status: { $ne: "draft" } };
  }
  const assignments = await Assignment.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, assignments: assignments.map(a => assignmentView(a)) });
});
async function readable(req) {
  const a = await Assignment.findOne({ shareToken: token(req.params.token) });
  if (!a) fail(404, "Assignment not found.");
  const group = await Group.findById(a.group);
  const manages = manager(a, group, req.user);
  if (!manages && (req.user.role !== "student" || !group || group.status !== "active" || a.status === "draft" ||
    !group.students.some(id => String(id) === String(req.user._id)) ||
    !a.assignedStudents.some(s => String(s.user) === String(req.user._id)))) fail(403, "You cannot view this assignment.");
  return { a, manages };
}
export const detail = handler(async (req, res) => {
  const { a, manages } = await readable(req);
  const attempts = manages ? [] : await Attempt.find({ assignment: a._id, user: req.user._id }).sort({ startedAt: -1 });
  res.json({ success: true, assignment: assignmentView(a), canManage: manages,
    attempts: attempts.map(resultView), attemptsUsed: attempts.length });
});
export const report = handler(async (req, res) => {
  const { a, manages } = await readable(req);
  if (!manages) fail(403, "Only the classroom teacher or admin can view analytics.");
  const attempts = await Attempt.find({ assignment: a._id });
  res.json({ success: true, analytics: analytics(a, attempts) });
});
