import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import connectDB from "../config/db.js";
import { readEnvironment } from "../config/env.js";
import { logError } from "../utils/logger.js";

// Explicitly permissioned deployment operation. createIndexes only adds
// declared indexes; never syncIndexes/dropIndexes or change historical data.
export async function prepareIndexes(models = Object.values(mongoose.models)) {
  for (const model of models) {
    await model.createIndexes();
    const actual = await model.listIndexes();
    for (const [fields, options] of model.schema.indexes()) {
      const match = actual.find(index => JSON.stringify(index.key) === JSON.stringify(fields));
      if (!match || !!match.unique !== !!options.unique || !!match.sparse !== !!options.sparse ||
          (options.expireAfterSeconds !== undefined && match.expireAfterSeconds !== options.expireAfterSeconds) ||
          JSON.stringify(match.partialFilterExpression) !== JSON.stringify(options.partialFilterExpression)) {
        throw new Error("Required database index verification failed.");
      }
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await import("dotenv/config");
    readEnvironment();
    await import("../app.js");
    await connectDB({ autoIndex: false, autoCreate: false });
    await prepareIndexes();
    console.log("Required indexes prepared and verified.");
  } catch (error) { logError("index-preparation-failed", error); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
