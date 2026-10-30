/**
 * Server-side pricing — the single source of truth at checkout.
 * Values mirror the storefront CONFIG (src/config.js) so mock and live totals agree.
 */
export const TAX_RATE = 0.08;
export const FREE_SHIP_THRESHOLD = 75;

export const SHIPPING_METHODS = {
  standard: { id: "standard", label: "Standard", price: 6.95 },
  express: { id: "express", label: "Express", price: 14.95 },
  overnight: { id: "overnight", label: "Overnight", price: 24.95 }
} as const;

export type ShippingMethod = keyof typeof SHIPPING_METHODS;

interface Coupon {
  code: string;
  type: "percent" | "freeship";
  value: number;
  minSubtotal: number;
}

export const COUPONS: Record<string, Coupon> = {
  WELCOME10: { code: "WELCOME10", type: "percent", value: 10, minSubtotal: 0 },
  PREMIUM15: { code: "PREMIUM15", type: "percent", value: 15, minSubtotal: 200 },
  FREESHIP: { code: "FREESHIP", type: "freeship", value: 0, minSubtotal: 0 }
};

const cents = (n: number): number => Math.round(n * 100) / 100;

export interface PricedTotals {
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shipping: number;
  shippingMethod: ShippingMethod;
  tax: number;
  total: number;
}

/**
 * Same operation order as the storefront cartTotals(): percent discount off the
 * subtotal, free shipping when a freeship coupon applies OR the discounted
 * subtotal clears the threshold, 8% tax on the discounted subtotal.
 */
export function priceOrder(
  subtotal: number,
  couponCode: string | null,
  shippingMethod: ShippingMethod
): PricedTotals {
  const code = (couponCode ?? "").trim().toUpperCase() || null;
  const coupon = code ? COUPONS[code] : undefined;
  let discount = 0;
  let freeShip = false;
  let applied: string | null = null;
  if (coupon && subtotal >= (coupon.minSubtotal || 0)) {
    applied = coupon.code;
    if (coupon.type === "percent") discount = cents((subtotal * coupon.value) / 100);
    if (coupon.type === "freeship") freeShip = true;
  }
  const method = SHIPPING_METHODS[shippingMethod] ?? SHIPPING_METHODS.standard;
  let shipping: number = method.price;
  if (freeShip || subtotal - discount >= FREE_SHIP_THRESHOLD) shipping = 0;
  const tax = cents(Math.max(0, subtotal - discount) * TAX_RATE);
  const total = cents(Math.max(0, subtotal - discount) + shipping + tax);
  return {
    subtotal: cents(subtotal),
    discount,
    couponCode: applied,
    shipping,
    shippingMethod: method.id as ShippingMethod,
    tax,
    total
  };
}
