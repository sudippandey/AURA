import { getProducts } from "../services/api/productApi.js";
import { getCategories } from "../services/api/categoryApi.js";
import { productCard, bindCards, cardSkeletons, emptyState } from "../components/product.js";
import { navigate, toast, observeReveals } from "../components/layout.js";
import { BRANDS, ALL_COLORS, ALL_SIZES } from "../mocks/products.js";
import { money, esc } from "../lib/format.js";
import { icon } from "../lib/icons.js";
import { CONFIG } from "../config.js";

const SORTS = [["featured", "Featured"], ["newest", "Newest"], ["price-asc", "Price: Low to High"], ["price-desc", "Price: High to Low"], ["bestselling", "Best Selling"], ["rating", "Highest Rated"]];

export function parseShopQuery(hash) {
  const q = (hash.split("?")[1] || "");
  const sp = new URLSearchParams(q);
  return {
    q: sp.get("q") || "", cat: sp.get("cat") || "", sort: sp.get("sort") || "featured", page: Number(sp.get("page") || 1),
    brands: sp.get("brands") ? sp.get("brands").split(",") : [], min: Number(sp.get("min") || 0), max: Number(sp.get("max") || 1500),
    rating: Number(sp.get("rating") || 0), stock: sp.get("stock") === "1",
    colors: sp.get("colors") ? sp.get("colors").split(",") : [], sizes: sp.get("sizes") ? sp.get("sizes").split(",") : [],
  };
}
function toQuery(s) {
  const sp = new URLSearchParams();
  if (s.q) sp.set("q", s.q); if (s.cat) sp.set("cat", s.cat); if (s.sort !== "featured") sp.set("sort", s.sort);
  if (s.page > 1) sp.set("page", s.page); if (s.brands.length) sp.set("brands", s.brands.join(","));
  if (s.min > 0) sp.set("min", s.min); if (s.max < 1500) sp.set("max", s.max);
  if (s.rating) sp.set("rating", s.rating); if (s.stock) sp.set("stock", "1");
  if (s.colors.length) sp.set("colors", s.colors.join(",")); if (s.sizes.length) sp.set("sizes", s.sizes.join(","));
  const str = sp.toString(); return str ? "?" + str : "";
}

export async function renderShop(state) {
  const cats = await getCategories();
  const filters = {
    category: state.cat, brands: state.brands, minPrice: state.min, maxPrice: state.max,
    minRating: state.rating, inStock: state.stock, colors: state.colors, sizes: state.sizes,
  };
  const res = await getProducts({ page: state.page, limit: CONFIG.PAGE_SIZE, sort: state.sort, filters, search: state.q });
  const chips = [];
  if (state.q) chips.push(["q", `“${state.q}”`]); if (state.cat) chips.push(["cat", cats.find((c) => c.id === state.cat)?.name || state.cat]);
  state.brands.forEach((b) => chips.push(["b:" + b, b]));
  if (state.min > 0 || state.max < 1500) chips.push(["price", `$${state.min}–$${state.max}`]);
  if (state.rating) chips.push(["rating", `${state.rating}★+`]); if (state.stock) chips.push(["stock", "In stock"]);
  state.colors.forEach((c) => chips.push(["c:" + c, c])); state.sizes.forEach((s) => chips.push(["s:" + s, "Size " + s]));

  const grid = res.items.length ? res.items.map(productCard).join("") : emptyState({ title: "No products found", body: "Try widening your filters or search — or clear everything and start fresh.", cta: `<button class="btn btn-dark btn-sm" data-clear>Clear all filters</button>` });
  return `
  <section class="sec" style="padding-top:34px"><h1 style="font-family:var(--font-disp);font-size:38px;margin:0 0 6px;font-weight:500">Shop all</h1>
  <p class="muted" style="margin:0 0 22px">${res.total} product${res.total === 1 ? "" : "s"}${state.q ? ` for “${esc(state.q)}”` : ""}</p>
  <div class="shop-layout"><aside class="filters" id="filterBox">
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Filters</h3><button class="link-u small" data-clear style="border:0;background:none">Clear all</button></div>
    <div class="f-group"><h5>Search</h5><input type="search" id="fQ" value="${esc(state.q)}" placeholder="Search…" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px"></div>
    <div class="f-group"><h5>Category</h5>${cats.map((c) => `<label class="f-check"><input type="checkbox" data-fcat="${c.id}" ${state.cat === c.id ? "checked" : ""}> ${esc(c.name)} <span class="muted small">(${c.productCount})</span></label>`).join("")}</div>
    <div class="f-group"><h5>Price</h5><div style="display:flex;gap:8px"><input type="number" id="fMin" value="${state.min}" min="0" max="1500" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px"><input type="number" id="fMax" value="${state.max}" min="0" max="1500" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px"></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${[["0,100", "Under $100"], ["100,250", "$100–250"], ["250,1500", "$250+"]].map(([v, l]) => `<button class="size" data-price="${v}">${l}</button>`).join("")}</div></div>
    <div class="f-group"><h5>Brand</h5>${BRANDS.map((b) => `<label class="f-check"><input type="checkbox" data-fbrand="${esc(b)}" ${state.brands.includes(b) ? "checked" : ""}> ${esc(b)}</label>`).join("")}</div>
    <div class="f-group"><h5>Rating</h5>${[4, 3, 0].map((r) => `<label class="f-check"><input type="radio" name="fr" data-frate="${r}" ${state.rating === r ? "checked" : ""}> ${r === 0 ? "Any rating" : r + "★ & up"}</label>`).join("")}</div>
    <div class="f-group"><h5>Availability</h5><label class="f-check"><input type="checkbox" data-fstock ${state.stock ? "checked" : ""}> In stock only</label></div>
    <div class="f-group"><h5>Color</h5><div class="f-swatches">${ALL_COLORS.map((c) => `<button class="sw${state.colors.includes(c.name) ? " on" : ""}" title="${c.name}" data-fcolor="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`).join("")}</div></div>
    <div class="f-group"><h5>Size</h5><div class="size-row">${ALL_SIZES.map((s) => `<button class="size${state.sizes.includes(s) ? " on" : ""}" data-fsize="${s}">${s}</button>`).join("")}</div></div>
    <button class="btn btn-dark btn-sm" data-apply style="width:100%;margin-top:6px">Apply filters</button>
  </aside>
  <div><div class="toolbar">
    <button class="btn btn-outline btn-sm" id="mobF">${icon("filter", 15)} Filters</button>
    <span class="muted small">Showing ${res.items.length} of ${res.total}</span>
    <select id="sortS" aria-label="Sort products">${SORTS.map(([v, l]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
  </div>
  ${chips.length ? `<div class="chips">${chips.map(([k, l]) => `<span class="chip">${esc(l)}<button data-chip="${esc(k)}" aria-label="Remove">✕</button></span>`).join("")}</div>` : ""}
  <div class="p-grid" id="shopGrid" data-bind>${grid}</div>
  ${res.pages > 1 ? `<div class="pager">${Array.from({ length: res.pages }, (_, i) => `<button class="${state.page === i + 1 ? "on" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("")}</div>` : ""}
  </div></div></section>`;
}

export function mountShop(state) {
  const reroute = (patch) => navigate("/shop" + toQuery({ ...state, page: 1, ...patch }));
  bindCards(document); observeReveals();
  const box = document.getElementById("filterBox");
  const collect = () => ({
    brands: [...box.querySelectorAll("[data-fbrand]:checked")].map((x) => x.dataset.fbrand),
    min: Number(box.querySelector("#fMin").value || 0), max: Number(box.querySelector("#fMax").value || 1500),
    rating: Number(box.querySelector("[data-frate]:checked")?.dataset.frate || 0),
    stock: box.querySelector("[data-fstock]").checked,
    colors: [...box.querySelectorAll("[data-fcolor].on")].map((x) => x.dataset.fcolor),
    sizes: [...box.querySelectorAll("[data-fsize].on")].map((x) => x.dataset.fsize),
    q: box.querySelector("#fQ").value.trim(),
    cat: box.querySelector("[data-fcat]:checked")?.dataset.fcat || "",
  });
  box.querySelector("[data-apply]").onclick = () => reroute(collect());
  box.querySelector("#fQ").addEventListener("keydown", (e) => { if (e.key === "Enter") reroute(collect()); });
  box.querySelectorAll("[data-fcat]").forEach((c) => (c.onchange = () => {
    box.querySelectorAll("[data-fcat]").forEach((x) => { if (x !== c) x.checked = false; });
    reroute({ ...collect(), cat: c.checked ? c.dataset.fcat : "" });
  }));
  box.querySelectorAll("[data-price]").forEach((b) => (b.onclick = () => { const [a, z] = b.dataset.price.split(",").map(Number); box.querySelector("#fMin").value = a; box.querySelector("#fMax").value = z; reroute(collect()); }));
  box.querySelectorAll("[data-fcolor]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); b.classList.toggle("on"); }));
  box.querySelectorAll("[data-fsize]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); b.classList.toggle("on"); }));
  document.querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => navigate("/shop")));
  document.querySelectorAll("[data-chip]").forEach((b) => (b.onclick = () => {
    const k = b.dataset.chip; const s = { ...state };
    if (k === "q") s.q = ""; else if (k === "cat") s.cat = ""; else if (k === "price") { s.min = 0; s.max = 1500; }
    else if (k === "rating") s.rating = 0; else if (k === "stock") s.stock = false;
    else if (k.startsWith("b:")) s.brands = s.brands.filter((x) => x !== k.slice(2));
    else if (k.startsWith("c:")) s.colors = s.colors.filter((x) => x !== k.slice(2));
    else if (k.startsWith("s:")) s.sizes = s.sizes.filter((x) => x !== k.slice(2));
    s.page = 1; navigate("/shop" + toQuery(s));
  }));
  document.querySelectorAll("[data-page]").forEach((b) => (b.onclick = () => navigate("/shop" + toQuery({ ...state, page: Number(b.dataset.page) }))));
  document.getElementById("sortS").onchange = (e) => navigate("/shop" + toQuery({ ...state, sort: e.target.value, page: 1 }));
  const mobF = document.getElementById("mobF");
  if (mobF) mobF.onclick = () => {
    const f = document.getElementById("filterBox");
    const hidden = f.style.display === "none";
    f.style.display = hidden ? "" : "none";
    if (hidden) f.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}
