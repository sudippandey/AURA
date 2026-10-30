import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { User, USER_ROLES, type UserRole } from "../models/User.js";
import { availableStock } from "../models/Product.js";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

function toAdminUser(doc: { _id: unknown; name: string; email: string; role: UserRole; isActive: boolean; createdAt: Date }): AdminUser {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    isActive: doc.isActive,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt)
  };
}

export async function listUsers(filter: {
  q?: string;
  role?: UserRole;
  page: number;
  limit: number;
}): Promise<{ items: AdminUser[]; total: number }> {
  const q: Record<string, unknown> = {};
  if (filter.role) q.role = filter.role;
  if (filter.q) {
    const rx = new RegExp(filter.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [{ name: rx }, { email: rx }];
  }
  const [total, docs] = await Promise.all([
    User.countDocuments(q),
    User.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit)
  ]);
  return { items: docs.map((d) => toAdminUser(d as unknown as Parameters<typeof toAdminUser>[0])), total };
}

/**
 * Role / activation management. Self-edits are refused (no lockouts, no
 * self-promotion audit gaps — a second admin must change you).
 */
export async function updateUser(
  id: string,
  actorId: string,
  patch: { role?: UserRole; isActive?: boolean }
): Promise<AdminUser> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("User not found.", 404, "NOT_FOUND");
  if (String(id) === String(actorId)) {
    throw new AppError("You cannot change your own role or status — ask another admin.", 400, "SELF_EDIT");
  }
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found.", 404, "NOT_FOUND");
  if (patch.role !== undefined) {
    if (!(USER_ROLES as readonly string[]).includes(patch.role)) {
      throw new AppError("Unknown role.", 400, "INVALID_ROLE");
    }
    user.role = patch.role;
  }
  if (patch.isActive !== undefined) user.isActive = patch.isActive;
  await user.save();
  return toAdminUser(user as unknown as Parameters<typeof toAdminUser>[0]);
}

export interface DashboardStats {
  revenue: number;
  orders: number;
  ordersByStatus: Record<string, number>;
  users: number;
  products: number;
  outOfStock: number;
  lowStock: number;
  topProducts: Array<{ productId: string; slug: string; name: string; soldCount: number }>;
  recentOrders: Array<{ id: string; total: number; status: string; createdAt: string }>;
}

export async function dashboardStats(): Promise<DashboardStats> {
  const [revenueRows, statusRows, users, products, top, recent] = await Promise.all([
    Order.aggregate<{ _id: null; revenue: number; orders: number }>([
      { $match: { status: { $in: ["pending", "processing", "shipped", "delivered"] } } },
      { $group: { _id: null, revenue: { $sum: "$total" }, orders: { $sum: 1 } } }
    ]),
    Order.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    User.countDocuments({}),
    Product.countDocuments({ isActive: true }),
    Product.find({ isActive: true }).sort({ soldCount: -1 }).limit(5).select("slug name soldCount"),
    Order.find({}).sort({ createdAt: -1 }).limit(5).select("orderNumber total status createdAt")
  ]);
  const docs = await Product.find({ isActive: true }).select("stock reservedStock lowStockThreshold");
  const low = docs.filter((p) => availableStock(p) <= p.lowStockThreshold);
  return {
    revenue: Math.round((revenueRows[0]?.revenue ?? 0) * 100) / 100,
    orders: revenueRows[0]?.orders ?? 0,
    ordersByStatus: Object.fromEntries(statusRows.map((r) => [r._id, r.n])),
    users,
    products,
    outOfStock: low.filter((p) => availableStock(p) <= 0).length,
    lowStock: low.length,
    topProducts: top.map((p) => ({
      productId: String(p._id),
      slug: p.slug,
      name: p.name,
      soldCount: p.soldCount
    })),
    recentOrders: recent.map((o) => ({
      id: o.orderNumber,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt)
    }))
  };
}
