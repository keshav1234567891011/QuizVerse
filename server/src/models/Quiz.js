import mongoose from "mongoose";
import crypto from "node:crypto";

import { questionSchema } from "./questionSchemas.js";

const quizSchema = new mongoose.Schema(
  {
    publicId: { type: String, immutable: true },
    moderationState: { type: String, enum: ["active", "restricted"], default: "active" },
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

quizSchema.index({ publicId: 1 }, { unique: true, sparse: true });
quizSchema.pre("validate", function () {
  if (this.isNew && !this.publicId) this.publicId = crypto.randomUUID();
});
const Quiz = mongoose.model("Quiz", quizSchema);

export default Quiz;
