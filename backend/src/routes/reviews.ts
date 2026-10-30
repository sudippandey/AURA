import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok } from "../utils/responses.js";
import * as reviews from "../services/reviewService.js";
import { REVIEW_STATUSES } from "../models/Review.js";

const reviewId = z.object({ id: z.string().trim().min(1, "Review id is required.") });

export const reviewPatchBody = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  body: z.string().trim().min(2).max(2000).optional()
});

export const reviewStatusBody = z.object({
  status: z.enum(REVIEW_STATUSES)
});

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

/** Edit own review (admin may edit any). */
reviewsRouter.put(
  "/:id",
  validate({ params: reviewId, body: reviewPatchBody }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await reviews.updateReview(req.params.id, { id: req.user!.id, role: req.user!.role }, req.body)
    );
  })
);

/** Delete own review (admin may delete any). */
reviewsRouter.delete(
  "/:id",
  validate({ params: reviewId }),
  asyncHandler(async (req, res) => {
    await reviews.deleteReview(req.params.id, { id: req.user!.id, role: req.user!.role });
    ok(res, { message: "Review deleted." });
  })
);

/** Moderation: hide/flag/show (admin only). */
reviewsRouter.patch(
  "/:id/status",
  requireRole("admin"),
  validate({ params: reviewId, body: reviewStatusBody }),
  asyncHandler(async (req, res) => {
    ok(res, await reviews.setReviewStatus(req.params.id, req.body.status));
  })
);
