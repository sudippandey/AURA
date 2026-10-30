import { Notification, type NotifType } from '../models/Notification.js';
import { logger } from '../utils/logger.js';
export async function notify(type: NotifType, title: string, message: string, refType?: string, refId?: string): Promise<void> {
  try { await Notification.create({ type, title: title.slice(0, 160), message: message.slice(0, 1000), refType: refType ?? null, refId: refId ?? null }); }
  catch (err) { logger.warn("[notifications] Failed to record notification:", err); }
}
export async function listNotifications(filter: { unreadOnly?: boolean; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.unreadOnly) q.read = false;
  const [total, unread, docs] = await Promise.all([
    Notification.countDocuments(q), Notification.countDocuments({ read: false }),
    Notification.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit)
  ]);
  return { items: docs.map((d) => ({ id: String(d._id), type: d.type, title: d.title, message: d.message, refType: d.refType, refId: d.refId, read: d.read, createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt) })), total, unread };
}
export async function markAllRead(): Promise<void> { await Notification.updateMany({ read: false }, { $set: { read: true } }); }
