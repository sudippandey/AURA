import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Cart } from "../src/models/Cart.js";
import { Category } from "../src/models/Category.js";
import { Order } from "../src/models/Order.js";
import { Product } from "../src/models/Product.js";
import { User } from "../src/models/User.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { getTestDbUri } from "./testDb.js";

const uri = getTestDbUri();
const app = createApp();

type Role = "admin" | "inventory-manager" | "warehouse-employee" | "customer";

async function tokenFor(email: string, role: Role = "customer"): Promise<string> {
  const user = await User.create({ name: `${role} tester`, email, passwordHash: "unused-test-hash", role });
  return signAccessToken(String(user._id), role);
}

async function seedShop() {
  const cat = await Category.create({ name: "Audio", slug: "audio" });
  const buds = await Product.create({
    name: "Pulse Buds",
    slug: "pulse-buds",
    description: "Fixture.",
    brand: "Aural",
    category: cat._id,
    price: 100,
    images: ["https://x/b.jpg"],
    rating: 4.5,
    reviewCount: 10,
    stock: 10,
    tags: [],
    colors: [],
    sizes: [],
    variants: [],
    specifications: {}
  });
  const tee = await Product.create({
    name: "Essential Tee",
    slug: "essential-tee",
    description: "Fixture.",
    brand: "Field",
    category: cat._id,
    price: 50,
    images: ["https://x/t.jpg"],
    rating: 4.5,
    reviewCount: 10,
    stock: 3,
    tags: [],
    colors: [],
    sizes: [],
    variants: [],
    specifications: {}
  });
  return { buds, tee };
}

const customer = {
  firstName: "Ada",
  lastName: "Tester",
  email: "ada@x.com",
  phone: "+15551234567"
};
const shipping = {
  address: "1 Main St",
  city: "Springfield",
  zip: "12345",
  country: "United States",
  method: "standard"
};
const payment = { method: "card", reference: "pay_test_123" };

beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.db?.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Promise.all([
    Category.deleteMany({}),
    Product.deleteMany({}),
    User.deleteMany({}),
    Cart.deleteMany({}),
    Order.deleteMany({})
  ]);
});

describe("checkout", () => {
  it("requires a token", async () => {
    const res = await request(app).post("/api/v1/orders").send({});
    expect(res.status).toBe(401);
  });

  it("checks out from the cart: snapshots, server totals, decrements stock, clears cart", async () => {
    const { buds, tee } = await seedShop();
    const token = await tokenFor("ada@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({
        items: [
          { productId: String(buds._id), qty: 2 },
          { productId: "essential-tee", qty: 1 }
        ],
        couponCode: "welcome10"
      });

    const res = await request(app).post("/api/v1/orders").set(auth).send({ customer, shipping, payment });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^ORD-\d{6}$/);
    expect(res.body.data.status).toBe("processing");
    // 2×100 + 1×50 = 250; WELCOME10 −25; free ship (225 ≥ 75); tax 225×.08 = 18
    expect(res.body.data.totals).toMatchObject({ subtotal: 250, discount: 25, shipping: 0, tax: 18, total: 243 });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.customer.email).toBe("ada@x.com");
    expect(new Date(res.body.data.createdAt).toString()).not.toBe("Invalid Date");

    const afterBuds = await Product.findById(buds._id);
    const afterTee = await Product.findById(tee._id);
    expect(afterBuds?.stock).toBe(8);
    expect(afterBuds?.soldCount).toBe(2);
    expect(afterTee?.stock).toBe(2);

    const cart = await request(app).get("/api/v1/cart").set(auth);
    expect(cart.body.data.items).toHaveLength(0);
  });

  it("checks out buy-now items without touching the cart", async () => {
    await seedShop();
    const token = await tokenFor("ada@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "essential-tee", qty: 1 }] });
    const res = await request(app).post("/api/v1/orders").set(auth).send({
      items: [{ productId: "pulse-buds", qty: 1 }],
      customer,
      shipping,
      payment
    });
    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totals.subtotal).toBe(100);
    const cart = await request(app).get("/api/v1/cart").set(auth);
    expect(cart.body.data.items).toHaveLength(1); // untouched
  });

  it("prices small orders honestly (no coupon, paid shipping, tax)", async () => {
    await seedShop();
    const token = await tokenFor("ada@x.com");
    const res = await request(app).post("/api/v1/orders").set("Authorization", `Bearer ${token}`).send({
      items: [{ productId: "essential-tee", qty: 1 }],
      customer,
      shipping,
      payment
    });
    // 50; no discount; standard 6.95 (< 75); tax 4; total 60.95
    expect(res.body.data.totals).toMatchObject({ subtotal: 50, discount: 0, shipping: 6.95, tax: 4, total: 60.95 });

    const freeship = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId: "essential-tee", qty: 1 }],
        customer,
        shipping,
        payment,
        couponCode: "FREESHIP"
      });
    expect(freeship.body.data.totals.shipping).toBe(0);

    // PREMIUM15 needs $200+ — ignored below the threshold.
    const premium = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId: "essential-tee", qty: 1 }],
        customer,
        shipping,
        payment,
        couponCode: "PREMIUM15"
      });
    expect(premium.body.data.totals.discount).toBe(0);
  });

  it("rejects empty carts, oversell, and bad input without side effects", async () => {
    const { buds } = await seedShop();
    const token = await tokenFor("ada@x.com");
    const auth = { Authorization: `Bearer ${token}` };

    const empty = await request(app).post("/api/v1/orders").set(auth).send({ customer, shipping, payment });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe("EMPTY_CART");

    const oversell = await request(app).post("/api/v1/orders").set(auth).send({
      items: [{ productId: "essential-tee", qty: 9 }],
      customer,
      shipping,
      payment
    });
    expect(oversell.status).toBe(400);
    expect(oversell.body.code).toBe("OUT_OF_STOCK");
    const tee = await Product.findOne({ slug: "essential-tee" });
    expect(tee?.stock).toBe(3); // untouched

    const badAddress = await request(app).post("/api/v1/orders").set(auth).send({
      items: [{ productId: String(buds._id), qty: 1 }],
      customer,
      shipping: { ...shipping, city: "" },
      payment
    });
    expect(badAddress.status).toBe(400);
    expect(badAddress.body.code).toBe("VALIDATION_ERROR");
  });

  it("lists own orders and resolves details; strangers get 404", async () => {
    await seedShop();
    const a = await tokenFor("a@x.com");
    const b = await tokenFor("b@x.com");
    const created = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${a}`)
      .send({ items: [{ productId: "pulse-buds", qty: 1 }], customer, shipping, payment });
    const id = created.body.data.id as string;

    const mine = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${a}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const detail = await request(app).get(`/api/v1/orders/${id}`).set("Authorization", `Bearer ${a}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.totals.total).toBeGreaterThan(0);

    const stranger = await request(app).get(`/api/v1/orders/${id}`).set("Authorization", `Bearer ${b}`);
    expect(stranger.status).toBe(404);
  });
});

describe("order status flow", () => {
  async function place(token: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: "pulse-buds", qty: 2 }], customer, shipping, payment });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it("owner cancels a fresh order (stock restored); closed orders stay closed", async () => {
    const { buds } = await seedShop();
    const owner = await tokenFor("owner@x.com");
    const id = await place(owner);
    const cancelled = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ status: "cancelled" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    const restocked = await Product.findById(buds._id);
    expect(restocked?.stock).toBe(10);

    const again = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ status: "processing" });
    expect(again.status).toBe(400);
  });

  it("runs the fulfilment chain with role guards", async () => {
    await seedShop();
    const owner = await tokenFor("owner@x.com");
    const admin = await tokenFor("root@x.com", "admin");
    const warehouse = await tokenFor("wh@x.com", "warehouse-employee");
    const id = await place(owner);

    // Owner cannot ship their own order.
    const ownerShip = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ status: "shipped" });
    expect(ownerShip.status).toBe(400);

    const shipped = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${warehouse}`)
      .send({ status: "shipped" });
    expect(shipped.body.data.status).toBe("shipped");

    // Owner cancel window is over.
    const lateCancel = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ status: "cancelled" });
    expect(lateCancel.status).toBe(400);

    // Warehouse cannot refund; admin delivers then refunds.
    const whRefund = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${warehouse}`)
      .send({ status: "refunded" });
    expect(whRefund.status).toBe(400);

    const delivered = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "delivered" });
    expect(delivered.body.data.status).toBe("delivered");

    const refunded = await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "refunded", note: "Return received" });
    expect(refunded.body.data.status).toBe("refunded");
  });

  it("serves the staff order list (?all=true) while customers get their own", async () => {
    await seedShop();
    const owner = await tokenFor("owner@x.com");
    const admin = await tokenFor("root@x.com", "admin");
    await place(owner);

    const all = await request(app).get("/api/v1/orders?all=true").set("Authorization", `Bearer ${admin}`);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(1);
    expect(all.body.data[0].id).toMatch(/^ORD-/);

    const filtered = await request(app)
      .get("/api/v1/orders?all=true&status=processing")
      .set("Authorization", `Bearer ${admin}`);
    expect(filtered.body.meta.total).toBe(1);

    // ?all is ignored for customers — they just get their history array.
    const mine = await request(app).get("/api/v1/orders?all=true").set("Authorization", `Bearer ${owner}`);
    expect(mine.status).toBe(200);
    expect(Array.isArray(mine.body.data)).toBe(true);
  });
});
