import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { Order } from '../models/Order.js';
import { Shipment, type ShipmentStatus } from '../models/Shipment.js';
function shape(s: { _id: unknown; orderNumber: string; provider: string; trackingNumber: string | null; status: ShipmentStatus; address: { address: string; city: string; zip: string; country: string }; dispatchedAt: Date | null; deliveredAt: Date | null; history: Array<{ status: ShipmentStatus; at: Date; note?: string }>; createdAt: Date }) {
  return { id: String(s._id), orderNumber: s.orderNumber, provider: s.provider, trackingNumber: s.trackingNumber, status: s.status, address: s.address, dispatchedAt: s.dispatchedAt ? s.dispatchedAt.toISOString() : null, deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null, history: s.history.map((h) => ({ status: h.status, at: h.at instanceof Date ? h.at.toISOString() : String(h.at), note: h.note ?? null })), createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt) };
}
export async function listShipments(filter: { status?: ShipmentStatus; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  const [total, docs] = await Promise.all([ Shipment.countDocuments(q), Shipment.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map((d) => shape(d as never)), total };
}
export async function upsertShipment(actorId: string, orderRef: string, patch: { provider?: string; trackingNumber?: string | null; status?: ShipmentStatus; note?: string }) {
  const q = String(orderRef).trim();
  const order = Types.ObjectId.isValid(q) ? await Order.findById(q) : await Order.findOne({ orderNumber: q.toUpperCase() });
  if (!order) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  let doc = await Shipment.findOne({ orderNumber: order.orderNumber });
  if (!doc) doc = await Shipment.create({ order: order._id, orderNumber: order.orderNumber, provider: patch.provider ?? 'manual', trackingNumber: patch.trackingNumber ?? null, status: 'pending', address: { address: order.shipping.address, city: order.shipping.city, zip: order.shipping.zip, country: order.shipping.country }, history: [{ status: 'pending' as ShipmentStatus, at: new Date(), by: new Types.ObjectId(actorId) }] });
  if (patch.provider !== undefined) doc.provider = patch.provider;
  if (patch.trackingNumber !== undefined) doc.trackingNumber = patch.trackingNumber;
  if (patch.status !== undefined) {
    const flow: ShipmentStatus[] = ['pending','packed','shipped','in_transit','delivered'];
    const ci = flow.indexOf(doc.status); const ni = flow.indexOf(patch.status);
    const terminal = doc.status === 'delivered' || doc.status === 'returned';
    if (terminal && patch.status !== doc.status) throw new AppError('Shipment is already ' + doc.status + '.', 400, 'IMMUTABLE_SHIPMENT');
    if (patch.status === 'failed' || patch.status === 'returned') { doc.status = patch.status; }
    else { if (ni < ci) throw new AppError('Shipments cannot move backwards.', 400, 'BAD_TRANSITION'); doc.status = patch.status; }
    if (patch.status === 'shipped' || patch.status === 'in_transit') doc.dispatchedAt = doc.dispatchedAt ?? new Date();
    if (patch.status === 'delivered') doc.deliveredAt = new Date();
    doc.history.push({ status: doc.status, at: new Date(), by: new Types.ObjectId(actorId), note: (patch.note ?? '').slice(0, 300) } as never);
  }
  await doc.save();
  return shape(doc as never);
}
