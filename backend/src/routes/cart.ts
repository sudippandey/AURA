import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok } from "../utils/responses.js";
import * as shopper from "../services/shopperService.js";

export const cartLineSchema = z.object({
  productId: z.string().trim().min(1, "productId is required.").max(100),
  qty: z.number().int().min(1).max(99),
  color: z.string().trim().max(40).nullable().optional(),
  size: z.string().trim().max(20).nullable().optional()
});

export const cartPrefsSchema = z.object({
  couponCode: z.string().trim().max(40).nullable().optional(),
  shippingId: z.string().trim().min(1).max(40).optional()
});

export const cartMergeBody = z.object({
  items: z.array(cartLineSchema).max(100),
  couponCode: cartPrefsSchema.shape.couponCode,
  shippingId: cartPrefsSchema.shape.shippingId
});

export const cartReplaceBody = z.object({
  items: z.array(cartLineSchema).max(100)
});

export const cartRouter = Router();
cartRouter.use(requireAuth);

/** Current cart (empty shape when the user never saved one). */
cartRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    ok(res, await shopper.getCart(req.user!.id));
  })
);

/** Sync merge: incoming lines add onto existing ones, capped at availability. */
cartRouter.post(
  "/",
  validate({ body: cartMergeBody }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await shopper.mergeCart(req.user!.id, req.body.items, {
        couponCode: req.body.couponCode,
        shippingId: req.body.shippingId
      })
    );
  })
);

/** Full replace: qty edits, removals, or clear with []. */
cartRouter.put(
  "/",
  validate({ body: cartReplaceBody }),
  asyncHandler(async (req, res) => {
    ok(res, await shopper.replaceCart(req.user!.id, req.body.items));
  })
);

/** Coupon / shipping preferences (stored verbatim; priced server-side in Stage 5). */
cartRouter.patch(
  "/",
  validate({ body: cartPrefsSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await shopper.updateCartPrefs(req.user!.id, req.body));
  })
);

/** Clear all lines (preferences are kept). */
cartRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    ok(res, await shopper.clearCart(req.user!.id));
  })
);
