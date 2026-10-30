import { randomBytes } from "node:crypto";
import { User, toPublicUser, type PublicUser } from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { sha256Hex } from "../utils/hash.js";
import { env } from "../config/env.js";

const MAX_SESSIONS = 5;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function issuePair(userId: string, role: Parameters<typeof signAccessToken>[1]): TokenPair {
  const jti = crypto.randomUUID();
  return {
    accessToken: signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId, jti)
  };
}

function sessionExpiry(): Date {
  // Matches JWT_REFRESH_TTL loosely; the JWT itself is authoritative.
  // 30d default keeps sessions aligned without parsing duration strings.
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

async function attachSession(userId: string, jti: string, meta: { ip?: string; userAgent?: string }): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;
  user.refreshSessions.push({ jti, expiresAt: sessionExpiry(), createdAt: new Date(), ...meta });
  user.refreshSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  while (user.refreshSessions.length > MAX_SESSIONS) user.refreshSessions.shift();
  await user.save();
}

/** Role is ALWAYS forced to customer here — any client-supplied role is ignored upstream. */
export async function register(
  input: { name: string; email: string; password: string },
  meta: { ip?: string; userAgent?: string } = {}
): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new AppError("An account with this email already exists.", 409, "EMAIL_TAKEN");
  const passwordHash = await hashPassword(input.password);
  const user = await User.create({ name: input.name.trim(), email, passwordHash, role: "customer" });
  const pair = issuePair(String(user._id), user.role);
  const { jti } = verifyRefreshToken(pair.refreshToken);
  await attachSession(String(user._id), jti, meta);
  return { user: toPublicUser(user), ...pair };
}

export async function login(
  input: { email: string; password: string },
  meta: { ip?: string; userAgent?: string } = {}
): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email.toLowerCase().trim() }).select("+passwordHash");
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
  }
  if (!user.isActive) throw new AppError("This account has been disabled.", 403, "ACCOUNT_DISABLED");
  user.lastLoginAt = new Date();
  await user.save();
  const pair = issuePair(String(user._id), user.role);
  const { jti } = verifyRefreshToken(pair.refreshToken);
  await attachSession(String(user._id), jti, meta);
  return { user: toPublicUser(user), ...pair };
}

/**
 * Rotate a refresh token. Reuse of an already-rotated token signals theft:
 * all sessions are revoked (the legitimate client re-authenticates via login).
 */
export async function refresh(
  refreshToken: string,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token.", 401, "INVALID_TOKEN");
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError("Invalid or expired refresh token.", 401, "INVALID_TOKEN");
  const session = user.refreshSessions.find((s) => s.jti === payload.jti);
  if (!session) {
    // Valid signature but unknown jti → token was rotated/revoked and is being replayed.
    user.refreshSessions = [];
    await user.save();
    throw new AppError("Session reuse detected. Please log in again.", 401, "TOKEN_REUSED");
  }
  if (session.expiresAt.getTime() < Date.now()) {
    user.refreshSessions = user.refreshSessions.filter((s) => s.jti !== payload.jti);
    await user.save();
    throw new AppError("Invalid or expired refresh token.", 401, "INVALID_TOKEN");
  }
  user.refreshSessions = user.refreshSessions.filter((s) => s.jti !== payload.jti);
  await user.save();
  const pair = issuePair(String(user._id), user.role);
  const next = verifyRefreshToken(pair.refreshToken);
  await attachSession(String(user._id), next.jti, meta);
  return pair;
}

/** Idempotent: unknown/invalid tokens still return success (already logged out). */
export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await User.updateOne({ _id: payload.sub }, { $pull: { refreshSessions: { jti: payload.jti } } });
  } catch {
    // ignore — nothing to revoke
  }
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new AppError("Account not found.", 404, "NOT_FOUND");
  return toPublicUser(user);
}

export async function updateMe(userId: string, input: { name: string }): Promise<PublicUser> {
  const user = await User.findByIdAndUpdate(
    userId,
    { name: input.name.trim() },
    { new: true, runValidators: true }
  );
  if (!user) throw new AppError("Account not found.", 404, "NOT_FOUND");
  return toPublicUser(user);
}

/**
 * Always succeeds (prevents account enumeration). In non-production the raw
 * reset token is returned so developers can complete the flow without email.
 */
export async function forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (user) {
    const token = randomBytes(32).toString("hex");
    user.passwordReset = { tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) };
    await user.save();
    if (env.NODE_ENV !== "production") {
      return { message: "If an account exists, a reset link has been sent.", resetToken: token };
    }
  }
  return { message: "If an account exists, a reset link has been sent." };
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  const tokenHash = sha256Hex(input.token);
  const user = await User.findOne({
    "passwordReset.tokenHash": tokenHash,
    "passwordReset.expiresAt": { $gt: new Date() }
  }).select("+passwordHash");
  if (!user) throw new AppError("Invalid or expired reset token.", 400, "INVALID_TOKEN");
  user.passwordHash = await hashPassword(input.password);
  user.passwordReset = undefined;
  user.refreshSessions = []; // all devices re-authenticate after a password change
  await user.save();
}
