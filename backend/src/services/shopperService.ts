import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Cart, type CartDoc } from "../models/Cart.js";
import { Wishlist } from "../models/Wishlist.js";
import { Product, availableStock, type ProductDoc } from "../models/Product.js";

/** Hard caps: keep payloads and line math sane. */
export const MAX_LINES = 100;
export const MAX_QTY = 99;

export interface IncomingLine {
  productId: string;
  qty: number;
  color?: string | null;
  size?: string | null;
}

export interface CartLineResponse {
  productId: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
  color: string | null;
  size: string | null;
  /** Units the shopper could still add (stock − Stage 6 holds). */
  available: number;
  lineTotal: number;
}

export interface CartResponse {
  items: CartLineResponse[];
  count: number;
  /** Sum of current prices × qty. Indicative until orders snapshot prices (Stage 5). */
  subtotal: number;
  couponCode: string | null;
  shippingId: string;
  updatedAt: string | null;
}

function lineKey(productId: string, color: string | null, size: string | null): string {
  return `${productId}::${color ?? ""}::${size ?? ""}`;
}

function normOpt(v: string | null | undefined, max: number, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new AppError(`${label} must be a string.`, 400, "INVALID_OPTION");
  const t = v.trim();
  if (t.length > max) throw new AppError(`${label} is too long.`, 400, "INVALID_OPTION");
  return t;
}

async function findProductOrThrow(ref: string): Promise<ProductDoc> {
  const q = String(ref ?? "").trim();
  let doc: ProductDoc | null = null;
  if (Types.ObjectId.isValid(q)) doc = await Product.findById(q);
  if (!doc) doc = await Product.findOne({ slug: q.toLowerCase() });
  if (!doc) throw new AppError(`Product "${ref}" not found.`, 404, "PRODUCT_NOT_FOUND");
  return doc;
}

interface ResolvedLine {
  product: ProductDoc;
  qty: number;
  color: string | null;
  size: string | null;
  available: number;
}

/**
 * Validate a whole batch BEFORE mutating anything (all-or-nothing).
 * Throws 400 INVALID_LINES with per-line details, or 404 for unknown products.
 */
async function resolveLines(lines: IncomingLine[]): Promise<ResolvedLine[]> {
  if (!Array.isArray(lines)) throw new AppError("Items must be an array.", 400, "INVALID_LINES");
  if (lines.length > MAX_LINES) {
    throw new AppError(`Too many lines (max ${MAX_LINES}).`, 400, "CART_FULL");
  }
  const issues: Array<{ index: number; message: string }> = [];
  const resolved: ResolvedLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as IncomingLine;
    try {
      if (!raw || typeof raw.productId !== "string" || !raw.productId.trim()) {
        throw new AppError("productId is required.", 400, "INVALID_LINES");
      }
      if (!Number.isInteger(raw.qty) || raw.qty < 1 || raw.qty > MAX_QTY) {
        throw new AppError(`qty must be an integer 1–${MAX_QTY}.`, 400, "INVALID_QTY");
      }
      const product = await findProductOrThrow(raw.productId);
      if (!product.isActive) {
        throw new AppError(`"${product.name}" is no longer available.`, 400, "PRODUCT_UNAVAILABLE");
      }
      const color = normOpt(raw.color, 40, "color");
      const size = normOpt(raw.size, 20, "size");
      if (color !== null && product.colors.length > 0 && !product.colors.some((c) => c.name === color)) {
        throw new AppError(`Color "${color}" is not offered for "${product.name}".`, 400, "INVALID_OPTION");
      }
      if (size !== null && product.sizes.length > 0 && !product.sizes.includes(size)) {
        throw new AppError(`Size "${size}" is not offered for "${product.name}".`, 400, "INVALID_OPTION");
      }
      const available = availableStock(product);
      if (available <= 0) {
        throw new AppError(`"${product.name}" is out of stock.`, 400, "OUT_OF_STOCK");
      }
      resolved.push({ product, qty: raw.qty, color, size, available });
    } catch (err) {
      if (err instanceof AppError && (err.code === "PRODUCT_NOT_FOUND" || err.statusCode === 404)) throw err;
      if (err instanceof AppError) {
        issues.push({ index: i, message: err.message });
        continue;
      }
      throw err;
    }
  }
  if (issues.length > 0) {
    throw new AppError("Some cart lines are invalid.", 400, "INVALID_LINES", issues);
  }
  return resolved;
}

function toLineResponse(
  product: ProductDoc,
  qty: number,
  color: string | null,
  size: string | null
): CartLineResponse {
  const available = availableStock(product);
  return {
    productId: String(product._id),
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    price: product.price,
    image: product.images[0] ?? "",
    qty,
    color,
    size,
    available,
    lineTotal: product.price * qty
  };
}

/** Maps cart lines to the storefront shape; lazily prunes lines of deleted products. */
async function buildCartResponse(cart: CartDoc): Promise<CartResponse> {
  const ids = cart.items.map((l) => l.product);
  const products = ids.length > 0 ? await Product.find({ _id: { $in: ids } }) : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  let pruned = false;
  const items: CartLineResponse[] = [];
  for (const line of cart.items) {
    const p = byId.get(String(line.product));
    if (!p) {
      pruned = true;
      continue;
    }
    items.push(toLineResponse(p, line.qty, line.color, line.size));
  }
  if (pruned) {
    cart.items = cart.items.filter((l) => byId.has(String(l.product)));
    await cart.save();
  }
  const count = items.reduce((s, l) => s + l.qty, 0);
  return {
    items,
    count,
    subtotal: items.reduce((s, l) => s + l.lineTotal, 0),
    couponCode: cart.couponCode,
    shippingId: cart.shippingId,
    updatedAt: cart.updatedAt ? cart.updatedAt.toISOString() : null
  };
}

function emptyCartResponse(): CartResponse {
  return { items: [], count: 0, subtotal: 0, couponCode: null, shippingId: "standard", updatedAt: null };
}

async function getOrCreateCart(userId: string): Promise<CartDoc> {
  const existing = await Cart.findOne({ user: new Types.ObjectId(userId) });
  if (existing) return existing;
  return new Cart({ user: new Types.ObjectId(userId), items: [] });
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function getCart(userId: string): Promise<CartResponse> {
  const cart = await Cart.findOne({ user: new Types.ObjectId(userId) });
  if (!cart) return emptyCartResponse();
  return buildCartResponse(cart);
}

function applyPrefs(cart: CartDoc, prefs: { couponCode?: string | null; shippingId?: string }): void {
  if (prefs.couponCode !== undefined) {
    const c = prefs.couponCode;
    cart.couponCode = c === null || c === "" ? null : String(c).trim().toUpperCase().slice(0, 40);
  }
  if (prefs.shippingId !== undefined) {
    cart.shippingId = String(prefs.shippingId).trim().slice(0, 40) || "standard";
  }
}

/**
 * Sync merge (login / multi-device): incoming lines ADD onto existing ones,
 * every line capped at min(available, 99). All-or-nothing validation.
 */
export async function mergeCart(
  userId: string,
  lines: IncomingLine[],
  prefs: { couponCode?: string | null; shippingId?: string } = {}
): Promise<CartResponse> {
  const resolved = await resolveLines(lines);
  const cart = await getOrCreateCart(userId);
  const merged = new Map<string, { product: Types.ObjectId; qty: number; color: string | null; size: string | null; available: number }>();
  for (const l of cart.items) {
    merged.set(lineKey(String(l.product), l.color, l.size), {
      product: l.product,
      qty: l.qty,
      color: l.color,
      size: l.size,
      available: Infinity
    });
  }
  for (const r of resolved) {
    const pid = String(r.product._id);
    const key = lineKey(pid, r.color, r.size);
    const cur = merged.get(key);
    const base = cur ? cur.qty : 0;
    merged.set(key, {
      product: r.product._id as Types.ObjectId,
      qty: Math.min(base + r.qty, r.available, MAX_QTY),
      color: r.color,
      size: r.size,
      available: r.available
    });
  }
  if (merged.size > MAX_LINES) throw new AppError(`Too many lines (max ${MAX_LINES}).`, 400, "CART_FULL");
  cart.items = [...merged.values()].map(({ product, qty, color, size }) => ({ product, qty, color, size }));
  applyPrefs(cart, prefs);
  await cart.save();
  return buildCartResponse(cart);
}

/** Full replace (qty edits, removals, clear with []). Incoming qty capped at available. */
export async function replaceCart(userId: string, lines: IncomingLine[]): Promise<CartResponse> {
  const resolved = await resolveLines(lines);
  const cart = await getOrCreateCart(userId);
  cart.items = resolved.map((r) => ({
    product: r.product._id as Types.ObjectId,
    qty: Math.min(r.qty, r.available, MAX_QTY),
    color: r.color,
    size: r.size
  }));
  await cart.save();
  return buildCartResponse(cart);
}

export async function updateCartPrefs(
  userId: string,
  prefs: { couponCode?: string | null; shippingId?: string }
): Promise<CartResponse> {
  const cart = await getOrCreateCart(userId);
  applyPrefs(cart, prefs);
  await cart.save();
  return buildCartResponse(cart);
}

/** Clear items (prefs like coupon/shipping are kept). */
export async function clearCart(userId: string): Promise<CartResponse> {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  return buildCartResponse(cart);
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export async function getWishlist(userId: string): Promise<string[]> {
  const doc = await Wishlist.findOne({ user: new Types.ObjectId(userId) });
  if (!doc) return [];
  return doc.products.map((p) => String(p));
}

async function getOrCreateWishlist(userId: string) {
  const existing = await Wishlist.findOne({ user: new Types.ObjectId(userId) });
  if (existing) return existing;
  return new Wishlist({ user: new Types.ObjectId(userId), products: [] });
}

export async function toggleWishlist(
  userId: string,
  productRef: string
): Promise<{ wished: boolean; items: string[] }> {
  const product = await findProductOrThrow(productRef);
  if (!product.isActive) {
    throw new AppError(`"${product.name}" is no longer available.`, 400, "PRODUCT_UNAVAILABLE");
  }
  const doc = await getOrCreateWishlist(userId);
  const pid = String(product._id);
  const has = doc.products.some((p) => String(p) === pid);
  if (has) {
    doc.products = doc.products.filter((p) => String(p) !== pid);
  } else {
    doc.products.push(product._id as Types.ObjectId);
  }
  await doc.save();
  return { wished: !has, items: doc.products.map((p) => String(p)) };
}

export async function removeFromWishlist(userId: string, productRef: string): Promise<string[]> {
  const doc = await getOrCreateWishlist(userId);
  const q = productRef.trim();
  const before = doc.products.length;
  doc.products = doc.products.filter((p) => {
    const id = String(p);
    if (id === q) return false;
    return true;
  });
  // Also match by slug without a product lookup when the id didn't hit.
  if (doc.products.length === before && !Types.ObjectId.isValid(q)) {
    const product = await Product.findOne({ slug: q.toLowerCase() });
    if (product) {
      const pid = String(product._id);
      doc.products = doc.products.filter((p) => String(p) !== pid);
    }
  }
  await doc.save();
  return doc.products.map((p) => String(p));
}
