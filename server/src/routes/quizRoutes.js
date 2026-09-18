import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import {
  createQuiz,
  getMyQuizzes,
} from "../controllers/quizController.js";
const router = express.Router();

router.post("/", protect, createQuiz);
router.get("/mine", protect, getMyQuizzes);

export default router;