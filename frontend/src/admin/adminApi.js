// Admin API: same apiClient + envelope as the storefront, under /api/v1/admin.
// Mock mode computes from the real mock catalogue so the dashboard never shows fake production data.
import { apiRequest, usingMock } from '../services/api/apiClient.js';
import { mockOverview, mockSeries, mockAdminList } from './mockAdmin.js';
const A = '/admin';
async function get(path, params, mockFn) {
  if (usingMock() && mockFn) return mockFn();
  return apiRequest(A + path, { params, auth: true });
}
async function send(path, method, body, mockFn) {
  if (usingMock() && mockFn) return mockFn();
  return apiRequest(A + path, { method, body, auth: true });
}
export const adminApi = {
  overview: (p) => get('/overview', p, () => mockOverview(p)),
  sales: (p) => get('/sales', p, () => { const o = mockOverview(p); return { summary: o, series: mockSeries(), byCategory: [{ brand: 'Auraline', revenue: 1820 }, { brand: 'Meridian', revenue: 1240 }, { brand: 'Kiln & Co', revenue: 980 }] }; }),
  stats: () => get('/stats', undefined, () => mockOverview({})),
  users: (p) => get('/users', p, () => mockAdminList('users', p)),
  updateUser: (id, body) => send('/users/' + id, 'PATCH', body, () => ({ id, ...body })),
  customers: (p) => get('/customers', p, () => mockAdminList('customers', p)),
  customer: (id) => get('/customers/' + id, undefined, () => mockAdminList('customer', { id })),
  orders: (p) => get('/orders', p, () => mockAdminList('orders', p)),
  order: (ref) => get('/orders/' + ref, undefined, () => mockAdminList('order', { ref })),
  orderStatus: (ref, body) => send('/orders/' + ref + '/status', 'PATCH', body, () => ({ id: ref, status: body.status })),
  orderNote: (ref, body) => send('/orders/' + ref + '/notes', 'POST', body, () => ({ ok: true })),
  inventoryOverview: () => get('/inventory/overview', undefined, () => mockAdminList('invOverview')),
  lowStock: (p) => get('/inventory/low', p, () => mockAdminList('low', p)),
  movements: (p) => get('/inventory/movements', p, () => mockAdminList('movements', p)),
  invAdjust: (b) => send('/inventory/adjust', 'POST', b, () => b),
  invReserve: (b) => send('/inventory/reserve', 'POST', b, () => b),
  invRelease: (b) => send('/inventory/release', 'POST', b, () => b),
  invDispatch: (b) => send('/inventory/dispatch', 'POST', b, () => b),
  invDamaged: (b) => send('/inventory/damaged', 'POST', b, () => b),
  invReturned: (b) => send('/inventory/returned', 'POST', b, () => b),
  payments: (p) => get('/payments', p, () => mockAdminList('payments', p)),
  payment: (id) => get('/payments/' + id, undefined, () => mockAdminList('payment', { id })),
  refunds: (p) => get('/refunds', p, () => mockAdminList('refunds', p)),
  refundRequest: (b) => send('/refunds', 'POST', b, () => ({ id: 'mock-' + Date.now(), ...b, status: 'requested' })),
  refundMove: (id, b) => send('/refunds/' + id, 'PATCH', b, () => ({ id, ...b })),
  coupons: (p) => get('/coupons', p, () => mockAdminList('coupons', p)),
  couponCreate: (b) => send('/coupons', 'POST', b, () => ({ id: 'mock-' + Date.now(), ...b })),
  couponUpdate: (id, b) => send('/coupons/' + id, 'PATCH', b, () => ({ id, ...b })),
  couponDelete: (id) => send('/coupons/' + id, 'DELETE', null, () => ({ ok: true })),
  shipments: (p) => get('/shipping', p, () => mockAdminList('shipments', p)),
  shipmentSave: (ref, b) => send('/shipping/' + ref, 'PUT', b, () => ({ orderNumber: ref, ...b })),
  reviews: (p) => get('/reviews', p, () => mockAdminList('reviews', p)),
  reviewModerate: (id, b) => send('/reviews/' + id, 'PATCH', b, () => ({ id, ...b })),
  reviewRespond: (id, b) => send('/reviews/' + id + '/respond', 'POST', b, () => ({ id, ...b })),
  reports: (kind, p) => get('/reports/' + kind, p, () => mockAdminList('report-' + kind, p)),
  staff: (p) => get('/staff', p, () => mockAdminList('staff', p)),
  staffCreate: (b) => send('/staff', 'POST', b, () => ({ id: 'mock-' + Date.now(), ...b })),
  staffUpdate: (id, b) => send('/staff/' + id, 'PATCH', b, () => ({ id, ...b })),
  roles: () => get('/roles', undefined, () => mockAdminList('roles')),
  logs: (p) => get('/activity-logs', p, () => mockAdminList('logs', p)),
  settings: () => get('/settings', undefined, () => mockAdminList('settings')),
  saveSettings: (b) => send('/settings', 'PATCH', b, () => b),
  notifications: (p) => get('/notifications', p, () => mockAdminList('notifications', p)),
  brands: () => get('/brands', undefined, () => mockAdminList('brands')),
};
export function isStaff(user) { return !!user && user.role !== 'customer'; }
export const STAFF_ROLES = ['super-admin','admin','product-manager','order-manager','inventory-manager','customer-support','finance-manager','analyst'];
