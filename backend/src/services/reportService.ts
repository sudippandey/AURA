import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { StockMovement } from '../models/StockMovement.js';
export interface Range { from: Date | null; to: Date | null; }
export function parseRange(q: { from?: string; to?: string; preset?: string }): Range {
  const now = new Date();
  const day = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
  if (q.from || q.to) return { from: q.from ? new Date(q.from) : null, to: q.to ? new Date(q.to) : null };
  const p = (q.preset ?? '30d');
  if (p === 'today') return { from: day(now), to: now };
  if (p === 'yesterday') { const s = day(new Date(now.getTime() - 86400000)); const e = new Date(s.getTime() + 86400000); return { from: s, to: e }; }
  if (p === '7d') return { from: new Date(now.getTime() - 7*86400000), to: now };
  if (p === 'this_month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: s, to: now }; }
  if (p === 'last_month') { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 1); return { from: s, to: e }; }
  return { from: new Date(now.getTime() - 30*86400000), to: now };
}
function matchRange(r: Range, field = 'createdAt'): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (r.from || r.to) { const c: Record<string, unknown> = {}; if (r.from) c['$gte'] = r.from; if (r.to) c['$lte'] = r.to; m[field] = c; }
  return m;
}
const round = (n: number) => Math.round(n * 100) / 100;
export async function salesReport(range: Range) {
  const match = { status: { $nin: ['cancelled','failed'] }, ...matchRange(range) };
  const rows = await Order.aggregate([ { $match: match }, { $group: { _id: null, gross: { $sum: '$subtotal' }, discount: { $sum: '$discount' }, shipping: { $sum: '$shippingCost' }, tax: { $sum: '$tax' }, net: { $sum: '$total' }, orders: { $sum: 1 } } } ]);
  const refunds = await Refund.aggregate([ { $match: { status: 'completed', ...matchRange(range) } }, { $group: { _id: null, refunded: { $sum: '$amount' }, count: { $sum: 1 } } } ]);
  const r = rows[0] ?? { gross: 0, discount: 0, shipping: 0, tax: 0, net: 0, orders: 0 };
  const rf = refunds[0] ?? { refunded: 0, count: 0 };
  return { gross: round(r.gross), discounts: round(r.discount), shipping: round(r.shipping), tax: round(r.tax), net: round(r.net), refunded: round(rf.refunded), netAfterRefunds: round(r.net - rf.refunded), orders: r.orders, refunds: rf.count, avgOrderValue: r.orders ? round(r.net / r.orders) : 0 };
}
export async function seriesReport(range: Range, bucket: 'day' | 'week' = 'day') {
  const fmt = bucket === 'week' ? '%Y-%U' : '%Y-%m-%d';
  const rows = await Order.aggregate([ { $match: { status: { $nin: ['cancelled','failed'] }, ...matchRange(range) } }, { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } } ]);
  return rows.map((r) => ({ date: r._id, revenue: round(r.revenue), orders: r.orders }));
}
export async function categoryReport(range: Range) {
  const rows = await Order.aggregate([ { $match: { status: { $nin: ['cancelled','failed'] }, ...matchRange(range) } }, { $unwind: '$items' }, { $group: { _id: '$items.brand', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.qty', '$items.price'] } } } }, { $sort: { revenue: -1 } }, { $limit: 20 } ]);
  return rows.map((r) => ({ brand: r._id, units: r.units, revenue: round(r.revenue) }));
}
export async function productReport(range: Range, limit = 20) {
  const rows = await Order.aggregate([ { $match: { status: { $nin: ['cancelled','failed'] }, ...matchRange(range) } }, { $unwind: '$items' }, { $group: { _id: { slug: '$items.slug', name: '$items.name' }, units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.qty', '$items.price'] } } } }, { $sort: { revenue: -1 } }, { $limit: limit } ]);
  return rows.map((r) => ({ slug: r._id.slug, name: r._id.name, units: r.units, revenue: round(r.revenue) }));
}
export async function customerReport(range: Range) {
  const [total, recent, guests] = await Promise.all([ User.countDocuments({ role: 'customer' }), User.countDocuments({ role: 'customer', ...matchRange(range) }), Order.distinct('customer.email', { ...matchRange(range) }) ]);
  const repeat = await Order.aggregate([ { $match: { status: { $nin: ['cancelled','failed'] }, ...matchRange(range) } }, { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } }, { $group: { _id: null, repeatCustomers: { $sum: { $cond: [{ $gt: ['$orders', 1] }, 1, 0] } }, avgSpent: { $avg: '$spent' } } } ]);
  return { totalCustomers: total, newCustomers: recent, activeEmails: guests.length, repeatCustomers: repeat[0]?.repeatCustomers ?? 0, avgLifetimeSpent: round(repeat[0]?.avgSpent ?? 0) };
}
export async function inventoryReport() {
  const [products, moves] = await Promise.all([ Product.find({ isActive: true }).select('name slug stock reservedStock lowStockThreshold price'), StockMovement.countDocuments({}) ]);
  const avail = (p: { stock: number; reservedStock: number }) => Math.max(0, (p.stock ?? 0) - (p.reservedStock ?? 0));
  const low = products.filter((p) => avail(p) <= p.lowStockThreshold);
  const value = products.reduce((s, p) => s + avail(p) * (p.price ?? 0), 0);
  return { products: products.length, units: products.reduce((s, p) => s + avail(p), 0), stockValue: round(value), outOfStock: low.filter((p) => avail(p) <= 0).length, lowStock: low.length, movements: moves, lowItems: low.slice(0, 50).map((p) => ({ slug: p.slug, name: p.name, available: avail(p), threshold: p.lowStockThreshold })) };
}
export async function paymentsReport(range: Range) {
  const rows = await Payment.aggregate([ { $match: { ...matchRange(range) } }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } } ]);
  const byMethod = await Payment.aggregate([ { $match: { ...matchRange(range) } }, { $group: { _id: '$method', n: { $sum: 1 }, amount: { $sum: '$amount' } } } ]);
  return { byStatus: rows.map((r) => ({ status: r._id, count: r.n, amount: round(r.amount) })), byMethod: byMethod.map((r) => ({ method: r._id, count: r.n, amount: round(r.amount) })) };
}
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
