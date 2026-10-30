import { observeReveals, bindNewsletters, newsletterBlock } from "../components/layout.js";
import { validateContact } from "../lib/validation.js";
import { toast } from "../components/layout.js";
import { icon } from "../lib/icons.js";

const head = (t, s) => `<section class="sec prose"><h1>${t}</h1><p class="muted">${s}</p>`;
export function renderAbout() {
  return `${head("Considered goods for a life well-lived", "AURA is a Copenhagen-born studio making audio, watches, home and wardrobe essentials — fewer, better things with lifetime repairs.")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:26px 0" class="about-grid">
    <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80" alt="AURA store" loading="lazy" style="border-radius:16px">
    <img src="https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80" alt="AURA studio" loading="lazy" style="border-radius:16px"></div>
  <h2>What we believe</h2><p>Buy once, keep forever. Every product is scored on materials, repairability and cost-per-wear before it earns the AURA mark. If it can't be repaired, we don't sell it.</p>
  <h2>The numbers</h2><p>★ 4.6 average across 20,000+ verified reviews · 60-day returns · Free shipping over $75 · Lifetime repairs on leather & hardware · Carbon-neutral delivery.</p>
  <h2>Visit us</h2><p>Bredgade 24, 1260 Copenhagen K · Open Mon–Sat 10–19. Or say hi at <b>hello@aura.shop</b>.</p></section>${newsletterBlock()}`;
}
export function renderContact() {
  return `${head("Contact us", "Questions about sizing, shipping or repairs? We reply within one business day.")}
  <div class="card-box" style="margin-top:20px"><form id="ctF" novalidate>
    <div class="form-2"><div class="field"><label>Name</label><input name="name"><div class="err" data-e="name"></div></div>
    <div class="field"><label>Email</label><input name="email" type="email"><div class="err" data-e="email"></div></div></div>
    <div class="field"><label>Topic</label><select name="topic"><option>Order help</option><option>Sizing</option><option>Repairs</option><option>Wholesale</option><option>Other</option></select></div>
    <div class="field"><label>Message</label><textarea name="message" rows="5"></textarea><div class="err" data-e="message"></div></div>
    <button class="btn btn-dark" type="submit">Send message</button></form></div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px" class="about-grid">
    ${[["mail", "Email", "hello@aura.shop"], ["truck", "Shipping", "4–6 days, free $75+"], ["shield", "Repairs", "Lifetime, free labor"]].map(([i, t, d]) => `<div class="card-box" style="margin:0"><b style="display:flex;gap:8px;align-items:center">${icon(i, 16)} ${t}</b><div class="small muted">${d}</div></div>`).join("")}
  </div></section>`;
}
export function mountContact() {
  observeReveals();
  const f = document.getElementById("ctF"); if (!f) return;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const errs = validateContact(d);
    f.querySelectorAll("[data-e]").forEach((x) => (x.textContent = ""));
    Object.entries(errs).forEach(([k, m]) => (f.querySelector(`[data-e="${k}"]`).textContent = m));
    if (Object.keys(errs).length) return;
    f.reset(); toast("Message sent — we'll reply within a day.", "ok");
  };
}
export function renderFaq() {
  const faqs = [["How long is shipping?", "Orders dispatch within 24h. Standard 4–6 days ($6.95, free $75+), Express 2–3 days ($14.95), Overnight ($24.95)."], ["What's the return policy?", "60 days, free return label, refund within 3 business days. Lifetime repairs on leather & hardware."], ["Do coupons stack?", "One coupon per order in demo. WELCOME10 (10% off), PREMIUM15 (15% off $200+), FREESHIP (free standard shipping)."], ["Is payment real?", "No — checkout is simulated. Payment integration belongs in pages/checkout.js and must be implemented with a payment provider."], ["Where's my order?", "Find every demo order under Account → Orders with live status."], ["Do you ship internationally?", "Yes — duties calculated at checkout for 40+ countries."]];
  return `${head("Frequently asked questions", "Everything else lives on the policy pages below.")}<div style="margin-top:20px" id="faqL">${faqs.map(([q, a], i) => `<div class="acc-item${i === 0 ? " open" : ""}"><button data-faq>${q}<span>${icon("chevD", 16)}</span></button><div class="body">${a}</div></div>`).join("")}</div></section>`;
}
export function mountFaq() {
  observeReveals();
  document.querySelectorAll("[data-faq]").forEach((b) => (b.onclick = () => b.parentElement.classList.toggle("open")));
}
const policy = (t, items) => `${head(t, "Last updated October 2026.")}${items.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join("")}</section>`;
export const renderShipping = () => policy("Shipping policy", [["Speeds & rates", "Standard 4–6 business days $6.95 (free over $75). Express 2–3 days $14.95. Overnight next business day $24.95. Orders placed before 14:00 CET dispatch same day."], ["Tracking", "Every parcel is tracked and carbon-neutral. You'll get tracking by email + SMS the moment it leaves our warehouse."], ["International", "We ship to 40+ countries; duties and taxes are calculated at checkout so there are no surprises."], ["Delays", "If a parcel is more than 2 days late, contact us and we'll make it right — refund of shipping at minimum."]]);
export const renderReturns = () => policy("Returns & refunds", [["60-day promise", "Unworn, unwashed items can be returned within 60 days for a full refund. Start from Account → Orders."], ["How it works", "Print the prepaid label, drop the parcel, refund lands within 3 business days of arrival to your original method."], ["Repairs first", "Loose stitching or scuffed leather? Our lifetime repair bench fixes most issues free — returns are the last resort."], ["Final sale", "Gift cards and marked final-sale items can't be returned, but they're still covered by warranty."]]);
export const renderPrivacy = () => policy("Privacy policy", [["What we store", "Cart, wishlist and demo orders live in your browser's localStorage. Accounts are demo records on your device — nothing leaves it until you connect a backend."], ["Analytics", "This demo collects no analytics. When you go live, add your consent banner and processor list here."], ["Your rights", "Export or erase everything by clearing site storage, or ask hello@aura.shop and we'll confirm within 30 days."]]);
export const renderTerms = () => policy("Terms & conditions", [["Demo storefront", "All products, prices and reviews here are realistic samples. Checkout and payments are simulated; no goods ship."], ["Pricing", "Prices in USD, taxes estimated at checkout. Coupon abuse or resale voids orders."], ["Warranty", "2-year warranty as standard, 5 years on watches and furniture frames, lifetime repairs on leather & hardware."]]);
export function render404() {
  return `<section class="sec"><div class="empty"><div style="font-family:var(--font-disp);font-size:70px">404</div><h3>Lost in the studio?</h3><p class="muted">That page doesn't exist — but the good stuff does.</p><div style="display:flex;gap:10px;justify-content:center"><a class="btn btn-dark btn-sm" href="#/">Go home</a><a class="btn btn-outline btn-sm" href="#/shop">Shop all</a></div></div></section>`;
}
export function mountStatic() { observeReveals(); bindNewsletters(document); }
