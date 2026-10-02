import mongoose from "mongoose";
import crypto from "node:crypto";

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    selectedOption: {
      type: Number,
      default: null,
      min: 0,
    },

    isCorrect: {
      type: Boolean,
      default: false,
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
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", default: null },
    // Only new assignment attempts receive a public UUID; legacy records need no backfill.
    publicId: { type: String, immutable: true },
    attemptNumber: { type: Number, min: 1 },
    expiresAt: { type: Date, default: null },
    currentQuestionIndex: { type: Number, default: 0 },
    questionOpenedAt: { type: Date, default: null },
    questionClosesAt: { type: Date, default: null },
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
      default: 0,
      min: 0,
    },

    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },

    correctAnswers: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalQuestions: {
      type: Number,
      default: 0,
      min: 0,
    },

    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    status: {
      type: String,
      enum: ["in-progress", "submitted"],
      default: "in-progress",
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    timeTakenSeconds: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

attemptSchema.pre("validate", function () {
  if (this.assignment && !this.publicId) this.publicId = crypto.randomUUID();
});
attemptSchema.index({ publicId: 1 }, { unique: true, sparse: true });
attemptSchema.index({ assignment: 1, user: 1, startedAt: -1 });
attemptSchema.index({ assignment: 1, user: 1, attemptNumber: 1 }, {
  unique: true, partialFilterExpression: { assignment: { $type: "objectId" } },
});

const Attempt = mongoose.model(
  "Attempt",
  attemptSchema
);

export default Attempt;
