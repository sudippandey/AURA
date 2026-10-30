import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { created, ok } from "../utils/responses.js";
import * as auth from "../services/authService.js";

/** Stricter limits for credential/reset abuse; login/register/refresh/logout stay usable. */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later.", code: "RATE_LIMITED" }
});
const lenientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later.", code: "RATE_LIMITED" }
});

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Password is too long.");

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Please enter your name.").max(80),
    email,
    password
  })
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1, "Password is required.").max(72) })
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1, "Refresh token is required.") })
});

export const logoutSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1).optional() })
});

export const updateMeSchema = z.object({
  body: z.object({ name: z.string().trim().min(2, "Please enter your name.").max(80) })
});

export const forgotSchema = z.object({
  body: z.object({ email })
});

export const resetSchema = z.object({
  body: z.object({ token: z.string().min(1, "Reset token is required."), password })
});

function clientMeta(req: { ip?: string; headers: Record<string, unknown> }): { ip?: string; userAgent?: string } {
  const ua = req.headers["user-agent"];
  return { ip: req.ip, userAgent: typeof ua === "string" ? ua.slice(0, 200) : undefined };
}

export const authRouter = Router();

authRouter.post(
  "/register",
  lenientLimiter,
  validate({ body: registerSchema.shape.body }),
  asyncHandler(async (req, res) => {
    const result = await auth.register(req.body, clientMeta(req));
    created(res, result);
  })
);

authRouter.post(
  "/login",
  strictLimiter,
  validate({ body: loginSchema.shape.body }),
  asyncHandler(async (req, res) => {
    const result = await auth.login(req.body, clientMeta(req));
    ok(res, result);
  })
);

authRouter.post(
  "/refresh",
  lenientLimiter,
  validate({ body: refreshSchema.shape.body }),
  asyncHandler(async (req, res) => {
    const pair = await auth.refresh(req.body.refreshToken, clientMeta(req));
    ok(res, pair);
  })
);

authRouter.post(
  "/logout",
  lenientLimiter,
  validate({ body: logoutSchema.shape.body }),
  asyncHandler(async (req, res) => {
    await auth.logout(req.body.refreshToken);
    ok(res, { message: "Logged out." });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    ok(res, await auth.getMe(req.user!.id));
  })
);

authRouter.patch(
  "/me",
  requireAuth,
  validate({ body: updateMeSchema.shape.body }),
  asyncHandler(async (req, res) => {
    ok(res, await auth.updateMe(req.user!.id, req.body));
  })
);

authRouter.post(
  "/forgot-password",
  strictLimiter,
  validate({ body: forgotSchema.shape.body }),
  asyncHandler(async (req, res) => {
    ok(res, await auth.forgotPassword(req.body.email));
  })
);

authRouter.post(
  "/reset-password",
  strictLimiter,
  validate({ body: resetSchema.shape.body }),
  asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body);
    ok(res, { message: "Password has been reset. Please log in." });
  })
);
