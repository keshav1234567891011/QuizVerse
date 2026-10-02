import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { logError } from "../utils/logger.js";

export const protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET, { algorithms: ["HS256"] }
    );
    if (typeof decoded.userId !== "string" || !/^[a-f0-9]{24}$/i.test(decoded.userId)) throw new Error("Invalid token subject.");

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({ success: false, message: "Your account is suspended. Contact a platform administrator." });
    }
    req.user = user;

    next();
  } catch (error) {
    if (!["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name) && error.message !== "Invalid token subject.") {
      logError("authentication-unavailable", error);
      return res.status(503).json({ success: false, message: "Authentication temporarily unavailable. Please try again." });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action",
      });
    }

    next();
  };
};
