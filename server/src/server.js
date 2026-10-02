import "dotenv/config";
import express from "express";
import { readEnvironment } from "./config/env.js";
import { createInitializer } from "./config/initialize.js";
import { logError } from "./utils/logger.js";

let app, port = 5000;
try {
  const config = readEnvironment();
  port = config.port;
  const { createApp } = await import("./app.js");
  const initialize = createInitializer({ production: config.production });
  // Local startup waits once; production requests share initialization/retry.
  if (!config.production) await initialize();
  app = createApp({ config, initialize });
} catch (error) {
  logError("api-initialization-failed", error);
  app = express();
  app.disable("x-powered-by");
  app.use((req, res) => res.status(503).json({ success: false, message: "Service temporarily unavailable. Check deployment configuration." }));
}
// Recognized Express entrypoint: no serverless adapter or backend vercel.json.
app.listen(port, () => console.log("QuizVerse API listening."));
export default app;
