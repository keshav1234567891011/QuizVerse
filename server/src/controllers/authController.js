import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// A consistent public profile keeps database IDs and schema internals out of identity responses.
const publicProfile = user => ({
  publicId: user.publicId,
  name: user.name,
  email: user.email,
  role: user.role,
});

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role = "student" } = req.body || {};

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string" || !name.trim() || !email.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const allowedRegistrationRoles = ["student", "teacher"];

    if (!allowedRegistrationRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid account type",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: publicProfile(user),
    });
  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while registering the user",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: publicProfile(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while logging in",
    });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: publicProfile(req.user),
    });
  } catch (error) {
    console.error("Get current user error:", error);

    res.status(500).json({
      success: false,
      message: "Something went wrong while getting the current user",
    });
  }
};

export const logoutUser = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};
