import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true,
    },

    options: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],

    correctOption: {
      type: Number,
      required: true,
      min: 0,
    },

    marks: {
      type: Number,
      default: 1,
      min: 1,
    },

    timeLimit: {
      type: Number,
      default: 30,
      min: 5,
    },
  },
  {
    _id: true,
  }
);

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },

    questions: {
      type: [questionSchema],
      default: [],
    },

    timerMode: {
      type: String,
      enum: ["per-question", "whole-quiz", "none"],
      default: "per-question",
    },

    totalTimeLimit: {
      type: Number,
      default: null,
    },

    visibility: {
      type: String,
      enum: ["public", "private", "unlisted"],
      default: "private",
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

const Quiz = mongoose.model("Quiz", quizSchema);

export default Quiz;