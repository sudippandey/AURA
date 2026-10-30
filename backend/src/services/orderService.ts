import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Cart } from "../models/Cart.js";
import { Order, ORDER_STATUSES, type OrderDoc, type OrderStatus } from "../models/Order.js";
import { Product, availableStock, type ProductDoc } from "../models/Product.js";
import { priceOrder, SHIPPING_METHODS, type ShippingMethod } from "../utils/pricing.js";
import { logMovement } from "./inventoryService.js";
import { logger } from "../utils/logger.js";

/** Roles that may view/fulfil any order (owner always sees their own). */
export const FULFILMENT_ROLES = ["super-admin", "admin", "order-manager", "inventory-manager", "customer-support", "finance-manager", "analyst", "warehouse-employee"] as const;
export const ORDER_ADMIN_ROLES = ["super-admin", "admin", "order-manager", "inventory-manager"] as const;

/** Exact shape the storefront checkout/success/account pages read. */
export interface FrontendOrder {
  id: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    qty: number;
    color: string | null;
    size: string | null;
    image: string;
  }>;
  totals: { subtotal: number; discount: number; shipping: number; tax: number; total: number };
  customer: { firstName: string; lastName: string; email: string; phone?: string };
  shipping: { address: string; city: string; zip: string; country: string; method: string };
  payment: { method: string; id?: string };
  status: OrderStatus;
  createdAt: string;
}

export interface AdminOrder extends FrontendOrder { orderNumber: string; userId: string; history: Array<{ status: OrderStatus; at: string; note?: string; by?: string }>; notes: Array<{ body: string; by: string; at: string }>; couponCode: string | null; createdAt: string; updatedAt: string; }
export function toAdminOrder(o: OrderDoc): AdminOrder {
  const f = toFrontendOrder(o);
  return { ...f, orderNumber: o.orderNumber, userId: String(o.user), history: (o.history ?? []).map((h) => ({ status: h.status, at: h.at instanceof Date ? h.at.toISOString() : String(h.at), ...(h.note ? { note: h.note } : {}), ...((h as { by?: string }).by ? { by: (h as { by?: string }).by } : {}) })), notes: ((o as unknown as { notes?: Array<{ body: string; by: string; at: Date }> }).notes ?? []).map((n) => ({ body: n.body, by: n.by, at: n.at instanceof Date ? n.at.toISOString() : String(n.at) })), couponCode: o.couponCode ?? null, createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt), updatedAt: (o as unknown as { updatedAt?: Date }).updatedAt instanceof Date ? ((o as unknown as { updatedAt?: Date }).updatedAt as Date).toISOString() : String((o as unknown as { updatedAt?: Date }).updatedAt ?? o.createdAt) };
}
export function toFrontendOrder(o: OrderDoc): FrontendOrder {
  return {
    id: o.orderNumber,
    items: o.items.map((l) => ({
      id: String(l.product),
      name: l.name,
      price: l.price,
      qty: l.qty,
      color: l.color,
      size: l.size,
      image: l.image
    })),
    totals: {
      subtotal: o.subtotal,
      discount: o.discount,
      shipping: o.shippingCost,
      tax: o.tax,
      total: o.total
    },
    customer: { ...o.customer },
    shipping: {
      address: o.shipping.address,
      city: o.shipping.city,
      zip: o.shipping.zip,
      country: o.shipping.country,
      method: o.shipping.method
    },
    payment: { method: o.payment.method, ...(o.payment.reference ? { id: o.payment.reference } : {}) },
    status: o.status,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt)
  };
}

export interface CheckoutLine {
  productId: string;
  qty: number;
  color?: string | null;
  size?: string | null;
}

export interface CheckoutInput {
  items?: CheckoutLine[];
  customer: { firstName: string; lastName: string; email: string; phone?: string };
  shipping: { address: string; city: string; zip: string; country: string; method: string };
  payment: { method: string; reference?: string };
  couponCode?: string | null;
}

function orderNumber(): string {
  return "ORD-" + Math.floor(100000 + Math.random() * 900000);
}

async function findOrder(ref: string): Promise<OrderDoc | null> {
  const q = String(ref ?? "").trim();
  if (Types.ObjectId.isValid(q)) {
    const byId = await Order.findById(q);
    if (byId) return byId;
  }
  return Order.findOne({ orderNumber: q.toUpperCase() });
}

/**
 * Checkout: validate → price server-side → atomically decrement stock →
 * snapshot the order → clear the cart (when it was the source).
 * Stock decrements are single-document atomic guards ({stock: $gte qty});
 * a late race rolls back earlier lines and reports 409. True multi-line
 * transactions arrive with the Stage 6 replica-set requirement.
 */
export async function checkout(userId: string, input: CheckoutInput): Promise<FrontendOrder> {
  const uid = new Types.ObjectId(userId);
  let fromCart = false;
  let lines = input.items ?? [];
  let coupon = input.couponCode ?? null;

  const cart = await Cart.findOne({ user: uid });
  if (!input.items) {
    if (!cart || cart.items.length === 0) {
      throw new AppError("Your cart is empty.", 400, "EMPTY_CART");
    }
    fromCart = true;
    lines = cart.items.map((l) => ({
      productId: String(l.product),
      qty: l.qty,
      color: l.color,
      size: l.size
    }));
    if (!coupon) coupon = cart.couponCode;
  }

  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw new AppError("Order must contain 1–100 lines.", 400, "INVALID_LINES");
  }

  // Resolve + validate everything before touching stock.
  const resolved: Array<{ product: ProductDoc; qty: number; color: string | null; size: string | null }> = [];
  for (const [i, raw] of lines.entries()) {
    if (!raw || typeof raw.productId !== "string" || !raw.productId.trim()) {
      throw new AppError(`Line ${i + 1}: productId is required.`, 400, "INVALID_LINES");
    }
    if (!Number.isInteger(raw.qty) || raw.qty < 1 || raw.qty > 99) {
      throw new AppError(`Line ${i + 1}: qty must be 1–99.`, 400, "INVALID_LINES");
    }
    const q = raw.productId.trim();
    const product = Types.ObjectId.isValid(q)
      ? await Product.findById(q)
      : await Product.findOne({ slug: q.toLowerCase() });
    if (!product) throw new AppError(`Product "${raw.productId}" not found.`, 404, "PRODUCT_NOT_FOUND");
    if (!product.isActive) throw new AppError(`"${product.name}" is no longer available.`, 400, "PRODUCT_UNAVAILABLE");
    if (availableStock(product) < raw.qty) {
      throw new AppError(`Only ${availableStock(product)} × "${product.name}" left in stock.`, 400, "OUT_OF_STOCK");
    }
    resolved.push({ product, qty: raw.qty, color: raw.color ?? null, size: raw.size ?? null });
  }

  const method = (input.shipping.method ?? "standard") as ShippingMethod;
  if (!SHIPPING_METHODS[method]) throw new AppError("Unknown shipping method.", 400, "INVALID_SHIPPING");
  const subtotal = resolved.reduce((s, r) => s + r.product.price * r.qty, 0);
  const totals = priceOrder(subtotal, coupon, method);

  // Atomic decrements with rollback on a late race.
  const taken: Array<{ id: Types.ObjectId; qty: number }> = [];
  try {
    for (const r of resolved) {
      const res = await Product.updateOne(
        { _id: r.product._id, stock: { $gte: r.qty } },
        { $inc: { stock: -r.qty, soldCount: r.qty } }
      );
      if ((res.modifiedCount ?? res.matchedCount ?? 0) === 0) {
        throw new AppError(
          `"${r.product.name}" just sold out — please review your cart.`,
          409,
          "STOCK_RACE"
        );
      }
      taken.push({ id: r.product._id as Types.ObjectId, qty: r.qty });
    }
  } catch (err) {
    for (const t of taken) {
      await Product.updateOne({ _id: t.id }, { $inc: { stock: t.qty, soldCount: -t.qty } });
    }
    throw err;
  }

  let doc: OrderDoc | null = null;
  for (let attempt = 0; attempt < 5 && !doc; attempt++) {
    try {
      doc = await Order.create({
        orderNumber: orderNumber(),
        user: uid,
        items: resolved.map((r) => ({
          product: r.product._id,
          slug: r.product.slug,
          name: r.product.name,
          brand: r.product.brand,
          price: r.product.price,
          image: r.product.images[0] ?? "",
          qty: r.qty,
          color: r.color,
          size: r.size
        })),
        customer: {
          firstName: input.customer.firstName.trim(),
          lastName: input.customer.lastName.trim(),
          email: input.customer.email.toLowerCase().trim(),
          phone: input.customer.phone?.trim() || undefined
        },
        shipping: {
          address: input.shipping.address.trim(),
          city: input.shipping.city.trim(),
          zip: input.shipping.zip.trim(),
          country: input.shipping.country.trim(),
          method,
          cost: totals.shipping
        },
        payment: {
          method: input.payment.method,
          reference: input.payment.reference?.trim() || undefined,
          // Simulated charge (Stage 8 wires the provider SDK; COD stays pending).
          status: input.payment.method === "cod" ? "pending" : "paid"
        },
        subtotal: totals.subtotal,
        discount: totals.discount,
        couponCode: totals.couponCode,
        shippingCost: totals.shipping,
        tax: totals.tax,
        total: totals.total,
        status: "processing",
        history: [{ status: "processing" as OrderStatus, at: new Date() }]
      });
    } catch (err) {
      if ((err as { code?: unknown }).code !== 11000) throw err;
      doc = null; // order-number collision — retry
    }
  }
  if (!doc) throw new AppError("Could not place the order, please try again.", 500, "ORDER_FAILED");

  if (fromCart && cart) {
    cart.items = [];
    await cart.save();
  }
  for (const r of resolved) {
    await logMovement({
      productId: r.product._id,
      type: "sale",
      qty: -r.qty,
      balance: Math.max(0, r.product.stock - r.qty),
      reason: `Sale ${doc.orderNumber}`,
      orderNumber: doc.orderNumber,
      actor: userId
    });
  }
  return toFrontendOrder(doc);
}

export async function listMyOrders(userId: string): Promise<FrontendOrder[]> {
  const docs = await Order.find({ user: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(100);
  return docs.map(toFrontendOrder);
}

export async function listAllOrders(filter: {
  status?: OrderStatus;
  page: number;
  limit: number;
}): Promise<{ items: FrontendOrder[]; total: number }> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  const [total, docs] = await Promise.all([
    Order.countDocuments(q),
    Order.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit)
  ]);
  return { items: docs.map(toFrontendOrder), total };
}

export async function getOrder(ref: string, userId: string, role: string): Promise<FrontendOrder> {
  const doc = await findOrder(ref);
  if (!doc) throw new AppError("Order not found.", 404, "NOT_FOUND");
  const isOwner = String(doc.user) === String(userId);
  const isStaff = (FULFILMENT_ROLES as readonly string[]).includes(role);
  if (!isOwner && !isStaff) throw new AppError("Order not found.", 404, "NOT_FOUND");
  return toFrontendOrder(doc);
}

const STAFF_FULFIL = ["admin", "inventory-manager", "warehouse-employee"] as const;

/**
 * Status transitions with role matrix + restock on cancel.
 * Owner: pending/processing → cancelled. Staff: forward fulfilment;
 * admin/inventory-manager may also cancel unfulfilled orders; admin refunds delivered.
 */
export async function updateOrderStatus(
  ref: string,
  actor: { id: string; role: string },
  next: OrderStatus,
  note?: string
): Promise<FrontendOrder> {
  if (!ORDER_STATUSES.includes(next)) throw new AppError("Unknown order status.", 400, "INVALID_STATUS");
  const doc = await findOrder(ref);
  if (!doc) throw new AppError("Order not found.", 404, "NOT_FOUND");
  const isOwner = String(doc.user) === String(actor.id);
  const role = actor.role;
  const cur = doc.status;
  const terminal: OrderStatus[] = ["cancelled", "refunded", "delivered"];

  if (next === cur) return toFrontendOrder(doc);
  if (terminal.includes(cur)) {
    throw new AppError(`Order is already ${cur}.`, 400, "IMMUTABLE_ORDER");
  }

  const staff = (STAFF_FULFIL as readonly string[]).includes(role) || ["super-admin", "admin", "order-manager", "inventory-manager", "warehouse-employee"].includes(role);
  const canCancelOrder = (ORDER_ADMIN_ROLES as readonly string[]).includes(role) || ["super-admin", "admin", "order-manager"].includes(role);
  const restock = async (): Promise<void> => {
    for (const l of doc.items) {
      await Product.updateOne({ _id: l.product }, { $inc: { stock: l.qty } });
      const fresh = await Product.findById(l.product).select("stock");
      await logMovement({
        productId: l.product,
        type: "restock",
        qty: l.qty,
        balance: fresh?.stock ?? l.qty,
        reason: `Cancel ${doc.orderNumber}`,
        orderNumber: doc.orderNumber,
        actor: actor.id
      });
    }
  };

  if (next === "cancelled") {
    if (isOwner && (cur === "pending" || cur === "processing")) {
      await restock();
    } else if (canCancelOrder && cur !== "delivered" && cur !== "refunded") {
      await restock();
    } else {
      throw new AppError("This order can no longer be cancelled.", 400, "CANCEL_CLOSED");
    }
  } else if (["confirmed", "processing", "packed", "shipped", "delivered"].includes(next)) {
    if (!staff) throw new AppError("Only staff can advance fulfilment.", 403, "FORBIDDEN");
    const flow: OrderStatus[] = ["pending", "confirmed", "processing", "packed", "shipped", "delivered"];
    const ci = flow.indexOf(cur); const ni = flow.indexOf(next);
    if (ci === -1) throw new AppError("Order is in a terminal state.", 400, "IMMUTABLE_ORDER");
    if (ni <= ci) throw new AppError("Orders cannot move backwards.", 400, "BAD_TRANSITION");
    if (ni > ci + 2) throw new AppError("Orders must advance step by step.", 400, "BAD_TRANSITION");
    if (next === "shipped" && cur === "processing") { /* legacy path: processing -> shipped allowed */ }
  } else if (next === "failed") {
    if (!staff) throw new AppError("Only staff can mark orders failed.", 403, "FORBIDDEN");
    if (cur !== "pending" && cur !== "confirmed") throw new AppError("Only unfulfilled orders can fail.", 400, "BAD_TRANSITION");
    await restock();
  } else if (next === "returned" || next === "partially_returned") {
    if (!staff) throw new AppError("Only staff can record returns.", 403, "FORBIDDEN");
    if (cur !== "delivered") throw new AppError("Only delivered orders can be returned.", 400, "BAD_TRANSITION");
  } else if (next === "refunded") {
    if (role !== "admin" && role !== "super-admin" && role !== "finance-manager") {
      throw new AppError("Only finance staff can refund delivered orders.", 403, "FORBIDDEN");
    }
    if (cur !== "delivered" && cur !== "returned" && cur !== "partially_returned") {
      throw new AppError("Only delivered/returned orders can be refunded.", 400, "BAD_TRANSITION");
    }
  } else if (next === "pending" || next === "confirmed") {
    throw new AppError("Orders cannot move backwards.", 400, "BAD_TRANSITION");
  }

  doc.status = next;
  doc.history.push({ status: next, at: new Date(), ...(note ? { note: note.slice(0, 300) } : {}), by: actor.id } as never);
  await doc.save();
  try {
    const { notify } = await import("./notificationService.js");
    await notify("order", "Order " + next, doc.orderNumber + " moved to " + next, "order", doc.orderNumber);
  } catch (err) {
    logger.warn("[orders] Failed to record order notification:", err);
  }
  return toFrontendOrder(doc);
}

export async function listAdminOrders(filter: { status?: OrderStatus; q?: string; from?: string; to?: string; page: number; limit: number }): Promise<{ items: AdminOrder[]; total: number }> {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.from || filter.to) { const c: Record<string, unknown> = {}; if (filter.from) c.$gte = new Date(filter.from); if (filter.to) c.$lte = new Date(filter.to); q.createdAt = c; }
  if (filter.q) { const rx = new RegExp(filter.q.trim().replace(/[.*+?^()|[\]\\$]/g, (m) => '\\' + m), 'i'); q.$or = [{ orderNumber: rx }, { 'customer.email': rx }, { 'customer.firstName': rx }, { 'customer.lastName': rx }]; }
  const [total, docs] = await Promise.all([ Order.countDocuments(q), Order.find(q).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.limit).limit(filter.limit) ]);
  return { items: docs.map(toAdminOrder), total };
}

export async function getAdminOrder(ref: string): Promise<AdminOrder> {
  const doc = await findOrder(ref);
  if (!doc) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  return toAdminOrder(doc);
}

export async function addOrderNote(ref: string, actorId: string, body: string): Promise<AdminOrder> {
  const doc = await findOrder(ref);
  if (!doc) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  if (!body || !body.trim()) throw new AppError('Note cannot be empty.', 400, 'NOTE_REQUIRED');
  (doc as unknown as { notes: Array<{ body: string; by: string; at: Date }> }).notes.push({ body: body.trim().slice(0, 1000), by: actorId, at: new Date() });
  await doc.save();
  try {
    const { audit } = await import('./auditService.js');
    await audit({ actorId, action: 'order.note', entity: 'order', entityId: doc.orderNumber, after: { body: body.slice(0, 200) } });
  } catch (err) {
    logger.warn("[orders] Failed to audit order note:", err);
  }
  return toAdminOrder(doc);
}
