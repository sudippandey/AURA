import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok, created, paginated } from "../utils/responses.js";
import * as orders from "../services/orderService.js";
import { FULFILMENT_ROLES } from "../services/orderService.js";
import { ORDER_STATUSES } from "../models/Order.js";

const lineSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  qty: z.number().int().min(1).max(99),
  color: z.string().trim().max(40).nullable().optional(),
  size: z.string().trim().max(20).nullable().optional()
});

export const checkoutBody = z.object({
  // Omitted → checkout the user's cart (cleared on success). Provided → buy-now.
  items: z.array(lineSchema).min(1).max(100).optional(),
  customer: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(30).optional()
  }),
  shipping: z.object({
    address: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    zip: z.string().trim().min(1).max(20),
    country: z.string().trim().min(1).max(80),
    method: z.enum(["standard", "express", "overnight"])
  }),
  payment: z.object({
    method: z.enum(["card", "paypal", "cod"]),
    reference: z.string().trim().max(120).optional()
  }),
  couponCode: z.string().trim().max(40).nullable().optional()
});

const refParams = z.object({ ref: z.string().trim().min(1, "Order id is required.") });

export const adminListQuery = z.object({
  all: z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean()),
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const statusBody = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional()
});

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

/** Checkout (201). */
ordersRouter.post(
  "/",
  validate({ body: checkoutBody }),
  asyncHandler(async (req, res) => {
    created(res, await orders.checkout(req.user!.id, req.body));
  })
);

/** Own history (array, newest first — matches the storefront mock) or ?all=true staff list. */
ordersRouter.get(
  "/",
  validate({ query: adminListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof adminListQuery>;
    if (q.all === true) {
      if (!(FULFILMENT_ROLES as readonly string[]).includes(req.user!.role)) {
        // Non-staff callers simply get their own history (?all is ignored).
        ok(res, await orders.listMyOrders(req.user!.id));
        return;
      }
      const { items, total } = await orders.listAllOrders({ status: q.status, page: q.page, limit: q.limit });
      paginated(res, items, total, q.page, q.limit);
      return;
    }
    ok(res, await orders.listMyOrders(req.user!.id));
  })
);

ordersRouter.get(
  "/:ref",
  validate({ params: refParams }),
  asyncHandler(async (req, res) => {
    ok(res, await orders.getOrder(req.params.ref, req.user!.id, req.user!.role));
  })
);

/** Cancel (owner of a fresh order) or fulfil/refund (staff matrix in the service). */
ordersRouter.patch(
  "/:ref/status",
  validate({ params: refParams, body: statusBody }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await orders.updateOrderStatus(
        req.params.ref,
        { id: req.user!.id, role: req.user!.role },
        req.body.status,
        req.body.note
      )
    );
  })
);
