import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { dbStatus } from "../config/db.js";
import { ok } from "../utils/responses.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

/** GET /api/v1 — API index. */
healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    ok(res, {
      name: "AURA API",
      version: "1.0.0",
      health: "/api/v1/health",
      docs: "/api/docs"
    });
  })
);

/** GET /api/v1/health — liveness + dependency status. */
healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    ok(res, {
      status: "ok",
      version: "1.0.0",
      env: env.NODE_ENV,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      mongodb: dbStatus()
    });
  })
);
