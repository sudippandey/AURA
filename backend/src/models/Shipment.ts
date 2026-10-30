import { Schema, model, type Document, type Model, type Types } from "mongoose";

export const SHIPMENT_STATUSES = ["pending","packed","shipped","in_transit","delivered","failed","returned"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface ShipmentDoc extends Document {
  order: Types.ObjectId;
  orderNumber: string;
  provider: string;
  trackingNumber: string | null;
  status: ShipmentStatus;
  address: { address: string; city: string; zip: string; country: string };
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  history: Array<{ status: ShipmentStatus; at: Date; by?: Types.ObjectId; note?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const hSchema = new Schema(
  {
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 300 }
  },
  { _id: false }
);

const shipmentSchema = new Schema<ShipmentDoc>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    provider: { type: String, default: "manual", maxlength: 60 },
    trackingNumber: { type: String, default: null, maxlength: 120 },
    status: { type: String, enum: SHIPMENT_STATUSES, default: "pending", index: true },
    address: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      zip: { type: String, required: true },
      country: { type: String, required: true }
    },
    dispatchedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    history: { type: [hSchema], default: [] }
  },
  { timestamps: true }
);

export const Shipment: Model<ShipmentDoc> = model<ShipmentDoc>("Shipment", shipmentSchema);
