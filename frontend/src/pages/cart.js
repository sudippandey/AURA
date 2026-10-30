import { cartLines, cartTotals, updateQty, removeLine, saveForLater, moveToCart, setCoupon, setShipping, store, updateBadges } from "../store/store.js";
import { validateCoupon } from "../services/api/cartApi.js";
import { money, esc } from "../lib/format.js";
import { icon } from "../lib/icons.js";
import { navigate, toast, confirmDialog, observeReveals } from "../components/layout.js";
import { productCard, bindCards, emptyState } from "../components/product.js";
import { PRODUCTS } from "../mocks/products.js";
import { CONFIG } from "../config.js";

export function renderCart() {
  const lines = cartLines();
  if (!lines.length) {
    const trending = [...PRODUCTS].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 4);
    return `<section class="sec">${emptyState({ title: "Your cart is empty", body: "Beautiful things await. Start with our best sellers.", cta: `<a class="btn btn-dark" href="#/shop">Continue shopping</a>` })}
    <div class="sec" style="padding-left:0;padding-right:0"><div class="sec-head"><div><h2>You may like</h2></div></div><div class="p-grid four" data-bind>${trending.map(productCard).join("")}</div></div></section>`;
  }
  const t = cartTotals();
  return `<section class="sec" style="padding-top:30px"><h1 style="font-family:var(--font-disp);font-size:36px;margin:0 0 4px;font-weight:500">Cart (${lines.reduce((s, l) => s + l.qty, 0)})</h1>
  <p class="muted" style="margin:0 0 20px">${t.shipping === 0 ? "You've unlocked FREE standard shipping." : `Add ${money(CONFIG.FREE_SHIP_THRESHOLD - (t.subtotal - t.discount))} more for free shipping.`}</p>
  <div class="cart-layout"><div>
    ${lines.map((l) => `<div class="cart-line"><img src="${l.product.images[0]}" alt="${esc(l.product.name)}" loading="lazy">
      <div><div class="p-brand">${esc(l.product.brand)}</div><a href="#/product/${l.product.slug}" style="font-weight:600">${esc(l.product.name)}</a>
      <div class="small muted">${l.color ? esc(l.color) + " · " : ""}${l.size ? esc(l.size) : ""} · ${money(l.product.price)} each</div>
      <div class="line-actions" style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
        <div class="qty"><button data-dec="${l.id}|${esc(l.color || "")}|${esc(l.size || "")}">−</button><b>${l.qty}</b><button data-inc="${l.id}|${esc(l.color || "")}|${esc(l.size || "")}">+</button></div>
        <button class="small link-u" data-save="${l.id}|${esc(l.color || "")}|${esc(l.size || "")}" style="border:0;background:none">Save for later</button>
        <button class="small link-u" data-rm="${l.id}|${esc(l.color || "")}|${esc(l.size || "")}" style="border:0;background:none;color:var(--sale)">Remove</button>
      </div></div><div style="font-weight:700">${money(l.product.price * l.qty)}</div></div>`).join("")}
    ${store.state.saved.length ? `<h3 style="margin:22px 0 10px">Saved for later (${store.state.saved.length})</h3>${store.state.saved.map((s) => { const p = PRODUCTS.find((x) => x.id === s.id); if (!p) return ""; return `<div class="cart-line"><img src="${p.images[0]}" alt="${esc(p.name)}"><div><b>${esc(p.name)}</b><div class="small muted">${money(p.price)}</div><button class="small link-u" data-move="${s.id}|${esc(s.color || "")}|${esc(s.size || "")}" style="border:0;background:none">Move to cart</button></div><div></div></div>`; }).join("")}` : ""}
  </div><aside class="summary">
    <h3 style="margin:0 0 10px">Order summary</h3>
    <div class="coupon"><input id="cpn" placeholder="Coupon code (try WELCOME10)" value="${esc(store.state.coupon || "")}" aria-label="Coupon code"><button class="btn btn-outline btn-sm" id="cpnB">Apply</button></div>
    <div class="small muted">Try WELCOME10 · PREMIUM15 · FREESHIP</div>
    <div style="margin:12px 0 4px" class="small"><b>Shipping</b></div>
    ${Object.values(CONFIG.SHIPPING).map((s) => `<label class="pay-opt ${store.state.shippingId === s.id ? "on" : ""}"><input type="radio" name="ship" value="${s.id}" ${store.state.shippingId === s.id ? "checked" : ""}> <span><b>${s.label}</b> <span class="muted">· ${s.eta}</span><br><span class="small">${money(s.price)}</span></span></label>`).join("")}
    <div class="sum-row"><span>Subtotal</span><span class="mono">${money(t.subtotal)}</span></div>
    ${t.discount ? `<div class="sum-row" style="color:var(--ok)"><span>Discount (${esc(store.state.coupon)})</span><span class="mono">−${money(t.discount)}</span></div>` : ""}
    <div class="sum-row"><span>Shipping</span><span class="mono">${t.shipping === 0 ? "FREE" : money(t.shipping)}</span></div>
    <div class="sum-row"><span>Est. tax</span><span class="mono">${money(t.tax)}</span></div>
    <div class="sum-row total"><span>Total</span><span class="mono">${money(t.total)}</span></div>
    <button class="btn btn-dark" id="toCO" style="width:100%;margin-top:14px">Proceed to checkout ${icon("arrowR", 16)}</button>
    <a class="btn btn-outline btn-sm" href="#/shop" style="width:100%;margin-top:8px">Continue shopping</a>
    <div class="small muted" style="margin-top:12px;display:flex;gap:6px;align-items:center">${icon("lock", 14)} Secure checkout · 60-day returns</div>
  </aside></div></section>`;
}

export function mountCart() {
  bindCards(document); observeReveals();
  const rerender = () => navigate("/cart"); // simplest consistent refresh via router
  const parse = (k) => { const [id, c, s] = k.split("|"); return [id, c || null, s || null]; };
  document.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => { const [id, c, s] = parse(b.dataset.dec); const cur = store.state.cart.find((l) => l.id === id && (l.color || null) === c && (l.size || null) === s); updateQty(id, c, s, (cur?.qty || 1) - 1); updateBadges(); rerender(); }));
  document.querySelectorAll("[data-inc]").forEach((b) => (b.onclick = () => { const [id, c, s] = parse(b.dataset.inc); const cur = store.state.cart.find((l) => l.id === id && (l.color || null) === c && (l.size || null) === s); updateQty(id, c, s, (cur?.qty || 1) + 1); updateBadges(); rerender(); }));
  document.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Remove item?", body: "This will remove the item from your cart.", okLabel: "Remove", danger: true }))) return;
    const [id, c, s] = parse(b.dataset.rm); removeLine(id, c, s); updateBadges(); toast("Removed from cart.", "info"); rerender();
  }));
  document.querySelectorAll("[data-save]").forEach((b) => (b.onclick = () => { const [id, c, s] = parse(b.dataset.save); saveForLater(id, c, s); updateBadges(); toast("Saved for later.", "ok"); rerender(); }));
  document.querySelectorAll("[data-move]").forEach((b) => (b.onclick = () => { const [id, c, s] = parse(b.dataset.move); moveToCart(id, c, s); updateBadges(); toast("Moved to cart.", "ok"); rerender(); }));
  const cpnB = document.getElementById("cpnB");
  if (cpnB) cpnB.onclick = () => {
    const code = document.getElementById("cpn").value.trim().toUpperCase();
    const lines = cartLines(); const sub = lines.reduce((x, l) => x + l.product.price * l.qty, 0);
    const r = validateCoupon(code, sub);
    if (!r.ok) { toast(r.message, "err"); return; }
    setCoupon(code); toast(`Coupon ${code} applied.`, "ok"); rerender();
  };
  document.querySelectorAll('input[name="ship"]').forEach((r) => (r.onchange = () => { setShipping(r.value); rerender(); }));
  const co = document.getElementById("toCO");
  if (co) co.onclick = () => navigate("/checkout");
}
