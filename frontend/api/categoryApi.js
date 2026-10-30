import { apiRequest } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";
import { CATEGORIES, PRODUCTS } from "../mocks/products.js";

export async function getCategories() {
  return apiRequest(ENDPOINTS.categories, {
    mockFn: () => CATEGORIES.map((c) => ({ ...c, productCount: PRODUCTS.filter((p) => p.category === c.id).length })),
  });
}
export async function getCategoryById(id) {
  const cats = await getCategories();
  return cats.find((c) => c.id === id || c.slug === id) || null;
}
