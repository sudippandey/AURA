import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';
export async function audit(input: { actorId?: string | null; actorEmail?: string | null; action: string; entity: string; entityId?: string | null; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; requestId?: string | null }): Promise<void> {
  try {
    await AuditLog.create({
      actor: input.actorId && Types.ObjectId.isValid(input.actorId) ? new Types.ObjectId(input.actorId) : null,
      actorEmail: input.actorEmail ?? null, action: input.action, entity: input.entity,
      entityId: input.entityId ?? null, before: input.before ?? null, after: input.after ?? null,
      requestId: input.requestId ?? null
    });
  } catch (err) {
    logger.warn("[audit] Failed to record audit event:", err);
  }
}
export async function listAudit(filter: { action?: string; entity?: string; page: number; limit: number }) {
  const q: Record<string, unknown> = {};
  if (filter.action) q.action = filter.action;
  if (filter.entity) q.entity = filter.entity;
  const [total, docs] = await Promise.all([
    AuditLog.countDocuments(q),
    AuditLog.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit)
  ]);
  return { items: docs.map((d) => ({ id: String(d._id), actorEmail: d.actorEmail, action: d.action, entity: d.entity, entityId: d.entityId, before: d.before, after: d.after, createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt) })), total };
}
