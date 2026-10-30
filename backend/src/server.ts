import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  try {
    await connectDb();
    logger.info(`[db] Connected (${env.MONGODB_URI.replace(/:\/\/.*@/, "://***@")})`);
  } catch (err) {
    if (env.NODE_ENV === "production") {
      logger.error("[db] Connection failed — refusing to boot:", err);
      process.exit(1);
    }
    logger.warn("[db] Unavailable, continuing without database (health will report status):", (err as Error).message);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`[api] AURA listening on :${env.PORT} (${env.NODE_ENV}) — health: /api/v1/health`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`[api] ${signal} — shutting down…`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main();
