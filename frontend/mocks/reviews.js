// Mock reviews keyed by product id (fallback generator covers the rest)
import { PRODUCTS } from "./products.js";
const NAMES = ["Maya R.", "Jordan T.", "Sofia L.", "Daniel K.", "Priya S.", "Alex M.", "Hannah W.", "Chris B.", "Elena G.", "Sam O."];
const TITLES = ["Exceeded expectations", "Worth every penny", "My new everyday essential", "Beautiful quality", "Great, minor caveats", "Would buy again"];
const BODIES = [
  "Build quality feels a level above the price. Packaging, materials, finish — everything considered. Shipping was fast and it arrived flawless.",
  "I compared a lot of options before this and I'm glad I landed here. It looks even better in person and works exactly as described.",
  "Minimal design, zero fuss. It fits perfectly into my routine and the quality is obvious the moment you unbox it.",
  "Bought one, then came back for a second as a gift. Customer care answered a sizing question within an hour. Lovely experience.",
  "Really strong overall. One small nitpick on fit/shade, but support helped me swap it quickly. Would absolutely recommend.",
  "Premium without being flashy. Materials feel durable and the details — stitching, weight, finish — are all spot on.",
];
export function getMockReviews(productId) {
  const p = PRODUCTS.find((x) => x.id === productId || x.slug === productId);
  const seed = (p ? p.id.length * 7 + p.name.length : 5);
  const n = 3 + (seed % 3);
  return Array.from({ length: n }, (_, i) => ({
    id: `${productId}-r${i}`,
    author: NAMES[(seed + i * 3) % NAMES.length],
    rating: Math.max(3, Math.min(5, Math.round((p ? p.rating : 4.5) + ((i % 2 === 0) ? 0 : -1)))),
    title: TITLES[(seed + i) % TITLES.length],
    body: BODIES[(seed + i * 2) % BODIES.length],
    date: `2026-0${1 + ((seed + i) % 8)}-${10 + ((seed * (i + 2)) % 18)}`,
    verified: i !== 2,
  }));
}
