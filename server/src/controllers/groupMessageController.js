import { handler } from "./assignmentController.js";
import { history, sendMessage } from "../services/groupMessageService.js";
export const list = handler(async (req, res) => res.json({ success: true, ...await history(req.user, req.params.code, req.query) }));
export const send = handler(async (req, res) => res.status(201).json({ success: true, message: await sendMessage(req.user, req.params.code, req.body) }));
