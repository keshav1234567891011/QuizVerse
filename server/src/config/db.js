import mongoose from "mongoose";

const connectDB = async (options = {}) => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, options);

    console.log(`MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
