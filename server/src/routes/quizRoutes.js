import express from "express";
import {
  createQuiz,
  getMyQuizzes,
  getMyQuizById,
  getPlayableQuiz,
  updateQuiz,
  deleteQuiz,
  getPublicQuizzes,
} from "../controllers/quizController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createQuiz);

router.get("/mine", protect, getMyQuizzes);
router.get(
  "/public",
  getPublicQuizzes
);
router.get("/play/:id", getPlayableQuiz);

router.get("/:id", protect, getMyQuizById);

router.put("/:id", protect, updateQuiz);

router.delete("/:id", protect, deleteQuiz);


export default router;