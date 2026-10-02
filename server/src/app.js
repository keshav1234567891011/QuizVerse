import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import attemptRoutes from "./routes/attemptRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import assignmentAttemptRoutes from "./routes/assignmentAttemptRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

const app = express();

// Allow frontend to communicate with backend
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// Security headers
app.use(helmet());

// Request logging
app.use(morgan("dev"));

// Parse incoming JSON
app.use(express.json());

// Parse cookies BEFORE protected routes
app.use(cookieParser());

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "QuizVerse API is running",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/attempts", attemptRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/assignment-attempts", assignmentAttemptRoutes);
app.use("/api/notifications", notificationRoutes);

export default app;
