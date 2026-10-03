import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

async function start() {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      console.log(`🚀 SkillForge app listening on port ${env.PORT}`);
    });
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
}

start();