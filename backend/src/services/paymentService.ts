import crypto from 'crypto';
import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { Order } from '../models/Order.js';
import { Payment, PAYMENT_STATUSES, type PaymentMethod, type PaymentStatus } from '../models/Payment.js';
import { env } from '../config/env.js';
import { notify } from './notificationService.js';
export interface PaymentProvider { name: string; initiate(args: { orderNumber: string; amount: number; currency: string; method: string }): Promise<{ gatewayRef: string | null; status: PaymentStatus; raw: Record<string, unknown> }>; verifyWebhook(payload: string, signature: string, secret: string): boolean; }
export class SandboxProvider implements PaymentProvider {
  name = 'sandbox';
  async initiate(args: { orderNumber: string; amount: number; currency: string; method: string }) {
    if (args.method === 'cod') return { gatewayRef: null, status: 'pending' as PaymentStatus, raw: { sandbox: true, mode: 'cod-pending' } };
    return { gatewayRef: 'MOCK-' + args.orderNumber + '-' + Date.now().toString(36).toUpperCase(), status: 'successful' as PaymentStatus, raw: { sandbox: true, mode: 'mock-paid' } };
  }
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
  }
}
export class ManualProvider implements PaymentProvider {
  name = 'manual';
  async initiate(args: { orderNumber: string; amount: number; currency: string; method: string }) {
    return { gatewayRef: null, status: 'pending' as PaymentStatus, raw: { manual: true, method: args.method } };
  }
  verifyWebhook(): boolean { return false; }
}
const providers: Record<string, PaymentProvider> = { sandbox: new SandboxProvider(), manual: new ManualProvider(), cod: new ManualProvider(), bank_transfer: new ManualProvider() };
export function getProvider(name: string): PaymentProvider { return providers[name] ?? providers.sandbox; }
export function signWebhook(payload: string, secret: string): string { return crypto.createHmac('sha256', secret).update(payload).digest('hex'); }
function shape(p: { _id: unknown; orderNumber: string; method: string; provider: string; amount: number; currency: string; status: PaymentStatus; gatewayRef: string | null; history: Array<{ status: PaymentStatus; at: Date; note?: string }>; paidAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: String(p._id), orderNumber: p.orderNumber, method: p.method, provider: p.provider, amount: p.amount, currency: p.currency, status: p.status, gatewayRef: p.gatewayRef, history: p.history.map((h) => ({ status: h.status, at: h.at instanceof Date ? h.at.toISOString() : String(h.at), note: h.note ?? null })), paidAt: p.paidAt ? p.paidAt.toISOString() : null, createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt) };
}
export async function createPaymentForOrder(orderId: Types.ObjectId | string, method: PaymentMethod, providerName?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  const key = 'pay_' + String(order._id) + '_' + String(order.total.toFixed(2));
  const existing = await Payment.findOne({ idempotencyKey: key });
  if (existing) return shape(existing as never);
  const provider = getProvider(providerName ?? (method === 'cod' ? 'manual' : 'sandbox'));
  const init = await provider.initiate({ orderNumber: order.orderNumber, amount: order.total, currency: 'USD', method });
  const doc = await Payment.create({ order: order._id, orderNumber: order.orderNumber, user: order.user, provider: provider.name, method, amount: order.total, currency: 'USD', status: init.status, gatewayRef: init.gatewayRef, idempotencyKey: key, raw: init.raw, history: [{ status: init.status, at: new Date(), note: 'initiated via ' + provider.name }], paidAt: init.status === 'successful' ? new Date() : null });
  order.payment = { method, reference: init.gatewayRef ?? undefined, status: init.status === 'successful' ? 'paid' : init.status } as never;
  await order.save();
  if (init.status === 'successful') notify('payment', 'Payment received', order.orderNumber + ' paid ' + order.total.toFixed(2), 'order', order.orderNumber);
  return shape(doc as never);
}
export async function listPayments(filter: { status?: PaymentStatus; method?: string; q?: string; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.method) q.method = filter.method;
  if (filter.q) { const rx = new RegExp(filter.q.trim().replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m), 'i'); q['$or'] = [{ orderNumber: rx }, { gatewayRef: rx }]; }
  const [total, docs] = await Promise.all([ Payment.countDocuments(q), Payment.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map((d) => shape(d as never)), total };
}
export async function getPayment(id: string) {
  const q = String(id).trim();
  const doc = Types.ObjectId.isValid(q) ? await Payment.findById(q) : await Payment.findOne({ orderNumber: q.toUpperCase() });
  if (!doc) throw new AppError('Payment not found.', 404, 'NOT_FOUND');
  return shape(doc as never);
}
export async function handleWebhook(providerName: string, rawBody: string, signature: string, parsed: { orderNumber: string; status: PaymentStatus; gatewayRef?: string }): Promise<{ deduped: boolean; status: PaymentStatus }> {
  const secret = env.PAYMENT_WEBHOOK_SECRET;
  const provider = getProvider(providerName);
  if (!provider.verifyWebhook(rawBody, signature, secret)) throw new AppError('Invalid webhook signature.', 401, 'BAD_SIGNATURE');
  const pay = await Payment.findOne({ orderNumber: parsed.orderNumber.toUpperCase() });
  if (!pay) throw new AppError('Payment not found.', 404, 'NOT_FOUND');
  if ((pay.history ?? []).some((h) => h.status === parsed.status && (pay.gatewayRef ?? '') === (parsed.gatewayRef ?? pay.gatewayRef ?? ''))) return { deduped: true, status: pay.status };
  if (!PAYMENT_STATUSES.includes(parsed.status)) throw new AppError('Unknown payment status.', 400, 'INVALID_STATUS');
  const before = pay.status;
  pay.status = parsed.status;
  if (parsed.gatewayRef) pay.gatewayRef = parsed.gatewayRef;
  pay.history.push({ status: parsed.status, at: new Date(), note: 'webhook:' + providerName } as never);
  if (parsed.status === 'successful') pay.paidAt = new Date();
  await pay.save();
  const order = await Order.findOne({ orderNumber: pay.orderNumber });
  if (order) { order.payment.status = parsed.status === 'successful' ? 'paid' : parsed.status; await order.save(); }
  if (before !== parsed.status) notify('payment', 'Payment ' + parsed.status, pay.orderNumber + ': ' + before + ' -> ' + parsed.status, 'order', pay.orderNumber);
  return { deduped: false, status: pay.status };
}
