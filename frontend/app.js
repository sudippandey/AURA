// Memory router with lazy-loaded routes (dynamic import = code-splitting).
// NOTE: the Perchance editor owns location.hash (e.g. "#edit"), so this app
// routes in memory and never touches the URL. The Vite port restores URL
// routing with React Router using the same route table.
import { shell, afterShell, setActiveNav, observeReveals, bindNewsletters } from "./components/layout.js";
import { cardSkeletons } from "./components/product.js";
import { parseShopQuery } from "./pages/shop.js";
import { esc } from "./lib/format.js";

const TITLES = {
  home: "AURA — Premium Lifestyle Store", shop: "Shop All — AURA", product: "Product — AURA",
  cart: "Cart — AURA", checkout: "Checkout — AURA", success: "Order Confirmed — AURA",
  login: "Log in — AURA", register: "Create Account — AURA", forgot: "Reset Password — AURA",
  account: "Account — AURA", wishlist: "Wishlist — AURA", about: "About — AURA", contact: "Contact — AURA",
  faq: "FAQ — AURA", shipping: "Shipping — AURA", returns: "Returns — AURA", privacy: "Privacy — AURA", terms: "Terms — AURA",
};
let booted = false;
function ensureShell() {
  if (booted) return;
  document.getElementById("app").innerHTML = shell("");
  afterShell(); booted = true;
}
function loading() { return `<section class="sec"><div class="p-grid four">${cardSkeletons(8)}</div></section>`; }

export function go(path) {
  window.__auraPath = path;
  route();
}
window.__auraGo = go;

async function route() {
  ensureShell();
  const view = document.getElementById("view");
  const raw = window.__auraPath || "/";
  const pathPart = raw.split("?")[0];
  const seg = pathPart.split("/").filter(Boolean);
  const scroll = () => window.scrollTo({ top: 0 });
  try {
    if (seg.length === 0) {
      document.title = TITLES.home; setActiveNav("home"); view.innerHTML = loading();
      const m = await import("./pages/home.js");
      view.innerHTML = await m.renderHome(); m.mountHome(); scroll(); observeReveals(); return;
    }
    const [a, b] = seg;
    if (a === "shop") {
      document.title = TITLES.shop; setActiveNav("shop"); view.innerHTML = loading();
      const state = parseShopQuery(raw);
      const m = await import("./pages/shop.js");
      view.innerHTML = await m.renderShop(state); m.mountShop(state); scroll(); observeReveals(); return;
    }
    if (a === "product" && b) {
      const m = await import("./pages/product.js");
      view.innerHTML = loading();
      view.innerHTML = await m.renderProduct(decodeURIComponent(b));
      document.title = TITLES.product; setActiveNav("shop"); m.mountProduct(decodeURIComponent(b)); scroll(); observeReveals(); return;
    }
    if (a === "cart") {
      const m = await import("./pages/cart.js");
      document.title = TITLES.cart; setActiveNav(""); view.innerHTML = m.renderCart(); m.mountCart(); scroll(); observeReveals(); return;
    }
    if (a === "checkout") {
      const m = await import("./pages/checkout.js");
      document.title = TITLES.checkout; view.innerHTML = m.renderCheckout(); m.mountCheckout(); scroll(); observeReveals(); return;
    }
    if (a === "success") {
      const m = await import("./pages/checkout.js");
      document.title = TITLES.success; view.innerHTML = m.renderSuccess(); scroll(); observeReveals(); return;
    }
    if (a === "login") { const m = await import("./pages/auth.js"); document.title = TITLES.login; view.innerHTML = m.renderLogin(); m.mountLogin(); scroll(); return; }
    if (a === "register") { const m = await import("./pages/auth.js"); document.title = TITLES.register; view.innerHTML = m.renderRegister(); m.mountRegister(); scroll(); return; }
    if (a === "forgot") { const m = await import("./pages/auth.js"); document.title = TITLES.forgot; view.innerHTML = m.renderForgot(); m.mountForgot(); scroll(); return; }
    if (a === "account") {
      const m = await import("./pages/account.js");
      document.title = TITLES.account; view.innerHTML = m.renderAccount(b || "profile"); m.mountAccount(b || "profile"); scroll(); return;
    }
    if (a === "wishlist") {
      const m = await import("./pages/account.js");
      document.title = TITLES.wishlist; view.innerHTML = m.renderWishlist(); m.mountWishlist(); scroll(); return;
    }
    if (["about", "contact", "faq", "shipping", "returns", "privacy", "terms"].includes(a)) {
      const m = await import("./pages/static.js");
      const map = { about: ["renderAbout", TITLES.about, "about"], contact: ["renderContact", TITLES.contact, ""], faq: ["renderFaq", TITLES.faq, ""], shipping: ["renderShipping", TITLES.shipping, ""], returns: ["renderReturns", TITLES.returns, ""], privacy: ["renderPrivacy", TITLES.privacy, ""], terms: ["renderTerms", TITLES.terms, ""] };
      const [fn, t, nav] = map[a];
      document.title = t; setActiveNav(nav); view.innerHTML = m[fn]();
      if (a === "contact") m.mountContact();
      else if (a === "faq") m.mountFaq();
      else m.mountStatic();
      bindNewsletters(document); scroll(); observeReveals(); return;
    }
    const m = await import("./pages/static.js");
    document.title = "Not Found — AURA"; view.innerHTML = m.render404(); scroll();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<section class="sec"><div class="empty"><h3>Something went wrong</h3><p class="muted">${esc(err.message || err)}</p><div style="margin-top:12px"><button class="btn btn-dark btn-sm" data-home>Go home</button></div></div></section>`;
    const hb = view.querySelector("[data-home]"); if (hb) hb.onclick = () => go("/");
  }
}

// Intercept in-app links so the editor-owned location.hash is never touched.
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute("href").slice(1));
});

window.__auraPath = "/";
route();
