import { Schema, model, type Document, type Model } from "mongoose";

/** Roles are assigned server-side only. The client can never choose or escalate its role. */
export const USER_ROLES = ["customer", "super-admin", "admin", "product-manager", "order-manager", "inventory-manager", "customer-support", "finance-manager", "analyst", "warehouse-employee"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface RefreshSession {
  jti: string;
  expiresAt: Date;
  createdAt: Date;
  ip?: string;
  userAgent?: string;
}

export interface PasswordReset {
  tokenHash: string;
  expiresAt: Date;
}

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserDoc extends Document, UserAttrs {
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  refreshSessions: RefreshSession[];
  passwordReset?: PasswordReset;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

const refreshSessionSchema = new Schema<RefreshSession>(
  {
    jti: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    ip: { type: String },
    userAgent: { type: String }
  },
  { _id: false }
);

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Invalid email address."]
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "customer", index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    refreshSessions: { type: [refreshSessionSchema], default: [] },
    passwordReset: {
      type: new Schema<PasswordReset>(
        { tokenHash: { type: String, required: true }, expiresAt: { type: Date, required: true } },
        { _id: false }
      ),
      required: false
    }
  },
  { timestamps: true }
);

// Backstop: never serialize secrets, even if a code path forgets to map.
userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    Reflect.deleteProperty(ret, "passwordHash");
    Reflect.deleteProperty(ret, "refreshSessions");
    Reflect.deleteProperty(ret, "passwordReset");
    Reflect.deleteProperty(ret, "_id");
    return ret;
  }
});

export function toPublicUser(doc: UserDoc): PublicUser {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    isActive: doc.isActive,
    createdAt: doc.createdAt
  };
}

export const User: Model<UserDoc> =
  model<UserDoc>("User", userSchema);
