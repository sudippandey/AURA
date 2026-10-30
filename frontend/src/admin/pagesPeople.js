import { esc } from '../lib/format.js';
import { adminApi } from './adminApi.js';
import { usingMock } from '../services/api/apiClient.js';
import { badge, dataTable, pager, bindPager, emptyState, loadingState, fmtMoney, dt } from './components.js';
import { toast } from '../components/layout.js';
export function renderCustomersShell() { return '<div class="am-toolbar"><input id="cuQ" class="input" placeholder="Search name / email…"></div><div id="cuList">' + loadingState(6) + '</div>'; }
export function mountCustomers(go) {
  let page = 1; const limit = 15;
  const load = async () => {
    const root = document.getElementById('cuList'); root.innerHTML = loadingState(6);
    try { const res = await adminApi.customers({ q: document.getElementById('cuQ').value.trim() || undefined, page, limit }); root.innerHTML = dataTable({ cols: ['Customer', 'Orders', 'Spent', 'Status', ''], rows: res.items || [], rowHtml: (c) => '<tr><td><b>' + esc(c.name) + '</b><br><span class="muted">' + esc(c.email) + '</span></td><td>' + esc(String(c.orders ?? 0)) + '</td><td>' + fmtMoney(c.spent ?? 0) + '</td><td>' + badge(c.isActive === false ? 'inactive' : 'active') + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-c="' + c.id + '">Open</button></td></tr>' }) + pager(res.total || 0, page, limit); bindPager(root, (p) => { page = p; load(); }); root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => go('/admin/customers/' + b.dataset.c); }); }
    catch (e) { root.innerHTML = emptyState('Customers unavailable', String(e.message || e)); }
  };
  document.getElementById('cuQ').oninput = () => { page = 1; load(); }; load();
}
export function renderCustomerDetailShell() { return '<div id="cdBody">' + loadingState(4) + '</div>'; }
export function mountCustomerDetail(id) {
  const root = document.getElementById('cdBody');
  (async () => { try { const c = await adminApi.customer(id); const rows = (c.recentOrders || []).map((o) => '<tr><td>' + esc(o.id) + '</td><td>' + fmtMoney(o.total) + '</td><td>' + badge(o.status) + '</td></tr>').join(''); root.innerHTML = '<div class="am-card"><h3>' + esc(c.name) + '</h3><p class="muted">' + esc(c.email) + ' · since ' + esc(dt(c.createdAt)) + '</p><p>Orders: <b>' + esc(String(c.orders ?? 0)) + '</b> · Spent: <b>' + fmtMoney(c.spent ?? 0) + '</b> ' + badge(c.isActive === false ? 'inactive' : 'active') + '</p>' + (usingMock() ? '<p class="muted">Sample profile — connect the backend for addresses and full history.</p>' : '<button class="btn btn-outline btn-sm" id="cdToggle">' + (c.isActive === false ? 'Reactivate' : 'Block') + '</button>') + (rows ? '<table class="am-table"><tbody>' + rows + '</tbody></table>' : '') + '</div>'; const t = document.getElementById('cdToggle'); if (t) t.onclick = async () => { try { await adminApi.updateUser(id, { isActive: c.isActive === false }); toast('Customer updated.', 'ok'); mountCustomerDetail(id); } catch (e) { toast(String(e.message || e), 'err'); } }; } catch (e) { root.innerHTML = emptyState('Customer unavailable', String(e.message || e)); } })();
}
export function renderStaffShell() { return '<div class="am-toolbar"><button class="btn btn-dark btn-sm" id="stNew">New staff account</button><span class="muted">Action-level permissions are enforced by the backend on every request.</span></div><div id="stList">' + loadingState(5) + '</div><div class="am-card" style="margin-top:16px"><h3>Roles</h3><div id="roleList" class="muted">Loading…</div></div>'; }
export function mountStaff() {
  const load = async () => {
    try {
      const [res, roles] = await Promise.all([adminApi.staff({ page: 1, limit: 50 }), adminApi.roles().catch(() => [])]);
      document.getElementById('stList').innerHTML = dataTable({ cols: ['Staff', 'Role', 'Status', ''], rows: res.items || [], rowHtml: (s) => '<tr><td><b>' + esc(s.name) + '</b><br><span class="muted">' + esc(s.email) + '</span></td><td>' + badge(s.role) + '</td><td>' + badge(s.isActive === false ? 'inactive' : 'active') + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-t="' + s.id + '">' + (s.isActive === false ? 'Activate' : 'Deactivate') + '</button></td></tr>' });
      document.getElementById('roleList').innerHTML = (roles || []).map((r) => '<p><b>' + esc(r.label || r.id) + '</b> <span class="muted">' + esc(r.id) + '</span></p>').join('') || '—';
      document.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to manage staff.', 'info'); return; } try { const cur = (res.items || []).find((x) => x.id === b.dataset.t); await adminApi.staffUpdate(b.dataset.t, { isActive: !(cur && cur.isActive === false) ? false : true }); toast('Staff updated.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
    } catch (e) { document.getElementById('stList').innerHTML = emptyState('Staff unavailable', String(e.message || e)); }
  };
  document.getElementById('stNew').onclick = async () => { if (usingMock()) { toast('Connect the backend to create staff.', 'info'); return; } const email = prompt('Staff email:'); if (!email) return; const role = prompt('Role (product-manager, order-manager, inventory-manager, customer-support, finance-manager, analyst, admin):', 'customer-support') || 'customer-support'; try { await adminApi.staffCreate({ name: email.split('@')[0], email, password: 'ChangeMe123!', role }); toast('Staff created — they must change their password.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
export function renderReviewsShell() { return '<div class="am-toolbar"><select id="rvS" class="input"><option value="">All</option><option>visible</option><option>hidden</option><option>flagged</option></select></div><div id="rvList">' + loadingState(5) + '</div>'; }
export function mountReviews() {
  const load = async () => {
    const root = document.getElementById('rvList'); root.innerHTML = loadingState(5);
    try { const res = await adminApi.reviews({ status: document.getElementById('rvS').value || undefined, page: 1, limit: 20 }); root.innerHTML = dataTable({ cols: ['Review', 'Product', 'Status', ''], rows: res.items || [], rowHtml: (r) => '<tr><td><b>' + esc(r.title) + '</b> (' + esc(String(r.rating)) + '/5)<br><span class="muted">' + esc(r.body || '').slice(0, 120) + '</span></td><td>' + esc(r.productName || '') + '</td><td>' + badge(r.status) + '</td><td style="text-align:right">' + (r.status !== 'visible' ? '<button class="btn btn-outline btn-sm" data-ok="' + r.id + '">Approve</button> ' : '<button class="btn btn-outline btn-sm" data-hide="' + r.id + '">Hide</button> ') + '</td></tr>' });
      root.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to moderate.', 'info'); return; } try { await adminApi.reviewModerate(b.dataset.ok, { status: 'visible' }); toast('Review approved.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
      root.querySelectorAll('[data-hide]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to moderate.', 'info'); return; } try { await adminApi.reviewModerate(b.dataset.hide, { status: 'hidden' }); toast('Review hidden.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
    } catch (e) { root.innerHTML = emptyState('Reviews unavailable', String(e.message || e)); }
  };
  document.getElementById('rvS').onchange = load; load();
}
