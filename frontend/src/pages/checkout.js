import { cartLines, cartTotals, clearCart, updateBadges, store } from "../store/store.js";
import { createOrderApi } from "../services/api/orderApi.js";
import { validateCheckout } from "../lib/validation.js";
import { money, esc } from "../lib/format.js";
import { icon } from "../lib/icons.js";
import { navigate, toast, observeReveals } from "../components/layout.js";
import { CONFIG } from "../config.js";

// Dedicated integration point for a real payment provider (Stripe/Adyen/...).
// Replace simulatePayment() with your provider SDK call — the rest of checkout stays unchanged.
async function simulatePayment({ method, amount }) {
  await new Promise((r) => setTimeout(r, 1400));
  if (String(method).toLowerCase().includes("decline")) throw new Error("Card declined (demo). Try another method.");
  return { id: "pay_demo_" + Math.floor(Math.random() * 1e6), brand: "demo", amount };
}

export function renderCheckout() {
  const lines = cartLines();
  if (!lines.length) return `<section class="sec"><div class="empty"><h3>Nothing to check out</h3><p class="muted">Your cart is empty.</p><div style="margin-top:14px"><a class="btn btn-dark" href="#/shop">Back to shop</a></div></div></section>`;
  const t = cartTotals();
  const u = store.state.user || {};
  return `<section class="sec" style="padding-top:30px"><h1 style="font-family:var(--font-disp);font-size:36px;margin:0 0 4px;font-weight:500">Checkout</h1>
  <p class="muted" style="margin:0 0 20px">Demo mode — no real charge. Plug a provider into <span class="mono">simulatePayment()</span>.</p>
  <form id="coForm" novalidate><div class="cart-layout"><div>
    <div class="card-box"><h3>1 · Contact</h3><div class="form-2">
      <div class="field"><label>First name</label><input name="firstName" value="${esc(u.name?.split(" ")[0] || "")}"><div class="err" data-e="firstName"></div></div>
      <div class="field"><label>Last name</label><input name="lastName" value="${esc(u.name?.split(" ").slice(1).join(" ") || "")}"><div class="err" data-e="lastName"></div></div></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${esc(u.email || "")}" placeholder="you@example.com"><div class="err" data-e="email"></div></div>
      <div class="field"><label>Phone (optional)</label><input name="phone" placeholder="+1 …"></div></div>
    <div class="card-box"><h3>2 · Shipping address</h3>
      <div class="field"><label>Street address</label><input name="address" placeholder="Street and number"><div class="err" data-e="address"></div></div>
      <div class="form-2"><div class="field"><label>City</label><input name="city"><div class="err" data-e="city"></div></div>
      <div class="field"><label>ZIP / Postal code</label><input name="zip"><div class="err" data-e="zip"></div></div></div>
      <div class="field"><label>Country</label><select name="country"><option value="">Select…</option>${["United States", "Denmark", "United Kingdom", "Germany", "France", "Canada", "Australia"].map((c) => `<option>${c}</option>`).join("")}</select><div class="err" data-e="country"></div></div>
      <label class="f-check"><input type="checkbox" name="same" checked> Billing address is the same</label>
      <div id="billBox" hidden><div class="form-2" style="margin-top:10px"><div class="field"><label>Billing street</label><input name="baddress"></div><div class="field"><label>Billing city</label><input name="bcity"></div></div></div></div>
    <div class="card-box"><h3>3 · Delivery</h3>
      ${Object.values(CONFIG.SHIPPING).map((s) => `<label class="pay-opt ${store.state.shippingId === s.id ? "on" : ""}"><input type="radio" name="ship" value="${s.id}" ${store.state.shippingId === s.id ? "checked" : ""}><span style="display:flex;gap:8px;align-items:center">${icon("truck", 17)}<span><b>${s.label}</b> <span class="muted">· ${s.eta}</span><br><span class="small">${money(s.price)}${s.id === "standard" ? " · free over $75" : ""}</span></span></span></label>`).join("")}</div>
    <div class="card-box"><h3>4 · Payment</h3>
      ${[["card", "Card", "Visa · Mastercard · Amex"], ["paypal", "PayPal", "Redirect to PayPal (simulated)"], ["cod", "Cash on delivery", "Pay the courier"]].map(([v, t2, d], i) => `<label class="pay-opt ${i === 0 ? "on" : ""}"><input type="radio" name="pay" value="${v}" ${i === 0 ? "checked" : ""}><span style="display:flex;gap:8px;align-items:center">${icon(v === "card" ? "card" : v === "paypal" ? "mail" : "box", 17)}<span><b>${t2}</b><br><span class="small muted">${d}</span></span></span></label>`).join("")}
      <div id="cardBox"><div class="field"><label>Card number</label><input name="cardNum" inputmode="numeric" placeholder="4242 4242 4242 4242"><div class="err" data-e="cardNum"></div></div>
      <div class="field"><label>Name on card</label><input name="cardName"><div class="err" data-e="cardName"></div></div>
      <div class="form-2"><div class="field"><label>Expiry (MM/YY)</label><input name="exp" placeholder="08/28"><div class="err" data-e="exp"></div></div>
      <div class="field"><label>CVC</label><input name="cvc" inputmode="numeric" placeholder="123"><div class="err" data-e="cvc"></div></div></div></div>
      <div class="small muted" style="display:flex;gap:6px;align-items:center">${icon("lock", 14)} 256-bit encrypted · PCI-DSS via provider · demo charge only</div></div>
  </div><aside class="summary"><h3>Order summary</h3>
    ${lines.map((l) => `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><img src="${l.product.images[0]}" alt="" style="width:52px;height:52px;border-radius:10px;object-fit:cover"><div style="flex:1"><b class="small">${esc(l.product.name)}</b><div class="small muted">Qty ${l.qty}${l.size ? " · " + esc(l.size) : ""}</div></div><b class="small mono">${money(l.product.price * l.qty)}</b></div>`).join("")}
    <div class="sum-row"><span>Subtotal</span><span class="mono">${money(t.subtotal)}</span></div>
    ${t.discount ? `<div class="sum-row" style="color:var(--ok)"><span>Discount</span><span>−${money(t.discount)}</span></div>` : ""}
    <div class="sum-row"><span>Shipping</span><span>${t.shipping === 0 ? "FREE" : money(t.shipping)}</span></div>
    <div class="sum-row"><span>Tax</span><span>${money(t.tax)}</span></div>
    <div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>
    <button class="btn btn-dark" style="width:100%;margin-top:12px" id="placeB" type="submit">Place order · ${money(t.total)}</button>
    <a class="btn btn-outline btn-sm" href="#/cart" style="width:100%;margin-top:8px">Back to cart</a>
  </aside></div></form></section>`;
}

export function mountCheckout() {
  observeReveals();
  const form = document.getElementById("coForm");
  if (!form) return;
  const fd = () => Object.fromEntries(new FormData(form).entries());
  form.querySelector('[name="same"]').onchange = (e) => (form.querySelector("#billBox").hidden = e.target.checked);
  form.querySelectorAll('[name="pay"]').forEach((r) => (r.onchange = () => {
    form.querySelector("#cardBox").style.display = form.querySelector('[name="pay"]:checked').value === "card" ? "" : "none";
    form.querySelectorAll(".pay-opt").forEach((o) => o.classList.remove("on"));
    r.closest(".pay-opt").classList.add("on");
  }));
  form.querySelectorAll('[name="ship"]').forEach((r) => (r.onchange = () => {
    import("../store/store.js").then(({ setShipping }) => { setShipping(r.value); navigate("/checkout"); });
  }));
  // live card number spacing
  const cn = form.querySelector('[name="cardNum"]');
  cn.addEventListener("input", () => { cn.value = cn.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = fd();
    d.payMethod = form.querySelector('[name="pay"]:checked').value;
    const errs = validateCheckout(d);
    form.querySelectorAll("[data-e]").forEach((x) => (x.textContent = ""));
    form.querySelectorAll("input.bad").forEach((x) => x.classList.remove("bad"));
    Object.entries(errs).forEach(([k, m]) => {
      const slot = form.querySelector(`[data-e="${k}"]`); if (slot) slot.textContent = m;
      const inp = form.querySelector(`[name="${k}"]`); if (inp) inp.classList.add("bad");
    });
    if (Object.keys(errs).length) { toast("Please fix the highlighted fields.", "err"); form.querySelector("input.bad")?.focus(); return; }
    const btn = document.getElementById("placeB");
    btn.disabled = true; btn.textContent = "Processing payment…";
    try {
      const lines = cartLines(); const totals = cartTotals();
      const pay = await simulatePayment({ method: d.payMethod, amount: totals.total });
      const order = await createOrderApi({
        items: lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price, qty: l.qty, color: l.color, size: l.size, image: l.product.images[0] })),
        totals, customer: { firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone },
        shipping: { address: d.address, city: d.city, zip: d.zip, country: d.country, method: form.querySelector('[name="ship"]:checked').value },
        payment: { method: d.payMethod, id: pay.id },
      });
      clearCart(); updateBadges();
      sessionStorage.setItem("aura_last_order", JSON.stringify(order));
      navigate("/success");
    } catch (err) { toast(err.message || "Payment failed.", "err"); btn.disabled = false; btn.textContent = "Place order"; }
  };
}

export function renderSuccess() {
  let o = null;
  try { o = JSON.parse(sessionStorage.getItem("aura_last_order") || "null"); } catch {}
  if (!o) return `<section class="sec"><div class="empty"><h3>No recent order</h3><p class="muted">Place an order to see confirmation here.</p><div style="margin-top:14px"><a class="btn btn-dark" href="#/shop">Start shopping</a></div></div></section>`;
  return `<section class="sec"><div class="success-hero rv in"><div class="check-dot">${icon("check", 30)}</div>
    <h1 style="font-family:var(--font-disp);font-size:38px;margin:0 0 8px;font-weight:500">Thank you, ${esc(o.customer.firstName)}!</h1>
    <p class="muted">Order <b class="mono">${esc(o.id)}</b> is confirmed. A receipt went to <b>${esc(o.customer.email)}</b>.</p>
    <div class="card-box" style="max-width:560px;margin:22px auto;text-align:left">
      <div class="sum-row"><span>Items</span><span>${o.items.reduce((s, i) => s + i.qty, 0)}</span></div>
      <div class="sum-row"><span>Shipping</span><span>${esc(o.shipping.method)} · ${esc(o.shipping.city)}</span></div>
      <div class="sum-row total"><span>Charged (demo)</span><span>${money(o.totals.total)}</span></div></div>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn btn-dark" href="#/shop">Continue shopping</a><a class="btn btn-outline" href="#/account">View orders</a></div></div></section>`;
}
