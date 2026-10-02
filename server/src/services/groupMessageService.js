import mongoose from "mongoose";
import Group from "../models/Group.js";
import GroupMessage from "../models/GroupMessage.js";
import { identifier, fail, canManage, lockGroup } from "./groupService.js";
import { notify, uuid, displayPerson } from "./notificationService.js";

export function messageAccess(group, user) {
  if (!group) fail(404, "Classroom no longer exists.");
  const manages = canManage(group, user);
  if (!manages && !(user.role === "student" && group.students.some(id => String(id) === String(user._id)))) fail(403, "You cannot access this classroom chat.");
  return manages;
}
export const messageView = row => ({ publicId: row.publicId, sender: row.senderDisplay,
  message: row.message, type: row.type, createdAt: row.createdAt });
export async function history(user, code, { before, after, limit = 30 } = {}) {
  const group = await Group.findOne({ groupCode: identifier(code, "GRP") });
  const canAnnounce = messageAccess(group, user);
  limit = Number(limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (before && after)) fail(400, "Invalid message page.");
  const filter = { group: group._id };
  if (before || after) {
    const cursor = await GroupMessage.findOne({ group: group._id, publicId: uuid(before || after) });
    if (!cursor) fail(404, "Message cursor not found in this classroom.");
    const comparison = after ? "$gt" : "$lt";
    filter.$or = [{ createdAt: { [comparison]: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { [comparison]: cursor._id } }];
  }
  const direction = after ? 1 : -1;
  const rows = await GroupMessage.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { group: { name: group.name, groupCode: group.groupCode, status: group.status }, canAnnounce,
    messages: (after ? page : [...page].reverse()).map(messageView),
    nextCursor: rows.length > limit ? page.at(-1).publicId : null };
}
export async function sendMessage(user, code, body = {}) {
  code = identifier(code, "GRP");
  const clientMessageId = uuid(body.clientMessageId), type = body.type || "normal";
  if (typeof body.message !== "string" || !body.message.trim() || body.message.trim().length > 2000 || !["normal", "announcement"].includes(type)) fail(400, "Enter a message between 1 and 2,000 characters.");
  const message = body.message.trim();
  return mongoose.connection.transaction(async session => {
    const group = await lockGroup(code, session);
    const manages = messageAccess(group, user);
    if (type === "announcement" && !manages) fail(403, "Only the classroom teacher or admin can announce.");
    const previous = await GroupMessage.findOne({ group: group._id, sender: user._id, clientMessageId }).session(session);
    if (previous) {
      if (previous.message !== message || previous.type !== type) fail(409, "This retry reference belongs to a different message.");
      return messageView(previous);
    }
    // Database count under the shared classroom write lock, safe across workers.
    const recent = await GroupMessage.countDocuments({ group: group._id, sender: user._id, createdAt: { $gte: new Date(Date.now() - 60000) } }).session(session);
    if (recent >= 20) fail(429, "Please wait before sending more messages (20 per minute).");
    const [row] = await GroupMessage.create([{ group: group._id, sender: user._id, senderDisplay: displayPerson(user), message, type, clientMessageId }], { session });
    if (type === "announcement") await notify({ recipients: [...group.students, group.teacher], actor: user,
      type: "classroom-announcement", title: `Announcement in ${group.name}`, message: message.slice(0, 500),
      related: { groupCode: code, groupName: group.name, messagePublicId: row.publicId }, eventKey: `announcement:${row.publicId}`, session });
    return messageView(row);
  });
}
