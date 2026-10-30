// Shared chrome: header, footer, toasts, modal, badges, newsletter, reveal.
import { icon } from "../lib/icons.js";
import { esc } from "../lib/format.js";
import { cartCount, store, updateBadges } from "../store.js";
export { updateBadges };

export function navigate(path) {
  const p = path.startsWith("/") ? path : "/" + path;
  if (window.__auraGo) window.__auraGo(p);
  else location.hash = "#" + p;
}
export function link(path) { return "#" + path; }

export function toast(msg, type = "info") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `<span>${icon(type === "err" ? "x" : type === "ok" ? "check" : "spark", 16)}</span><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 2800);
}

export function openModal(html, { wide = false } = {}) {
  closeModal();
  const scrim = document.createElement("div");
  scrim.className = "scrim"; scrim.id = "scrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true"${wide ? ' style="max-width:1000px"' : ""}>${html}</div>`;
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeModal(); });
  document.body.appendChild(scrim);
  document.body.style.overflow = "hidden";
  const c = scrim.querySelector("[data-close]");
  if (c) c.onclick = closeModal;
  return scrim;
}
export function closeModal() {
  document.getElementById("scrim")?.remove();
  document.body.style.overflow = "";
}
export function confirmDialog({ title, body, okLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const s = openModal(`<div style="padding:28px"><h3 style="margin:0 0 8px;font-family:var(--font-disp);font-size:24px">${esc(title)}</h3>
      <p class="muted" style="margin:0 0 22px">${esc(body)}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-outline btn-sm" data-x>Cancel</button>
      <button class="btn btn-sm ${danger ? "" : "btn-dark"}" data-ok style="${danger ? "background:#a33b2e;border-color:#a33b2e;color:#fff" : ""}">${esc(okLabel)}</button></div></div>`);
    s.querySelector("[data-x]").onclick = () => { closeModal(); resolve(false); };
    s.querySelector("[data-ok]").onclick = () => { closeModal(); resolve(true); };
  });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });

export function openDrawer(html) {
  closeDrawer();
  const d = document.createElement("div");
  d.id = "drawer"; d.className = "drawer";
  d.innerHTML = html;
  const scrim = document.createElement("div");
  scrim.id = "drawer-scrim"; scrim.className = "scrim"; scrim.style.justifyContent = "flex-end"; scrim.style.padding = "0";
  scrim.appendChild(d);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeDrawer(); });
  document.body.appendChild(scrim);
  document.body.style.overflow = "hidden";
  return d;
}
export function closeDrawer() { document.getElementById("drawer-scrim")?.remove(); if (!document.getElementById("scrim")) document.body.style.overflow = ""; }

export function shell(viewHtml) {
  return `
  <div class="announce">Complimentary shipping on orders over $75 &nbsp;·&nbsp; <b>WELCOME10</b> for 10% off</div>
  <header class="site-head"><div class="head-in">
    <button class="icon-btn hamb" id="hambBtn" aria-label="Open menu">${icon("menu")}</button>
    <a class="brand" href="#/" aria-label="AURA home">AURA<sup>®</sup></a>
    <nav class="nav" id="mainNav" aria-label="Primary">
      <a href="#/" data-r="home">Home</a><a href="#/shop" data-r="shop">Shop</a>
      <a href="#/shop?cat=watches" data-r="watches">Watches</a><a href="#/shop?cat=apparel" data-r="apparel">Apparel</a>
      <a href="#/about" data-r="about">About</a>
    </nav>
    <div class="head-tools">
      <div class="search-pop"><input id="headSearch" type="search" placeholder="Search products…" aria-label="Search products"><button id="headGo" aria-label="Search">${icon("search", 16)}</button></div>
      <a class="icon-btn" href="#/wishlist" aria-label="Wishlist">${icon("heart")}<span class="count-b" id="wishB" hidden></span></a>
      <a class="icon-btn" href="#/cart" aria-label="Cart">${icon("bag")}<span class="count-b" id="cartB" hidden></span></a>
      <a class="icon-btn" href="#/account" aria-label="Account" id="acctBtn">${icon("user")}</a>
    </div>
  </div></header>
  <main id="view">${viewHtml || ""}</main>
  <footer class="site"><div class="foot-in">
    <div><div class="foot-brand">AURA</div><p class="small" style="color:#a09a8c;max-width:30ch">Considered essentials for a life well-lived. Designed in Copenhagen, worn everywhere.</p></div>
    <div><h4>Shop</h4><a href="#/shop">All products</a><a href="#/shop?cat=audio">Audio</a><a href="#/shop?cat=watches">Watches</a><a href="#/shop?cat=home">Home</a><a href="#/shop?cat=apparel">Apparel</a><a href="#/wishlist">Wishlist</a></div>
    <div><h4>Company</h4><a href="#/about">About us</a><a href="#/contact">Contact</a><a href="#/faq">FAQ</a><a href="#/shipping">Shipping</a><a href="#/returns">Returns</a></div>
    <div><h4>Legal</h4><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/account">Account</a><a href="#/checkout">Checkout</a></div>
  </div><div class="foot-base"><span>© 2026 AURA Studio. Demo storefront — payments simulated.</span><span>Visa · Mastercard · Amex · PayPal · Apple Pay</span></div></footer>`;
}

export function afterShell() {
  const go = () => {
    const q = document.getElementById("headSearch")?.value.trim() || "";
    navigate("/shop" + (q ? "?q=" + encodeURIComponent(q) : ""));
  };
  document.getElementById("headGo").onclick = go;
  document.getElementById("headSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  document.getElementById("hambBtn").onclick = () => {
    const d = openDrawer(`<div class="drawer-head"><b>AURA®</b><button class="icon-btn" data-dx aria-label="Close menu">${icon("x")}</button></div>
      <div style="padding:6px 18px 24px"><form data-msearch style="display:flex;gap:8px;margin-bottom:10px"><input type="search" placeholder="Search products…" aria-label="Search products" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:11px 12px;min-width:0"><button class="btn btn-dark btn-sm" type="submit">Go</button></form>
      <div style="display:flex;flex-direction:column;font-size:17px;font-weight:600">
      ${[["Home", "#/"], ["Shop all", "#/shop"], ["Audio", "#/shop?cat=audio"], ["Watches", "#/shop?cat=watches"], ["Home", "#/shop?cat=home"], ["Apparel", "#/shop?cat=apparel"], ["Footwear", "#/shop?cat=footwear"], ["Skincare", "#/shop?cat=skincare"], ["Wishlist", "#/wishlist"], ["Account", "#/account"], ["About", "#/about"], ["Contact", "#/contact"]].map(([t, h]) => `<a href="${h}" style="padding:11px 4px;border-bottom:1px solid var(--line-soft)">${t}</a>`).join("")}</div></div>`);
    d.querySelector("[data-dx]").onclick = closeDrawer;
    d.querySelector("[data-msearch]").onsubmit = (e) => { e.preventDefault(); const q = e.target.querySelector("input").value.trim(); closeDrawer(); navigate("/shop" + (q ? "?q=" + encodeURIComponent(q) : "")); };
    d.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeDrawer));
  };
  store.sub(updateBadges); updateBadges();
}
export function setActiveNav(route) {
  document.querySelectorAll("#mainNav a").forEach((a) => a.classList.toggle("on", a.dataset.r === route));
}
let io = null;
export function observeReveals() {
  if (io) io.disconnect();
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));
}
export function newsletterBlock() {
  return `<section class="sec"><div class="news rv"><div><h2>Get 10% off your first order</h2><p>Join the list for early drops, private sales and zero spam. Unsubscribe anytime.</p></div>
    <form data-news novalidate><input type="email" placeholder="Email address" aria-label="Email address" required><button class="btn btn-light" type="submit">Subscribe</button></form></div></section>`;
}
export function bindNewsletters(root = document) {
  root.querySelectorAll("[data-news]").forEach((f) => {
    f.onsubmit = (e) => {
      e.preventDefault();
      const em = f.querySelector("input").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { toast("Please enter a valid email.", "err"); return; }
      f.reset(); toast("Welcome aboard — code WELCOME10 is yours.", "ok");
    };
  });
}
