import { getFeaturedProducts, getTrendingProducts, getBestSellers, getNewArrivals } from "../api/productApi.js";
import { getCategories } from "../api/categoryApi.js";
import { productCard, bindCards, ratingHtml } from "../components/product.js";
import { newsletterBlock, bindNewsletters, observeReveals } from "../components/layout.js";
import { money, esc } from "../lib/format.js";

const HERO_IMG = "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80";
const EDIT_IMG = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80";

export async function renderHome() {
  const [cats, trending, best, fresh, featured] = await Promise.all([
    getCategories(), getTrendingProducts(4), getBestSellers(4), getNewArrivals(4), getFeaturedProducts(8),
  ]);
  return `
  <section class="hero"><div class="hero-copy rv">
    <div class="hero-kick">New season · Fall 2026</div>
    <h1>Considered essentials, built for decades.</h1>
    <p>Audio, watches, home and wardrobe staples — designed in Copenhagen, rated 4.6★ by 20,000+ customers, backed by lifetime repairs.</p>
    <div class="hero-cta"><a class="btn btn-light" href="#/shop">Shop best sellers</a><a class="btn btn-ghost" href="#/shop?sort=newest">New arrivals</a></div>
  </div><div class="hero-media rv"><img src="${HERO_IMG}" alt="Fall 2026 collection" fetchpriority="high" onerror="this.style.display='none'">
    <div class="hero-tag"><div><b>Voyager Leather Jacket</b><span>★ 4.8 · 296 reviews</span></div><a class="btn btn-dark btn-sm" href="#/product/voyager-leather-jacket">Shop now</a></div>
  </div></section>

  <section class="sec"><div class="sec-head rv"><div><h2>Shop by category</h2><p>Seven edits, zero filler.</p></div><a class="see-all" href="#/shop">View all</a></div>
    <div class="cat-grid">${cats.map((c) => `<a class="cat-tile rv" href="#/shop?cat=${c.id}"><img src="${c.image}" alt="${esc(c.name)}" loading="lazy"><div><b>${esc(c.name)}</b><span>${c.productCount} products · ${esc(c.desc)}</span></div></a>`).join("")}</div></section>

  <section class="sec"><div class="sec-head rv"><div><h2>Trending now</h2><p>What 20,000+ shoppers are adding this week.</p></div><a class="see-all" href="#/shop?sort=bestselling">View all</a></div>
    <div class="p-grid four" data-bind>${trending.map(productCard).join("")}</div></section>

  <section class="sec"><div class="promo-grid">
    <div class="promo sand rv"><div style="position:relative"><h3>The linen edit</h3><p>Stonewashed European flax, 20% off bedding through Sunday.</p><a class="btn btn-dark btn-sm" href="#/shop?cat=home">Shop home</a></div></div>
    <div class="promo ink rv"><img class="bg" src="${EDIT_IMG}" alt="" loading="lazy"><div style="position:relative"><h3>WELCOME10 — 10% off</h3><p>New here? Take 10% off your first order. Applied at cart with code WELCOME10.</p><a class="btn btn-light btn-sm" href="#/shop">Start shopping</a></div></div>
  </div></section>

  <section class="sec"><div class="sec-head rv"><div><h2>Best sellers</h2><p>Highest rated, most re-ordered.</p></div><a class="see-all" href="#/shop?sort=rating">View all</a></div>
    <div class="p-grid four" data-bind>${best.map(productCard).join("")}</div></section>

  <section class="sec"><div class="promo rv" style="background:#e9ebe2;border-radius:20px;display:grid;grid-template-columns:1fr 1fr;gap:0;overflow:hidden;padding:0">
    <div style="padding:52px"><div class="hero-kick">Featured collection</div><h3>The Everyday Carry</h3><p>Full-grain leather totes, waxed canvas backpacks and the bifold that started it all — all with lifetime repairs.</p><a class="btn btn-dark btn-sm" href="#/shop?cat=accessories">Shop accessories</a></div>
    <img src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80" alt="Everyday carry" loading="lazy" style="width:100%;height:100%;object-fit:cover;min-height:280px">
  </div></section>

  <section class="sec"><div class="sec-head rv"><div><h2>New arrivals</h2><p>Fresh this season.</p></div><a class="see-all" href="#/shop?sort=newest">View all</a></div>
    <div class="p-grid four" data-bind>${fresh.map(productCard).join("")}</div></section>

  <section class="sec"><div class="sec-head rv"><div><h2>Loved worldwide</h2><p>4.6 average across 20,000+ verified reviews.</p></div></div>
    <div class="testi-grid">
      ${[["The Meridian chrono gets compliments weekly. The weight, the lume, the strap — everything feels considered.", "Maya R.", "Meridian Chrono owner", "photo-1494790108377-be9c29b29330"],
         ["Ordered the Oslo chair on Monday, hosting on it by Friday. Build quality is frankly absurd for the price.", "Daniel K.", "Oslo Lounge Chair owner", "photo-1507003211169-0a1dd7228f2d"],
         ["My third Field tee pack. Two years in and the collars still sit perfectly. Nothing else fits like this.", "Sofia L.", "Essential Tee devotee", "photo-1438761681033-6461ffad8d80"]].map(([q, n, s, img]) => `
      <div class="testi rv"><q>${q}</q><figure><img src="https://images.unsplash.com/${img}?auto=format&fit=crop&w=100&q=80" alt="${n}" loading="lazy"><figcaption><b>${n}</b><br><span class="muted small">${s}</span></figcaption></figure></div>`).join("")}
    </div></section>
  ${newsletterBlock()}`;
}
export function mountHome() { bindCards(document); bindNewsletters(document); observeReveals(); }
