import "dotenv/config";
import { createRuntimeApp } from "./app.js";

// Local startup waits once; production requests share initialization/retry.
const { app, port } = await createRuntimeApp({ localStartup: true });
// Recognized Express entrypoint: no serverless adapter or backend vercel.json.
app.listen(port, () => console.log("QuizVerse API listening."));
export default app;
