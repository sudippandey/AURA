import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok } from "../utils/responses.js";
import * as shopper from "../services/shopperService.js";

export const wishlistToggleBody = z.object({
  productId: z.string().trim().min(1, "productId is required.").max(100)
});

export const wishlistProductParams = z.object({
  productId: z.string().trim().min(1, "productId is required.").max(100)
});

export const wishlistRouter = Router();
wishlistRouter.use(requireAuth);

/** Wishlist as product-id strings (mirrors the storefront store shape). */
wishlistRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    ok(res, { items: await shopper.getWishlist(req.user!.id) });
  })
);

wishlistRouter.post(
  "/toggle",
  validate({ body: wishlistToggleBody }),
  asyncHandler(async (req, res) => {
    ok(res, await shopper.toggleWishlist(req.user!.id, req.body.productId));
  })
);

/** Idempotent remove (accepts id or slug). */
wishlistRouter.delete(
  "/:productId",
  validate({ params: wishlistProductParams }),
  asyncHandler(async (req, res) => {
    ok(res, { items: await shopper.removeFromWishlist(req.user!.id, req.params.productId) });
  })
);
