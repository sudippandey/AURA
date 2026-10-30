import { esc } from '../lib/format.js';
import { adminApi } from './adminApi.js';
import { usingMock } from '../services/api/apiClient.js';
import { badge, dataTable, pager, bindPager, emptyState, loadingState, fmtMoney, dt } from './components.js';
import { toast, confirmDialog } from '../components/layout.js';
export function renderInventoryShell() { return '<div class="am-grid6" id="invTop">' + loadingState(3) + '</div><div class="am-toolbar"><input id="invQ" class="input" placeholder="Search SKU / product…"><select id="invF" class="input"><option value="">All</option><option value="low">Low stock</option><option value="out">Out of stock</option></select><button class="btn btn-dark btn-sm" id="invAdj">Adjust stock</button></div><div class="am-grid2"><div><h3>Products</h3><div id="invList">' + loadingState(5) + '</div></div><div><h3>Movements</h3><div id="movList">' + loadingState(5) + '</div></div></div>'; }
export function mountInventory() {
  const load = async () => {
    try {
      const [over, low, moves] = await Promise.all([adminApi.inventoryOverview(), adminApi.lowStock({ limit: 50 }), adminApi.movements({ page: 1, limit: 15 })]);
      document.getElementById('invTop').innerHTML = ['Products: ' + (over.totalProducts ?? '?'), 'Units: ' + (over.totalUnits ?? '?'), 'Low: ' + (over.lowStock ?? (low.length || 0)), 'Out: ' + (over.outOfStock ?? 0), 'Movements: ' + (over.movements ?? (moves.total ?? 0))].map((t) => '<div class="am-card"><b>' + esc(t) + '</b></div>').join('');
      const rows = (low.items || low || []).filter((r) => r);
      document.getElementById('invList').innerHTML = dataTable({ cols: ['Product', 'Available', 'Note'], rows, rowHtml: (r) => '<tr><td><b>' + esc(r.name || r.productName || r.slug) + '</b><br><span class="muted">' + esc(r.slug || r.productSlug || '') + '</span></td><td>' + esc(String(r.available ?? r.stock ?? 0)) + '</td><td><button class="btn btn-outline btn-sm" data-adj="' + esc(r.slug || r.productSlug || '') + '">Adjust</button></td></tr>', emptyTitle: 'Stock looks healthy', emptyBody: 'No low-stock products right now.' });
      document.getElementById('movList').innerHTML = dataTable({ cols: ['When', 'Product', 'Change'], rows: moves.items || [], rowHtml: (m) => '<tr><td class="muted">' + esc(dt(m.createdAt)) + '</td><td>' + esc(m.productName || m.productSlug || '') + '<br><span class="muted">' + esc(m.reason || m.type) + '</span></td><td>' + badge(m.type) + ' ' + esc(String(m.qty)) + '</td></tr>' });
      document.querySelectorAll('[data-adj]').forEach((b) => { b.onclick = () => adjustDialog(b.dataset.adj, load); });
    } catch (e) { document.getElementById('invList').innerHTML = emptyState('Inventory unavailable', String(e.message || e)); }
  };
  document.getElementById('invAdj').onclick = () => adjustDialog('', load);
  load();
}
async function adjustDialog(slug, reload) {
  if (usingMock()) { toast('Connect the backend for live stock writes.', 'info'); return; }
  const ref = slug || prompt('Product slug or id:'); if (!ref) return;
  const level = prompt('New on-hand stock level (integer):'); if (level === null) return;
  const reason = prompt('Reason (required, e.g. stock-take, damaged, return):') || '';
  if (!reason.trim()) { toast('A reason is required.', 'err'); return; }
  try { await adminApi.invAdjust({ productId: ref, stock: Number(level), reason }); toast('Stock updated.', 'ok'); reload(); } catch (e) { toast(String(e.message || e), 'err'); }
}
export function renderOrdersShell() { return '<div class="am-toolbar"><input id="ordQ" class="input" placeholder="Search order #, customer, email…"><select id="ordS" class="input"><option value="">All statuses</option><option>pending</option><option>confirmed</option><option>processing</option><option>packed</option><option>shipped</option><option>delivered</option><option>cancelled</option><option>refunded</option><option>returned</option></select></div><div id="ordList">' + loadingState(6) + '</div>'; }
export function mountOrders(go) {
  let page = 1; const limit = 15;
  const load = async () => {
    const root = document.getElementById('ordList'); root.innerHTML = loadingState(6);
    try {
      const res = await adminApi.orders({ q: document.getElementById('ordQ').value.trim() || undefined, status: document.getElementById('ordS').value || undefined, page, limit });
      root.innerHTML = dataTable({ cols: ['Order', 'Customer', 'Total', 'Status', ''], rows: res.items || [], rowHtml: (o) => '<tr><td><b>' + esc(o.orderNumber || o.id) + '</b><br><span class="muted">' + esc(dt(o.createdAt)) + '</span></td><td>' + esc((o.customer && (o.customer.firstName + ' ' + o.customer.lastName)) || o.customer?.email || '') + '</td><td>' + fmtMoney(o.total) + '</td><td>' + badge(o.status) + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-open="' + esc(o.orderNumber || o.id) + '">Open</button></td></tr>' }) + pager(res.total || 0, page, limit);
      bindPager(root, (p) => { page = p; load(); });
      root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => go('/admin/orders/' + b.dataset.open); });
    } catch (e) { root.innerHTML = emptyState('Orders unavailable', String(e.message || e)); }
  };
  document.getElementById('ordQ').oninput = () => { page = 1; load(); };
  document.getElementById('ordS').onchange = () => { page = 1; load(); };
  load();
}
export function renderOrderDetailShell() { return '<div id="odBody">' + loadingState(6) + '</div>'; }
export function mountOrderDetail(ref) {
  const root = document.getElementById('odBody');
  const load = async () => {
    try {
      const o = await adminApi.order(ref);
      const items = (o.items || []).map((l) => '<tr><td>' + esc(l.name) + '</td><td>' + esc(String(l.qty)) + '</td><td>' + fmtMoney(l.price) + '</td></tr>').join('');
      const hist = (o.history || []).map((h) => '<li>' + badge(h.status) + ' <span class="muted">' + esc(dt(h.at)) + (h.by ? ' · ' + esc(h.by) : '') + (h.note ? ' · ' + esc(h.note) : '') + '</span></li>').join('');
      const notes = (o.notes || []).map((n) => '<li>' + esc(n.body) + ' <span class="muted">· ' + esc(dt(n.at)) + '</span></li>').join('') || '<li class="muted">No internal notes.</li>';
      root.innerHTML = '<div class="am-grid2"><div class="am-card"><h3>' + esc(o.orderNumber || o.id) + ' ' + badge(o.status) + '</h3>' +
      '<p class="muted">' + esc(o.customer ? o.customer.firstName + ' ' + o.customer.lastName + ' · ' + o.customer.email : '') + '</p>' +
      '<table class="am-table"><tbody>' + items + '</tbody></table>' +
      '<p>Subtotal ' + fmtMoney(o.totals?.subtotal) + ' · Discount ' + fmtMoney(o.totals?.discount) + ' · Shipping ' + fmtMoney(o.totals?.shipping ?? o.shipping?.cost) + ' · Tax ' + fmtMoney(o.totals?.tax) + '</p>' +
      '<h3>Total ' + fmtMoney(o.totals?.total ?? o.total) + '</h3>' +
      '<div class="am-actions"><select id="odStatus" class="input">' + ['confirmed','processing','packed','shipped','delivered','cancelled','returned','refunded'].map((s) => '<option' + (o.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><button class="btn btn-dark btn-sm" id="odGo">Update status</button></div>' +
      '<div class="am-actions"><input id="odNote" class="input" placeholder="Add internal note…"><button class="btn btn-outline btn-sm" id="odNoteGo">Add note</button></div></div>' +
      '<div class="am-card"><h3>Timeline</h3><ul class="am-tl">' + hist + '</ul><h3>Notes</h3><ul class="am-tl">' + notes + '</ul>' +
      '<p class="muted">Payment: ' + esc(o.payment?.method || '') + ' · ' + esc(o.payment?.status || '') + (o.couponCode ? ' · Coupon ' + esc(o.couponCode) : '') + '</p></div></div>';
      document.getElementById('odGo').onclick = async () => { if (usingMock()) { toast('Connect the backend to change order status.', 'info'); return; } const ok = await confirmDialog({ title: 'Change status?', body: 'Move ' + (o.orderNumber || '') + ' to ' + document.getElementById('odStatus').value + '?', okLabel: 'Update' }); if (!ok) return; try { await adminApi.orderStatus(ref, { status: document.getElementById('odStatus').value }); toast('Order updated.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
      document.getElementById('odNoteGo').onclick = async () => { const v = document.getElementById('odNote').value.trim(); if (!v) return; if (usingMock()) { toast('Connect the backend to save notes.', 'info'); return; } try { await adminApi.orderNote(ref, { body: v }); toast('Note added.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
    } catch (e) { root.innerHTML = emptyState('Order unavailable', String(e.message || e)); }
  };
  load();
}
export function renderShippingShell() { return '<div class="am-toolbar"><input id="shQ" class="input" placeholder="Order #…"><button class="btn btn-dark btn-sm" id="shNew">New / update shipment</button></div><div id="shList">' + loadingState(5) + '</div>'; }
export function mountShipping() {
  const load = async () => {
    const root = document.getElementById('shList');
    try { const res = await adminApi.shipments({ page: 1, limit: 20 }); root.innerHTML = dataTable({ cols: ['Order', 'Provider', 'Tracking', 'Status'], rows: res.items || [], rowHtml: (s) => '<tr><td><b>' + esc(s.orderNumber) + '</b></td><td>' + esc(s.provider || '') + '</td><td class="muted">' + esc(s.trackingNumber || '—') + '</td><td>' + badge(s.status) + '</td></tr>' }); }
    catch (e) { root.innerHTML = emptyState('Shipments unavailable', String(e.message || e)); }
  };
  document.getElementById('shNew').onclick = async () => { if (usingMock()) { toast('Connect the backend to manage shipments.', 'info'); return; } const ref = prompt('Order number:'); if (!ref) return; const tracking = prompt('Tracking number (optional):') || ''; const status = prompt('Status (packed/shipped/in_transit/delivered):', 'shipped') || 'shipped'; try { await adminApi.shipmentSave(ref, { trackingNumber: tracking || null, status }); toast('Shipment saved.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
