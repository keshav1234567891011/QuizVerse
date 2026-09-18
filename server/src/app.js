import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes.js";
import cookieParser from "cookie-parser";
const app = express();

// Allows our frontend to communicate with this backend
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// Helps secure HTTP headers
app.use(helmet());

// Shows incoming requests in the terminal
app.use(morgan("dev"));

// Allows Express to understand JSON sent by React
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
// Simple test route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "QuizVerse API is running",
  });
});

export default app;