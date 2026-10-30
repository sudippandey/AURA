import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { validate } from '../middleware/validate.js';
import { ok, paginated, created } from '../utils/responses.js';
import * as admin from '../services/adminService.js';
import * as catalog from '../services/catalogService.js';
import * as inv from '../services/inventoryService.js';
import * as orders from '../services/orderService.js';
import * as payments from '../services/paymentService.js';
import * as refunds from '../services/refundService.js';
import * as coupons from '../services/couponService.js';
import * as shipping from '../services/shipmentService.js';
import * as reports from '../services/reportService.js';
import * as staff from '../services/staffService.js';
import { listAudit } from '../services/auditService.js';
import { listNotifications, markAllRead } from '../services/notificationService.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { USER_ROLES } from '../models/User.js';
import { ORDER_STATUSES } from '../models/Order.js';
import { PAYMENT_STATUSES, PAYMENT_METHODS } from '../models/Payment.js';
import { REFUND_STATUSES } from '../models/Refund.js';
import { SHIPMENT_STATUSES } from '../models/Shipment.js';
import { MOVEMENT_TYPES } from '../models/StockMovement.js';
import { REVIEW_STATUSES } from '../models/Review.js';
import { listReviews, moderateReview, respondToReview } from '../services/reviewService.js';
const pageLimit = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const lowLimitQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
export const adminRouter = Router();
adminRouter.use(requireAuth);
const qUsers = z.object({ q: z.string().trim().max(120).optional(), role: z.enum(USER_ROLES).optional(), ...pageLimit });
const idParams = z.object({ id: z.string().trim().min(1) });
const overviewQuery = z.object({ preset: z.string().trim().max(20).optional(), from: z.string().trim().max(30).optional(), to: z.string().trim().max(30).optional() });
adminRouter.get('/overview', requirePermission('dashboard.view'), validate({ query: overviewQuery }), asyncHandler(async (req, res) => {
  ok(res, await admin.dashboardOverview(req.query as { preset?: string; from?: string; to?: string }));
}));
adminRouter.get('/sales', requirePermission('dashboard.view'), validate({ query: overviewQuery.extend({ bucket: z.enum(['day','week']).default('day') }) }), asyncHandler(async (req, res) => {
  const q = req.query as { preset?: string; from?: string; to?: string; bucket: 'day' | 'week' };
  const range = reports.parseRange(q);
  ok(res, { summary: await reports.salesReport(range), series: await reports.seriesReport(range, q.bucket), byCategory: await reports.categoryReport(range) });
}));
adminRouter.get('/stats', requirePermission('dashboard.view'), asyncHandler(async (_req, res) => { ok(res, await admin.dashboardStats()); }));
const usersQuery = qUsers;
adminRouter.get('/users', requirePermission('staff.view'), validate({ query: usersQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof usersQuery>;
  const r = await admin.listUsers(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.patch('/users/:id', requirePermission('staff.manage'), validate({ params: idParams, body: z.object({ role: z.enum(USER_ROLES).optional(), isActive: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  ok(res, await admin.updateUser(req.params.id, req.user!.id, req.body));
}));
const custQuery = z.object({ q: z.string().trim().max(120).optional(), sort: z.enum(['newest','oldest']).optional(), ...pageLimit });
adminRouter.get('/customers', requirePermission('customers.view'), validate({ query: custQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof custQuery>;
  const r = await admin.listCustomers(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.get('/customers/:id', requirePermission('customers.view'), validate({ params: idParams }), asyncHandler(async (req, res) => { ok(res, await admin.getCustomer(req.params.id)); }));
adminRouter.patch('/customers/:id', requirePermission('customers.manage'), validate({ params: idParams, body: z.object({ isActive: z.boolean() }) }), asyncHandler(async (req, res) => { ok(res, await admin.updateUser(req.params.id, req.user!.id, { isActive: req.body.isActive })); }));
adminRouter.get('/brands', requirePermission('products.view'), asyncHandler(async (_req, res) => { ok(res, await catalog.listBrands()); }));
const orderQuery = z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().trim().max(120).optional(), from: z.string().trim().max(30).optional(), to: z.string().trim().max(30).optional(), ...pageLimit });
adminRouter.get('/orders', requirePermission('orders.view'), validate({ query: orderQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof orderQuery>;
  const r = await orders.listAdminOrders(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.get('/orders/:ref', requirePermission('orders.view'), asyncHandler(async (req, res) => { ok(res, await orders.getAdminOrder(req.params.ref)); }));
adminRouter.patch('/orders/:ref/status', requirePermission('orders.manage'), validate({ body: z.object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(300).optional() }) }), asyncHandler(async (req, res) => {
  const { audit } = await import('../services/auditService.js');
  const before = await orders.getAdminOrder(req.params.ref).catch(() => null);
  const updated = await orders.updateOrderStatus(req.params.ref, { id: req.user!.id, role: req.user!.role }, req.body.status, req.body.note);
  await audit({ actorId: req.user!.id, action: 'order.status', entity: 'order', entityId: req.params.ref, before: before ? { status: before.status } : null, after: { status: req.body.status } });
  ok(res, updated);
}));
adminRouter.post('/orders/:ref/notes', requirePermission('orders.manage'), validate({ body: z.object({ body: z.string().trim().min(1).max(1000) }) }), asyncHandler(async (req, res) => { ok(res, await orders.addOrderNote(req.params.ref, req.user!.id, req.body.body)); }));
adminRouter.get('/inventory/overview', requirePermission('inventory.view'), asyncHandler(async (_req, res) => { ok(res, await inv.inventoryOverview()); }));
adminRouter.get('/inventory/low', requirePermission('inventory.view'), validate({ query: lowLimitQuery }), asyncHandler(async (req, res) => {
  const { limit } = req.query as unknown as z.output<typeof lowLimitQuery>;
  ok(res, await inv.lowStock(limit));
}));
adminRouter.get('/inventory/movements', requirePermission('inventory.view'), validate({ query: z.object({ productId: z.string().trim().max(100).optional(), type: z.enum(MOVEMENT_TYPES).optional(), ...pageLimit }) }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as { productId?: string; type?: (typeof MOVEMENT_TYPES)[number]; page: number; limit: number };
  const r = await inv.listMovements(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
const stockBody = z.object({ productId: z.string().trim().min(1).max(100), qty: z.number().int().min(0).max(1000000).optional(), stock: z.number().int().min(0).max(1000000).optional(), reason: z.string().trim().min(1).max(300), orderNumber: z.string().trim().max(20).optional() });
async function auditStock(action: string, entityId: string, after: unknown, actorId: string) { const { audit } = await import('../services/auditService.js'); await audit({ actorId, action, entity: 'inventory', entityId, after: after as Record<string, unknown> }); }
adminRouter.post('/inventory/adjust', requirePermission('inventory.adjust'), validate({ body: stockBody }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; stock?: number; qty?: number; reason: string };
  const level = b.stock ?? b.qty ?? 0;
  const r = await inv.adjustStock(b.productId, level, b.reason, req.user!.id);
  await auditStock('inventory.adjust', r.slug, r, req.user!.id); ok(res, r);
}));
adminRouter.post('/inventory/reserve', requirePermission('inventory.adjust'), validate({ body: stockBody.extend({ qty: z.number().int().min(1).max(1000000) }) }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; qty: number; reason: string };
  const r = await inv.reserveStock(b.productId, b.qty, b.reason, req.user!.id);
  await auditStock('inventory.reserve', r.slug, r, req.user!.id); ok(res, r);
}));
adminRouter.post('/inventory/release', requirePermission('inventory.adjust'), validate({ body: stockBody.extend({ qty: z.number().int().min(1).max(1000000) }) }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; qty: number; reason: string; orderNumber?: string };
  const r = await inv.releaseStock(b.productId, b.qty, b.reason, req.user!.id, b.orderNumber);
  await auditStock('inventory.release', r.slug, r, req.user!.id); ok(res, r);
}));
adminRouter.post('/inventory/dispatch', requirePermission('orders.fulfil'), validate({ body: stockBody.extend({ qty: z.number().int().min(1).max(1000000) }) }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; qty: number; reason: string; orderNumber?: string };
  const r = await inv.dispatchStock(b.productId, b.qty, b.reason, req.user!.id, b.orderNumber);
  await auditStock('inventory.dispatch', r.slug, r, req.user!.id); ok(res, r);
}));
adminRouter.post('/inventory/damaged', requirePermission('inventory.adjust'), validate({ body: stockBody.extend({ qty: z.number().int().min(1).max(1000000) }) }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; qty: number; reason: string };
  const r = await inv.recordDamaged(b.productId, b.qty, b.reason, req.user!.id);
  await auditStock('inventory.damaged', b.productId, r, req.user!.id); ok(res, r);
}));
adminRouter.post('/inventory/returned', requirePermission('inventory.adjust'), validate({ body: stockBody.extend({ qty: z.number().int().min(1).max(1000000) }) }), asyncHandler(async (req, res) => {
  const b = req.body as { productId: string; qty: number; reason: string; orderNumber?: string };
  const r = await inv.recordReturned(b.productId, b.qty, b.reason, req.user!.id, b.orderNumber);
  await auditStock('inventory.returned', b.productId, r, req.user!.id); ok(res, r);
}));
const payQuery = z.object({ status: z.enum(PAYMENT_STATUSES).optional(), method: z.enum(PAYMENT_METHODS).optional(), q: z.string().trim().max(120).optional(), ...pageLimit });
adminRouter.get('/payments', requirePermission('payments.view'), validate({ query: payQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof payQuery>;
  const r = await payments.listPayments(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.get('/payments/:id', requirePermission('payments.view'), asyncHandler(async (req, res) => { ok(res, await payments.getPayment(req.params.id)); }));
adminRouter.post('/payments/webhook/:provider', validate({ body: z.object({ orderNumber: z.string().trim().min(1), status: z.enum(PAYMENT_STATUSES), gatewayRef: z.string().trim().max(200).optional() }).passthrough() }), asyncHandler(async (req, res) => {
  const raw = JSON.stringify(req.body);
  const sig = String(req.headers['x-webhook-signature'] ?? '');
  ok(res, await payments.handleWebhook(req.params.provider, raw, sig, req.body as { orderNumber: string; status: (typeof PAYMENT_STATUSES)[number]; gatewayRef?: string }));
}));
const refundQuery = z.object({ status: z.enum(REFUND_STATUSES).optional(), ...pageLimit });
adminRouter.get('/refunds', requirePermission('payments.view'), validate({ query: refundQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof refundQuery>;
  const r = await refunds.listRefunds(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.post('/refunds', requirePermission('refunds.request'), validate({ body: z.object({ orderRef: z.string().trim().min(1), amount: z.number().positive().max(1000000), reason: z.string().trim().min(1).max(500) }) }), asyncHandler(async (req, res) => {
  created(res, await refunds.requestRefund(req.user!.id, req.body.orderRef, req.body.amount, req.body.reason));
}));
adminRouter.patch('/refunds/:id', requirePermission('refunds.approve'), validate({ params: idParams, body: z.object({ status: z.enum(REFUND_STATUSES), note: z.string().trim().max(500).optional(), manual: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  ok(res, await refunds.transitionRefund(req.user!.id, req.params.id, req.body.status, req.body.note, req.body.manual));
}));
const couponQuery = z.object({ q: z.string().trim().max(40).optional(), active: z.preprocess((v) => v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined, z.boolean().optional()), ...pageLimit });
adminRouter.get('/coupons', requirePermission('dashboard.view'), validate({ query: couponQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof couponQuery>;
  const r = await coupons.listCoupons(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
const couponBody = z.object({ code: z.string().trim().min(3).max(40), type: z.enum(['percent','fixed','freeship']), value: z.number().min(0).max(1000000), minSubtotal: z.number().min(0).optional(), maxDiscount: z.number().min(0).nullable().optional(), usageLimit: z.number().int().min(1).nullable().optional(), perCustomerLimit: z.number().int().min(1).nullable().optional(), startsAt: z.string().nullable().optional(), endsAt: z.string().nullable().optional(), isActive: z.boolean().optional(), productSlugs: z.array(z.string().trim().max(80)).max(100).optional(), categorySlugs: z.array(z.string().trim().max(80)).max(100).optional(), freeShipping: z.boolean().optional() });
adminRouter.post('/coupons', requirePermission('coupons.manage'), validate({ body: couponBody }), asyncHandler(async (req, res) => { created(res, await coupons.createCoupon(req.body)); }));
adminRouter.patch('/coupons/:id', requirePermission('coupons.manage'), validate({ params: idParams, body: couponBody.partial() }), asyncHandler(async (req, res) => { ok(res, await coupons.updateCoupon(req.params.id, req.body)); }));
adminRouter.delete('/coupons/:id', requirePermission('coupons.manage'), validate({ params: idParams }), asyncHandler(async (req, res) => { await coupons.deleteCoupon(req.params.id); ok(res, { message: 'Coupon deleted.' }); }));
const shipQuery = z.object({ status: z.enum(SHIPMENT_STATUSES).optional(), ...pageLimit });
adminRouter.get('/shipping', requirePermission('orders.view'), validate({ query: shipQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof shipQuery>;
  const r = await shipping.listShipments(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.put('/shipping/:orderRef', requirePermission('shipping.manage'), validate({ body: z.object({ provider: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(120).nullable().optional(), status: z.enum(SHIPMENT_STATUSES).optional(), note: z.string().trim().max(300).optional() }) }), asyncHandler(async (req, res) => { ok(res, await shipping.upsertShipment(req.user!.id, req.params.orderRef, req.body)); }));
adminRouter.get('/reviews', requirePermission('dashboard.view'), validate({ query: z.object({ productId: z.string().trim().max(100).optional(), status: z.enum(REVIEW_STATUSES).optional(), ...pageLimit }) }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as { productId?: string; status?: (typeof REVIEW_STATUSES)[number]; page: number; limit: number };
  const { items, total } = await listReviews(q.productId ?? '', q.page, q.limit, q.status);
  paginated(res, items, total, q.page, q.limit);
}));
adminRouter.patch('/reviews/:id', requirePermission('reviews.moderate'), validate({ params: idParams, body: z.object({ status: z.enum(REVIEW_STATUSES) }) }), asyncHandler(async (req, res) => {
  const { audit } = await import('../services/auditService.js');
  const updated = await moderateReview(req.params.id, req.body.status);
  await audit({ actorId: req.user!.id, action: 'review.moderate', entity: 'review', entityId: req.params.id, after: { status: req.body.status } });
  ok(res, updated);
}));
adminRouter.post('/reviews/:id/respond', requirePermission('reviews.moderate'), validate({ params: idParams, body: z.object({ body: z.string().trim().min(1).max(1000) }) }), asyncHandler(async (req, res) => { ok(res, await respondToReview(req.params.id, req.user!.id, req.body.body)); }));
const reportQuery = z.object({ preset: z.string().trim().max(20).optional(), from: z.string().trim().max(30).optional(), to: z.string().trim().max(30).optional(), format: z.enum(['json','csv']).default('json') });
function sendReport(res: { setHeader: (k: string, v: string) => void; send: (b: string) => void }, name: string, rows: Array<Record<string, unknown>>, format: string) {
  if (format === 'csv') { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="' + name + '.csv"'); res.send(reports.toCsv(rows)); return; }
}
adminRouter.get('/reports/sales', requirePermission('reports.view'), validate({ query: reportQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof reportQuery>;
  const range = reports.parseRange(q);
  const summary = await reports.salesReport(range);
  if (q.format === 'csv') { sendReport(res as never, 'sales', [summary as unknown as Record<string, unknown>], 'csv'); return; }
  ok(res, { summary, series: await reports.seriesReport(range), byCategory: await reports.categoryReport(range) });
}));
adminRouter.get('/reports/products', requirePermission('reports.view'), validate({ query: reportQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof reportQuery>;
  const rows = await reports.productReport(reports.parseRange(q));
  if (q.format === 'csv') { sendReport(res as never, 'products', rows as unknown as Array<Record<string, unknown>>, 'csv'); return; }
  ok(res, rows);
}));
adminRouter.get('/reports/customers', requirePermission('reports.view'), validate({ query: reportQuery }), asyncHandler(async (req, res) => { ok(res, await reports.customerReport(reports.parseRange(req.query as never))); }));
adminRouter.get('/reports/inventory', requirePermission('reports.view'), asyncHandler(async (_req, res) => { ok(res, await reports.inventoryReport()); }));
adminRouter.get('/reports/payments', requirePermission('reports.view'), validate({ query: reportQuery }), asyncHandler(async (req, res) => { ok(res, await reports.paymentsReport(reports.parseRange(req.query as never))); }));
adminRouter.get('/reports/refunds', requirePermission('reports.view'), validate({ query: z.object({ ...pageLimit }) }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as { page: number; limit: number };
  const r = await refunds.listRefunds({ page: q.page, limit: q.limit }); paginated(res, r.items, r.total, q.page, q.limit);
}));
const staffQuery = z.object({ q: z.string().trim().max(120).optional(), role: z.enum(USER_ROLES).optional(), ...pageLimit });
adminRouter.get('/roles', requirePermission('staff.view'), asyncHandler(async (_req, res) => { ok(res, staff.roleDirectory()); }));
adminRouter.get('/staff', requirePermission('staff.view'), validate({ query: staffQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.output<typeof staffQuery>;
  const r = await staff.listStaff({ q: q.q, role: q.role, page: q.page, limit: q.limit }); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.post('/staff', requirePermission('staff.manage'), validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(128), role: z.enum(USER_ROLES) }) }), asyncHandler(async (req, res) => { created(res, await staff.createStaff(req.user!.id, req.body)); }));
adminRouter.patch('/staff/:id', requirePermission('staff.manage'), validate({ params: idParams, body: z.object({ role: z.enum(USER_ROLES).optional(), isActive: z.boolean().optional() }) }), asyncHandler(async (req, res) => { ok(res, await staff.updateStaff(req.user!.id, req.params.id, req.body)); }));
adminRouter.get('/activity-logs', requirePermission('audit.view'), validate({ query: z.object({ action: z.string().trim().max(120).optional(), entity: z.string().trim().max(80).optional(), ...pageLimit }) }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as { action?: string; entity?: string; page: number; limit: number };
  const r = await listAudit(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.get('/settings', requirePermission('dashboard.view'), asyncHandler(async (_req, res) => { ok(res, await getSettings()); }));
adminRouter.patch('/settings', requirePermission('settings.manage'), validate({ body: z.object({ storeName: z.string().trim().max(80).optional(), logo: z.string().trim().max(2048).optional(), contactEmail: z.string().trim().max(160).optional(), contactPhone: z.string().trim().max(40).optional(), currency: z.string().trim().max(8).optional(), timezone: z.string().trim().max(60).optional(), taxRate: z.number().min(0).max(1).optional(), shippingFlat: z.number().min(0).optional(), freeShipThreshold: z.number().min(0).optional(), maintenance: z.boolean().optional(), notifications: z.object({ orders: z.boolean(), lowStock: z.boolean(), payments: z.boolean() }).partial().optional() }).passthrough() }), asyncHandler(async (req, res) => {
  const { audit } = await import('../services/auditService.js');
  const before = await getSettings();
  const updated = await updateSettings(req.body);
  await audit({ actorId: req.user!.id, action: 'settings.update', entity: 'settings', entityId: 'default', before: before as never, after: updated as never });
  ok(res, updated);
}));
adminRouter.get('/notifications', requirePermission('dashboard.view'), validate({ query: z.object({ unreadOnly: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()), ...pageLimit }) }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as { unreadOnly?: boolean; page: number; limit: number };
  const r = await listNotifications(q); paginated(res, r.items, r.total, q.page, q.limit);
}));
adminRouter.post('/notifications/read-all', requirePermission('dashboard.view'), asyncHandler(async (_req, res) => { await markAllRead(); ok(res, { message: 'All notifications marked read.' }); }));
