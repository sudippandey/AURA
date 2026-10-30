import { esc } from '../lib/format.js';
import { adminApi } from './adminApi.js';
import { apiBaseUrl, usingMock } from '../services/api/apiClient.js';
import { badge, dataTable, emptyState, loadingState, fmtMoney, dt, lineChart, bars } from './components.js';
import { toast } from '../components/layout.js';
export function renderReportsShell() { return '<div class="am-filters"><div class="seg" id="rpRange"><button data-r="7d">7d</button><button data-r="30d" class="on">30d</button><button data-r="this_month">Month</button></div><button class="btn btn-outline btn-sm" id="rpCsv">Export sales CSV</button></div><div id="rpBody">' + loadingState(6) + '</div>'; }
export function mountReports() {
  let preset = '30d';
  const load = async () => {
    const root = document.getElementById('rpBody'); root.innerHTML = loadingState(6);
    try {
      const [sales, products, customers, payments, inventory] = await Promise.all([adminApi.reports('sales', { preset }), adminApi.reports('products', { preset }), adminApi.reports('customers', { preset }), adminApi.reports('payments', { preset }), adminApi.reports('inventory', {})]);
      const s = sales.summary || sales;
      root.innerHTML = '<div class="am-grid6">' + [['Gross', s.gross], ['Discounts', s.discounts], ['Shipping', s.shipping], ['Tax', s.tax], ['Net', s.net], ['Refunded', s.refunded]].map(([l, v]) => '<div class="am-card"><div class="am-metric-l">' + l + '</div><div class="am-metric-v">' + fmtMoney(v || 0) + '</div></div>').join('') + '</div>' +
      '<div class="am-grid2"><div class="am-card"><h3>Revenue trend</h3>' + lineChart(sales.series || []) + '</div><div class="am-card"><h3>Top products</h3>' + bars((products || []).map((p) => ({ label: p.name, value: p.revenue })), 'label', 'value') + '</div></div>' +
      '<div class="am-grid3"><div class="am-card"><h3>Customers</h3><p>Total <b>' + esc(String(customers.totalCustomers ?? '?')) + '</b> · New <b>' + esc(String(customers.newCustomers ?? '?')) + '</b> · Repeat <b>' + esc(String(customers.repeatCustomers ?? '?')) + '</b></p></div><div class="am-card"><h3>Payments</h3><p class="muted">' + esc(JSON.stringify((payments.byStatus || []).slice(0, 4))) + '</p></div><div class="am-card"><h3>Inventory value</h3><p>Units <b>' + esc(String(inventory.units ?? '?')) + '</b> · Value <b>' + fmtMoney(inventory.stockValue ?? 0) + '</b></p></div></div>';
    } catch (e) { root.innerHTML = emptyState('Reports unavailable', String(e.message || e)); }
  };
  document.querySelectorAll('#rpRange button').forEach((b) => { b.onclick = () => { document.querySelectorAll('#rpRange button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); preset = b.dataset.r; load(); }; });
  document.getElementById('rpCsv').onclick = async () => { if (usingMock()) { toast('CSV export needs the live backend.', 'info'); return; } try { const res = await fetch(apiBaseUrl() + '/api/v1/admin/reports/sales?preset=' + preset + '&format=csv', { headers: { Authorization: 'Bearer ' + (localStorage.getItem('aura_token') || '') } }); const text = await res.text(); const blob = new Blob([text], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sales-' + preset + '.csv'; a.click(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
export function renderLogsShell() { return '<div id="logList">' + loadingState(6) + '</div>'; }
export function mountLogs() {
  (async () => { const root = document.getElementById('logList'); try { const res = await adminApi.logs({ page: 1, limit: 30 }); root.innerHTML = dataTable({ cols: ['When', 'Actor', 'Action', 'Entity'], rows: res.items || [], rowHtml: (l) => '<tr><td class="muted">' + esc(dt(l.createdAt)) + '</td><td>' + esc(l.actorEmail || '—') + '</td><td><b>' + esc(l.action) + '</b></td><td>' + esc(l.entity) + (l.entityId ? ' · ' + esc(l.entityId) : '') + '</td></tr>' }); } catch (e) { root.innerHTML = emptyState('Logs unavailable', String(e.message || e)); } })();
}
export function renderSettingsShell() { return '<div id="setBody">' + loadingState(4) + '</div>'; }
export function mountSettings() {
  const root = document.getElementById('setBody');
  (async () => {
    try {
      const s = await adminApi.settings();
      root.innerHTML = '<form id="sf" class="am-form"><div class="am-grid2"><div class="am-card"><h3>Store</h3><label>Store name<input name="storeName" class="input" value="' + esc(s.storeName || '') + '"></label><label>Contact email<input name="contactEmail" class="input" value="' + esc(s.contactEmail || '') + '"></label><label>Currency<input name="currency" class="input" value="' + esc(s.currency || 'USD') + '"></label><label>Timezone<input name="timezone" class="input" value="' + esc(s.timezone || 'UTC') + '"></label></div><div class="am-card"><h3>Money & shipping</h3><label>Tax rate (0-1)<input name="taxRate" class="input" type="number" step="0.01" min="0" max="1" value="' + esc(String(s.taxRate ?? 0.08)) + '"></label><label>Flat shipping<input name="shippingFlat" class="input" type="number" step="0.01" min="0" value="' + esc(String(s.shippingFlat ?? 6.95)) + '"></label><label>Free-ship threshold<input name="freeShipThreshold" class="input" type="number" step="0.01" min="0" value="' + esc(String(s.freeShipThreshold ?? 75)) + '"></label><label class="chk"><input type="checkbox" name="maintenance"' + (s.maintenance ? ' checked' : '') + '> Maintenance mode</label></div></div><div class="am-actions"><button class="btn btn-dark" type="submit">Save settings</button><span class="muted">Secrets are never exposed here.</span></div></form>';
      document.getElementById('sf').onsubmit = async (e) => { e.preventDefault(); if (usingMock()) { toast('Connect the backend to save settings.', 'info'); return; } const fd = new FormData(e.target); try { await adminApi.saveSettings({ storeName: String(fd.get('storeName')), contactEmail: String(fd.get('contactEmail')), currency: String(fd.get('currency')), timezone: String(fd.get('timezone')), taxRate: Number(fd.get('taxRate')), shippingFlat: Number(fd.get('shippingFlat')), freeShipThreshold: Number(fd.get('freeShipThreshold')), maintenance: !!fd.get('maintenance') }); toast('Settings saved.', 'ok'); } catch (err) { toast(String(err.message || err), 'err'); } };
    } catch (e) { root.innerHTML = emptyState('Settings unavailable', String(e.message || e)); }
  })();
}
