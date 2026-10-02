import { logError } from "../utils/logger.js";
import mongoose from "mongoose";
import Quiz from "../models/Quiz.js";
import { normalizeQuestions, validateQuizContent, playableQuestion } from "../services/questionService.js";
const canManageQuiz = (
  quiz,
  user
) => {
  if (user.role === "admin") {
    return true;
  }

  return (
    quiz.creator.toString() ===
    user._id.toString()
  );
};
export const createQuiz = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      difficulty,
      questions,
      timerMode,
      totalTimeLimit,
      visibility,
      status,
    } = req.body;

    // Basic required-field validation
    if (!title || !category) {
      return res.status(400).json({
        success: false,
        message: "Title and category are required",
      });
    }

    const normalizedQuestions = normalizeQuestions(questions ?? []);
    validateQuizContent({ questions: normalizedQuestions, status, timerMode, totalTimeLimit });

    const quiz = await Quiz.create({
      title,
      description,
      category,
      difficulty,
      questions: normalizedQuestions,
      timerMode,
      totalTimeLimit,
      visibility,
      status,

      // Very important:
      // creator comes from authenticated user,
      // not from req.body.
      creator: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Quiz created successfully",
      quiz,
    });
  } catch (error) {
    logError("Create quiz error:", error);

    res.status(error.status || (error.name === "ValidationError" ? 400 : 500)).json({
      success: false,
      message: error.status ? error.message : error.name === "ValidationError" ? "Please check the quiz settings." : "Something went wrong while creating the quiz",
    });
  }
};
export const getMyQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find(req.user.role === "admin" ? {} : {
      creator: req.user._id,
    }).sort({
      updatedAt: -1,
    });

    res.status(200).json({
      success: true,
      count: quizzes.length,
      quizzes,
    });
  } catch (error) {
    logError("Get my quizzes error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while loading your quizzes",
    });
  }
};
export const getMyQuizById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

if (!canManageQuiz(quiz, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this quiz",
      });
    }

    res.status(200).json({
      success: true,
      quiz,
    });
  } catch (error) {
    logError("Get quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching the quiz",
    });
  }
};

export const updateQuiz = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    if (!canManageQuiz(quiz, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to edit this quiz",
      });
    }

    if (quiz.moderationState === "restricted" && req.user.role !== "admin" && req.body.status === "published") {
      return res.status(409).json({ success: false, message: "This quiz is restricted by an administrator." });
    }
    if (quiz.moderationState === "restricted" && req.body.status === "published") {
      return res.status(409).json({ success: false, message: "Restore the quiz through moderation before publishing." });
    }
    const allowedFields = [
      "title",
      "description",
      "category",
      "difficulty",
      "questions",
      "timerMode",
      "totalTimeLimit",
      "visibility",
      "status",
    ];

    if (req.body.questions !== undefined) req.body.questions = normalizeQuestions(req.body.questions, quiz.questions);
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        quiz[field] = req.body[field];
      }
    });

    validateQuizContent(quiz);
    await quiz.save();

    res.status(200).json({
      success: true,
      message: "Quiz updated successfully",
      quiz,
    });
  } catch (error) {
    logError("Update quiz error:", error);

    res.status(error.status || (error.name === "ValidationError" ? 400 : 500)).json({
      success: false,
      message: error.status ? error.message : error.name === "ValidationError" ? "Please check the quiz settings." : "Something went wrong while updating the quiz",
    });
  }
};

export const deleteQuiz = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    if (!canManageQuiz(quiz, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this quiz",
      });
    }

    await quiz.deleteOne();

    res.status(200).json({
      success: true,
      message: "Quiz deleted successfully",
    });
  } catch (error) {
    logError("Delete quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting the quiz",
    });
  }
};
export const getPlayableQuiz = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    if (quiz.status !== "published" || quiz.moderationState === "restricted") {
      return res.status(403).json({
        success: false,
        message: "This quiz is not published",
      });
    }

    if (
      quiz.visibility !== "public" &&
      quiz.visibility !== "unlisted"
    ) {
      return res.status(403).json({
        success: false,
        message: "This quiz is private",
      });
    }

    const safeQuestions = quiz.questions.map(q => ({ _id: q._id, ...playableQuestion(q) }));

    res.status(200).json({
      success: true,

      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        difficulty: quiz.difficulty,
        timerMode: quiz.timerMode,
        totalTimeLimit: quiz.totalTimeLimit,
        questionCount: quiz.questions.length,
        questions: safeQuestions,
      },
    });
  } catch (error) {
    logError("Get playable quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while loading the quiz",
    });
  }
};
export const getPublicQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      moderationState: { $ne: "restricted" },
      status: "published",
      visibility: "public",
    })
      .populate("creator", "name publicId")
      .sort({
        updatedAt: -1,
      });

    const publicQuizzes = quizzes.map((quiz) => ({
      _id: quiz._id,

      title: quiz.title,
      description: quiz.description,

      category: quiz.category,
      difficulty: quiz.difficulty,

      timerMode: quiz.timerMode,
      totalTimeLimit: quiz.totalTimeLimit,

      questionCount:
        quiz.questions.length,

      creator: quiz.creator
        ? {
            publicId: quiz.creator.publicId,
            name: quiz.creator.name,
          }
        : null,

      updatedAt: quiz.updatedAt,
    }));

    res.status(200).json({
      success: true,
      count: publicQuizzes.length,
      quizzes: publicQuizzes,
    });
  } catch (error) {
    logError("Get public quizzes error:", error);

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading quizzes",
    });
  }
};
