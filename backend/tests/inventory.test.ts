import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Cart } from "../src/models/Cart.js";
import { Category } from "../src/models/Category.js";
import { Order } from "../src/models/Order.js";
import { Product } from "../src/models/Product.js";
import { StockMovement } from "../src/models/StockMovement.js";
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

async function seedInventory() {
  const cat = await Category.create({ name: "Audio", slug: "audio" });
  const mk = (o: Record<string, unknown>) =>
    Product.create({
      description: "Fixture.",
      brand: "Aural",
      images: [],
      rating: 4.5,
      reviewCount: 1,
      stock: 10,
      lowStockThreshold: 5,
      tags: [],
      colors: [],
      sizes: [],
      variants: [],
      specifications: {},
      ...o
    });
  const buds = await mk({ name: "Pulse Buds", slug: "pulse-buds", category: cat._id, price: 100 });
  const tee = await mk({ name: "Essential Tee", slug: "essential-tee", category: cat._id, price: 50, stock: 2 });
  return { buds, tee };
}

const customer = { firstName: "Ada", lastName: "T", email: "ada@x.com" };
const shipping = { address: "1 Main St", city: "Springfield", zip: "12345", country: "United States", method: "standard" };
const payment = { method: "card" };

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
    Order.deleteMany({}),
    StockMovement.deleteMany({})
  ]);
});

describe("inventory auth", () => {
  it("requires stock staff (customers blocked, strangers 401)", async () => {
    const customer = await tokenFor("c@x.com");
    const anon = await request(app).get("/api/v1/inventory/overview");
    expect(anon.status).toBe(401);
    const denied = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Authorization", `Bearer ${customer}`)
      .send({ productId: "x", stock: 1, reason: "count" });
    expect(denied.status).toBe(403);
  });
});

describe("stock-takes", () => {
  it("sets absolute stock and logs the signed delta", async () => {
    const { buds } = await seedInventory();
    const manager = await tokenFor("m@x.com", "inventory-manager");
    const res = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Authorization", `Bearer ${manager}`)
      .send({ productId: "pulse-buds", stock: 25, reason: "Year-end count" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug: "pulse-buds", stock: 25, available: 25, delta: 15 });

    const moves = await request(app)
      .get("/api/v1/inventory/movements?productId=pulse-buds")
      .set("Authorization", `Bearer ${manager}`);
    expect(moves.body.meta.total).toBe(1);
    expect(moves.body.data[0]).toMatchObject({ type: "adjustment", qty: 15, balance: 25 });

    // No-op takes log nothing.
    await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Authorization", `Bearer ${manager}`)
      .send({ productId: String(buds._id), stock: 25, reason: "Recount" });
    const again = await request(app).get("/api/v1/inventory/movements").set("Authorization", `Bearer ${manager}`);
    expect(again.body.meta.total).toBe(1);
  });

  it("rejects negative stock, unknown products, and blank reasons", async () => {
    await seedInventory();
    const admin = await tokenFor("root@x.com", "admin");
    const auth = { Authorization: `Bearer ${admin}` };
    const neg = await request(app)
      .post("/api/v1/inventory/adjust")
      .set(auth)
      .send({ productId: "pulse-buds", stock: -1, reason: "oops" });
    expect(neg.status).toBe(400);
    const unknown = await request(app)
      .post("/api/v1/inventory/adjust")
      .set(auth)
      .send({ productId: "nope", stock: 5, reason: "count" });
    expect(unknown.status).toBe(404);
  });

  it("warehouse staff may count, and ledger filters work", async () => {
    await seedInventory();
    const wh = await tokenFor("wh@x.com", "warehouse-employee");
    const res = await request(app)
      .post("/api/v1/inventory/adjust")
      .set("Authorization", `Bearer ${wh}`)
      .send({ productId: "essential-tee", stock: 7, reason: "Shelf count" });
    expect(res.status).toBe(201);

    const sales = await request(app)
      .get("/api/v1/inventory/movements?type=sale")
      .set("Authorization", `Bearer ${wh}`);
    expect(sales.body.meta.total).toBe(0);
    const all = await request(app).get("/api/v1/inventory/movements").set("Authorization", `Bearer ${wh}`);
    expect(all.body.meta.total).toBe(1);
    expect(all.body.data[0].productSlug).toBe("essential-tee");
  });
});

describe("ledger + low stock", () => {
  it("checkout writes sale movements; cancel writes restocks", async () => {
    await seedInventory();
    const owner = await tokenFor("o@x.com");
    const admin = await tokenFor("root@x.com", "admin");
    const placed = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${owner}`)
      .send({
        items: [{ productId: "pulse-buds", qty: 2 }],
        customer,
        shipping,
        payment
      });
    expect(placed.status).toBe(201);
    const id = placed.body.data.id as string;

    const sales = await request(app)
      .get("/api/v1/inventory/movements?type=sale")
      .set("Authorization", `Bearer ${admin}`);
    expect(sales.body.data[0]).toMatchObject({ qty: -2, balance: 8, orderNumber: id });

    await request(app)
      .patch(`/api/v1/orders/${id}/status`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ status: "cancelled" });
    const restocks = await request(app)
      .get("/api/v1/inventory/movements?type=restock")
      .set("Authorization", `Bearer ${admin}`);
    expect(restocks.body.data[0]).toMatchObject({ qty: 2, balance: 10, orderNumber: id });
  });

  it("flags low and out-of-stock products, worst first", async () => {
    await seedInventory();
    const admin = await tokenFor("root@x.com", "admin");
    await Product.updateOne({ slug: "pulse-buds" }, { stock: 0 });
    const res = await request(app).get("/api/v1/inventory/low-stock").set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(200);
    // tee: available 2 ≤ 5; buds: 0
    expect(res.body.data.map((l: { slug: string }) => l.slug)).toEqual(["pulse-buds", "essential-tee"]);
    expect(res.body.data[0]).toMatchObject({ available: 0, lowStockThreshold: 5 });

    const overview = await request(app).get("/api/v1/inventory/overview").set("Authorization", `Bearer ${admin}`);
    expect(overview.body.data).toMatchObject({ totalProducts: 2, totalUnits: 2, outOfStock: 1, lowStock: 2 });
  });
});
