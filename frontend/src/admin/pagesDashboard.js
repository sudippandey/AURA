import { esc } from '../lib/format.js';
import { adminApi } from './adminApi.js';
import { usingMock } from '../services/api/apiClient.js';
import { badge, metricCard, lineChart, bars, donut, fmtMoney, loadingState, emptyState } from './components.js';
const RANGES = [['today','Today'],['yesterday','Yesterday'],['7d','Last 7 days'],['30d','Last 30 days'],['this_month','This month'],['last_month','Last month']];
export function renderDashboardShell() {
  return '<div class="am-filters"><div class="seg" id="amRange">' + RANGES.map(([v, l]) => '<button data-r="' + v + '" class="' + (v === '30d' ? 'on' : '') + '">' + l + '</button>').join('') + '</div><span class="muted" id="amMode">' + (usingMock() ? 'Sample data — connect the backend for live numbers.' : 'Live data') + '</span></div><div id="amDash">' + loadingState(8) + '</div>';
}
export function mountDashboard() {
  const root = document.getElementById('amDash');
  let preset = '30d';
  const load = async () => {
    root.innerHTML = loadingState(8);
    try {
      const [o, s] = await Promise.all([adminApi.overview({ preset }), adminApi.sales({ preset, bucket: 'day' })]);
      root.innerHTML = dashboardHtml(o, s);
    } catch (e) { root.innerHTML = emptyState('Dashboard unavailable', String((e && e.message) || e)); }
  };
  document.getElementById('amRange')?.querySelectorAll('button').forEach((b) => { b.onclick = () => { document.querySelectorAll('#amRange button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); preset = b.dataset.r; load(); }; });
  load();
}
function dashboardHtml(o, s) {
  const rev = o.revenue ?? o.net ?? 0;
  const cards = [
    metricCard('Net revenue', fmtMoney(o.net ?? rev), 'gross ' + fmtMoney(o.gross ?? rev) + ' · refunds ' + fmtMoney(o.refunded ?? 0)),
    metricCard('Orders', esc(String(o.orders ?? o.orderCount ?? 0)), 'AOV ' + fmtMoney(o.avgOrderValue ?? 0)),
    metricCard('Units sold', esc(String(o.unitsSold ?? 0)), (o.totalCustomers ?? 0) + ' customers · +' + (o.newCustomers ?? 0) + ' new'),
    metricCard('Pending', esc(String(o.pendingOrders ?? 0)) + ' orders', esc(String(o.pendingPayments ?? 0)) + ' payments pending'),
    metricCard('Inventory', esc(String(o.lowStock ?? 0)) + ' low', esc(String(o.outOfStock ?? 0)) + ' out of stock'),
    metricCard('Refunds', esc(String(o.refunds ?? 0)), fmtMoney(o.refundedAmount ?? o.refunded ?? 0) + ' refunded'),
  ].join('');
  const series = s.series || [];
  const cats = (s.byCategory || []).map((c) => ({ label: c.brand, value: Math.round(c.revenue) }));
  const payRows = (o.paymentsByStatus || []).map((p) => ({ label: p.status, value: p.count }));
  const statusRows = Object.entries(o.ordersByStatus || {}).map(([label, value]) => ({ label, value }));
  return '<div class="am-grid6">' + cards + '</div>' +
  '<div class="am-grid2"><div class="am-card"><h3>Revenue over time</h3>' + lineChart(series) + '</div>' +
  '<div class="am-card"><h3>Orders over time</h3>' + lineChart(series.map((d) => ({ date: d.date, revenue: d.orders })), 560, 180) + '</div></div>' +
  '<div class="am-grid3"><div class="am-card"><h3>Sales by brand</h3>' + bars(cats, 'label', 'value') + '</div>' +
  '<div class="am-card"><h3>Order status</h3>' + donut(statusRows, 'label', 'value') + '</div>' +
  '<div class="am-card"><h3>Payment status</h3>' + donut(payRows, 'label', 'value') + '</div></div>' +
  '<div class="am-card"><h3>How revenue is calculated</h3><p class="muted">Net = gross − discounts + shipping + tax. Net after refunds subtracts completed refunds. AOV = net ÷ orders. All figures come from the orders collection for the selected range.</p></div>';
}
