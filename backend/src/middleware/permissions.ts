import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

/**
 * Action-level permission matrix. Roles map to atomic actions; the frontend
 * mirrors this for hiding buttons, but EVERY protected route re-checks here.
 * Super-admin bypasses all checks.
 */
export const PERMISSIONS = {
  "dashboard.view": ["super-admin","admin","product-manager","order-manager","inventory-manager","customer-support","finance-manager","analyst"],
  "products.view": ["super-admin","admin","product-manager","order-manager","inventory-manager","customer-support","finance-manager","analyst"],
  "products.write": ["super-admin","admin","product-manager"],
  "categories.write": ["super-admin","admin","product-manager"],
  "inventory.view": ["super-admin","admin","inventory-manager","order-manager","analyst"],
  "inventory.adjust": ["super-admin","admin","inventory-manager"],
  "orders.view": ["super-admin","admin","order-manager","inventory-manager","customer-support","finance-manager","analyst"],
  "orders.manage": ["super-admin","admin","order-manager"],
  "orders.fulfil": ["super-admin","admin","order-manager","inventory-manager"],
  "payments.view": ["super-admin","admin","finance-manager","order-manager","analyst"],
  "payments.manage": ["super-admin","admin","finance-manager"],
  "refunds.request": ["super-admin","admin","order-manager","customer-support","finance-manager"],
  "refunds.approve": ["super-admin","admin","finance-manager"],
  "customers.view": ["super-admin","admin","order-manager","customer-support","finance-manager","analyst"],
  "customers.manage": ["super-admin","admin","customer-support"],
  "coupons.manage": ["super-admin","admin","product-manager"],
  "shipping.manage": ["super-admin","admin","order-manager","inventory-manager"],
  "reviews.moderate": ["super-admin","admin","customer-support","product-manager"],
  "reports.view": ["super-admin","admin","finance-manager","analyst","order-manager","inventory-manager"],
  "staff.view": ["super-admin","admin"],
  "staff.manage": ["super-admin","admin"],
  "settings.manage": ["super-admin","admin"],
  "audit.view": ["super-admin","admin","analyst"]
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: string, perm: Permission): boolean {
  if (role === "super-admin") return true;
  const roles = (PERMISSIONS[perm] as readonly string[]) ?? [];
  return roles.includes(role);
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) { next(new AppError("Authentication required.", 401, "UNAUTHENTICATED")); return; }
    if (req.user.role === "super-admin" || req.user.role === "admin") { next(); return; }
    for (const p of perms) {
      if (hasPermission(req.user.role, p)) { next(); return; }
    }
    next(new AppError("You do not have permission for this action.", 403, "FORBIDDEN"));
  };
}

/** Role directory for the staff UI (backend is the source of truth). */
export const ROLE_DIRECTORY = [
  { id: "super-admin", label: "Super Admin", desc: "Full control, including staff and settings." },
  { id: "admin", label: "Admin", desc: "Full operational control except staff management." },
  { id: "product-manager", label: "Product Manager", desc: "Catalogue, categories, coupons, review moderation." },
  { id: "order-manager", label: "Order Manager", desc: "Orders, fulfillment, shipping, refund requests." },
  { id: "inventory-manager", label: "Inventory Manager", desc: "Stock levels, movements, fulfillment help." },
  { id: "customer-support", label: "Customer Support", desc: "Customers, orders (view), refund requests, reviews." },
  { id: "finance-manager", label: "Finance Manager", desc: "Payments, refunds approval, financial reports." },
  { id: "analyst", label: "Analyst", desc: "Read-only dashboards and reports." }
];
