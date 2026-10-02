import Assignment from "../models/Assignment.js";
import Attempt from "../models/Attempt.js";
import Group from "../models/Group.js";
import { fail } from "../services/groupService.js";
import { handler } from "./assignmentController.js";
import { eligible, assignmentView, sessionView, resultView, startAssignedAttempt, mutateAssignedAttempt } from "../services/assignmentService.js";

export const start = handler(async (req, res) => res.json({ success: true,
  session: await startAssignedAttempt(req.user, req.params.token) }));
export const mutate = action => handler(async (req, res) => res.json({ success: true,
  [action === "submit" ? "result" : "session"]: await mutateAssignedAttempt(req.user, req.params.publicId, action, req.body) }));
export const get = handler(async (req, res) => {
  if (!/^[a-f0-9-]{36}$/.test(req.params.publicId)) fail(400, "Invalid attempt reference.");
  const attempt = await Attempt.findOne({ publicId: req.params.publicId });
  if (!attempt?.assignment) fail(404, "Assignment attempt not found.");
  if (String(attempt.user) !== String(req.user._id)) fail(403, "Only the intended student can view this attempt.");
  const a = await Assignment.findById(attempt.assignment).select("+quizSnapshot");
  if (!a) fail(404, "Assignment no longer exists.");
  if (attempt.status === "submitted") return res.json({ success: true,
    result: { ...resultView(attempt), assignment: assignmentView(a), quiz: { title: a.title } } });
  const group = await Group.findById(a.group);
  eligible(a, group, req.user);
  res.json({ success: true, session: sessionView(attempt, a) });
});
