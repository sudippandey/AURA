import "dotenv/config";
import { z } from "zod";

const DEV_ACCESS = "dev-access-secret-change-me-in-production-000000";
const DEV_REFRESH = "dev-refresh-secret-change-me-in-production-000000";
const DEV_WEBHOOK = "dev-webhook-secret-change-me-in-production-000000";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/aura"),
  JWT_ACCESS_SECRET: z.string().min(1).default(DEV_ACCESS),
  JWT_REFRESH_SECRET: z.string().min(1).default(DEV_REFRESH),
  JWT_ACCESS_TTL: z.string().regex(/^[1-9]\d*(s|m|h|d|w|y)$/).default("15m"),
  JWT_REFRESH_TTL: z.string().regex(/^[1-9]\d*(s|m|h|d|w|y)$/).default("30d"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32).default(DEV_WEBHOOK),
  CORS_ORIGINS: z.string().min(1).default("http://localhost:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8765,http://127.0.0.1:8765"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[env] Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;

const usingDevSecrets =
  env.JWT_ACCESS_SECRET === DEV_ACCESS ||
  env.JWT_REFRESH_SECRET === DEV_REFRESH ||
  env.PAYMENT_WEBHOOK_SECRET === DEV_WEBHOOK;

if (env.NODE_ENV === "production" && usingDevSecrets) {
  throw new Error(
    "[env] Refusing to boot in production with development secrets. Set both JWT secrets and PAYMENT_WEBHOOK_SECRET (>=32 chars)."
  );
}

if (env.NODE_ENV !== "production" && usingDevSecrets) {
  console.warn("[env] Using dev JWT secrets — fine for local dev, never for production.");
}
