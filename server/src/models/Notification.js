import crypto from "node:crypto";
import mongoose from "mongoose";
const schema = new mongoose.Schema({
  publicId: { type: String, default: () => crypto.randomUUID(), unique: true, immutable: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  actorDisplay: { name: String, publicId: String, role: String },
  type: { type: String, required: true },
  title: { type: String, required: true, maxlength: 150 },
  message: { type: String, required: true, maxlength: 500 },
  related: { groupCode: String, groupName: String, requestPublicId: String, assignmentToken: String, messagePublicId: String },
  eventKey: { type: String, required: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ recipient: 1, eventKey: 1 }, { unique: true });
schema.index({ recipient: 1, readAt: 1, createdAt: -1, _id: -1 });
export default mongoose.model("Notification", schema);
