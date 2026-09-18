import mongoose from "mongoose";

import Quiz from "../models/Quiz.js";
import Attempt from "../models/Attempt.js";

export const startAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID",
      });
    }

    const quiz = await Quiz.findById(quizId);

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

    if (quiz.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "This quiz has no questions",
      });
    }

    const totalMarks = quiz.questions.reduce(
      (total, question) =>
        total + (Number(question.marks) || 0),
      0
    );

    const attempt = await Attempt.create({
      quiz: quiz._id,
      user: req.user._id,
      totalMarks,
      totalQuestions: quiz.questions.length,
    });

    res.status(201).json({
      success: true,
      message: "Attempt started",

      attempt: {
        _id: attempt._id,
        quiz: attempt.quiz,
        status: attempt.status,
        startedAt: attempt.startedAt,
        totalMarks: attempt.totalMarks,
        totalQuestions: attempt.totalQuestions,
      },
    });
  } catch (error) {
    console.error("Start attempt error:", error);

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while starting the attempt",
    });
  }
};

export const submitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(attemptId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid attempt ID",
      });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Answers must be an array",
      });
    }

    const attempt = await Attempt.findById(
      attemptId
    );

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Attempt not found",
      });
    }

    if (
      attempt.user.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to submit this attempt",
      });
    }

    if (attempt.status === "submitted") {
      return res.status(409).json({
        success: false,
        message:
          "This attempt has already been submitted",
      });
    }

    const quiz = await Quiz.findById(
      attempt.quiz
    );

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz no longer exists",
      });
    }

    const validQuestionIds = new Set(
      quiz.questions.map((question) =>
        question._id.toString()
      )
    );

    const answerMap = new Map();

    for (const answer of answers) {
      if (
        !answer.questionId ||
        !mongoose.Types.ObjectId.isValid(
          answer.questionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more answers contain an invalid question ID",
        });
      }

      const questionId =
        answer.questionId.toString();

      if (!validQuestionIds.has(questionId)) {
        return res.status(400).json({
          success: false,
          message:
            "An answer references a question that does not belong to this quiz",
        });
      }

      if (answerMap.has(questionId)) {
        return res.status(400).json({
          success: false,
          message:
            "The same question was answered more than once",
        });
      }

      const selectedOption =
        answer.selectedOption === null ||
        answer.selectedOption === undefined
          ? null
          : Number(answer.selectedOption);

      if (
        selectedOption !== null &&
        (!Number.isInteger(selectedOption) ||
          selectedOption < 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more selected options are invalid",
        });
      }

      answerMap.set(
        questionId,
        selectedOption
      );
    }

    let score = 0;
    let correctAnswers = 0;
    let totalMarks = 0;

    const gradedAnswers = [];

    for (const question of quiz.questions) {
      const questionId =
        question._id.toString();

      const selectedOption =
        answerMap.has(questionId)
          ? answerMap.get(questionId)
          : null;

      if (
        selectedOption !== null &&
        selectedOption >= question.options.length
      ) {
        return res.status(400).json({
          success: false,
          message:
            "A selected option is outside the valid range",
        });
      }

      const questionMarks =
        Number(question.marks) || 0;

      totalMarks += questionMarks;

      const isCorrect =
        selectedOption !== null &&
        selectedOption ===
          question.correctOption;

      const marksAwarded = isCorrect
        ? questionMarks
        : 0;

      if (isCorrect) {
        correctAnswers += 1;
        score += marksAwarded;
      }

      gradedAnswers.push({
        questionId: question._id,
        selectedOption,
        isCorrect,
        marksAwarded,
      });
    }

    const percentage =
      totalMarks > 0
        ? Number(
            (
              (score / totalMarks) *
              100
            ).toFixed(2)
          )
        : 0;

    const submittedAt = new Date();

    const timeTakenSeconds = Math.max(
      0,
      Math.round(
        (submittedAt.getTime() -
          attempt.startedAt.getTime()) /
          1000
      )
    );

    attempt.answers = gradedAnswers;
    attempt.score = score;
    attempt.totalMarks = totalMarks;
    attempt.correctAnswers =
      correctAnswers;
    attempt.totalQuestions =
      quiz.questions.length;
    attempt.percentage = percentage;
    attempt.status = "submitted";
    attempt.submittedAt = submittedAt;
    attempt.timeTakenSeconds =
      timeTakenSeconds;

    await attempt.save();

    res.status(200).json({
      success: true,
      message:
        "Attempt submitted successfully",

      result: {
        attemptId: attempt._id,
        quizId: quiz._id,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        correctAnswers:
          attempt.correctAnswers,
        totalQuestions:
          attempt.totalQuestions,
        percentage: attempt.percentage,
        timeTakenSeconds:
          attempt.timeTakenSeconds,
        submittedAt:
          attempt.submittedAt,
      },
    });
  } catch (error) {
    console.error(
      "Submit attempt error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while submitting the attempt",
    });
  }
};