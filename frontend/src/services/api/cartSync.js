// Wishlist + cart server sync (live mode only; mock mode stays fully local).
// Called with plain data — no store import, so no module cycles.
import { apiRequest, usingMock } from "./apiClient.js";

function loggedIn() {
  try { return !!localStorage.getItem("aura_token"); } catch { return false; }
}
function live() { return !usingMock() && loggedIn(); }

const toServerLines = (lines) =>
  (lines || []).map((l) => ({ productId: l.id, qty: l.qty, color: l.color ?? null, size: l.size ?? null }));
const toStoreLines = (items) =>
  (items || []).map((l) => ({ id: l.productId, qty: l.qty, color: l.color ?? null, size: l.size ?? null }));

let pushTimer = null;
/** Debounced full-cart replace after local mutations (caps already enforced locally). */
export function pushCartLive(localLines) {
  if (!live()) return;
  clearTimeout(pushTimer);
  const snapshot = JSON.parse(JSON.stringify(toServerLines(localLines)));
  pushTimer = setTimeout(async () => {
    try { await apiRequest("/cart", { method: "PUT", body: { items: snapshot }, auth: true }); } catch {}
  }, 600);
}

/** Login/boot: merge the device cart into the server one, adopt the result. */
export async function mergeServerCart(localLines) {
  if (!live()) return null;
  try {
    const cart = await apiRequest("/cart", { method: "POST", body: { items: toServerLines(localLines) }, auth: true });
    return toStoreLines(cart.items);
  } catch { return null; }
}

/** Fire-and-forget single wishlist toggle (intent known at the call site). */
export async function pushWishLive(productId, wished) {
  if (!live()) return;
  try {
    if (wished) await apiRequest("/wishlist/toggle", { method: "POST", body: { productId }, auth: true });
    else await apiRequest(`/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE", auth: true });
  } catch {}
}

/** Login/boot: union device + server ids (additive only — never removes). */
export async function mergeServerWishlist(localIds) {
  if (!live()) return null;
  try {
    const srv = await apiRequest("/wishlist", { auth: true });
    const serverIds = (srv && srv.items) || [];
    const missing = (localIds || []).filter((id) => !serverIds.includes(id));
    for (const id of missing) {
      try { await apiRequest("/wishlist/toggle", { method: "POST", body: { productId: id }, auth: true }); } catch {}
    }
    return [...new Set([...serverIds, ...(localIds || [])])];
  } catch { return null; }
}

/** Boot: merge device state into a fresh login session. Returns patches for the store. */
export async function bootSync(localCart, localWishlist) {
  if (!live()) return null;
  const [cart, wishlist] = await Promise.all([mergeServerCart(localCart), mergeServerWishlist(localWishlist)]);
  const patch = {};
  if (cart) patch.cart = cart;
  if (wishlist) patch.wishlist = wishlist;
  return patch;
}
