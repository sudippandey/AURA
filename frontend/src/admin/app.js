// Admin entry: memory-router section under /admin (the editor owns location.hash).
import { adminShell, afterAdminShell, guardAdmin, isAdminPath } from './layout.js';
export function isAdminRoute(path) { const p = (path || '/').split('?')[0]; return p === '/admin' || p.startsWith('/admin/'); }
function ensureAdminCss() {
  if (document.getElementById('amCss')) return;
  const l = document.createElement('link');
  l.id = 'amCss'; l.rel = 'stylesheet'; l.href = 'src/admin/admin.css';
  document.head.appendChild(l);
}
export async function renderAdmin(path) {
  ensureAdminCss();
  const view = document.getElementById('view');
  document.title = 'Admin — AURA';
  const g = guardAdmin();
  if (!g.ok) { view.innerHTML = adminShell('dashboard', '<div class="am-card"><h3>Admin sign-in required</h3><p class="muted">' + g.reason + '</p><p><a class="btn btn-dark btn-sm" href="#/login">Go to login</a> <a class="btn btn-outline btn-sm" href="#/">Back to store</a></p><p class="muted">Demo: log in with an admin account, or set localStorage aura_user to a staff role for a preview.</p></div>'); afterAdminShell(); return; }
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const sec = seg[1] || 'dashboard'; const arg = seg[2] ? decodeURIComponent(seg[2]) : null;
  view.innerHTML = adminShell(sectionOf(sec), '<div id="amMount"><div class="am-load"><div class="am-skel"></div><div class="am-skel"></div><div class="am-skel"></div></div></div>');
  afterAdminShell();
  const mount = document.getElementById('amMount');
  const go = (p) => window.__auraGo(p);
  try {
    if (sec === 'dashboard' || sec === 'admin') { const m = await import('./pagesDashboard.js'); mount.innerHTML = m.renderDashboardShell(); m.mountDashboard(); }
    else if (sec === 'products' && !arg) { const m = await import('./pagesCatalog.js'); mount.innerHTML = m.renderProductsShell(); m.mountProducts(go); }
    else if (sec === 'products' && arg) { const m = await import('./pagesCatalog.js'); mount.innerHTML = m.renderProductFormShell(arg); m.mountProductForm(arg, go); }
    else if (sec === 'categories') { const m = await import('./pagesCatalog.js'); mount.innerHTML = m.renderCategoriesShell(); m.mountCategories(); }
    else if (sec === 'inventory') { const m = await import('./pagesOps.js'); mount.innerHTML = m.renderInventoryShell(); m.mountInventory(); }
    else if (sec === 'orders' && !arg) { const m = await import('./pagesOps.js'); mount.innerHTML = m.renderOrdersShell(); m.mountOrders(go); }
    else if (sec === 'orders' && arg) { const m = await import('./pagesOps.js'); mount.innerHTML = m.renderOrderDetailShell(); m.mountOrderDetail(arg); }
    else if (sec === 'payments') { const m = await import('./pagesMoney.js'); mount.innerHTML = m.renderPaymentsShell(); m.mountPayments(); }
    else if (sec === 'refunds') { const m = await import('./pagesMoney.js'); mount.innerHTML = m.renderRefundsShell(); m.mountRefunds(); }
    else if (sec === 'customers' && !arg) { const m = await import('./pagesPeople.js'); mount.innerHTML = m.renderCustomersShell(); m.mountCustomers(go); }
    else if (sec === 'customers' && arg) { const m = await import('./pagesPeople.js'); mount.innerHTML = m.renderCustomerDetailShell(); m.mountCustomerDetail(arg); }
    else if (sec === 'coupons') { const m = await import('./pagesMoney.js'); mount.innerHTML = m.renderCouponsShell(); m.mountCoupons(); }
    else if (sec === 'shipping') { const m = await import('./pagesOps.js'); mount.innerHTML = m.renderShippingShell(); m.mountShipping(); }
    else if (sec === 'reviews') { const m = await import('./pagesPeople.js'); mount.innerHTML = m.renderReviewsShell(); m.mountReviews(); }
    else if (sec === 'reports') { const m = await import('./pagesSystem.js'); mount.innerHTML = m.renderReportsShell(); m.mountReports(); }
    else if (sec === 'staff') { const m = await import('./pagesPeople.js'); mount.innerHTML = m.renderStaffShell(); m.mountStaff(); }
    else if (sec === 'logs') { const m = await import('./pagesSystem.js'); mount.innerHTML = m.renderLogsShell(); m.mountLogs(); }
    else if (sec === 'settings') { const m = await import('./pagesSystem.js'); mount.innerHTML = m.renderSettingsShell(); m.mountSettings(); }
    else { mount.innerHTML = '<div class="am-card"><h3>Not found</h3><p class="muted">Unknown admin section.</p></div>'; }
  } catch (e) { console.error(e); mount.innerHTML = '<div class="am-card"><h3>Something went wrong</h3><p class="muted">' + String((e && e.message) || e) + '</p></div>'; }
  window.scrollTo({ top: 0 });
}
function sectionOf(sec) { return ['dashboard','products','categories','inventory','orders','payments','refunds','customers','coupons','shipping','reviews','reports','staff','logs','settings'].includes(sec) ? sec : 'dashboard'; }
export { isAdminPath };
