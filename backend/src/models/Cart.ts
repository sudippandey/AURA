import { Schema, model, type Document, type Model, type Types } from "mongoose";

/**
 * One cart line. `color`/`size` are null when the shopper didn't pick a variant
 * option (frontend store uses nulls too: {id, qty, color, size}).
 */
export interface CartItem {
  product: Types.ObjectId;
  qty: number;
  color: string | null;
  size: string | null;
}

export interface CartDoc extends Document {
  /** Owner. One cart per user (unique) — guests keep localStorage until login. */
  user: Types.ObjectId;
  items: CartItem[];
  /** Echoed verbatim; server-side coupon truth arrives with orders (Stage 5). */
  couponCode: string | null;
  /** Echoed verbatim (e.g. "standard" | "express"). */
  shippingId: string;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<CartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1, max: 99 },
    color: { type: String, default: null, maxlength: 40 },
    size: { type: String, default: null, maxlength: 20 }
  },
  { _id: false }
);

const cartSchema = new Schema<CartDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, default: null, maxlength: 40 },
    shippingId: { type: String, default: "standard", maxlength: 40 }
  },
  { timestamps: true }
);

export const Cart: Model<CartDoc> = model<CartDoc>("Cart", cartSchema);
