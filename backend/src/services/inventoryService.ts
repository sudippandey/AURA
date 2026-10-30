import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Product, availableStock } from "../models/Product.js";
import { StockMovement, type MovementType } from "../models/StockMovement.js";

/** Physical stock handlers: managers plus the warehouse crew doing counts. */
export const INVENTORY_ROLES = ["admin", "inventory-manager", "warehouse-employee"] as const;

export interface MovementResponse {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  type: MovementType;
  qty: number;
  balance: number;
  reason: string;
  orderNumber?: string;
  createdAt: string;
}

export async function logMovement(input: {
  productId: Types.ObjectId | string;
  type: MovementType;
  qty: number;
  balance: number;
  reason: string;
  orderNumber?: string;
  actor?: string;
}): Promise<void> {
  await StockMovement.create({
    product: new Types.ObjectId(String(input.productId)),
    type: input.type,
    qty: input.qty,
    balance: Math.max(0, input.balance),
    reason: input.reason.slice(0, 300),
    ...(input.orderNumber ? { orderNumber: input.orderNumber } : {}),
    ...(input.actor ? { actor: new Types.ObjectId(input.actor) } : {})
  });
}

/**
 * Absolute stock-take: sets on-hand stock to `stock` and logs the delta.
 * Returns the updated product fields the catalogue mapper needs.
 */
export async function adjustStock(
  productRef: string,
  stock: number,
  reason: string,
  actorId: string
): Promise<{ productId: string; slug: string; stock: number; available: number; delta: number }> {
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    throw new AppError("Stock must be an integer 0–1000000.", 400, "INVALID_STOCK");
  }
  const q = productRef.trim();
  const product = Types.ObjectId.isValid(q)
    ? await Product.findById(q)
    : await Product.findOne({ slug: q.toLowerCase() });
  if (!product) throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  const delta = stock - product.stock;
  product.stock = stock;
  await product.save();
  if (delta !== 0) {
    await logMovement({
      productId: product._id,
      type: "adjustment",
      qty: delta,
      balance: stock,
      reason: reason || "Manual stock-take",
      actor: actorId
    });
  }
  return {
    productId: String(product._id),
    slug: product.slug,
    stock: product.stock,
    available: availableStock(product),
    delta
  };
}

export async function listMovements(filter: {
  productId?: string;
  type?: MovementType;
  page: number;
  limit: number;
}): Promise<{ items: MovementResponse[]; total: number }> {
  const q: Record<string, unknown> = {};
  if (filter.productId) {
    const ref = filter.productId.trim();
    const product = Types.ObjectId.isValid(ref)
      ? await Product.findById(ref).select("_id")
      : await Product.findOne({ slug: ref.toLowerCase() }).select("_id");
    if (!product) return { items: [], total: 0 };
    q.product = product._id;
  }
  if (filter.type) q.type = filter.type;
  const [total, docs] = await Promise.all([
    StockMovement.countDocuments(q),
    StockMovement.find(q)
      .populate("product", "slug name")
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit)
  ]);
  return {
    items: docs.map((m) => {
      const raw = m.product as unknown;
      const prod =
        raw && typeof raw === "object" && "_id" in (raw as Record<string, unknown>)
          ? (raw as { _id: Types.ObjectId; slug?: string; name?: string })
          : null;
      return {
        id: String(m._id),
        productId: prod ? String(prod._id) : String(raw),
        productSlug: prod?.slug ?? "",
        productName: prod?.name ?? "",
        type: m.type,
        qty: m.qty,
        balance: m.balance,
        reason: m.reason,
        ...(m.orderNumber ? { orderNumber: m.orderNumber } : {}),
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt)
      };
    }),
    total
  };
}

export interface LowStockItem {
  productId: string;
  slug: string;
  name: string;
  stock: number;
  reservedStock: number;
  available: number;
  lowStockThreshold: number;
}

/** Products at/below threshold (available units), worst first. */
export async function lowStock(limit = 50): Promise<LowStockItem[]> {
  const docs = await Product.find({ isActive: true }).sort({ stock: 1 }).limit(Math.min(limit, 200));
  return docs
    .map((p) => ({
      productId: String(p._id),
      slug: p.slug,
      name: p.name,
      stock: p.stock,
      reservedStock: p.reservedStock,
      available: availableStock(p),
      lowStockThreshold: p.lowStockThreshold
    }))
    .filter((l) => l.available <= l.lowStockThreshold);
}

export async function inventoryOverview(): Promise<{
  totalProducts: number;
  totalUnits: number;
  outOfStock: number;
  lowStock: number;
}> {
  const [groups, counts] = await Promise.all([
    Product.aggregate<{ _id: null; units: number; products: number }>([
      { $match: { isActive: true } },
      { $group: { _id: null, units: { $sum: "$stock" }, products: { $sum: 1 } } }
    ]),
    (async () => {
      const low = await lowStock(10000);
      return { low: low.length, out: low.filter((l) => l.available <= 0).length };
    })()
  ]);
  return {
    totalProducts: groups[0]?.products ?? 0,
    totalUnits: groups[0]?.units ?? 0,
    outOfStock: counts.out,
    lowStock: counts.low
  };
}
