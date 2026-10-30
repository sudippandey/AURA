import { esc, money } from '../lib/format.js';
export const badgeColor = (s) => ({ pending: 'b-warn', confirmed: 'b-info', processing: 'b-info', packed: 'b-info', shipped: 'b-info', delivered: 'b-ok', cancelled: 'b-mut', failed: 'b-bad', returned: 'b-warn', partially_returned: 'b-warn', refunded: 'b-mut', successful: 'b-ok', paid: 'b-ok', failed_pay: 'b-bad', refunded_pay: 'b-mut', visible: 'b-ok', hidden: 'b-mut', flagged: 'b-warn', requested: 'b-warn', approved: 'b-info', completed: 'b-ok', rejected: 'b-bad', active: 'b-ok', inactive: 'b-mut' }[(s || '').toLowerCase()] || 'b-mut');
export const badge = (s) => '<span class="badge ' + badgeColor(s) + '">' + esc(String(s ?? '').replace(/_/g, ' ')) + '</span>';
export const metricCard = (label, value, sub) => '<div class="am-card"><div class="am-metric-l">' + esc(label) + '</div><div class="am-metric-v">' + value + '</div>' + (sub ? '<div class="am-metric-s">' + sub + '</div>' : '') + '</div>';
export const emptyState = (title, body) => '<div class="am-empty"><h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p></div>';
export const loadingState = (n) => '<div class="am-load">' + Array.from({ length: n || 6 }, () => '<div class="am-skel"></div>').join('') + '</div>';
export function dataTable({ cols, rows, rowHtml, emptyTitle, emptyBody }) {
  if (!rows || !rows.length) return emptyState(emptyTitle || 'Nothing here yet', emptyBody || 'Try adjusting filters.');
  return '<div class="am-twrap"><table class="am-table"><thead><tr>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>';
}
export function pager(total, page, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return '';
  return '<div class="am-pager"><button class="btn btn-outline btn-sm" data-pg="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>Prev</button><span class="muted">Page ' + page + ' of ' + pages + ' · ' + total + ' total</span><button class="btn btn-outline btn-sm" data-pg="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>Next</button></div>';
}
export function bindPager(root, onGo) { root.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { const p = Number(b.dataset.pg); if (p >= 1) onGo(p); }; }); }
export function lineChart(series, w, h) {
  w = w || 560; h = h || 180;
  if (!series || !series.length) return '<div class="muted">No data for this range.</div>';
  const max = Math.max(...series.map((s) => s.revenue || s.value || 0), 1);
  const pts = series.map((s, i) => { const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * (w - 40) + 20; const y = h - 24 - ((s.revenue ?? s.value ?? 0) / max) * (h - 48); return x.toFixed(1) + ',' + y.toFixed(1); }).join(' ');
  const area = '20,' + (h - 24) + ' ' + pts + ' ' + (w - 20) + ',' + (h - 24);
  return '<svg class="am-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Trend chart"><polygon points="' + area + '" fill="rgba(30,41,59,.08)"/><polyline points="' + pts + '" fill="none" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>' + series.map((s, i) => { const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * (w - 40) + 20; return '<circle cx="' + x.toFixed(1) + '" cy="' + (h - 24 - ((s.revenue ?? s.value ?? 0) / max) * (h - 48)).toFixed(1) + '" r="3" fill="#1e293b"><title>' + esc(String(s.date ?? '')) + ': ' + esc(String(s.revenue ?? s.value ?? 0)) + '</title></circle>'; }).join('') + '</svg>';
}
export function bars(rows, labelKey, valueKey) {
  if (!rows || !rows.length) return '<div class="muted">No data.</div>';
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
  return '<div class="am-bars">' + rows.slice(0, 8).map((r) => '<div class="am-bar-row"><span class="am-bar-l">' + esc(String(r[labelKey] ?? '')) + '</span><span class="am-bar-track"><span class="am-bar-fill" style="width:' + Math.round(((r[valueKey] || 0) / max) * 100) + '%"></span></span><span class="am-bar-v">' + esc(String(r[valueKey])) + '</span></div>').join('') + '</div>';
}
export function donut(rows, labelKey, valueKey) {
  if (!rows || !rows.length) return '<div class="muted">No data.</div>';
  const total = rows.reduce((s, r) => s + (r[valueKey] || 0), 0) || 1;
  let acc = 0;
  const segs = rows.slice(0, 6).map((r, i) => { const frac = (r[valueKey] || 0) / total; const a0 = acc; acc += frac; const x0 = 50 + 38 * Math.cos(a0 * 6.2832); const y0 = 50 + 38 * Math.sin(a0 * 6.2832); const x1 = 50 + 38 * Math.cos(acc * 6.2832); const y1 = 50 + 38 * Math.sin(acc * 6.2832); const big = frac > 0.5 ? 1 : 0; return '<path d="M50,50 L' + x0.toFixed(1) + ',' + y0.toFixed(1) + ' A38,38 0 ' + big + ' 1 ' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' Z" fill="hsl(' + (i * 62 + 210) + ',38%,' + (62 - i * 5) + '%)"><title>' + esc(String(r[labelKey])) + ': ' + esc(String(r[valueKey])) + '</title></path>'; }).join('');
  return '<div class="am-donut-wrap"><svg class="am-donut" viewBox="0 0 100 100" role="img" aria-label="Distribution">' + segs + '<circle cx="50" cy="50" r="22" fill="#fff"/></svg><div class="am-legend">' + rows.slice(0, 6).map((r, i) => '<span><i style="background:hsl(' + (i * 62 + 210) + ',38%,55%)"></i>' + esc(String(r[labelKey])) + ' · ' + esc(String(r[valueKey])) + '</span>').join('') + '</div></div>';
}
export const dt = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return String(iso || ''); } };
export const fmtMoney = (n) => money(Number(n || 0));
