import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { Coupon, type CouponDoc } from '../models/Coupon.js';
export interface CouponInput { code: string; type: 'percent' | 'fixed' | 'freeship'; value: number; minSubtotal?: number; maxDiscount?: number | null; usageLimit?: number | null; perCustomerLimit?: number | null; startsAt?: string | null; endsAt?: string | null; isActive?: boolean; productSlugs?: string[]; categorySlugs?: string[]; freeShipping?: boolean; }
function shape(d: CouponDoc) {
  return { id: String(d._id), code: d.code, type: d.type, value: d.value, minSubtotal: d.minSubtotal, maxDiscount: d.maxDiscount, usageLimit: d.usageLimit, usedCount: d.usedCount, perCustomerLimit: d.perCustomerLimit, startsAt: d.startsAt ? d.startsAt.toISOString() : null, endsAt: d.endsAt ? d.endsAt.toISOString() : null, isActive: d.isActive, productSlugs: [...d.productSlugs], categorySlugs: [...d.categorySlugs], freeShipping: d.freeShipping };
}
function rxEscape(s: string): string { return s.replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m).replace(/\{/g, '\\{').replace(/\}/g, '\\}'); }
export async function listCoupons(filter: { active?: boolean; q?: string; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.active !== undefined) q.isActive = filter.active;
  if (filter.q) q.code = new RegExp(rxEscape(filter.q.trim().toUpperCase()), 'i');
  const [total, docs] = await Promise.all([ Coupon.countDocuments(q), Coupon.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map(shape), total };
}
export async function createCoupon(input: CouponInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new AppError('Code must be 3-40 chars (A-Z, 0-9, -, _).', 400, 'INVALID_CODE');
  if (await Coupon.exists({ code })) throw new AppError('Coupon code already exists.', 409, 'CODE_TAKEN');
  if (input.type === 'percent' && (input.value <= 0 || input.value > 90)) throw new AppError('Percent must be 1-90.', 400, 'INVALID_VALUE');
  const doc = await Coupon.create({ code, type: input.type, value: input.value, minSubtotal: input.minSubtotal ?? 0, maxDiscount: input.maxDiscount ?? null, usageLimit: input.usageLimit ?? null, perCustomerLimit: input.perCustomerLimit ?? null, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, isActive: input.isActive ?? true, productSlugs: (input.productSlugs ?? []).map((s) => s.toLowerCase()), categorySlugs: (input.categorySlugs ?? []).map((s) => s.toLowerCase()), freeShipping: input.freeShipping ?? input.type === 'freeship' });
  return shape(doc);
}
export async function updateCoupon(id: string, patch: Partial<CouponInput>) {
  if (!Types.ObjectId.isValid(id)) throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  const doc = await Coupon.findById(id);
  if (!doc) throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  if (patch.type !== undefined) doc.type = patch.type;
  if (patch.value !== undefined) doc.value = patch.value;
  if (patch.minSubtotal !== undefined) doc.minSubtotal = patch.minSubtotal;
  if (patch.maxDiscount !== undefined) doc.maxDiscount = patch.maxDiscount;
  if (patch.usageLimit !== undefined) doc.usageLimit = patch.usageLimit;
  if (patch.perCustomerLimit !== undefined) doc.perCustomerLimit = patch.perCustomerLimit;
  if (patch.startsAt !== undefined) doc.startsAt = patch.startsAt ? new Date(patch.startsAt) : null;
  if (patch.endsAt !== undefined) doc.endsAt = patch.endsAt ? new Date(patch.endsAt) : null;
  if (patch.isActive !== undefined) doc.isActive = patch.isActive;
  if (patch.productSlugs !== undefined) doc.productSlugs = patch.productSlugs.map((s) => s.toLowerCase());
  if (patch.categorySlugs !== undefined) doc.categorySlugs = patch.categorySlugs.map((s) => s.toLowerCase());
  if (patch.freeShipping !== undefined) doc.freeShipping = patch.freeShipping;
  await doc.save();
  return shape(doc);
}
export async function deleteCoupon(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  const doc = await Coupon.findById(id);
  if (!doc) throw new AppError('Coupon not found.', 404, 'NOT_FOUND');
  await doc.deleteOne();
}
export async function validateCouponForOrder(code: string | null, subtotal: number): Promise<{ discount: number; freeShip: boolean; couponCode: string | null }> {
  if (!code) return { discount: 0, freeShip: false, couponCode: null };
  const c = await Coupon.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!c) return { discount: 0, freeShip: false, couponCode: null };
  const now = new Date();
  if (c.startsAt && now < c.startsAt) return { discount: 0, freeShip: false, couponCode: null };
  if (c.endsAt && now > c.endsAt) return { discount: 0, freeShip: false, couponCode: null };
  if (subtotal < c.minSubtotal) return { discount: 0, freeShip: false, couponCode: null };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { discount: 0, freeShip: false, couponCode: null };
  let discount = 0;
  if (c.type === 'percent') discount = Math.round(((subtotal * c.value) / 100) * 100) / 100;
  if (c.type === 'fixed') discount = Math.min(c.value, subtotal);
  if (c.maxDiscount !== null) discount = Math.min(discount, c.maxDiscount);
  return { discount, freeShip: c.freeShipping || c.type === 'freeship', couponCode: c.code };
}
export async function recordCouponUse(code: string | null): Promise<void> { if (!code) return; await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } }); }
