import { Schema, model, type Document, type Model, type Types } from "mongoose";

/**
 * Fulfilment lifecycle:
 * pending → confirmed → processing → packed → shipped → delivered,
 * with cancelled / failed / returned / partially_returned / refunded exits.
 * Legacy orders created before this change use the shorter
 * pending/processing/shipped/delivered path and remain valid.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
  "returned",
  "partially_returned",
  "refunded"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  product: Types.ObjectId;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
  color: string | null;
  size: string | null;
}

export interface StatusEvent {
  status: OrderStatus;
  at: Date;
  note?: string;
  by?: string;
}

export interface OrderNote {
  body: string;
  by: string;
  at: Date;
}

export interface OrderDoc extends Document {
  /** Human id ("ORD-482913") — what the storefront displays and links. */
  orderNumber: string;
  user: Types.ObjectId;
  items: OrderItem[];
  customer: { firstName: string; lastName: string; email: string; phone?: string };
  shipping: { address: string; city: string; zip: string; country: string; method: string; cost: number };
  payment: { method: string; reference?: string; status: string };
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shippingCost: number;
  tax: number;
  total: number;
  status: OrderStatus;
  history: StatusEvent[];
  notes: OrderNote[];
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    color: { type: String, default: null },
    size: { type: String, default: null }
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDoc>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    customer: {
      firstName: { type: String, required: true, trim: true, maxlength: 60 },
      lastName: { type: String, required: true, trim: true, maxlength: 60 },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true, maxlength: 30 }
    },
    shipping: {
      address: { type: String, required: true, trim: true, maxlength: 200 },
      city: { type: String, required: true, trim: true, maxlength: 100 },
      zip: { type: String, required: true, trim: true, maxlength: 20 },
      country: { type: String, required: true, trim: true, maxlength: 80 },
      method: { type: String, required: true },
      cost: { type: Number, required: true, min: 0 }
    },
    payment: {
      // Simulated until a provider SDK lands (see checkout page hook).
      method: { type: String, required: true, enum: ["card", "paypal", "cod"] },
      reference: { type: String, trim: true, maxlength: 120 },
      status: { type: String, required: true, default: "paid" }
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    couponCode: { type: String, default: null },
    shippingCost: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: "processing", index: true },
    history: {
      type: [
        {
          status: { type: String, enum: ORDER_STATUSES, required: true },
          at: { type: Date, default: Date.now },
          note: { type: String, maxlength: 300 },
          by: { type: String, maxlength: 80 }
        }
      ],
      default: []
    },
    notes: {
      type: [
        { body: { type: String, required: true, maxlength: 1000 }, by: { type: String, required: true }, at: { type: Date, default: Date.now } }
      ],
      default: []
    }
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

export const Order: Model<OrderDoc> = model<OrderDoc>("Order", orderSchema);
