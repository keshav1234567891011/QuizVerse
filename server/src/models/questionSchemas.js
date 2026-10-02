import mongoose from "mongoose";
import { normalizeQuestion, questionTypes } from "../services/questionService.js";
const blank = new mongoose.Schema({ acceptedAnswers: [String], caseSensitive: { type: Boolean, default: false } }, { _id: false });
export const questionSchema = new mongoose.Schema({
  questionType: { type: String, enum: questionTypes, default: "singleChoice" }, questionText: { type: String, required: true, trim: true },
  options: { type: [String], default: undefined }, correctOption: Number, correctOptions: { type: [Number], default: undefined }, correctBoolean: Boolean,
  acceptedAnswers: { type: [String], default: undefined }, caseSensitive: Boolean, correctNumber: Number, numericTolerance: Number,
  blanks: { type: [blank], default: undefined }, marks: { type: Number, default: 1, min: 1 }, timeLimit: { type: Number, default: 30, min: 5 },
});
questionSchema.pre("validate", function () {
  const normalized = normalizeQuestion(this);
  for (const key of ["options", "correctOption", "correctOptions", "correctBoolean", "acceptedAnswers", "caseSensitive", "correctNumber", "numericTolerance", "blanks"]) this.set(key, normalized[key]);
});
export const snapshotSchema = new mongoose.Schema({ title: String, description: String, category: String, difficulty: String, timerMode: String, totalTimeLimit: Number, questions: [questionSchema] }, { _id: false });
