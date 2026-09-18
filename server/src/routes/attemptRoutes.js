import express from "express";

import {
  startAttempt,
  submitAttempt,
} from "../controllers/attemptController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/start/:quizId",
  protect,
  startAttempt
);

router.post(
  "/:attemptId/submit",
  protect,
  submitAttempt
);

export default router;