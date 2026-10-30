import { validateLogin, validateRegister } from "../lib/validation.js";
import { loginApi, registerApi, forgotApi } from "../services/api/authApi.js";
import { setSession, store, updateBadges } from "../store/store.js";
import { mergeServerCart, mergeServerWishlist } from "../services/api/cartSync.js";
import { navigate, toast, observeReveals } from "../components/layout.js";
import { icon } from "../lib/icons.js";
import { esc } from "../lib/format.js";

function fieldErr(form, errs) {
  form.querySelectorAll("[data-e]").forEach((x) => (x.textContent = ""));
  form.querySelectorAll("input.bad").forEach((x) => x.classList.remove("bad"));
  Object.entries(errs).forEach(([k, m]) => {
    form.querySelector(`[data-e="${k}"]`) && (form.querySelector(`[data-e="${k}"]`).textContent = m);
    form.querySelector(`[name="${k}"]`)?.classList.add("bad");
  });
}
function pwToggle(form) {
  form.querySelectorAll("[data-pw]").forEach((b) => (b.onclick = () => {
    const i = b.parentElement.querySelector("input");
    const show = i.type === "password"; i.type = show ? "text" : "password";
    b.innerHTML = icon(show ? "eyeOff" : "eye", 17);
  }));
}
export function renderLogin() {
  if (store.state.user) { setTimeout(() => navigate("/account"), 0); return `<section class="sec"><p class="muted">Redirecting…</p></section>`; }
  return `<section class="sec"><div class="auth-wrap rv in"><h1 style="font-family:var(--font-disp);font-size:30px;margin:0 0 4px">Welcome back</h1>
  <p class="muted small" style="margin:0 0 18px">Demo auth — try <span class="mono">demo@aura.shop / password1</span> after registering, or register fresh.</p>
  <form id="loginF" novalidate><div class="field"><label>Email</label><input name="email" type="email" autocomplete="email"><div class="err" data-e="email"></div></div>
  <div class="field"><label>Password</label><div style="position:relative"><input name="password" type="password" autocomplete="current-password" style="padding-right:44px"><button type="button" data-pw class="icon-btn" style="position:absolute;right:4px;top:4px" aria-label="Show password">${icon("eye", 17)}</button></div><div class="err" data-e="password"></div></div>
  <button class="btn btn-dark" style="width:100%" type="submit" id="loginB">Log in</button></form>
  <p class="small" style="margin-top:14px"><a class="link-u" href="#/forgot">Forgot password?</a> · <a class="link-u" href="#/register">Create account</a></p></div></section>`;
}
export function mountLogin() {
  observeReveals();
  const f = document.getElementById("loginF"); if (!f) return; pwToggle(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const errs = validateLogin(d);
    fieldErr(f, errs);
    if (Object.keys(errs).length) return;
    const b = document.getElementById("loginB"); b.disabled = true; b.textContent = "Logging in…";
    try { const { user, token } = await loginApi(d); setSession(user, token); updateBadges(); toast(`Welcome back, ${user.name.split(" ")[0]}.`, "ok"); navigate("/account"); }
    catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "Log in"; }
    finally {
      // Live backend: fold the device cart/wishlist into the server ones.
      try {
        const [cart, wishlist] = await Promise.all([mergeServerCart(store.state.cart), mergeServerWishlist(store.state.wishlist)]);
        const patch = {};
        if (cart) patch.cart = cart;
        if (wishlist) patch.wishlist = wishlist;
        if (Object.keys(patch).length) { store.set(patch); updateBadges(); }
      } catch {}
    }
  };
}
export function renderRegister() {
  return `<section class="sec"><div class="auth-wrap rv in"><h1 style="font-family:var(--font-disp);font-size:30px;margin:0 0 4px">Create account</h1>
  <p class="muted small" style="margin:0 0 18px">Saved addresses, order history, faster checkout.</p>
  <form id="regF" novalidate><div class="field"><label>Full name</label><input name="name" autocomplete="name"><div class="err" data-e="name"></div></div>
  <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email"><div class="err" data-e="email"></div></div>
  <div class="field"><label>Password (8+ characters)</label><div style="position:relative"><input name="password" type="password" autocomplete="new-password" style="padding-right:44px"><button type="button" data-pw class="icon-btn" style="position:absolute;right:4px;top:4px" aria-label="Show password">${icon("eye", 17)}</button></div><div class="err" data-e="password"></div></div>
  <button class="btn btn-dark" style="width:100%" type="submit" id="regB">Create account</button></form>
  <p class="small" style="margin-top:14px">Have an account? <a class="link-u" href="#/login">Log in</a></p></div></section>`;
}
export function mountRegister() {
  observeReveals();
  const f = document.getElementById("regF"); if (!f) return; pwToggle(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    const errs = validateRegister(d);
    fieldErr(f, errs);
    if (Object.keys(errs).length) return;
    const b = document.getElementById("regB"); b.disabled = true; b.textContent = "Creating…";
    try { const { user, token } = await registerApi(d); setSession(user, token); updateBadges(); toast("Account created — welcome.", "ok"); navigate("/account"); }
    catch (err) { toast(err.message, "err"); b.disabled = false; b.textContent = "Create account"; }
    finally {
      try {
        const [cart, wishlist] = await Promise.all([mergeServerCart(store.state.cart), mergeServerWishlist(store.state.wishlist)]);
        const patch = {};
        if (cart) patch.cart = cart;
        if (wishlist) patch.wishlist = wishlist;
        if (Object.keys(patch).length) { store.set(patch); updateBadges(); }
      } catch {}
    }
  };
}
export function renderForgot() {
  return `<section class="sec"><div class="auth-wrap rv in"><h1 style="font-family:var(--font-disp);font-size:30px;margin:0 0 4px">Reset password</h1>
  <p class="muted small" style="margin:0 0 18px">We'll email you a reset link (simulated).</p>
  <form id="forF"><div class="field"><label>Email</label><input name="email" type="email"><div class="err" data-e="email"></div></div>
  <button class="btn btn-dark" style="width:100%" type="submit" id="forB">Send reset link</button></form>
  <p class="small" style="margin-top:14px"><a class="link-u" href="#/login">Back to login</a></p></div></section>`;
}
export function mountForgot() {
  observeReveals();
  const f = document.getElementById("forF"); if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const em = f.querySelector('[name="email"]').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { f.querySelector('[data-e="email"]').textContent = "Enter a valid email."; return; }
    const b = document.getElementById("forB"); b.disabled = true; b.textContent = "Sending…";
    await forgotApi(em); b.disabled = false; b.textContent = "Send reset link";
    toast("Reset link sent (demo — check console).", "ok");
  };
}
