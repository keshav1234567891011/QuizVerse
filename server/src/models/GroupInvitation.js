import crypto from "node:crypto";
import mongoose from "mongoose";

// One collection prevents overlapping invitations and join requests.
const schema = new mongoose.Schema({
  publicId: { type: String, default: () => crypto.randomUUID(), unique: true, immutable: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["invitation", "join-request"], required: true },
  status: { type: String, enum: ["pending", "accepted", "declined", "cancelled"], default: "pending" },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ group: 1, student: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
export default mongoose.model("GroupInvitation", schema);
