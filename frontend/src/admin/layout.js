import { esc } from '../lib/format.js';
import { store } from '../store/store.js';
import { STAFF_ROLES } from './adminApi.js';
const NAV = [
  ['dashboard', 'Dashboard', 'grid', '/admin'],
  ['products', 'Products', 'box', '/admin/products'],
  ['categories', 'Categories', 'tag', '/admin/categories'],
  ['inventory', 'Inventory', 'layers', '/admin/inventory'],
  ['orders', 'Orders', 'cart', '/admin/orders'],
  ['payments', 'Payments', 'card', '/admin/payments'],
  ['refunds', 'Refunds', 'undo', '/admin/refunds'],
  ['customers', 'Customers', 'users', '/admin/customers'],
  ['coupons', 'Coupons', 'ticket', '/admin/coupons'],
  ['shipping', 'Shipping', 'truck', '/admin/shipping'],
  ['reviews', 'Reviews', 'star', '/admin/reviews'],
  ['reports', 'Reports', 'chart', '/admin/reports'],
  ['staff', 'Staff', 'shield', '/admin/staff'],
  ['logs', 'Activity', 'list', '/admin/logs'],
  ['settings', 'Settings', 'gear', '/admin/settings'],
];
export function isAdminPath(path) { return path === '/admin' || path.startsWith('/admin/'); }
export function adminShell(active, inner) {
  const user = store.state.user;
  return '<div class="am">' +
  '<aside class="am-side" id="amSide"><div class="am-brand">AURA <span>Admin</span></div><nav class="am-nav" aria-label="Admin">' +
  NAV.map(([id, label, , href]) => '<a href="#' + href + '" data-am="' + id + '" class="' + (active === id ? 'on' : '') + '">' + esc(label) + '</a>').join('') +
  '</nav><div class="am-side-ft"><a href="#/">← Storefront</a></div></aside>' +
  '<div class="am-main"><header class="am-head"><button class="icon-btn am-burger" id="amBurger" aria-label="Toggle navigation">☰</button>' +
  '<div class="am-crumb">' + esc(labelFor(active)) + '</div>' +
  '<div class="am-head-r"><span class="badge b-info">' + esc(user?.role || 'staff') + '</span><span class="muted">' + esc(user?.email || user?.name || '') + '</span><button class="btn btn-outline btn-sm" id="amExit">Sign out</button></div></header>' +
  '<main class="am-body" id="amBody">' + inner + '</main></div></div>';
}
function labelFor(active) { const f = { dashboard: 'Executive dashboard', products: 'Products', categories: 'Categories & brands', inventory: 'Inventory', orders: 'Orders', payments: 'Payments', refunds: 'Refunds & returns', customers: 'Customers', coupons: 'Coupons & promotions', shipping: 'Shipping & fulfillment', reviews: 'Reviews', reports: 'Reports & analytics', staff: 'Staff & roles', logs: 'Activity logs', settings: 'Store settings' }; return f[active] || 'Admin'; }
export function afterAdminShell(go) {
  const b = document.getElementById('amBurger');
  if (b) b.onclick = () => document.getElementById('amSide')?.classList.toggle('open');
  const ex = document.getElementById('amExit');
  if (ex) ex.onclick = async () => { try { const { logoutApi } = await import('../services/api/authApi.js'); await logoutApi(); } catch {} try { localStorage.removeItem('aura_user'); } catch {} location.hash = '#/'; };
}
export function guardAdmin() {
  const user = store.state.user;
  if (!user) return { ok: false, reason: 'Please log in first — then return to /admin.' };
  if (!STAFF_ROLES.includes(user.role)) return { ok: false, reason: 'Role "' + user.role + '" has no admin access. Log in as staff.' };
  return { ok: true, user };
}
