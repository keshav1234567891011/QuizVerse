import crypto from "node:crypto";
import Notification from "../models/Notification.js";
import { fail } from "./groupService.js";

export const displayPerson = user => ({ name: user.name || "Former user", publicId: user.publicId, role: user.role });
export function uuid(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) fail(400, "Invalid public reference.");
  return value.toLowerCase();
}
export function notificationView(row) {
  return { publicId: row.publicId, actor: row.actorDisplay, type: row.type, title: row.title,
    message: row.message, related: row.related, read: !!row.readAt, readAt: row.readAt, createdAt: row.createdAt };
}
// Server-only event writer. Identity, links and recipients are never supplied by
// a public notification-creation API. Upserts participate in the caller's transaction.
export async function notify({ recipients, actor, type, title, message, related, eventKey, session }) {
  const unique = [...new Set(recipients.filter(Boolean).map(String))].filter(id => id !== String(actor?._id));
  if (!unique.length) return;
  await Notification.bulkWrite(unique.map(recipient => ({ updateOne: {
    filter: { recipient, eventKey }, update: { $setOnInsert: {
      publicId: crypto.randomUUID(), recipient, actor: actor?._id || null,
      actorDisplay: actor ? displayPerson(actor) : undefined, type, title, message, related, eventKey, readAt: null,
    } }, upsert: true,
  } })), { ...(session ? { session } : {}) });
}
export async function inbox(user, { before, unread, limit = 30 } = {}) {
  limit = Number(limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "Invalid page size.");
  const filter = { recipient: user._id, ...(unread === "true" ? { readAt: null } : {}) };
  if (before) {
    const cursor = await Notification.findOne({ recipient: user._id, publicId: uuid(before) });
    if (!cursor) fail(404, "Notification cursor not found.");
    filter.$or = [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }];
  }
  const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
  return { notifications: rows.slice(0, limit).map(notificationView), nextCursor: rows.length > limit ? rows[limit - 1].publicId : null };
}
export async function markRead(user, publicId) {
  publicId = uuid(publicId);
  const row = await Notification.findOneAndUpdate({ recipient: user._id, publicId, readAt: null }, { $set: { readAt: new Date() } }, { new: true });
  const existing = row || await Notification.findOne({ recipient: user._id, publicId });
  if (!existing) fail(404, "Notification not found.");
  return notificationView(existing);
}
