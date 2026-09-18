import mongoose from "mongoose";
import Quiz from "../models/Quiz.js";
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

    // Make sure questions is actually an array
    if (questions && !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        message: "Questions must be an array",
      });
    }

    // Validate every question before saving
    if (questions?.length) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (!question.questionText) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} must have question text`,
          });
        }

        if (
          !Array.isArray(question.options) ||
          question.options.length < 2
        ) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} must have at least 2 options`,
          });
        }

        if (
          question.correctOption === undefined ||
          question.correctOption < 0 ||
          question.correctOption >= question.options.length
        ) {
          return res.status(400).json({
            success: false,
            message: `Question ${i + 1} has an invalid correct option`,
          });
        }
      }
    }

    // Whole-quiz timer needs a total time
    if (
      timerMode === "whole-quiz" &&
      (!totalTimeLimit || totalTimeLimit < 1)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A whole-quiz timer requires a valid total time limit",
      });
    }

    const quiz = await Quiz.create({
      title,
      description,
      category,
      difficulty,
      questions,
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
    console.error("Create quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while creating the quiz",
    });
  }
};
export const getMyQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      creator: req.user._id,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: quizzes.length,
      quizzes,
    });
  } catch (error) {
    console.error("Get my quizzes error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching your quizzes",
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

    if (quiz.creator.toString() !== req.user._id.toString()) {
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
    console.error("Get quiz error:", error);

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

    if (quiz.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to edit this quiz",
      });
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

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        quiz[field] = req.body[field];
      }
    });

    await quiz.save();

    res.status(200).json({
      success: true,
      message: "Quiz updated successfully",
      quiz,
    });
  } catch (error) {
    console.error("Update quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while updating the quiz",
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

    if (quiz.creator.toString() !== req.user._id.toString()) {
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
    console.error("Delete quiz error:", error);

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

    if (quiz.status !== "published") {
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

    const safeQuestions = quiz.questions.map((question) => ({
      _id: question._id,
      questionText: question.questionText,
      options: question.options,
      marks: question.marks,
      timeLimit: question.timeLimit,
    }));

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
    console.error("Get playable quiz error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while loading the quiz",
    });
  }
};
export const getPublicQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({
      status: "published",
      visibility: "public",
    })
      .populate("creator", "name")
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
            _id: quiz.creator._id,
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
    console.error(
      "Get public quizzes error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading quizzes",
    });
  }
};