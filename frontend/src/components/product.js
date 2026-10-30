// Product card, rating, skeletons, quick-view modal.
import { money, pctOff, esc } from "../lib/format.js";
import { icon, starRow } from "../lib/icons.js";
import { openModal, closeModal, toast, navigate } from "./layout.js";
import { addToCart, toggleWishlist, isWished, updateBadges } from "../store/store.js";

export function ratingHtml(p) {
  return `<span class="stars">${starRow(p.rating)}<span>${p.rating.toFixed(1)} (${p.reviewCount.toLocaleString()})</span></span>`;
}
export function badges(p) {
  const b = [];
  const off = pctOff(p);
  if (off > 0) b.push(`<span class="badge sale">−${off}%</span>`);
  if ((p.tags || []).includes("new")) b.push(`<span class="badge new">New</span>`);
  if (p.stock === 0) b.push(`<span class="badge low">Sold out</span>`);
  else if (p.stock <= 12) b.push(`<span class="badge low">Only ${p.stock} left</span>`);
  return b.length ? `<div class="badge-row">${b.join("")}</div>` : "";
}
export function productCard(p) {
  const wished = isWished(p.id) ? " on" : "";
  return `<article class="p-card rv" data-card="${p.id}">
    <div class="p-media" data-goto="/product/${p.slug}">
      <img src="${p.images[0]}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${p.images[0]}&sat=-100'">
      ${badges(p)}
      <button class="heart${wished}" data-wish="${p.id}" aria-label="Toggle wishlist">${icon("heart", 17)}</button>
      <div class="quick"><button class="qa" data-add="${p.id}" ${p.stock === 0 ? "disabled" : ""}>${p.stock === 0 ? "Sold out" : "Add to cart"}</button><button class="qv" data-qv="${p.id}">Quick view</button></div>
    </div>
    <div class="p-body"><div class="p-brand">${esc(p.brand)} · ${esc(p.category)}</div>
      <div class="p-name" data-goto="/product/${p.slug}">${esc(p.name)}</div>${ratingHtml(p)}
      <div class="price-row"><span class="price">${money(p.price)}</span>${p.originalPrice ? `<span class="was">${money(p.originalPrice)}</span><span class="off">Save ${money(p.originalPrice - p.price)}</span>` : ""}</div>
    </div></article>`;
}
export function bindCards(root = document) {
  root.querySelectorAll("[data-goto]").forEach((el) => {
    el.onclick = (e) => { if (e.target.closest("[data-wish],[data-add],[data-qv]")) return; navigate(el.dataset.goto); };
  });
  root.querySelectorAll("[data-wish]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const added = toggleWishlist(b.dataset.wish);
      b.classList.toggle("on", added); updateBadges();
      toast(added ? "Saved to wishlist." : "Removed from wishlist.", added ? "ok" : "info");
    };
  });
  root.querySelectorAll("[data-add]").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const r = addToCart(b.dataset.add, 1);
      if (!r.ok) { toast(r.message || "Couldn't add to cart.", "err"); return; }
      updateBadges(); toast("Added to cart.", "ok");
    };
  });
  root.querySelectorAll("[data-qv]").forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); quickView(b.dataset.qv); };
  });
}
export async function quickView(id) {
  const { getProductById } = await import("../services/api/productApi.js");
  const p = await getProductById(id);
  if (!p) { toast("Product not found.", "err"); return; }
  let color = (p.colors || [])[0]?.name || null, size = (p.sizes || [])[0] || null, qty = 1;
  const s = openModal(`<div class="modal-head"><b>${esc(p.name)}</b><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="qv-grid"><img src="${p.images[0]}" alt="${esc(p.name)}">
    <div class="qv-info"><div class="p-brand">${esc(p.brand)}</div>
      <div class="price-row" style="margin:8px 0"><span class="price" style="font-size:22px">${money(p.price)}</span>${p.originalPrice ? `<span class="was">${money(p.originalPrice)}</span>` : ""}</div>
      ${ratingHtml(p)}
      <p class="muted small" style="margin:12px 0">${esc(p.description.slice(0, 160))}…</p>
      ${(p.colors || []).length ? `<div class="opt-label">Color</div><div class="opt-row" data-c>${p.colors.map((c, i) => `<button class="opt${i === 0 ? " on" : ""}" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      ${(p.sizes || []).length ? `<div class="opt-label">Size</div><div class="opt-row" data-s>${p.sizes.map((z, i) => `<button class="opt${i === 0 ? " on" : ""}" data-v="${esc(z)}">${esc(z)}</button>`).join("")}</div>` : ""}
      <div style="display:flex;gap:10px;margin-top:18px"><div class="qty"><button data-d="-1">−</button><b data-q>1</b><button data-d="1">+</button></div>
      <button class="btn btn-dark" data-go style="flex:1">Add to cart</button></div>
      <button class="btn btn-outline btn-sm" data-full style="width:100%;margin-top:10px">View full details</button>
    </div></div>`);
  const paint = () => {
    s.querySelectorAll("[data-c] .opt").forEach((b) => b.classList.toggle("on", b.dataset.v === color));
    s.querySelectorAll("[data-s] .opt").forEach((b) => b.classList.toggle("on", b.dataset.v === size));
    s.querySelector("[data-q]").textContent = qty;
  };
  s.querySelectorAll("[data-c] .opt").forEach((b) => (b.onclick = () => { color = b.dataset.v; paint(); }));
  s.querySelectorAll("[data-s] .opt").forEach((b) => (b.onclick = () => { size = b.dataset.v; paint(); }));
  s.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { qty = Math.max(1, Math.min(p.stock || 9, qty + Number(b.dataset.d))); paint(); }));
  s.querySelector("[data-go]").onclick = () => {
    const r = addToCart(p.id, qty, color, size);
    if (!r.ok) { toast(r.message || "Couldn't add.", "err"); return; }
    updateBadges(); closeModal(); toast("Added to cart.", "ok");
  };
  s.querySelector("[data-full]").onclick = () => { closeModal(); navigate("/product/" + p.slug); };
  paint();
}
export function cardSkeletons(n = 6) {
  return Array.from({ length: n }, () => `<div class="p-card"><div class="sk" style="aspect-ratio:1/1"></div><div style="padding:14px;display:grid;gap:8px"><div class="sk" style="height:12px;width:40%"></div><div class="sk" style="height:16px"></div><div class="sk" style="height:14px;width:60%"></div></div></div>`).join("");
}
export function emptyState({ iconName = "box", title, body, cta }) {
  return `<div class="empty"><div style="display:inline-flex;background:var(--sand);border-radius:999px;padding:16px">${icon(iconName, 26)}</div><h3>${title}</h3><p class="muted">${body}</p><div style="margin-top:16px">${cta || ""}</div></div>`;
}
