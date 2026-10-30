import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok, created, paginated } from "../utils/responses.js";
import * as inventory from "../services/inventoryService.js";
import { INVENTORY_ROLES } from "../services/inventoryService.js";
import { MOVEMENT_TYPES } from "../models/StockMovement.js";

const stockStaff = requireRole(...INVENTORY_ROLES);

export const adjustBody = z.object({
  productId: z.string().trim().min(1, "productId is required.").max(100),
  stock: z.number().int().min(0).max(1000000),
  reason: z.string().trim().min(1, "Reason is required.").max(300)
});

export const movementsQuery = z.object({
  productId: z.string().trim().max(100).optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const lowStockQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth, stockStaff);

/** Absolute stock-take (logs the delta). */
inventoryRouter.post(
  "/adjust",
  validate({ body: adjustBody }),
  asyncHandler(async (req, res) => {
    created(res, await inventory.adjustStock(req.body.productId, req.body.stock, req.body.reason, req.user!.id));
  })
);

/** Append-only ledger, newest first. */
inventoryRouter.get(
  "/movements",
  validate({ query: movementsQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof movementsQuery>;
    const { items, total } = await inventory.listMovements(q);
    paginated(res, items, total, q.page, q.limit);
  })
);

/** Products at/below threshold (available units), worst first. */
inventoryRouter.get(
  "/low-stock",
  validate({ query: lowStockQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof lowStockQuery>;
    ok(res, await inventory.lowStock(q.limit));
  })
);

/** Headline counts for the ops dashboard. */
inventoryRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    ok(res, await inventory.inventoryOverview());
  })
);
