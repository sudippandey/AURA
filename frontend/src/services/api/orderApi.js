import { apiRequest, usingMock } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";

function couponCode() {
  try { return localStorage.getItem("aura_coupon") || null; } catch { return null; }
}

/** Backend checkout shape from the storefront order draft. */
function toBackendOrder(order) {
  return {
    items: (order.items || []).map((l) => ({
      productId: l.id,
      qty: l.qty,
      color: l.color ?? null,
      size: l.size ?? null
    })),
    customer: order.customer,
    shipping: {
      address: order.shipping.address,
      city: order.shipping.city,
      zip: order.shipping.zip,
      country: order.shipping.country,
      method: order.shipping.method
    },
    payment: {
      method: order.payment.method,
      reference: order.payment.id || undefined
    },
    couponCode: order.couponCode ?? couponCode()
  };
}

export async function createOrderApi(order) {
  const liveBody = usingMock() ? order : toBackendOrder(order);
  const res = await apiRequest(ENDPOINTS.orders, {
    method: "POST", body: liveBody,
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
  if (!usingMock()) {
    // Backend keeps its own cart: explicit-items checkout doesn't clear it.
    try { await apiRequest(ENDPOINTS.cart, { method: "PUT", body: { items: [] }, auth: true }); } catch {}
  }
  return res;
}
export async function getOrdersApi() {
  return apiRequest(ENDPOINTS.orders, { auth: true, mockFn: async () => JSON.parse(localStorage.getItem("aura_orders") || "[]") });
}
export async function getOrderApi(id) {
  return apiRequest(ENDPOINTS.orderById(id), { auth: true, mockFn: async () => null });
}
