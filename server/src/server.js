import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";

import Group from "./models/Group.js";
import GroupInvitation from "./models/GroupInvitation.js";
import Assignment from "./models/Assignment.js";
import Attempt from "./models/Attempt.js";

const PORT = process.env.PORT || 5000;

await connectDB();
// Required before membership traffic: uniqueness must be enforced by MongoDB.
await Group.init();
await GroupInvitation.init();
await Assignment.init();
await Attempt.init();

app.listen(PORT, () => {
  console.log(`QuizVerse server running on port ${PORT}`);
});
