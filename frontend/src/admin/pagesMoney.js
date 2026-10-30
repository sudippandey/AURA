import { esc } from '../lib/format.js';
import { adminApi } from './adminApi.js';
import { usingMock } from '../services/api/apiClient.js';
import { badge, dataTable, pager, bindPager, emptyState, loadingState, fmtMoney, dt } from './components.js';
import { toast, confirmDialog } from '../components/layout.js';
export function renderPaymentsShell() { return '<div class="am-toolbar"><select id="payS" class="input"><option value="">All statuses</option><option>pending</option><option>processing</option><option>successful</option><option>failed</option><option>cancelled</option><option>partially_refunded</option><option>refunded</option></select><span class="muted">Payments are separate from orders. Never trust a frontend success flag — only provider-confirmed records count.</span></div><div id="payList">' + loadingState(6) + '</div>'; }
export function mountPayments() {
  let page = 1; const limit = 15;
  const load = async () => {
    const root = document.getElementById('payList'); root.innerHTML = loadingState(6);
    try { const res = await adminApi.payments({ status: document.getElementById('payS').value || undefined, page, limit }); root.innerHTML = dataTable({ cols: ['Order', 'Method', 'Amount', 'Status', 'Gateway ref'], rows: res.items || [], rowHtml: (p) => '<tr><td><b>' + esc(p.orderNumber) + '</b><br><span class="muted">' + esc(dt(p.createdAt)) + '</span></td><td>' + esc(p.method) + '<br><span class="muted">' + esc(p.provider || '') + '</span></td><td>' + fmtMoney(p.amount) + '</td><td>' + badge(p.status) + '</td><td class="muted">' + esc(p.gatewayRef || '—') + '</td></tr>' }) + pager(res.total || 0, page, limit); bindPager(root, (n) => { page = n; load(); }); }
    catch (e) { root.innerHTML = emptyState('Payments unavailable', String(e.message || e)); }
  };
  document.getElementById('payS').onchange = () => { page = 1; load(); }; load();
}
export function renderRefundsShell() { return '<div class="am-toolbar"><button class="btn btn-dark btn-sm" id="rfNew">New refund request</button><span class="muted">Refunds complete only after provider confirmation or a documented manual process.</span></div><div id="rfList">' + loadingState(5) + '</div>'; }
export function mountRefunds() {
  const load = async () => {
    const root = document.getElementById('rfList');
    try { const res = await adminApi.refunds({ page: 1, limit: 20 }); root.innerHTML = dataTable({ cols: ['Order', 'Amount', 'Reason', 'Status', ''], rows: res.items || [], rowHtml: (r) => '<tr><td><b>' + esc(r.orderNumber) + '</b></td><td>' + fmtMoney(r.amount) + '</td><td class="muted">' + esc(r.reason || '') + '</td><td>' + badge(r.status) + '</td><td style="text-align:right">' + (r.status === 'requested' ? '<button class="btn btn-outline btn-sm" data-ap="' + r.id + '">Approve</button> <button class="btn btn-outline btn-sm" data-rj="' + r.id + '">Reject</button>' : r.status === 'approved' ? '<button class="btn btn-outline btn-sm" data-done="' + r.id + '">Mark completed</button>' : '') + '</td></tr>' });
      root.querySelectorAll('[data-ap]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to approve refunds.', 'info'); return; } try { await adminApi.refundMove(b.dataset.ap, { status: 'approved' }); toast('Refund approved.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
      root.querySelectorAll('[data-rj]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to reject refunds.', 'info'); return; } try { await adminApi.refundMove(b.dataset.rj, { status: 'rejected', note: 'Rejected by staff' }); toast('Refund rejected.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
      root.querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to complete refunds.', 'info'); return; } const ok = await confirmDialog({ title: 'Complete refund?', body: 'Only confirm when the provider settled it or you ran a documented manual refund.', okLabel: 'Complete refund' }); if (!ok) return; try { await adminApi.refundMove(b.dataset.done, { status: 'completed', manual: true, note: 'Manual completion by staff' }); toast('Refund completed.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
    } catch (e) { root.innerHTML = emptyState('Refunds unavailable', String(e.message || e)); }
  };
  document.getElementById('rfNew').onclick = async () => { if (usingMock()) { toast('Connect the backend to request refunds.', 'info'); return; } const ref = prompt('Order number:'); if (!ref) return; const amt = Number(prompt('Amount:') || '0'); const reason = prompt('Reason:') || ''; try { await adminApi.refundRequest({ orderRef: ref, amount: amt, reason }); toast('Refund requested.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
export function renderCouponsShell() { return '<div class="am-toolbar"><button class="btn btn-dark btn-sm" id="cpNew">New coupon</button></div><div id="cpList">' + loadingState(5) + '</div>'; }
export function mountCoupons() {
  const load = async () => {
    const root = document.getElementById('cpList');
    try { const res = await adminApi.coupons({ page: 1, limit: 50 }); root.innerHTML = dataTable({ cols: ['Code', 'Type', 'Value', 'Used', 'Active', ''], rows: res.items || [], rowHtml: (c) => '<tr><td><b>' + esc(c.code) + '</b></td><td>' + esc(c.type) + '</td><td>' + esc(String(c.value)) + '</td><td>' + esc(String(c.usedCount ?? 0)) + (c.usageLimit ? ' / ' + c.usageLimit : '') + '</td><td>' + badge(c.isActive ? 'active' : 'inactive') + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-tg="' + c.id + '" data-on="' + (c.isActive ? '0' : '1') + '">' + (c.isActive ? 'Disable' : 'Enable') + '</button></td></tr>' });
      root.querySelectorAll('[data-tg]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to manage coupons.', 'info'); return; } try { await adminApi.couponUpdate(b.dataset.tg, { isActive: b.dataset.on === '1' }); toast('Coupon updated.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
    } catch (e) { root.innerHTML = emptyState('Coupons unavailable', String(e.message || e)); }
  };
  document.getElementById('cpNew').onclick = async () => { if (usingMock()) { toast('Connect the backend to create coupons.', 'info'); return; } const code = prompt('Code (e.g. SAVE20):'); if (!code) return; const value = Number(prompt('Percent value 1-90:') || '10'); try { await adminApi.couponCreate({ code, type: 'percent', value }); toast('Coupon created.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
