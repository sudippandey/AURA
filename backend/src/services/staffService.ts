import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { User, USER_ROLES, type UserRole } from '../models/User.js';
import { ROLE_DIRECTORY, PERMISSIONS, type Permission } from '../middleware/permissions.js';
export function roleDirectory() { return ROLE_DIRECTORY.map((r) => ({ ...r, permissions: Object.keys(PERMISSIONS).filter((p) => (PERMISSIONS as Record<string, readonly string[]>)[p].includes(r.id)) })); }
export function permissionsFor(role: string): Permission[] { return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => (PERMISSIONS[p] as readonly string[]).includes(role)); }
export async function listStaff(filter: { q?: string; role?: UserRole; active?: boolean; page: number; limit: number }) {
  const q: Record<string, unknown> = { role: { $ne: 'customer' } };
  if (filter.role) q.role = filter.role;
  if (filter.active !== undefined) q.isActive = filter.active;
  if (filter.q) { const rx = new RegExp(filter.q.trim().replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m), 'i'); q['$or'] = [{ name: rx }, { email: rx }]; }
  const [total, docs] = await Promise.all([ User.countDocuments(q), User.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map((d) => ({ id: String(d._id), name: d.name, email: d.email, role: d.role, isActive: d.isActive, lastLoginAt: d.lastLoginAt ? d.lastLoginAt.toISOString() : null, createdAt: d.createdAt.toISOString(), permissions: permissionsFor(d.role) })), total };
}
export async function createStaff(actorId: string, input: { name: string; email: string; password: string; role: UserRole }) {
  if (!(USER_ROLES as readonly string[]).includes(input.role)) throw new AppError('Unknown role.', 400, 'INVALID_ROLE');
  if (input.role === 'customer') throw new AppError('Use customer registration for customers.', 400, 'INVALID_ROLE');
  const { hashPassword } = await import('../utils/password.js');
  const email = input.email.toLowerCase().trim();
  if (await User.exists({ email })) throw new AppError('Email already registered.', 409, 'EMAIL_TAKEN');
  const doc = await User.create({ name: input.name.trim(), email, passwordHash: await hashPassword(input.password), role: input.role });
  const { audit } = await import('./auditService.js');
  await audit({ actorId, action: 'staff.create', entity: 'user', entityId: String(doc._id), after: { email, role: input.role } });
  return { id: String(doc._id), name: doc.name, email: doc.email, role: doc.role, isActive: doc.isActive };
}
export async function updateStaff(actorId: string, id: string, patch: { role?: UserRole; isActive?: boolean }) {
  if (!Types.ObjectId.isValid(id)) throw new AppError('Staff not found.', 404, 'NOT_FOUND');
  if (String(id) === String(actorId)) throw new AppError('You cannot change your own role or status.', 400, 'SELF_EDIT');
  const user = await User.findById(id);
  if (!user) throw new AppError('Staff not found.', 404, 'NOT_FOUND');
  const before = { role: user.role, isActive: user.isActive };
  if (patch.role !== undefined) { if (!(USER_ROLES as readonly string[]).includes(patch.role)) throw new AppError('Unknown role.', 400, 'INVALID_ROLE'); user.role = patch.role; }
  if (patch.isActive !== undefined) user.isActive = patch.isActive;
  await user.save();
  const { audit } = await import('./auditService.js');
  await audit({ actorId, action: 'staff.update', entity: 'user', entityId: String(user._id), before: before as never, after: { role: user.role, isActive: user.isActive } as never });
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}
