// ALL product fetching lives here. UI components import these functions only.
import { apiRequest, normalizeList, usingMock } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";
import { PRODUCTS } from "../../mocks/products.js";
import { getMockReviews } from "../../mocks/reviews.js";

// Live-mode product cache so cart lines resolve without another round-trip.
const liveById = new Map();
function remember(p) {
  if (!p) return;
  if (p.id) liveById.set(p.id, p);
  if (p.slug && p.slug !== p.id) liveById.set(p.slug, p);
}
function rememberMany(res) {
  if (usingMock()) return;
  for (const p of normalizeList(res).items) remember(p);
}
function rememberOne(res) {
  if (usingMock()) return;
  if (res && !Array.isArray(res) && (res.id || res.data)) remember(res.id ? res : normalizeList(res).items[0]);
}

export function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id || p.slug === id) || liveById.get(id) || null;
}

const byId = (id) => findProduct(id);

function applyQuery(list, { search = "", sort = "featured", category = "", categories = [], brands = [], minPrice = 0, maxPrice = Infinity, minRating = 0, inStock = false, colors = [], sizes = [] } = {}) {
  let out = [...list];
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((p) => [p.name, p.brand, p.description, p.category].join(" ").toLowerCase().includes(q));
  }
  const cats = categories?.length ? categories : category ? [category] : [];
  if (cats.length) out = out.filter((p) => cats.includes(p.category));
  if (brands?.length) out = out.filter((p) => brands.includes(p.brand));
  out = out.filter((p) => p.price >= minPrice && p.price <= (maxPrice ?? Infinity));
  if (minRating) out = out.filter((p) => p.rating >= minRating);
  if (inStock) out = out.filter((p) => p.stock > 0);
  if (colors?.length) out = out.filter((p) => (p.colors || []).some((c) => colors.includes(c.name)));
  if (sizes?.length) out = out.filter((p) => (p.sizes || []).some((s) => sizes.includes(s)));
  switch (sort) {
    case "price-asc": out.sort((a, b) => a.price - b.price); break;
    case "price-desc": out.sort((a, b) => b.price - a.price); break;
    case "newest": out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
    case "rating": out.sort((a, b) => b.rating - a.rating); break;
    case "bestselling": out.sort((a, b) => b.reviewCount - a.reviewCount); break;
    case "featured":
    default: out.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.reviewCount - a.reviewCount);
  }
  return out;
}

export async function getProducts({ page = 1, limit = 9, sort = "featured", filters = {}, search = "" } = {}) {
  const res = await apiRequest(ENDPOINTS.products, {
    params: { page, limit, sort, search, ...filters },
    mockFn: () => {
      const all = applyQuery(PRODUCTS, { ...filters, search, sort });
      const total = all.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const items = all.slice((page - 1) * limit, page * limit);
      return { items, total, page, pages };
    },
  });
  rememberMany(res);
  return res;
}

export async function getProductById(id) {
  const res = await apiRequest(ENDPOINTS.productById(id), { mockFn: () => byId(id) || null });
  rememberOne(res);
  return res;
}

export async function getFeaturedProducts(limit = 8) {
  const res = await apiRequest(ENDPOINTS.featured, { mockFn: () => PRODUCTS.filter((p) => p.featured).slice(0, limit) });
  rememberMany(res);
  return res;
}
export async function getTrendingProducts(limit = 4) {
  const res = await apiRequest("/products/trending", { mockFn: () => PRODUCTS.filter((p) => (p.tags || []).includes("trending")).slice(0, limit) });
  rememberMany(res);
  return res;
}
export async function getBestSellers(limit = 4) {
  const res = await apiRequest("/products/bestsellers", { mockFn: () => [...PRODUCTS].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, limit) });
  rememberMany(res);
  return res;
}
export async function getNewArrivals(limit = 4) {
  const res = await apiRequest("/products/new", { mockFn: () => [...PRODUCTS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit) });
  rememberMany(res);
  return res;
}
export async function getRelatedProducts(id, limit = 4) {
  const res = await apiRequest(ENDPOINTS.related(id), {
    mockFn: () => {
      const p = byId(id);
      if (!p) return [];
      return PRODUCTS.filter((x) => x.id !== p.id && (x.category === p.category || x.brand === p.brand)).slice(0, limit);
    },
  });
  rememberMany(res);
  return res;
}
export async function searchProducts(query, limit = 8) {
  const res = await getProducts({ page: 1, limit, search: query });
  return normalizeList(res).items;
}
export async function getProductsByCategory(categoryId, opts = {}) {
  return getProducts({ ...opts, filters: { ...(opts.filters || {}), category: categoryId } });
}
export async function getProductReviews(productId) {
  return apiRequest(ENDPOINTS.reviews(productId), { mockFn: () => getMockReviews(productId) });
}
