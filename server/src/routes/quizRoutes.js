import express from "express";

import {
  createQuiz,
  getMyQuizzes,
  getMyQuizById,
  updateQuiz,
  deleteQuiz,
} from "../controllers/quizController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createQuiz);

router.get("/mine", protect, getMyQuizzes);

router.get("/:id", protect, getMyQuizById);

router.put("/:id", protect, updateQuiz);

router.delete("/:id", protect, deleteQuiz);

export default router;