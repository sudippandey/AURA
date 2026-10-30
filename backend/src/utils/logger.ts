import { env } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: Level, ...args: unknown[]): void {
  if (order[level] < order[env.LOG_LEVEL]) return;
  const ts = new Date().toISOString();
  console[level === "debug" ? "log" : level](`[${ts}] [${level}]`, ...args);
}

export const logger = {
  debug: (...a: unknown[]) => log("debug", ...a),
  info: (...a: unknown[]) => log("info", ...a),
  warn: (...a: unknown[]) => log("warn", ...a),
  error: (...a: unknown[]) => log("error", ...a)
};
