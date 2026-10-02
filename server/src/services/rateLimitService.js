import { createHmac } from "node:crypto";
import RateLimitBucket from "../models/RateLimitBucket.js";
export async function consumeLimit(scope, identity, { limit, windowMs, now = Date.now(), secret = process.env.JWT_SECRET, Model = RateLimitBucket } = {}) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Rate limiter configuration unavailable.");
  const window = Math.floor(now / windowMs), expiresAt = new Date((window + 1) * windowMs);
  const key = `${scope}:${window}:${createHmac("sha256", secret).update(String(identity).slice(0, 500)).digest("hex")}`;
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } };
  let bucket;
  try { bucket = await Model.findOneAndUpdate({ key }, update, { upsert: true, new: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    bucket = await Model.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true });
  }
  if (!bucket) throw new Error("Rate limiter unavailable.");
  return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) };
}
