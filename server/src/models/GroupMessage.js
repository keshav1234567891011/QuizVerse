import crypto from "node:crypto";
import mongoose from "mongoose";
const schema = new mongoose.Schema({
  publicId: { type: String, default: () => crypto.randomUUID(), unique: true, immutable: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderDisplay: { name: String, publicId: String, role: String },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  type: { type: String, enum: ["normal", "announcement"], default: "normal" },
  clientMessageId: { type: String, required: true },
}, { timestamps: true });
schema.index({ group: 1, sender: 1, clientMessageId: 1 }, { unique: true });
schema.index({ group: 1, createdAt: -1, _id: -1 });
schema.index({ group: 1, sender: 1, createdAt: -1 });
export default mongoose.model("GroupMessage", schema);
