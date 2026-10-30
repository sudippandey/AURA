import { esc } from '../lib/format.js';
import { apiRequest, usingMock } from '../services/api/apiClient.js';
import { getProducts } from '../services/api/productApi.js';
import { getCategories } from '../services/api/categoryApi.js';
import { PRODUCTS } from '../mocks/products.js';
import { adminApi } from './adminApi.js';
import { badge, dataTable, pager, bindPager, emptyState, loadingState, fmtMoney, dt } from './components.js';
import { toast, confirmDialog, openModal, closeModal } from '../components/layout.js';
export function renderProductsShell() { return '<div class="am-toolbar"><input id="amQ" class="input" placeholder="Search products…" aria-label="Search products"><select id="amPub" class="input"><option value="">All statuses</option><option value="active">Published</option><option value="draft">Draft / hidden</option><option value="featured">Featured</option><option value="low">Low stock</option></select><button class="btn btn-dark btn-sm" id="amNew">New product</button></div><div id="amList">' + loadingState(6) + '</div>'; }
export function mountProducts(go) {
  let page = 1; const limit = 12;
  const load = async () => {
    const root = document.getElementById('amList'); root.innerHTML = loadingState(6);
    try {
      const q = document.getElementById('amQ').value.trim(); const f = document.getElementById('amPub').value;
      const res = await getProducts({ page, limit, search: q, filters: {} });
      let items = res.items || [];
      if (f === 'featured') items = items.filter((p) => p.featured);
      if (f === 'low') items = items.filter((p) => p.stock <= 8);
      root.innerHTML = dataTable({ cols: ['Product', 'Price', 'Stock', 'Status', ''], rows: items, rowHtml: (p) => '<tr><td><b>' + esc(p.name) + '</b><br><span class="muted">' + esc(p.slug) + ' · ' + esc(p.brand) + '</span></td><td>' + fmtMoney(p.price) + '</td><td>' + esc(String(p.stock)) + '</td><td>' + (p.featured ? badge('featured') : badge('active')) + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-edit="' + esc(p.slug || p.id) + '">Edit</button> <button class="btn btn-outline btn-sm" data-dup="' + esc(p.slug || p.id) + '">Duplicate</button></td></tr>', emptyTitle: 'No products', emptyBody: 'Create your first product.' }) + pager(res.total || items.length, page, limit);
      bindPager(root, (p) => { page = p; load(); });
      root.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => go('/admin/products/' + b.dataset.edit); });
      root.querySelectorAll('[data-dup]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Duplicate is available once the backend is connected.', 'info'); return; } try { const src = await apiRequest('/products/' + b.dataset.dup); const body = { ...src, name: src.name + ' (copy)', slug: undefined }; delete body.id; const createdP = await apiRequest('/products', { method: 'POST', body, auth: true }); toast('Duplicated as ' + createdP.slug, 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } }; });
    } catch (e) { root.innerHTML = emptyState('Products unavailable', String(e.message || e)); }
  };
  document.getElementById('amQ').oninput = () => { page = 1; load(); };
  document.getElementById('amPub').onchange = () => { page = 1; load(); };
  document.getElementById('amNew').onclick = () => go('/admin/products/new');
  load();
}
export function renderProductFormShell(id) { return '<div id="amForm">' + loadingState(4) + '</div>'; }
export function mountProductForm(id, go) {
  const root = document.getElementById('amForm');
  const isNew = !id || id === 'new';
  const load = async () => {
    let p = { name: '', slug: '', description: '', brand: '', category: '', price: 0, originalPrice: '', images: [], stock: 0, lowStockThreshold: 5, featured: false, isActive: true, tags: [], colors: [], sizes: [], variants: [], specifications: {} };
    let cats = [];
    try { cats = (await getCategories()).categories || []; } catch {}
    if (!isNew) { try { p = await apiRequest('/products/' + id); } catch (e) { root.innerHTML = emptyState('Product not found', String(e.message || e)); return; } }
    const imgList = (p.images || []).join('\n');
    root.innerHTML = '<form id="pf" class="am-form">' +
    '<div class="am-grid2"><div class="am-card"><h3>Basics</h3>' +
    '<label>Name<input name="name" class="input" required value="' + esc(p.name || '') + '"></label>' +
    '<label>Slug (auto if blank)<input name="slug" class="input" value="' + esc(p.slug || '') + '"></label>' +
    '<label>Brand<input name="brand" class="input" required value="' + esc(p.brand || '') + '"></label>' +
    '<label>Category<select name="category" class="input">' + cats.map((c) => '<option value="' + esc(c.slug) + '"' + (c.slug === p.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' +
    '<label>Description<textarea name="description" class="input" rows="4">' + esc(p.description || '') + '</textarea></label></div>' +
    '<div class="am-card"><h3>Pricing & stock</h3>' +
    '<label>Price<input name="price" class="input" type="number" min="0" step="0.01" required value="' + esc(String(p.price ?? 0)) + '"></label>' +
    '<label>Compare-at price<input name="originalPrice" class="input" type="number" min="0" step="0.01" value="' + esc(String(p.originalPrice ?? '')) + '"></label>' +
    '<label>Stock<input name="stock" class="input" type="number" min="0" step="1" value="' + esc(String(p.stock ?? 0)) + '"></label>' +
    '<label>Low-stock threshold<input name="lowStockThreshold" class="input" type="number" min="0" step="1" value="' + esc(String(p.lowStockThreshold ?? 5)) + '"></label>' +
    '<label class="chk"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> Featured</label>' +
    '<label class="chk"><input type="checkbox" name="isActive"' + (p.isActive === false ? '' : ' checked') + '> Published</label>' +
    '<label>Images (one URL per line)<textarea name="images" class="input" rows="3">' + esc(imgList) + '</textarea></label>' +
    '<label>Tags (comma separated)<input name="tags" class="input" value="' + esc((p.tags || []).join(', ')) + '"></label></div></div>' +
    '<div class="am-actions"><button type="button" class="btn btn-outline" id="pfBack">Back</button><button class="btn btn-dark" type="submit">' + (isNew ? 'Create product' : 'Save changes') + '</button></div></form>';
    document.getElementById('pfBack').onclick = () => go('/admin/products');
    document.getElementById('pf').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { name: String(fd.get('name')).trim(), slug: String(fd.get('slug')).trim() || undefined, description: String(fd.get('description') || ''), brand: String(fd.get('brand')).trim(), category: String(fd.get('category')).trim(), price: Number(fd.get('price')), originalPrice: fd.get('originalPrice') === '' ? null : Number(fd.get('originalPrice')), images: String(fd.get('images') || '').split('\n').map((s) => s.trim()).filter(Boolean), stock: Number(fd.get('stock') || 0), lowStockThreshold: Number(fd.get('lowStockThreshold') || 5), featured: !!fd.get('featured'), isActive: !!fd.get('isActive'), tags: String(fd.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean) };
      if (usingMock()) { toast('Connect the backend to save products — preview is read-only.', 'info'); return; }
      try { if (isNew) { const c = await apiRequest('/products', { method: 'POST', body, auth: true }); toast('Created ' + c.slug, 'ok'); go('/admin/products/' + c.slug); } else { await apiRequest('/products/' + id, { method: 'PATCH', body, auth: true }); toast('Saved.', 'ok'); } } catch (err) { toast(String(err.message || err), 'err'); }
    };
  };
  load();
}
export function renderCategoriesShell() { return '<div class="am-toolbar"><button class="btn btn-dark btn-sm" id="catNew">New category</button><span class="muted">Existing AURA categories (Audio, Watches, Home, Apparel, Footwear, Skincare) and their product counts are preserved.</span></div><div id="catList">' + loadingState(4) + '</div>'; }
export function mountCategories() {
  const root = document.getElementById('catList');
  const load = async () => {
    try {
      const [cats, brands] = await Promise.all([getCategories().catch(() => ({ categories: [] })), adminApi.brands().catch(() => [])]);
      const list = cats.categories || [];
      root.innerHTML = dataTable({ cols: ['Category', 'Slug', 'Products', ''], rows: list, rowHtml: (c) => '<tr><td><b>' + esc(c.name) + '</b></td><td class="muted">' + esc(c.slug) + '</td><td>' + esc(String(c.productCount ?? 0)) + '</td><td style="text-align:right"><button class="btn btn-outline btn-sm" data-toggle="' + esc(c.slug) + '">Toggle visibility</button></td></tr>' }) + '<div class="am-card" style="margin-top:16px"><h3>Brands (' + (brands.length || 0) + ')</h3><p class="muted">' + (brands.map((b) => esc(b.name)).join(', ') || 'No brands yet.') + '</p></div>';
      root.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = async () => { if (usingMock()) { toast('Connect the backend to edit categories.', 'info'); return; } toast('Use the API to toggle visibility for now.', 'info'); }; });
    } catch (e) { root.innerHTML = emptyState('Categories unavailable', String(e.message || e)); }
  };
  document.getElementById('catNew').onclick = async () => { if (usingMock()) { toast('Connect the backend to create categories.', 'info'); return; } const name = prompt('Category name:'); if (!name) return; try { await apiRequest('/categories', { method: 'POST', body: { name }, auth: true }); toast('Category created.', 'ok'); load(); } catch (e) { toast(String(e.message || e), 'err'); } };
  load();
}
