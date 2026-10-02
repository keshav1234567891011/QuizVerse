import express from "express";
import { list, send } from "../controllers/groupMessageController.js";
const router = express.Router({ mergeParams: true });
// Mounted beneath the authenticated classroom router.
router.get("/", list);
router.post("/", send);
export default router;
