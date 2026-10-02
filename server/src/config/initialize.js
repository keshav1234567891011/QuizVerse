import mongoose from "mongoose";
import connectDB from "./db.js";
export function createInitializer({ connect = connectDB, models = () => Object.values(mongoose.models), production = process.env.NODE_ENV === "production", ready = () => mongoose.connection.readyState === 1 } = {}) {
  let pending, completed = false;
  return function initialize() {
    if (completed && ready()) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(connect).then(async () => {
      if (!production) for (const model of models()) await model.init();
      completed = true;
    }).catch(error => { completed = false; throw error; }).finally(() => { pending = undefined; });
    return pending;
  };
}
