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

import {
  protect,
  authorizeRoles,
} from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  authorizeRoles("teacher", "admin"),
  createQuiz
);

router.get(
  "/mine",
  protect,
  authorizeRoles("teacher", "admin"),
  getMyQuizzes
);

router.get(
  "/public",
  getPublicQuizzes
);

router.get(
  "/play/:id",
  getPlayableQuiz
);

router.get(
  "/:id",
  protect,
  authorizeRoles("teacher", "admin"),
  getMyQuizById
);

router.put(
  "/:id",
  protect,
  authorizeRoles("teacher", "admin"),
  updateQuiz
);

router.delete(
  "/:id",
  protect,
  authorizeRoles("teacher", "admin"),
  deleteQuiz
);

export default router;