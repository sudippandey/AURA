import { store, toggleWishlist, addToCart, updateBadges, logout, setSession } from "../store.js";
import { productCard, bindCards, emptyState } from "../components/product.js";
import { navigate, toast, confirmDialog, observeReveals } from "../components/layout.js";
import { money, esc, prettyDate } from "../lib/format.js";
import { validateAddress } from "../lib/validation.js";
import { icon } from "../lib/icons.js";
import { PRODUCTS } from "../mocks/products.js";

export function renderWishlist() {
  const items = store.state.wishlist.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
  return `<section class="sec"><h1 style="font-family:var(--font-disp);font-size:36px;margin:0 0 4px;font-weight:500">Wishlist (${items.length})</h1>
  <p class="muted" style="margin:0 0 20px">Saved across visits on this device.</p>
  ${items.length ? `<div class="p-grid four" data-bind>${items.map(productCard).join("")}</div>` : emptyState({ iconName: "heart", title: "Nothing saved yet", body: "Tap the heart on any product to keep it here.", cta: `<a class="btn btn-dark" href="#/shop">Discover products</a>` })}</section>`;
}
export function mountWishlist() { bindCards(document); observeReveals(); }

export function renderAccount(tab = "profile") {
  const u = store.state.user;
  if (!u) return `<section class="sec"><div class="auth-wrap rv in" style="text-align:center"><h1 style="font-family:var(--font-disp);font-size:30px">Your account</h1><p class="muted">Log in to see orders, addresses and faster checkout.</p><div style="display:flex;gap:10px;justify-content:center"><a class="btn btn-dark btn-sm" href="#/login">Log in</a><a class="btn btn-outline btn-sm" href="#/register">Register</a></div></div></section>`;
  let orders = [];
  try {
    const savedOrders = JSON.parse(localStorage.getItem("aura_orders") || "[]");
    if (Array.isArray(savedOrders)) orders = savedOrders;
  } catch {}
  const tabs = [["profile", "Profile"], ["addresses", `Addresses (${store.state.addresses.length})`], ["orders", `Orders (${orders.length})`], ["wishlist", `Wishlist (${store.state.wishlist.length})`]];
  let body = "";
  if (tab === "profile") body = `<div class="card-box"><h3>Account information</h3><form id="profF"><div class="field"><label>Full name</label><input name="name" value="${esc(u.name || "")}"></div><div class="field"><label>Email</label><input value="${esc(u.email || "")}" disabled><div class="small muted">Email can't be changed in demo.</div></div><button class="btn btn-dark btn-sm" type="submit">Save changes</button></form>
    <div style="margin-top:18px"><button class="btn btn-outline btn-sm" id="outB">${icon("logout", 15)} Log out</button></div></div>`;
  if (tab === "addresses") body = `<div class="card-box"><h3>Saved addresses</h3><div id="addrL">${store.state.addresses.length ? store.state.addresses.map((a, i) => `<div class="rev" style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>${esc(a.label)}</b><div class="small muted">${esc(a.address)}, ${esc(a.city)} ${esc(a.zip)}</div></div><div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" data-adel="${i}">Delete</button></div></div>`).join("") : `<p class="muted small">No addresses yet — add one for faster checkout.</p>`}</div>
    <h3 style="margin-top:18px">Add address</h3><form id="addrF"><div class="form-2"><div class="field"><label>Label</label><input name="label" placeholder="Home"><div class="err" data-e="label"></div></div><div class="field"><label>ZIP</label><input name="zip"><div class="err" data-e="zip"></div></div></div><div class="field"><label>Street</label><input name="address"><div class="err" data-e="address"></div></div><div class="field"><label>City</label><input name="city"><div class="err" data-e="city"></div></div><button class="btn btn-dark btn-sm" type="submit">Save address</button></form></div>`;
  if (tab === "orders") body = orders.length ? orders.map((o) => `<div class="card-box"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><b class="mono">${esc(o.id)}</b><span class="small muted">${prettyDate(o.createdAt)} · ${esc(o.status)}</span></div><div style="display:flex;gap:10px;margin:12px 0;flex-wrap:wrap">${o.items.map((i) => `<img src="${i.image}" alt="" title="${esc(i.name)} × ${i.qty}" style="width:56px;height:56px;border-radius:10px;object-fit:cover">`).join("")}</div><div class="sum-row total"><span>Total</span><span>${money(o.totals.total)}</span></div></div>`).join("") : emptyState({ iconName: "box", title: "No orders yet", body: "Your order history will live here.", cta: `<a class="btn btn-dark btn-sm" href="#/shop">Start shopping</a>` });
  if (tab === "wishlist") {
    const items = store.state.wishlist.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
    body = items.length ? `<div class="p-grid" data-bind>${items.map(productCard).join("")}</div>` : emptyState({ iconName: "heart", title: "Wishlist is empty", body: "Hearts you tap will appear here.", cta: `<a class="btn btn-dark btn-sm" href="#/shop">Discover</a>` });
  }
  return `<section class="sec"><h1 style="font-family:var(--font-disp);font-size:34px;margin:0 0 4px;font-weight:500">Hi, ${esc(u.name.split(" ")[0])}</h1><p class="muted" style="margin:0 0 20px">${esc(u.email)}</p>
  <div class="acct"><nav class="acct-nav">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</nav><div>${body}</div></div></section>`;
}

export function mountAccount(tab = "profile") {
  bindCards(document); observeReveals();
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => navigate("/account" + (b.dataset.tab === "profile" ? "" : "/" + b.dataset.tab))));
  const prof = document.getElementById("profF");
  if (prof) prof.onsubmit = (e) => {
    e.preventDefault();
    const name = prof.querySelector('[name="name"]').value.trim();
    if (name.length < 2) { toast("Please enter your name.", "err"); return; }
    const u = { ...store.state.user, name }; setSession(u, localStorage.getItem("aura_token"));
    toast("Profile updated.", "ok"); navigate("/account");
  };
  const out = document.getElementById("outB");
  if (out) out.onclick = async () => { if (await confirmDialog({ title: "Log out?", body: "You'll need to log back in to see orders.", okLabel: "Log out" })) { logout(); updateBadges(); toast("Logged out.", "info"); navigate("/"); } };
  const af = document.getElementById("addrF");
  if (af) af.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(af).entries());
    const errs = validateAddress(d);
    af.querySelectorAll("[data-e]").forEach((x) => (x.textContent = ""));
    Object.entries(errs).forEach(([k, m]) => { af.querySelector(`[data-e="${k}"]`).textContent = m; });
    if (Object.keys(errs).length) return;
    store.set({ addresses: [...store.state.addresses, d] });
    toast("Address saved.", "ok"); navigate("/account/addresses");
  };
  document.querySelectorAll("[data-adel]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "Delete address?", body: "This can't be undone.", okLabel: "Delete", danger: true }))) return;
    store.set({ addresses: store.state.addresses.filter((_, i) => i !== Number(b.dataset.adel)) });
    navigate("/account/addresses");
  }));
}
