// Zustand-style global store with localStorage persistence.
import { calculateTotals, productById } from "../services/api/cartApi.js";
import { pushCartLive, pushWishLive } from "../services/api/cartSync.js";
import { logoutApi } from "../services/api/authApi.js";

const LS = { cart: "aura_cart", wishlist: "aura_wishlist", user: "aura_user", token: "aura_token", addresses: "aura_addresses", coupon: "aura_coupon", ship: "aura_ship", recent: "aura_recent", saved: "aura_saved" };
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const listeners = new Set();
export const store = {
  state: {
    cart: load(LS.cart, []), // [{id,color,size,qty}]
    saved: load(LS.saved, []),
    wishlist: load(LS.wishlist, []),
    user: load(LS.user, null),
    addresses: load(LS.addresses, []),
    coupon: load(LS.coupon, null),
    shippingId: load(LS.ship, "standard"),
    recent: load(LS.recent, []),
  },
  get() { return this.state; },
  set(patch) { this.state = { ...this.state, ...patch }; persist(this.state); listeners.forEach((f) => f(this.state)); },
  sub(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
function persist(s) {
  save(LS.cart, s.cart); save(LS.saved, s.saved); save(LS.wishlist, s.wishlist);
  save(LS.user, s.user); save(LS.addresses, s.addresses); save(LS.coupon, s.coupon);
  save(LS.ship, s.shippingId); save(LS.recent, s.recent);
}

// ---- cart ----
export function cartLines() {
  return store.state.cart.map((l) => ({ ...l, product: productById(l.id) })).filter((l) => l.product);
}
export function cartCount() { return store.state.cart.reduce((s, l) => s + l.qty, 0); }
export function cartTotals() {
  const lines = cartLines();
  return calculateTotals(lines, { couponCode: store.state.coupon, shippingId: store.state.shippingId });
}
export function addToCart(id, qty = 1, color = null, size = null) {
  const p = productById(id);
  if (!p) return { ok: false };
  const cart = [...store.state.cart];
  const key = (l) => l.id === id && l.color === color && l.size === size;
  const ex = cart.find(key);
  const cur = ex ? ex.qty : 0;
  if (cur + qty > p.stock) return { ok: false, message: `Only ${p.stock} in stock.` };
  if (ex) ex.qty += qty; else cart.push({ id, qty, color, size });
  store.set({ cart });
  pushCartLive(cart);
  return { ok: true };
}
export function updateQty(id, color, size, qty) {
  const p = productById(id);
  let cart = [...store.state.cart];
  cart = cart.map((l) => (l.id === id && l.color === color && l.size === size ? { ...l, qty: Math.max(0, Math.min(qty, p ? p.stock : qty)) } : l)).filter((l) => l.qty > 0);
  store.set({ cart });
  pushCartLive(cart);
}
export function removeLine(id, color, size) {
  const cart = store.state.cart.filter((l) => !(l.id === id && l.color === color && l.size === size));
  store.set({ cart });
  pushCartLive(cart);
}
export function clearCart() { store.set({ cart: [], coupon: null }); try { localStorage.removeItem(LS.coupon); } catch {} pushCartLive([]); }
export function saveForLater(id, color, size) {
  const line = store.state.cart.find((l) => l.id === id && l.color === color && l.size === size);
  if (!line) return;
  removeLine(id, color, size);
  if (!store.state.saved.some((s) => s.id === id && s.color === color && s.size === size)) store.set({ saved: [...store.state.saved, line] });
}
export function moveToCart(id, color, size) {
  const r = addToCart(id, 1, color, size);
  if (r.ok) {
    const saved = store.state.saved.filter((s) => !(s.id === id && s.color === color && s.size === size));
    store.set({ saved });
    pushCartLive(store.state.cart);
  }
  return r;
}
// ---- wishlist ----
export function toggleWishlist(id) {
  const w = store.state.wishlist.includes(id) ? store.state.wishlist.filter((x) => x !== id) : [...store.state.wishlist, id];
  store.set({ wishlist: w });
  const on = w.includes(id);
  pushWishLive(id, on);
  return on;
}
export function isWished(id) { return store.state.wishlist.includes(id); }
// ---- coupon/shipping ----
export function setCoupon(code) { store.set({ coupon: code }); }
export function setShipping(id) { store.set({ shippingId: id }); }
// ---- auth ----
export function setSession(user, token) {
  try { if (token) localStorage.setItem(LS.token, token); } catch {}
  store.set({ user });
}
export function logout() {
  try { localStorage.removeItem(LS.token); } catch {}
  try { logoutApi(); } catch {} // live: revoke server session (best effort); mock: clears refresh id
  store.set({ user: null });
}
export function updateBadges() {
  try {
    const c = cartCount(), w = store.state.wishlist.length;
    const cb = document.getElementById("cartB"), wb = document.getElementById("wishB");
    if (cb) { cb.hidden = c === 0; cb.textContent = c; }
    if (wb) { wb.hidden = w === 0; wb.textContent = w; }
  } catch {}
}
// ---- recent ----
export function pushRecent(id) {
  const r = [id, ...store.state.recent.filter((x) => x !== id)].slice(0, 8);
  store.set({ recent: r });
}
