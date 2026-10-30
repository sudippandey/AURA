import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";
import { verifyAccessToken } from "../utils/jwt.js";
import type { UserRole } from "../models/User.js";

export interface AuthUser {
  id: string;
  role: UserRole;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/** Requires a valid Bearer access token. Stateless: id + role come from the token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(new AppError("Authentication required.", 401, "UNAUTHENTICATED"));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError("Invalid or expired token.", 401, "INVALID_TOKEN"));
  }
}

/** Requires one of the given roles. Use after requireAuth. */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError("Authentication required.", 401, "UNAUTHENTICATED"));
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(new AppError("You do not have permission for this action.", 403, "FORBIDDEN"));
      return;
    }
    next();
  };
}
