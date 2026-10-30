import { Schema, model, type Document, type Model } from "mongoose";

export const NOTIF_TYPES = ["order","payment","inventory","refund","customer","system"] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

export interface NotificationDoc extends Document {
  type: NotifType;
  title: string;
  message: string;
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    type: { type: String, enum: NOTIF_TYPES, required: true, index: true },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 1000 },
    refType: { type: String, default: null },
    refId: { type: String, default: null },
    read: { type: Boolean, default: false, index: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ createdAt: -1 });

export const Notification: Model<NotificationDoc> = model<NotificationDoc>("Notification", notificationSchema);
