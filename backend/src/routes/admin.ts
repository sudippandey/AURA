import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok, paginated } from "../utils/responses.js";
import * as admin from "../services/adminService.js";
import { USER_ROLES } from "../models/User.js";

export const adminUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const adminUserPatch = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional()
});

const userIdParams = z.object({ id: z.string().trim().min(1, "User id is required.") });

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get(
  "/users",
  validate({ query: adminUsersQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof adminUsersQuery>;
    const { items, total } = await admin.listUsers(q);
    paginated(res, items, total, q.page, q.limit);
  })
);

adminRouter.patch(
  "/users/:id",
  validate({ params: userIdParams, body: adminUserPatch }),
  asyncHandler(async (req, res) => {
    ok(res, await admin.updateUser(req.params.id, req.user!.id, req.body));
  })
);

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    ok(res, await admin.dashboardStats());
  })
);
