import { Schema, model, type Document, type Model } from "mongoose";

export const COUPON_TYPES = ["percent","fixed","freeship"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export interface CouponDoc extends Document {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  productSlugs: string[];
  categorySlugs: string[];
  freeShipping: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<CouponDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40, index: true },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    usageLimit: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: null, min: 1 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    productSlugs: { type: [String], default: [] },
    categorySlugs: { type: [String], default: [] },
    freeShipping: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Coupon: Model<CouponDoc> = model<CouponDoc>("Coupon", couponSchema);
