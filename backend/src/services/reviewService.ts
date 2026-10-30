import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Order } from "../models/Order.js";
import { Product, type ProductDoc } from "../models/Product.js";
import { Review, type ReviewDoc, type ReviewStatus } from "../models/Review.js";
import { User } from "../models/User.js";

/** Exact shape the storefront getProductReviews() mocks return. */
export interface FrontendReview {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export function toFrontendReview(r: ReviewDoc): FrontendReview {
  return {
    id: String(r._id),
    author: r.author,
    rating: r.rating,
    title: r.title,
    body: r.body,
    date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    verified: r.verified
  };
}

const round1 = (n: number): number => Math.round((n + 1e-9) * 10) / 10;

/** Running average — preserves the seeded base counts instead of recomputing. Exported for tests. */
export function ratingAdded(p: { rating: number; reviewCount: number }, rating: number): void {
  p.rating = round1((p.rating * p.reviewCount + rating) / (p.reviewCount + 1));
  p.reviewCount += 1;
}

export function ratingChanged(p: { rating: number; reviewCount: number }, oldRating: number, newRating: number): void {
  if (p.reviewCount > 0) {
    p.rating = round1((p.rating * p.reviewCount - oldRating + newRating) / p.reviewCount);
  }
}

export function ratingRemoved(p: { rating: number; reviewCount: number }, rating: number): void {
  if (p.reviewCount > 1) {
    p.rating = round1((p.rating * p.reviewCount - rating) / (p.reviewCount - 1));
    p.reviewCount -= 1;
  } else {
    p.rating = 0;
    p.reviewCount = 0;
  }
}

async function findActiveProduct(ref: string): Promise<ProductDoc> {
  const q = ref.trim();
  const doc = Types.ObjectId.isValid(q) ? await Product.findById(q) : await Product.findOne({ slug: q.toLowerCase() });
  if (!doc || !doc.isActive) throw new AppError("Product not found.", 404, "NOT_FOUND");
  return doc;
}

export async function listReviews(
  productRef: string,
  page: number,
  limit: number
): Promise<{ items: FrontendReview[]; total: number }> {
  const product = await findActiveProduct(productRef);
  const filter = { product: product._id, status: "visible" as ReviewStatus };
  const [total, docs] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
  ]);
  return { items: docs.map(toFrontendReview), total };
}

export async function createReview(
  userId: string,
  productRef: string,
  input: { rating: number; title: string; body: string }
): Promise<FrontendReview> {
  const product = await findActiveProduct(productRef);
  const uid = new Types.ObjectId(userId);
  if (await Review.exists({ product: product._id, user: uid })) {
    throw new AppError("You already reviewed this product — edit your review instead.", 409, "ALREADY_REVIEWED");
  }
  const [user, bought] = await Promise.all([
    User.findById(uid).select("name"),
    Order.exists({
      user: uid,
      "items.product": product._id,
      status: { $nin: ["cancelled", "refunded"] }
    })
  ]);
  const review = await Review.create({
    product: product._id,
    user: uid,
    author: user?.name?.trim().slice(0, 80) || "AURA customer",
    rating: input.rating,
    title: input.title.trim(),
    body: input.body.trim(),
    verified: !!bought,
    status: "visible"
  });
  ratingAdded(product, input.rating);
  await product.save();
  return toFrontendReview(review);
}

async function findReview(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Review not found.", 404, "NOT_FOUND");
  const review = await Review.findById(id);
  if (!review) throw new AppError("Review not found.", 404, "NOT_FOUND");
  return review;
}

export async function updateReview(
  id: string,
  actor: { id: string; role: string },
  patch: { rating?: number; title?: string; body?: string }
): Promise<FrontendReview> {
  const review = await findReview(id);
  const isOwner = String(review.user) === String(actor.id);
  if (!isOwner && actor.role !== "admin") throw new AppError("Review not found.", 404, "NOT_FOUND");
  const wasCounted = review.status === "visible";
  const oldRating = review.rating;
  if (patch.rating !== undefined) review.rating = patch.rating;
  if (patch.title !== undefined) review.title = patch.title.trim();
  if (patch.body !== undefined) review.body = patch.body.trim();
  await review.save();
  if (wasCounted && patch.rating !== undefined && patch.rating !== oldRating) {
    const product = await Product.findById(review.product);
    if (product) {
      ratingChanged(product, oldRating, review.rating);
      await product.save();
    }
  }
  return toFrontendReview(review);
}

export async function deleteReview(id: string, actor: { id: string; role: string }): Promise<void> {
  const review = await findReview(id);
  const isOwner = String(review.user) === String(actor.id);
  if (!isOwner && actor.role !== "admin") throw new AppError("Review not found.", 404, "NOT_FOUND");
  if (review.status === "visible") {
    const product = await Product.findById(review.product);
    if (product) {
      ratingRemoved(product, review.rating);
      await product.save();
    }
  }
  await review.deleteOne();
}

/** Moderation: hidden/flagged leave the public list (and the average). */
export async function setReviewStatus(id: string, status: ReviewStatus): Promise<FrontendReview> {
  const review = await findReview(id);
  if (review.status !== status) {
    const product = await Product.findById(review.product);
    if (product) {
      if (review.status === "visible") ratingRemoved(product, review.rating);
      else if (status === "visible") ratingAdded(product, review.rating);
      await product.save();
    }
    review.status = status;
    await review.save();
  }
  return toFrontendReview(review);
}
