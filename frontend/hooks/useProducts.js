// TanStack-Query-style hooks (thin cached wrappers — components use these, never fetch).
import { getProducts, getProductById, getRelatedProducts, getProductReviews } from "../api/productApi.js";
import { getCategories } from "../api/categoryApi.js";

const mem = new Map();
async function cached(key, fn, ms = 30000) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ms) return hit.d;
  const d = await fn();
  mem.set(key, { t: Date.now(), d });
  return d;
}
export async function useProducts(opts) { return cached("products:" + JSON.stringify(opts), () => getProducts(opts)); }
export async function useProductDetails(id) {
  const [product, related, reviews] = await Promise.all([
    cached("pd:" + id, () => getProductById(id)),
    cached("rel:" + id, () => getRelatedProducts(id)),
    cached("rev:" + id, () => getProductReviews(id)),
  ]);
  return { product, related, reviews };
}
export async function useCategories() { return cached("cats", () => getCategories(), 120000); }
