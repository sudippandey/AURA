import { apiRequest } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";

export async function createOrderApi(order) {
  return apiRequest(ENDPOINTS.orders, {
    method: "POST", body: order,
    mockFn: async () => {
      await new Promise((r) => setTimeout(r, 700));
      const saved = { ...order, id: "ORD-" + Math.floor(100000 + Math.random() * 900000), createdAt: new Date().toISOString(), status: "Processing" };
      try {
        const all = JSON.parse(localStorage.getItem("aura_orders") || "[]");
        all.unshift(saved);
        localStorage.setItem("aura_orders", JSON.stringify(all));
      } catch {}
      return saved;
    },
  });
}
export async function getOrdersApi() {
  return apiRequest(ENDPOINTS.orders, { mockFn: async () => JSON.parse(localStorage.getItem("aura_orders") || "[]") });
}
