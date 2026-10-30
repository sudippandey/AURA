import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

/** bcrypt with a configurable cost factor (lower it in test envs for speed). */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(env.BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/** Constant-time comparison. Returns false (never throws) on mismatch. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
