import express from "express";

import {
  startAttempt,
  submitAttempt,
  getMyAttempts,
  getAttemptResult,
} from "../controllers/attemptController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/start/:quizId",
  protect,
  startAttempt
);

router.get(
  "/mine",
  protect,
  getMyAttempts
);

router.get(
  "/:attemptId",
  protect,
  getAttemptResult
);

router.post(
  "/:attemptId/submit",
  protect,
  submitAttempt
);

export default router;