import Notification from "../models/Notification.js";
import { handler } from "./assignmentController.js";
import { inbox, markRead } from "../services/notificationService.js";
import { syncReminders } from "../services/notificationReminderService.js";
export const list = handler(async (req, res) => res.json({ success: true, ...await inbox(req.user, req.query) }));
export const count = handler(async (req, res) => res.json({ success: true, unreadCount: await Notification.countDocuments({ recipient: req.user._id, readAt: null }) }));
export const read = handler(async (req, res) => res.json({ success: true, notification: await markRead(req.user, req.params.publicId) }));
export const readAll = handler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, readAt: null, createdAt: { $lte: new Date() } }, { $set: { readAt: new Date() } });
  res.json({ success: true });
});
export const sync = handler(async (req, res) => { await syncReminders(req.user); res.json({ success: true }); });
