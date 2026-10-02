import mongoose from "mongoose";
const schema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 100 },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ key: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("RateLimitBucket", schema);
