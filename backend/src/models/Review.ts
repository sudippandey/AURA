import { Schema, model, type Document, type Model, type Types } from "mongoose";

export const REVIEW_STATUSES = ["visible", "hidden", "flagged"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface ReviewDoc extends Document {
  product: Types.ObjectId;
  user: Types.ObjectId;
  /** Display name snapshot (profile renames don't rewrite history). */
  author: string;
  rating: number;
  title: string;
  body: string;
  /** True when the author bought the product (non-cancelled order). */
  verified: boolean;
  status: ReviewStatus;
  response?: { body: string; by: Types.ObjectId; at: Date };
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    author: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    body: { type: String, required: true, trim: true, minlength: 2, maxlength: 2000 },
    verified: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: "visible", index: true },
    response: { body: { type: String, maxlength: 1000 }, by: { type: Schema.Types.ObjectId, ref: "User" }, at: { type: Date } }
  },
  { timestamps: true }
);

/** One review per user per product (edit instead of re-posting). */
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

export const Review: Model<ReviewDoc> = model<ReviewDoc>("Review", reviewSchema);
