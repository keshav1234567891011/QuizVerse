import { logError } from "../utils/logger.js";
import mongoose from "mongoose";

import Quiz from "../models/Quiz.js";
import Attempt from "../models/Attempt.js";
import Assignment from "../models/Assignment.js";
import { quizSnapshot, playableQuestion } from "../services/questionService.js";
import { reviewQuestions, safeReview } from "../services/resultService.js";
import { gradeAnswers } from "../services/scoringService.js";
import { mutateAssignedAttempt, assignmentView, resultView } from "../services/assignmentService.js";

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

    const frozen = quizSnapshot(quiz);
    const attempt = await Attempt.create({
      quizSnapshot: frozen,
      quiz: quiz._id,
      user: req.user._id,
      totalMarks,
      totalQuestions: quiz.questions.length,
    });

    res.status(201).json({
      success: true,
      message: "Attempt started",
      quiz: { _id: quiz._id, ...frozen, questionCount: frozen.questions.length, questions: frozen.questions.map(q => ({ _id: q._id, ...playableQuestion(q) })) },

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
    logError("Start attempt error:", error);

    res.status(error.status || 500).json({
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

    const attempt = await Attempt.findById(attemptId).select("+quizSnapshot");

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

    if (attempt.assignment) {
      const result = await mutateAssignedAttempt(req.user, attempt.publicId, "submit");
      return res.json({ success: true, result });
    }

    const quiz = attempt.quizSnapshot || await Quiz.findById(attempt.quiz);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz no longer exists",
      });
    }

    const graded = gradeAnswers(quiz.questions, answers);
    const submittedAt = new Date();

    const timeTakenSeconds = Math.max(
      0,
      Math.round(
        (submittedAt.getTime() -
          attempt.startedAt.getTime()) /
          1000
      )
    );

    Object.assign(attempt, graded);
    attempt.review = reviewQuestions(quiz.questions, attempt.answers);
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
        quizId: attempt.quiz,
        review: safeReview(attempt),
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
    logError("Submit attempt error:", error);

    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message :
        "Something went wrong while submitting the attempt",
    });
  }
};
export const getMyAttempts = async (req, res) => {
  try {
    const attempts = await Attempt.find({
      user: req.user._id,
      status: "submitted",
    })
      .populate(
        "quiz",
        "title category difficulty visibility status"
      )
      .sort({
        submittedAt: -1,
      });

    const formattedAttempts = await Promise.all(attempts.map(async attempt => {
      const assigned = attempt.assignment ? await Assignment.findById(attempt.assignment) : null;
      return {
        _id: assigned ? attempt.publicId : attempt._id,
        publicId: attempt.publicId,
        assignment: assigned ? assignmentView(assigned) : null,
        quiz: assigned ? { title: assigned.title } : attempt.quiz,
        score: attempt.score, totalMarks: attempt.totalMarks,
        correctAnswers: attempt.correctAnswers, totalQuestions: attempt.totalQuestions,
        percentage: attempt.percentage, timeTakenSeconds: attempt.timeTakenSeconds,
        submittedAt: attempt.submittedAt,
      };
    }));

    res.status(200).json({
      success: true,
      count: formattedAttempts.length,
      attempts: formattedAttempts,
    });
  } catch (error) {
    logError("Get attempts error:", error);

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading your attempts",
    });
  }
};

export const getAttemptResult = async (req, res) => {
  try {
    const { attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attempt ID",
      });
    }

    const attempt = await Attempt.findById(
      attemptId
    ).populate(
      "quiz",
      "title description category difficulty visibility status"
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
          "You are not allowed to view this attempt",
      });
    }

    if (attempt.status !== "submitted") {
      return res.status(409).json({
        success: false,
        message:
          "This attempt has not been submitted yet",
      });
    }

    if (attempt.assignment) {
      const assignment = await Assignment.findById(attempt.assignment);
      if (!assignment) return res.status(404).json({ success: false, message: "Assignment no longer exists." });
      return res.json({ success: true, result: { ...resultView(attempt), assignment: assignmentView(assignment), quiz: { title: assignment.title } } });
    }

    res.status(200).json({
      success: true,

      result: {
        attemptId: attempt._id,
        review: safeReview(attempt),
        quiz: attempt.quiz,

        score: attempt.score,
        totalMarks: attempt.totalMarks,

        correctAnswers:
          attempt.correctAnswers,

        totalQuestions:
          attempt.totalQuestions,

        percentage: attempt.percentage,

        timeTakenSeconds:
          attempt.timeTakenSeconds,

        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
    });
  } catch (error) {
    logError("Get attempt result error:", error);

    res.status(500).json({
      success: false,
      message:
        "Something went wrong while loading the result",
    });
  }
};
