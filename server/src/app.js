import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { readEnvironment } from "./config/env.js";
import { originGuard } from "./middleware/originGuard.js";
import { authRateLimit } from "./middleware/rateLimitMiddleware.js";
import { notFound, errorMiddleware } from "./middleware/errorMiddleware.js";

import authRoutes from "./routes/authRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import attemptRoutes from "./routes/attemptRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import assignmentAttemptRoutes from "./routes/assignmentAttemptRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

export function createApp({ config = readEnvironment(process.env, { requireSecrets: false }), initialize, consume } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  // Allow frontend to communicate with backend
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin ? false : config.origins.includes(origin));
      },
      credentials: true,
    })
  );

  // Security headers
  app.use(helmet());

  // Request logging
  // Do not log URLs, query strings, cookies, headers, or request bodies.
  app.use(morgan(":method :status :response-time ms", { skip: () => config.mode === "test" }));
  app.use(originGuard(config));

  // Parse incoming JSON
  app.use(express.json({ limit: "100kb" }));

  // Parse cookies BEFORE protected routes
  app.use(cookieParser());
  if (initialize) app.use(async (req, res, next) => {
    // Clearing an authentication cookie must not depend on database availability.
    if (req.method === "POST" && /^\/api\/auth\/logout\/?$/i.test(req.path)) return next();
    try { await initialize(); next(); }
    catch (error) { error.status = 503; next(error); }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      success: true,
      message: "QuizVerse API is running",
    });
  });

  // API routes
  app.use("/api/auth", authRateLimit({ production: config.production, consume }), authRoutes);
  app.use("/api/quizzes", quizRoutes);
  app.use("/api/attempts", attemptRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/assignments", assignmentRoutes);
  app.use("/api/assignment-attempts", assignmentAttemptRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/admin", adminRoutes);
  app.use(notFound);
  app.use(errorMiddleware);
  return app;
}

export default createApp();
