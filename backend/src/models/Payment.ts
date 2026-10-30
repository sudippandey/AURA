import { Schema, model, type Document, type Model, type Types } from "mongoose";

export const PAYMENT_STATUSES = ["pending","processing","successful","failed","cancelled","partially_refunded","refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod","card","paypal","bank_transfer","sandbox"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentDoc extends Document {
  order: Types.ObjectId;
  orderNumber: string;
  user: Types.ObjectId;
  provider: string;
  method: PaymentMethod;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gatewayRef: string | null;
  idempotencyKey: string;
  raw: Record<string, unknown>;
  history: Array<{ status: PaymentStatus; at: Date; note?: string }>;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema<{ status: PaymentStatus; at: Date; note?: string }>(
  { status: { type: String, enum: PAYMENT_STATUSES, required: true }, at: { type: Date, default: Date.now }, note: { type: String, maxlength: 300 } },
  { _id: false }
);

const paymentSchema = new Schema<PaymentDoc>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, required: true, default: "sandbox", maxlength: 40 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "USD", maxlength: 8 },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending", index: true },
    gatewayRef: { type: String, default: null, maxlength: 200 },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    raw: { type: Schema.Types.Mixed, default: {} },
    history: { type: [historySchema], default: [] },
    paidAt: { type: Date, default: null }
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment: Model<PaymentDoc> = model<PaymentDoc>("Payment", paymentSchema);
