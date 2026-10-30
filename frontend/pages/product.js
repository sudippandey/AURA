import { useProductDetails } from "../hooks/useProducts.js";
import { productCard, bindCards, ratingHtml, emptyState } from "../components/product.js";
import { navigate, toast, openModal, closeModal, observeReveals } from "../components/layout.js";
import { money, pctOff, esc, prettyDate } from "../lib/format.js";
import { starRow, icon } from "../lib/icons.js";
import { addToCart, toggleWishlist, isWished, pushRecent, updateBadges, store } from "../store.js";
import { PRODUCTS } from "../mocks/products.js";

export async function renderProduct(slug) {
  const { product: p, related, reviews } = await useProductDetails(slug);
  if (!p) return `<section class="sec">${emptyState({ title: "Product not found", body: "That item may have sold out or moved.", cta: `<a class="btn btn-dark btn-sm" href="#/shop">Back to shop</a>` })}</section>`;
  pushRecent(p.id);
  const off = pctOff(p);
  const recent = store.state.recent.filter((id) => id !== p.id).map((id) => PRODUCTS.find((x) => x.id === id)).filter(Boolean).slice(0, 4);
  const avg = p.rating;
  return `<section class="sec" style="padding-top:30px">
  <nav class="small muted" style="margin-bottom:16px"><a class="link-u" href="#/">Home</a> · <a class="link-u" href="#/shop">Shop</a> · <a class="link-u" href="#/shop?cat=${p.category}">${esc(p.category)}</a> · <b style="color:var(--ink)">${esc(p.name)}</b></nav>
  <div class="pd"><div class="gal">
    <div class="gal-main" id="galMain"><img id="galImg" src="${p.images[0]}" alt="${esc(p.name)}"></div>
    <div class="gal-thumbs">${p.images.map((src, i) => `<img src="${src}" data-th="${i}" class="${i === 0 ? "on" : ""}" alt="View ${i + 1}" loading="lazy">`).join("")}</div>
  </div><div class="pd-info">
    <div class="p-brand">${esc(p.brand)} · ${esc(p.category)}</div><h1>${esc(p.name)}</h1>${ratingHtml(p)}
    <div class="price-row" style="margin:12px 0"><span class="price" style="font-size:28px">${money(p.price)}</span>${p.originalPrice ? `<span class="was" style="font-size:16px">${money(p.originalPrice)}</span><span class="off">Save ${off}%</span>` : ""}</div>
    <p class="muted">${esc(p.description)}</p>
    <div class="${p.stock === 0 ? "stock-low" : p.stock <= 12 ? "stock-low" : "stock-ok"}">${p.stock === 0 ? "Out of stock — back soon" : p.stock <= 12 ? `Only ${p.stock} left in stock` : "In stock, ready to ship"}</div>
    ${(p.colors || []).length ? `<div class="opt-label">Color — <span id="cName">${esc(p.colors[0].name)}</span></div><div class="opt-row" id="cRow">${p.colors.map((c, i) => `<button class="opt${i === 0 ? " on" : ""}" data-c="${esc(c.name)}"><span style="display:inline-block;width:12px;height:12px;border-radius:99px;background:${c.hex};margin-right:7px;vertical-align:-1px"></span>${esc(c.name)}</button>`).join("")}</div>` : ""}
    ${(p.sizes || []).length ? `<div class="opt-label">Size</div><div class="opt-row" id="sRow">${p.sizes.map((s, i) => `<button class="opt${i === 0 ? " on" : ""}" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
    <div class="opt-label">Quantity</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="qty"><button id="qD">−</button><b id="qV">1</b><button id="qI">+</button></div>
    <button class="icon-btn" id="wBtn" aria-label="Wishlist" style="border:1px solid var(--line)">${icon("heart", 18)}</button></div>
    <div class="buy-row"><button class="btn btn-dark" id="addB" ${p.stock === 0 ? "disabled" : ""}>Add to cart · <span id="addT">${money(p.price)}</span></button>
    <button class="btn btn-outline" id="buyB" ${p.stock === 0 ? "disabled" : ""}>Buy now</button></div>
    <div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap" class="small muted"><span style="display:flex;gap:6px;align-items:center">${icon("truck", 15)} Free shipping $75+</span><span style="display:flex;gap:6px;align-items:center">${icon("refresh", 15)} 60-day returns</span><span style="display:flex;gap:6px;align-items:center">${icon("shield", 15)} 2-year warranty</span></div>
    <div class="tabs"><button class="on" data-t="d">Details</button><button data-t="s">Specifications</button><button data-t="r">Shipping & returns</button></div>
    <div id="tab-d"><table class="spec-t" style="margin-top:14px"><tr><td>Brand</td><td>${esc(p.brand)}</td></tr><tr><td>Category</td><td>${esc(p.category)}</td></tr><tr><td>SKU</td><td>${esc(p.id.toUpperCase())}</td></tr></table></div>
    <div id="tab-s" hidden><table class="spec-t" style="margin-top:14px">${Object.entries(p.specifications || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table></div>
    <div id="tab-r" hidden><div class="card-box" style="margin-top:14px"><p class="small"><b>Shipping.</b> Standard (4–6 days) $6.95, free over $75 · Express (2–3 days) $14.95 · Overnight $24.95. Dispatched within 24h from our Copenhagen warehouse.</p><p class="small"><b>Returns.</b> 60 days, free return label, refund within 3 business days of arrival. Lifetime repairs on leather & hardware.</p></div></div>
  </div></div>
  <div class="sec" style="padding-left:0;padding-right:0"><div class="sec-head"><div><h2>Reviews</h2><p>${avg.toFixed(1)} average · ${p.reviewCount.toLocaleString()} verified ratings</p></div></div>
    ${(reviews || []).map((r) => `<div class="rev"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(r.author)}</b><span class="small muted">${prettyDate(r.date)}${r.verified ? " · Verified buyer" : ""}</span></div><div style="margin:6px 0">${starRow(r.rating, 14)} <b class="small">${esc(r.title)}</b></div><p class="small muted" style="margin:0">${esc(r.body)}</p></div>`).join("")}
  </div>
  ${related?.length ? `<div class="sec" style="padding-left:0;padding-right:0"><div class="sec-head"><div><h2>You may also like</h2></div><a class="see-all" href="#/shop?cat=${p.category}">More ${esc(p.category)}</a></div><div class="p-grid four" data-bind>${related.map(productCard).join("")}</div></div>` : ""}
  ${recent.length ? `<div class="sec" style="padding-left:0;padding-right:0"><div class="sec-head"><div><h2>Recently viewed</h2></div></div><div class="p-grid four" data-bind>${recent.map(productCard).join("")}</div></div>` : ""}
  </section>`;
}

export function mountProduct(slug) {
  bindCards(document); observeReveals();
  const main = document.getElementById("galMain"), img = document.getElementById("galImg");
  document.querySelectorAll("[data-th]").forEach((t) => (t.onclick = () => {
    document.querySelectorAll("[data-th]").forEach((x) => x.classList.remove("on")); t.classList.add("on");
    img.src = t.src;
  }));
  // click-to-zoom lightbox
  main.onclick = () => {
    const s = openModal(`<div class="modal-head"><b>Zoom</b><button class="icon-btn" data-close>${icon("x")}</button></div><img src="${img.src}" style="width:100%" alt="Zoomed product">`, { wide: true });
  };
  main.onmousemove = (e) => {
    const r = main.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };
  main.onmouseenter = () => { img.style.transform = "scale(1.6)"; img.style.transition = "transform .2s"; };
  main.onmouseleave = () => { img.style.transform = "none"; };
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("on")); b.classList.add("on");
    ["d", "s", "r"].forEach((k) => (document.getElementById("tab-" + k).hidden = k !== b.dataset.t));
  }));
  // need product for actions — read from rendered page via slug lookup
  import("../mocks/products.js").then(({ PRODUCTS }) => {
    const p = PRODUCTS.find((x) => x.slug === slug || x.id === slug);
    if (!p) return;
    let color = (p.colors || [])[0]?.name || null, size = (p.sizes || [])[0] || null, qty = 1;
    const paint = () => {
      document.querySelectorAll("#cRow .opt").forEach((x) => x.classList.toggle("on", x.dataset.c === color));
      document.querySelectorAll("#sRow .opt").forEach((x) => x.classList.toggle("on", x.dataset.s === size));
      document.getElementById("qV").textContent = qty;
      document.getElementById("addT").textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p.price * qty);
      const cn = document.getElementById("cName"); if (cn) cn.textContent = color || "";
    };
    document.querySelectorAll("#cRow .opt").forEach((x) => (x.onclick = () => { color = x.dataset.c; paint(); }));
    document.querySelectorAll("#sRow .opt").forEach((x) => (x.onclick = () => { size = x.dataset.s; paint(); }));
    document.getElementById("qD").onclick = () => { qty = Math.max(1, qty - 1); paint(); };
    document.getElementById("qI").onclick = () => { qty = Math.min(p.stock || 9, qty + 1); paint(); };
    const w = document.getElementById("wBtn");
    const syncW = () => { w.style.background = isWished(p.id) ? "#141414" : ""; w.style.color = isWished(p.id) ? "#fff" : ""; };
    syncW(); w.onclick = () => { const on = toggleWishlist(p.id); syncW(); updateBadges(); toast(on ? "Saved to wishlist." : "Removed from wishlist.", on ? "ok" : "info"); };
    document.getElementById("addB").onclick = () => {
      const r = addToCart(p.id, qty, color, size);
      if (!r.ok) { toast(r.message, "err"); return; }
      updateBadges(); toast("Added to cart.", "ok");
    };
    document.getElementById("buyB").onclick = () => {
      const r = addToCart(p.id, qty, color, size);
      if (!r.ok) { toast(r.message, "err"); return; }
      updateBadges(); navigate("/checkout");
    };
    paint();
  });
}
