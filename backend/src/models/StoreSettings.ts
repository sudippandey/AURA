import { Schema, model, type Document, type Model } from "mongoose";

export interface StoreSettingsDoc extends Document {
  key: string;
  storeName: string;
  logo: string;
  contactEmail: string;
  contactPhone: string;
  currency: string;
  timezone: string;
  taxRate: number;
  shippingFlat: number;
  freeShipThreshold: number;
  maintenance: boolean;
  notifications: { orders: boolean; lowStock: boolean; payments: boolean };
  updatedAt: Date;
}

const settingsSchema = new Schema<StoreSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    storeName: { type: String, default: "AURA" },
    logo: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    currency: { type: String, default: "USD" },
    timezone: { type: String, default: "UTC" },
    taxRate: { type: Number, default: 0.08, min: 0, max: 1 },
    shippingFlat: { type: Number, default: 6.95, min: 0 },
    freeShipThreshold: { type: Number, default: 75, min: 0 },
    maintenance: { type: Boolean, default: false },
    notifications: {
      orders: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      payments: { type: Boolean, default: true }
    }
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const StoreSettings: Model<StoreSettingsDoc> = model<StoreSettingsDoc>("StoreSettings", settingsSchema);
