import mongoose from "mongoose";
import Assignment from "../models/Assignment.js";
import Attempt from "../models/Attempt.js";
import Group from "../models/Group.js";
import { lockGroup } from "./groupService.js";
import { notify } from "./notificationService.js";

export function dueSoon(a, now = new Date()) {
  return !!(a.status === "published" && a.dueAt && new Date(a.dueAt) > now && new Date(a.dueAt) <= new Date(now.getTime() + 86400000));
}
// Called explicitly by authenticated clients; not an offline scheduler.
export async function syncReminders(user) {
  if (user.role !== "student") return;
  const now = new Date();
  const candidates = await Assignment.find({ status: "published", "assignedStudents.user": user._id,
    dueAt: { $gt: now, $lte: new Date(now.getTime() + 86400000) } }).select("group");
  for (const candidate of candidates) await mongoose.connection.transaction(async session => {
    const original = await Group.findById(candidate.group).session(session);
    if (!original || original.status !== "active") return;
    const group = await lockGroup(original.groupCode, session);
    if (!group.students.some(id => String(id) === String(user._id))) return;
    const a = await Assignment.findById(candidate._id).session(session);
    if (!a || !dueSoon(a) || !a.assignedStudents.some(s => String(s.user) === String(user._id))) return;
    if (await Attempt.exists({ assignment: a._id, user: user._id, status: "submitted" }).session(session)) return;
    await notify({ recipients: [user._id], type: "assignment-due-soon", title: "Assignment due soon",
      message: `${a.title} is due ${a.dueAt.toISOString()}.`, related: { groupCode: group.groupCode, groupName: group.name, assignmentToken: a.shareToken },
      eventKey: `due:${a._id}:${a.dueAt.toISOString()}`, session });
  });
}
