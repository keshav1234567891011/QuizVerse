import crypto from "node:crypto";
import mongoose from "mongoose";

const snapshotQuestion = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctOption: { type: Number, required: true },
  marks: { type: Number, required: true },
  timeLimit: { type: Number, required: true },
});
const snapshot = new mongoose.Schema({
  title: String, description: String, category: String, difficulty: String,
  timerMode: String, totalTimeLimit: Number, questions: [snapshotQuestion],
}, { _id: false });
const rosterEntry = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  publicId: { type: String, required: true },
}, { _id: false });
const schema = new mongoose.Schema({
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  shareToken: { type: String, default: () => crypto.randomBytes(24).toString("hex"), unique: true, immutable: true },
  status: { type: String, enum: ["draft", "published", "closed"], default: "draft" },
  opensAt: { type: Date, default: null },
  dueAt: { type: Date, default: null },
  attemptLimit: { type: Number, min: 1, max: 100, default: 1, validate: Number.isInteger },
  publishedAt: { type: Date, default: null },
  title: { type: String, required: true },
  groupSnapshot: { name: String, groupCode: String },
  assignedStudents: { type: [rosterEntry], default: [] },
  // Explicit opt-in for server-side grading. Public serializers never return this field.
  quizSnapshot: { type: snapshot, select: false, default: null },
  revision: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ group: 1, status: 1 });
schema.index({ "assignedStudents.user": 1, status: 1 });
export default mongoose.model("Assignment", schema);
