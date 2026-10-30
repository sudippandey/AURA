import { StoreSettings } from '../models/StoreSettings.js';
export async function getSettings() {
  let doc = await StoreSettings.findOne({ key: 'default' });
  if (!doc) doc = await StoreSettings.create({ key: 'default' });
  return shape(doc);
}
export async function updateSettings(patch: Record<string, unknown>) {
  const allowed = ['storeName','logo','contactEmail','contactPhone','currency','timezone','taxRate','shippingFlat','freeShipThreshold','maintenance','notifications'] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) if ((patch as Record<string, unknown>)[k] !== undefined) update[k] = (patch as Record<string, unknown>)[k];
  if (typeof update.taxRate === 'number' && ((update.taxRate as number) < 0 || (update.taxRate as number) > 1)) { const e = new Error('taxRate must be 0-1.') as Error & { status?: number }; e.status = 400; throw e; }
  const doc = await StoreSettings.findOneAndUpdate({ key: 'default' }, { $set: update }, { new: true, upsert: true });
  return shape(doc!);
}
function shape(doc: { storeName: string; logo: string; contactEmail: string; contactPhone: string; currency: string; timezone: string; taxRate: number; shippingFlat: number; freeShipThreshold: number; maintenance: boolean; notifications: { orders: boolean; lowStock: boolean; payments: boolean } }) {
  return { storeName: doc.storeName, logo: doc.logo, contactEmail: doc.contactEmail, contactPhone: doc.contactPhone, currency: doc.currency, timezone: doc.timezone, taxRate: doc.taxRate, shippingFlat: doc.shippingFlat, freeShipThreshold: doc.freeShipThreshold, maintenance: doc.maintenance, notifications: { ...doc.notifications } };
}
