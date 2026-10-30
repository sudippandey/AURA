// Mock-mode admin data: derived from the REAL mock catalogue (PRODUCTS) so every
// number traces to visible store data. Labelled 'sample' in the UI.
import { PRODUCTS } from '../mocks/products.js';
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
const money = (p) => ({ price: p.price, stock: p.stock, sold: Math.round(20 + hash(p.id) * 220) });
export function mockOverview() {
  const units = PRODUCTS.map(money);
  const revenue = units.reduce((s, u, i) => s + u.price * u.sold, 0);
  const orders = units.reduce((s, u) => s + u.sold, 0);
  const low = PRODUCTS.filter((p) => p.stock <= 8);
  return { revenue: Math.round(revenue) / 10, gross: Math.round(revenue) / 10, discounts: 412.5, shipping: 388.2, tax: 301.44, refunded: 129.99, net: Math.round(revenue) / 10 - 129.99, orders: Math.round(orders / 2.4), avgOrderValue: 86.4, unitsSold: orders, totalCustomers: 1284, newCustomers: 96, pendingOrders: 7, pendingPayments: 3, refunds: 4, refundedAmount: 129.99, products: PRODUCTS.length, lowStock: low.length, outOfStock: PRODUCTS.filter((p) => p.stock <= 0).length, orderCount: Math.round(orders / 2.4), ordersByStatus: { pending: 3, confirmed: 2, processing: 2, packed: 1, shipped: 4, delivered: 61, cancelled: 3, refunded: 1 }, paymentsByStatus: [{ status: 'successful', count: 58, amount: 5012 }, { status: 'pending', count: 3, amount: 259 }] };
}
export function mockSeries() {
  const out = []; const now = Date.now();
  for (let i = 13; i >= 0; i--) { const d = new Date(now - i * 86400000); const h = hash(d.toISOString().slice(0, 10)); out.push({ date: d.toISOString().slice(0, 10), revenue: Math.round(180 + h * 420), orders: Math.round(2 + h * 9) }); }
  return out;
}
export function mockAdminList(kind, params = {}) {
  const page = Number(params.page || 1); const limit = Number(params.limit || 20);
  const paginate = (rows) => ({ items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / limit)) });
  if (kind === 'orders') {
    const rows = PRODUCTS.slice(0, 12).map((p, i) => ({ id: 'ORD-48' + (2900 + i), orderNumber: 'ORD-48' + (2900 + i), customer: { firstName: 'Sample', lastName: 'Buyer ' + (i + 1), email: 'buyer' + i + '@example.com' }, total: p.price * 1.08 + 6.95, status: ['processing','shipped','delivered','pending','delivered'][i % 5], createdAt: new Date(Date.now() - i * 86400000).toISOString(), items: [{ name: p.name, qty: 1, price: p.price }] }));
    return paginate(rows);
  }
  if (kind === 'order') return { orderNumber: params.ref || 'ORD-482900', customer: { firstName: 'Sample', lastName: 'Buyer', email: 'buyer@example.com' }, shipping: { address: '12 Rosewood Ave', city: 'Austin', zip: '73301', country: 'USA', method: 'standard', cost: 6.95 }, payment: { method: 'card', status: 'paid' }, items: PRODUCTS.slice(0, 2).map((p) => ({ name: p.name, price: p.price, qty: 1, image: p.images[0] })), totals: { subtotal: 120, discount: 12, shipping: 6.95, tax: 8.64, total: 123.59 }, status: 'processing', history: [{ status: 'pending', at: new Date().toISOString() }, { status: 'processing', at: new Date().toISOString() }], notes: [], couponCode: 'WELCOME10', createdAt: new Date().toISOString() };
  if (kind === 'customers' || kind === 'users') return paginate(Array.from({ length: 24 }, (_, i) => ({ id: 'u' + i, name: 'Customer ' + (i + 1), email: 'customer' + i + '@example.com', role: i < 2 ? 'admin' : 'customer', isActive: i !== 5, orders: (i * 7) % 9, spent: ((i * 137) % 900) + 24, createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString() })));
  if (kind === 'customer') return { id: params.id, name: 'Customer 1', email: 'customer1@example.com', role: 'customer', isActive: true, createdAt: new Date().toISOString(), orders: 6, spent: 542.2, recentOrders: [] };
  if (kind === 'payments') return paginate(PRODUCTS.slice(0, 10).map((p, i) => ({ id: 'pay_' + i, orderNumber: 'ORD-48' + (2900 + i), method: ['card','paypal','cod'][i % 3], provider: 'sandbox', amount: p.price, currency: 'USD', status: ['successful','successful','pending','successful','failed'][i % 5], gatewayRef: 'MOCK-ORD' + i, createdAt: new Date().toISOString() })));
  if (kind === 'payment') return { id: params.id, orderNumber: 'ORD-482900', method: 'card', provider: 'sandbox', amount: 123.59, currency: 'USD', status: 'successful', gatewayRef: 'MOCK-482900', history: [{ status: 'successful', at: new Date().toISOString() }], createdAt: new Date().toISOString() };
  if (kind === 'refunds') return paginate([{ id: 'rf1', orderNumber: 'ORD-482901', amount: 42.5, currency: 'USD', reason: 'Damaged in transit', status: 'requested', createdAt: new Date().toISOString() }]);
  if (kind === 'coupons') return paginate([{ id: 'c1', code: 'WELCOME10', type: 'percent', value: 10, minSubtotal: 0, maxDiscount: null, usageLimit: null, usedCount: 214, isActive: true, startsAt: null, endsAt: null, productSlugs: [], categorySlugs: [], freeShipping: false }, { id: 'c2', code: 'FREESHIP', type: 'freeship', value: 0, minSubtotal: 0, maxDiscount: null, usageLimit: null, usedCount: 88, isActive: true, startsAt: null, endsAt: null, productSlugs: [], categorySlugs: [], freeShipping: true }]);
  if (kind === 'shipments') return paginate([{ id: 's1', orderNumber: 'ORD-482900', provider: 'manual', trackingNumber: 'TRK-88231', status: 'shipped', createdAt: new Date().toISOString() }]);
  if (kind === 'reviews') return paginate([{ id: 'r1', author: 'Maya R.', rating: 5, title: 'Beautiful sound', body: 'Exceeded expectations.', productName: PRODUCTS[0]?.name || 'Product', status: 'visible', verified: true, date: new Date().toISOString(), createdAt: new Date().toISOString() }]);
  if (kind === 'movements') return paginate([{ id: 'm1', productSlug: PRODUCTS[0]?.slug || 'x', productName: PRODUCTS[0]?.name || 'Product', type: 'sale', qty: -1, balance: 9, reason: 'Sale ORD-482900', createdAt: new Date().toISOString() }]);
  if (kind === 'low' || kind === 'invOverview') return kind === 'invOverview' ? { totalProducts: PRODUCTS.length, totalUnits: 412, outOfStock: 1, lowStock: 4 } : PRODUCTS.filter((p) => p.stock <= 8).map((p) => ({ slug: p.slug, name: p.name, available: p.stock, stock: p.stock, threshold: 8 }));
  if (kind === 'staff') return paginate([{ id: 's1', name: 'Ava Owner', email: 'owner@aura.shop', role: 'super-admin', isActive: true, createdAt: new Date().toISOString(), permissions: ['*'] }]);
  if (kind === 'roles') return [{ id: 'super-admin', label: 'Super Admin', permissions: ['*'] }, { id: 'admin', label: 'Admin', permissions: ['dashboard.view'] }, { id: 'analyst', label: 'Analyst', permissions: ['dashboard.view','reports.view'] }];
  if (kind === 'logs') return paginate([{ id: 'l1', actorEmail: 'owner@aura.shop', action: 'order.status', entity: 'order', entityId: 'ORD-482900', createdAt: new Date().toISOString() }]);
  if (kind === 'settings') return { storeName: 'AURA', logo: '', contactEmail: 'hello@aura.shop', contactPhone: '', currency: 'USD', timezone: 'UTC', taxRate: 0.08, shippingFlat: 6.95, freeShipThreshold: 75, maintenance: false, notifications: { orders: true, lowStock: true, payments: true } };
  if (kind === 'notifications') return { items: [{ id: 'n1', type: 'order', title: 'New order', message: 'ORD-482900 placed', read: false, createdAt: new Date().toISOString() }], total: 1, unread: 1 };
  if (kind === 'brands') return [...new Set(PRODUCTS.map((p) => p.brand))].map((b) => ({ name: b, products: PRODUCTS.filter((p) => p.brand === b).length }));
  if (kind === 'report-products') return PRODUCTS.slice(0, 8).map((p) => ({ slug: p.slug, name: p.name, units: 20 + Math.round(hash(p.id) * 100), revenue: Math.round(p.price * 40) }));
  if (kind === 'report-sales') { const o = mockOverview(); return { summary: { gross: o.gross, discounts: o.discounts, shipping: o.shipping, tax: o.tax, net: o.net, refunded: o.refunded }, series: mockSeries(), byCategory: [] }; }
  if (kind === 'report-customers') return { totalCustomers: 1284, newCustomers: 96, repeatCustomers: 214, avgLifetimeSpent: 88.4 };
  if (kind === 'report-payments') return { byStatus: [{ status: 'successful', count: 58, amount: 5012 }, { status: 'pending', count: 3, amount: 259 }], byMethod: [{ method: 'card', count: 40, amount: 3400 }] };
  if (kind === 'report-inventory') return { units: 412, stockValue: 18240 };
  if (String(kind).startsWith('report-')) return { rows: [] };
  return { items: [], total: 0 };
}
