import { Schema, model, type Document, type Model, type Types } from "mongoose";

export const MOVEMENT_TYPES = ["sale","restock","adjustment","reservation","release","dispatch","damaged","returned"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * Append-only stock ledger. Every change to Product.stock / reservedStock writes
 * a movement: checkout reserves, dispatch deducts, cancels release, humans log via
 * /inventory/adjust with a reason. `qty` is signed (sales/dispatch negative);
 * `balance` is the on-hand stock afterwards.
 */
export interface StockMovementDoc extends Document {
  product: Types.ObjectId;
  type: MovementType;
  qty: number;
  balance: number;
  reason: string;
  orderNumber?: string;
  actor?: Types.ObjectId;
  createdAt: Date;
}

const stockMovementSchema = new Schema<StockMovementDoc>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    qty: { type: Number, required: true },
    balance: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    orderNumber: { type: String, trim: true, maxlength: 20 },
    actor: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

export const StockMovement: Model<StockMovementDoc> =
  model<StockMovementDoc>("StockMovement", stockMovementSchema);
