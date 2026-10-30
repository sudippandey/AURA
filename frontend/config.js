// Central app configuration.
// Override the local backend URL with window.__API_BASE_URL or
// "aura_api_base_url" in localStorage. See README.md.
export const CONFIG = {
  get API_BASE_URL() {
    try {
      return (
        window.__API_BASE_URL ||
        localStorage.getItem("aura_api_base_url") ||
        "http://localhost:4000"
      );
    } catch { return (typeof window !== "undefined" && window.__API_BASE_URL) || "http://localhost:4000"; }
  },
  USE_MOCK: true, // flip to false when backend is ready (or set localStorage aura_use_mock="0")
  CURRENCY: "USD",
  LOCALE: "en-US",
  FREE_SHIP_THRESHOLD: 75,
  SHIPPING: {
    standard: { id: "standard", label: "Standard", eta: "4–6 business days", price: 6.95 },
    express: { id: "express", label: "Express", eta: "2–3 business days", price: 14.95 },
    overnight: { id: "overnight", label: "Overnight", eta: "Next business day", price: 24.95 },
  },
  COUPONS: {
    WELCOME10: { code: "WELCOME10", type: "percent", value: 10, minSubtotal: 0, desc: "10% off your order" },
    PREMIUM15: { code: "PREMIUM15", type: "percent", value: 15, minSubtotal: 200, desc: "15% off orders $200+" },
    FREESHIP: { code: "FREESHIP", type: "freeship", value: 0, minSubtotal: 0, desc: "Free standard shipping" },
  },
  PAGE_SIZE: 9,
};

export function isMockMode() {
  try {
    if (localStorage.getItem("aura_use_mock") === "0") return false;
    if (localStorage.getItem("aura_use_mock") === "1") return true;
  } catch {}
  return CONFIG.USE_MOCK;
}
