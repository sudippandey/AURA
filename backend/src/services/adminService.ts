import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { Order } from '../models/Order.js';
import { Product, availableStock } from '../models/Product.js';
import { User, USER_ROLES, type UserRole } from '../models/User.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { parseRange, salesReport } from './reportService.js';
export interface AdminUser { id: string; name: string; email: string; role: UserRole; isActive: boolean; createdAt: string; }
function toAdminUser(doc: { _id: unknown; name: string; email: string; role: UserRole; isActive: boolean; createdAt: Date }): AdminUser {
  return { id: String(doc._id), name: doc.name, email: doc.email, role: doc.role, isActive: doc.isActive, createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt) };
}
export async function listUsers(filter: { q?: string; role?: UserRole; page: number; limit: number }): Promise<{ items: AdminUser[]; total: number }> {
  const q: Record<string, unknown> = {};
  if (filter.role) q.role = filter.role;
  if (filter.q) { const rx = new RegExp(filter.q.trim().replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m), 'i'); q.$or = [{ name: rx }, { email: rx }]; }
  const [total, docs] = await Promise.all([ User.countDocuments(q), User.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map((d) => toAdminUser(d as never)), total };
}
export async function updateUser(id: string, actorId: string, patch: { role?: UserRole; isActive?: boolean }): Promise<AdminUser> {
  if (!Types.ObjectId.isValid(id)) throw new AppError('User not found.', 404, 'NOT_FOUND');
  if (String(id) === String(actorId)) throw new AppError('You cannot change your own role or status — ask another admin.', 400, 'SELF_EDIT');
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found.', 404, 'NOT_FOUND');
  if (patch.role !== undefined) { if (!(USER_ROLES as readonly string[]).includes(patch.role)) throw new AppError('Unknown role.', 400, 'INVALID_ROLE'); user.role = patch.role; }
  if (patch.isActive !== undefined) user.isActive = patch.isActive;
  await user.save();
  const { audit } = await import('./auditService.js');
  await audit({ actorId, action: 'user.update', entity: 'user', entityId: String(user._id), after: patch as never });
  return toAdminUser(user as never);
}
export interface DashboardStats { revenue: number; orders: number; ordersByStatus: Record<string, number>; users: number; products: number; outOfStock: number; lowStock: number; topProducts: Array<{ productId: string; slug: string; name: string; soldCount: number }>; recentOrders: Array<{ id: string; total: number; status: string; createdAt: string }>; }
export async function dashboardStats(): Promise<DashboardStats> {
  const [revenueRows, statusRows, users, products, top, recent] = await Promise.all([
    Order.aggregate([{ $match: { status: { $in: ['pending','confirmed','processing','packed','shipped','delivered'] } } }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]) as never as Array<{ revenue: number; orders: number }> ,
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.countDocuments({}), Product.countDocuments({ isActive: true }),
    Product.find({ isActive: true }).sort({ soldCount: -1 }).limit(5).select('slug name soldCount'),
    Order.find({}).sort({ createdAt: -1 }).limit(5).select('orderNumber total status createdAt')
  ]);
  const rev = (revenueRows as Array<{ revenue: number; orders: number }>)[0];
  const docs = await Product.find({ isActive: true }).select('stock reservedStock lowStockThreshold');
  const low = docs.filter((p) => availableStock(p) <= p.lowStockThreshold);
  return { revenue: Math.round(((rev as { revenue?: number } | undefined)?.revenue ?? 0) * 100) / 100, orders: (rev as { orders?: number } | undefined)?.orders ?? 0, ordersByStatus: Object.fromEntries((statusRows as Array<{ _id: string; n: number }>).map((r) => [r._id, r.n])), users, products, outOfStock: low.filter((p) => availableStock(p) <= 0).length, lowStock: low.length, topProducts: top.map((p) => ({ productId: String(p._id), slug: p.slug, name: p.name, soldCount: p.soldCount })), recentOrders: recent.map((o) => ({ id: o.orderNumber, total: o.total, status: o.status, createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt) })) };
}
export interface OverviewParams { preset?: string; from?: string; to?: string; }
export async function dashboardOverview(params: OverviewParams) {
  const range = parseRange(params);
  const sales = await salesReport(range);
  const match: Record<string, unknown> = { status: { $nin: ['cancelled','failed'] } };
  if (range.from || range.to) { const c: Record<string, unknown> = {}; if (range.from) c.$gte = range.from; if (range.to) c.$lte = range.to; match.createdAt = c; }
  const [statusRows, payRows, newCustomers, orderCount, products, lowDocs, pendingOrders, pendingPayments, refundsDone] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: range.from || range.to ? { createdAt: (match as { createdAt?: unknown }).createdAt } : {} }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    User.countDocuments({ role: 'customer', ...(range.from || range.to ? { createdAt: (match as { createdAt?: unknown }).createdAt } : {}) }),
    Order.countDocuments(match),
    Product.countDocuments({ isActive: true }),
    Product.find({ isActive: true }).select('stock reservedStock lowStockThreshold soldCount slug name price'),
    Order.countDocuments({ status: { $in: ['pending','confirmed'] } }),
    Payment.countDocuments({ status: 'pending' }),
    Refund.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);
  const avail = (p: { stock: number; reservedStock: number }) => Math.max(0, (p.stock ?? 0) - (p.reservedStock ?? 0));
  const low = lowDocs.filter((p) => avail(p) <= p.lowStockThreshold);
  const soldUnits = await Order.aggregate([{ $match: match }, { $unwind: '$items' }, { $group: { _id: null, units: { $sum: '$items.qty' } } }]);
  return {
    revenue: sales.net, gross: sales.gross, discounts: sales.discounts, shipping: sales.shipping, tax: sales.tax, refunded: sales.refunded, net: sales.netAfterRefunds,
    orders: sales.orders, avgOrderValue: sales.avgOrderValue, unitsSold: (soldUnits[0] as { units: number } | undefined)?.units ?? 0,
    totalCustomers: await User.countDocuments({ role: 'customer' }), newCustomers,
    pendingOrders, pendingPayments, refunds: (refundsDone[0] as { n: number; amount: number } | undefined)?.n ?? 0, refundedAmount: (refundsDone[0] as { n: number; amount: number } | undefined)?.amount ?? 0,
    products, lowStock: low.length, outOfStock: low.filter((p) => avail(p) <= 0).length,
    orderCount, ordersByStatus: Object.fromEntries((statusRows as Array<{ _id: string; n: number }>).map((r) => [String(r._id), r.n])),
    paymentsByStatus: (payRows as Array<{ _id: string; n: number; amount: number }>).map((r) => ({ status: String(r._id), count: r.n, amount: r.amount })),
  };
}
export async function listCustomers(filter: { q?: string; page: number; limit: number; sort?: string }) {
  const q: Record<string, unknown> = { role: 'customer' };
  if (filter.q) { const rx = new RegExp(filter.q.trim().replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m), 'i'); q.$or = [{ name: rx }, { email: rx }]; }
  const sort: Record<string, 1 | -1> = filter.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
  const [total, docs] = await Promise.all([ User.countDocuments(q), User.find(q).sort(sort).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  const ids = docs.map((d) => d._id);
  const stats = await Order.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } }]);
  const byId = new Map((stats as Array<{ _id: unknown; orders: number; spent: number }>).map((r) => [String(r._id), r]));
  return { items: docs.map((d) => { const s = byId.get(String(d._id)); return { id: String(d._id), name: d.name, email: d.email, isActive: d.isActive, createdAt: d.createdAt.toISOString(), orders: s?.orders ?? 0, spent: Math.round((s?.spent ?? 0) * 100) / 100, avgOrderValue: s?.orders ? Math.round(((s.spent ?? 0) / s.orders) * 100) / 100 : 0 }; }), total };
}
export async function getCustomer(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError('Customer not found.', 404, 'NOT_FOUND');
  const user = await User.findById(id);
  if (!user) throw new AppError('Customer not found.', 404, 'NOT_FOUND');
  const [orders, spent] = await Promise.all([ Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(20), Order.aggregate([{ $match: { user: user._id } }, { $group: { _id: null, total: { $sum: '$total' }, n: { $sum: 1 } } }]) ]);
  const s = (spent[0] as { total: number; n: number } | undefined);
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt.toISOString(), lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null, orders: s?.n ?? 0, spent: Math.round((s?.total ?? 0) * 100) / 100, recentOrders: orders.map((o) => ({ id: o.orderNumber, total: o.total, status: o.status, createdAt: o.createdAt.toISOString() })) };
}
