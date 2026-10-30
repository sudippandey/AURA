// Cart math + coupons + shipping. UI calls these — no inline business logic in pages.
import { CONFIG } from "../config.js";
import { apiRequest } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";
import { PRODUCTS } from "../mocks/products.js";

export function productById(id) { return PRODUCTS.find((p) => p.id === id); }

export function validateCoupon(code, subtotal) {
  if (!code) return { ok: false, message: "Enter a code." };
  const c = CONFIG.COUPONS[String(code).trim().toUpperCase()];
  if (!c) return { ok: false, message: "That code isn't valid." };
  if (subtotal < c.minSubtotal) return { ok: false, message: `Requires a $${c.minSubtotal}+ subtotal.` };
  return { ok: true, coupon: c };
}

export function calculateTotals(lines, { couponCode = null, shippingId = "standard" } = {}) {
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  let discount = 0;
  let freeShip = false;
  const c = couponCode ? CONFIG.COUPONS[String(couponCode).toUpperCase()] : null;
  if (c && subtotal >= (c.minSubtotal || 0)) {
    if (c.type === "percent") discount = (subtotal * c.value) / 100;
    if (c.type === "freeship") freeShip = true;
  }
  const shipOpt = CONFIG.SHIPPING[shippingId] || CONFIG.SHIPPING.standard;
  let shipping = lines.length === 0 ? 0 : shipOpt.price;
  if (freeShip || subtotal - discount >= CONFIG.FREE_SHIP_THRESHOLD) shipping = 0;
  if (shippingId === "standard" && subtotal - discount >= CONFIG.FREE_SHIP_THRESHOLD) shipping = 0;
  const tax = Math.max(0, (subtotal - discount) * 0.08);
  const total = Math.max(0, subtotal - discount + shipping + tax);
  return { subtotal, discount, shipping, tax, total, shippingLabel: shipOpt.label };
}

// Backend-ready stubs (mock-backed for now; pages use the store which calls these shapes)
export async function fetchCart() { return apiRequest(ENDPOINTS.cart, { mockFn: () => ({ items: [] }) }); }
export async function syncCart(items) { return apiRequest(ENDPOINTS.cart, { method: "POST", body: { items }, mockFn: () => ({ ok: true }) }); }
