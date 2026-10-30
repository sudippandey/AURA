import { Schema, model, type Document, type Model, type Types } from "mongoose";

export const REFUND_STATUSES = ["requested","approved","processing","completed","rejected","failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface RefundDoc extends Document {
  order: Types.ObjectId;
  orderNumber: string;
  payment: Types.ObjectId | null;
  user: Types.ObjectId;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  providerRef: string | null;
  manual: boolean;
  history: Array<{ status: RefundStatus; at: Date; by?: Types.ObjectId; note?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const hSchema = new Schema<{ status: RefundStatus; at: Date; by?: Types.ObjectId; note?: string }>(
  {
    status: { type: String, enum: REFUND_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 }
  },
  { _id: false }
);

const refundSchema = new Schema<RefundDoc>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: REFUND_STATUSES, default: "requested", index: true },
    providerRef: { type: String, default: null, maxlength: 200 },
    manual: { type: Boolean, default: false },
    history: { type: [hSchema], default: [] }
  },
  { timestamps: true }
);

refundSchema.index({ status: 1, createdAt: -1 });

export const Refund: Model<RefundDoc> = model<RefundDoc>("Refund", refundSchema);
