import "dotenv/config";
import crypto from "node:crypto";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/User.js";

export const missingPublicId = { $or: [{ publicId: { $exists: false } }, { publicId: null }, { publicId: "" }] };
export async function backfillPublicIds(collection = User.collection) {
  const users = collection.find(missingPublicId).project({ _id: 1 });
  let assigned = 0;
  for await (const user of users) {
    for (let retry = 0; retry < 10; retry++) {
      const publicId = `QV-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      if (await collection.findOne({ publicId })) continue;
      try {
        // Native collection is deliberate: schema immutability still protects app updates.
        // The guard makes reruns and concurrent backfills preserve existing IDs.
        const result = await collection.updateOne({ _id: user._id, ...missingPublicId }, { $set: { publicId } });
        assigned += result.modifiedCount;
        break;
      } catch (error) { if (error.code !== 11000 || retry === 9) throw error; }
    }
  }
  if (await collection.countDocuments(missingPublicId)) throw new Error("Some accounts still need public IDs. Rerun the backfill.");
  return assigned;
}
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  try {
    await connectDB({ autoIndex: false });
    console.log(`Public IDs assigned: ${await backfillPublicIds()}`);
    await User.createIndexes();
  } catch (error) { console.error("Public ID backfill failed:", error.message); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
