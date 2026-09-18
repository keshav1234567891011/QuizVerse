import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    selectedOption: {
      type: Number,
      required: true,
      min: 0,
    },

    isCorrect: {
      type: Boolean,
      required: true,
    },

    marksAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

const attemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    answers: {
      type: [answerSchema],
      default: [],
    },

    score: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    totalMarks: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    correctAnswers: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    totalQuestions: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    percentage: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Attempt = mongoose.model("Attempt", attemptSchema);

export default Attempt;