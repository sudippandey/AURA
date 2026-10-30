import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "../config/env.js";
import type { UserRole } from "../models/User.js";

export interface AccessPayload {
  sub: string;
  role: UserRole;
  type: "access";
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

type JwtDuration = `${number}${"s" | "m" | "h" | "d" | "w" | "y"}`;

function isJwtDuration(value: string): value is JwtDuration {
  return /^[1-9]\d*(s|m|h|d|w|y)$/.test(value);
}

function jwtDuration(value: string): StringValue {
  if (!isJwtDuration(value)) throw new Error("JWT expiration must be a positive number followed by s, m, h, d, w, or y.");
  return value;
}

export function signAccessToken(userId: string, role: UserRole): string {
  const payload: AccessPayload = { sub: userId, role, type: "access" };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: jwtDuration(env.JWT_ACCESS_TTL) });
}

export function signRefreshToken(userId: string, jti: string): string {
  const payload: RefreshPayload = { sub: userId, jti, type: "refresh" };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: jwtDuration(env.JWT_REFRESH_TTL) });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
  if (payload?.type !== "access" || !payload.sub) throw new Error("Invalid access token.");
  return payload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  if (payload?.type !== "refresh" || !payload.sub || !payload.jti) throw new Error("Invalid refresh token.");
  return payload;
}
