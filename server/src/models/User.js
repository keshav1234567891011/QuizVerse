import crypto from "crypto";
import mongoose from "mongoose";

const generatePublicId = () => {
  return `QV-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    publicId: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      default: generatePublicId,
    },

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model(
  "User",
  userSchema
);

export default User;