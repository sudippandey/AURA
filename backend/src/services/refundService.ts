import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { Order } from '../models/Order.js';
import { Payment } from '../models/Payment.js';
import { Refund, type RefundStatus } from '../models/Refund.js';
import { audit } from './auditService.js';
import { notify } from './notificationService.js';
function shape(r: { _id: unknown; orderNumber: string; amount: number; currency: string; reason: string; status: RefundStatus; providerRef: string | null; manual: boolean; history: Array<{ status: RefundStatus; at: Date; note?: string }>; createdAt: Date }) {
  return { id: String(r._id), orderNumber: r.orderNumber, amount: r.amount, currency: r.currency, reason: r.reason, status: r.status, providerRef: r.providerRef, manual: r.manual, history: r.history.map((h) => ({ status: h.status, at: h.at instanceof Date ? h.at.toISOString() : String(h.at), note: h.note ?? null })), createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt) };
}
export async function listRefunds(filter: { status?: RefundStatus; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  const [total, docs] = await Promise.all([ Refund.countDocuments(q), Refund.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map((d) => shape(d as never)), total };
}
export async function requestRefund(actorId: string, orderRef: string, amount: number, reason: string) {
  const q = String(orderRef).trim();
  const order = Types.ObjectId.isValid(q) ? await Order.findById(q) : await Order.findOne({ orderNumber: q.toUpperCase() });
  if (!order) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  if (!(amount > 0) || amount > order.total) throw new AppError('Refund amount must be 0 < amount <= order total.', 400, 'INVALID_AMOUNT');
  if (!reason || !reason.trim()) throw new AppError('A reason is required.', 400, 'REASON_REQUIRED');
  const payment = await Payment.findOne({ orderNumber: order.orderNumber });
  const doc = await Refund.create({ order: order._id, orderNumber: order.orderNumber, payment: payment ? payment._id : null, user: new Types.ObjectId(actorId), amount: Math.round(amount * 100) / 100, currency: 'USD', reason: reason.trim().slice(0, 500), status: 'requested', history: [{ status: 'requested' as RefundStatus, at: new Date(), by: new Types.ObjectId(actorId), note: reason.trim().slice(0, 300) }] });
  await audit({ actorId, action: 'refund.request', entity: 'refund', entityId: order.orderNumber, after: { amount } });
  notify('refund', 'Refund requested', order.orderNumber + ' — ' + amount.toFixed(2), 'order', order.orderNumber);
  return shape(doc as never);
}
export async function transitionRefund(actorId: string, id: string, next: RefundStatus, note?: string, manual?: boolean) {
  if (!Types.ObjectId.isValid(id)) throw new AppError('Refund not found.', 404, 'NOT_FOUND');
  const doc = await Refund.findById(id);
  if (!doc) throw new AppError('Refund not found.', 404, 'NOT_FOUND');
  const cur = doc.status;
  const allowed: Record<RefundStatus, RefundStatus[]> = { requested: ['approved','rejected'], approved: ['processing','rejected'], processing: ['completed','failed'], completed: [], rejected: [], failed: ['processing'] };
  if (cur === next) return shape(doc as never);
  if (!allowed[cur].includes(next)) throw new AppError('Refund cannot move from ' + cur + ' to ' + next + '.', 400, 'BAD_TRANSITION');
  if (next === 'completed' && !manual && !doc.providerRef) {
    const pay = doc.payment ? await Payment.findById(doc.payment) : await Payment.findOne({ orderNumber: doc.orderNumber });
    if (!pay || pay.status !== 'successful') throw new AppError('Provider has not confirmed the refund. Use a documented manual refund instead.', 400, 'PROVIDER_UNCONFIRMED');
  }
  doc.status = next;
  if (manual !== undefined) doc.manual = manual;
  if (next === 'completed' && manual && !doc.providerRef) doc.providerRef = 'MANUAL-' + Date.now().toString(36).toUpperCase();
  doc.history.push({ status: next, at: new Date(), by: new Types.ObjectId(actorId), note: (note ?? '').slice(0, 500) } as never);
  await doc.save();
  if (next === 'completed') {
    const order = await Order.findOne({ orderNumber: doc.orderNumber });
    if (order) { const full = doc.amount >= order.total - 0.009; order.status = full ? 'refunded' : 'partially_returned'; order.history.push({ status: order.status, at: new Date(), note: 'refund ' + doc.amount.toFixed(2) } as never); await order.save(); }
    const pay = doc.payment ? await Payment.findById(doc.payment) : null;
    if (pay) { const full = doc.amount >= pay.amount - 0.009; pay.status = full ? 'refunded' : 'partially_refunded'; pay.history.push({ status: pay.status, at: new Date(), note: 'refund completed' } as never); await pay.save(); }
  }
  await audit({ actorId, action: 'refund.' + next, entity: 'refund', entityId: doc.orderNumber, before: { status: cur }, after: { status: next } });
  return shape(doc as never);
}
