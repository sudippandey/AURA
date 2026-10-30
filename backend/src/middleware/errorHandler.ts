import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  isOperational = true;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** 404 for unknown routes — always JSON, never HTML. */
export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    };
  }
  const e = err as { name?: string; code?: number | string; errors?: Record<string, { message?: string }> } | null;
  if (e && e.name === "ValidationError" && e.errors) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Document validation failed.",
      details: Object.entries(e.errors).map(([path, v]) => ({ path, message: v?.message ?? "Invalid value." }))
    };
  }
  if (e && (e.name === "CastError" || e.name === "BSONError")) {
    return { statusCode: 400, code: "INVALID_ID", message: "Malformed resource identifier." };
  }
  if (e && (e.code === 11000 || e.code === "11000")) {
    return { statusCode: 409, code: "CONFLICT", message: "Resource already exists." };
  }
  if (e && (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError")) {
    return { statusCode: 401, code: "INVALID_TOKEN", message: "Invalid or expired token." };
  }
  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong." };
}

/** Centralized error handler — must be the last middleware. Safe messages only. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const n = normalize(err);
  if (n.statusCode >= 500) logger.error("[error]", err);
  const body: Record<string, unknown> = { success: false, message: n.message, code: n.code };
  if (n.details && env.NODE_ENV !== "production") body.details = n.details;
  if (n.details && env.NODE_ENV === "production" && n.code === "VALIDATION_ERROR") body.details = n.details;
  res.status(n.statusCode).json(body);
}
