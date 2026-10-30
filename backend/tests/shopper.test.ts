import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Cart } from "../src/models/Cart.js";
import { Wishlist } from "../src/models/Wishlist.js";
import { Category } from "../src/models/Category.js";
import { Product } from "../src/models/Product.js";
import { User } from "../src/models/User.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { getTestDbUri } from "./testDb.js";

const uri = getTestDbUri();
const app = createApp();

async function tokenFor(email: string): Promise<string> {
  const user = await User.create({ name: "Shopper", email, passwordHash: "unused-test-hash", role: "customer" });
  return signAccessToken(String(user._id), "customer");
}

async function seedShop() {
  const cat = await Category.create({ name: "Audio", slug: "audio" });
  const mk = (o: Record<string, unknown>) =>
    Product.create({
      description: "Fixture.",
      brand: "Aural",
      images: ["https://x/y.jpg"],
      rating: 4.5,
      reviewCount: 10,
      featured: false,
      tags: [],
      variants: [],
      specifications: {},
      ...o
    });
  const tee = await mk({
    name: "Essential Tee",
    slug: "essential-tee",
    brand: "Field",
    category: cat._id,
    price: 45,
    stock: 5,
    colors: [{ name: "White", hex: "#f5f5f5" }],
    sizes: ["M", "L"]
  });
  const buds = await mk({
    name: "Pulse Buds",
    slug: "pulse-buds",
    category: cat._id,
    price: 179,
    stock: 0
  });
  const retired = await mk({
    name: "Retired Reel",
    slug: "retired-reel",
    category: cat._id,
    price: 99,
    stock: 10,
    isActive: false
  });
  return { tee, buds, retired };
}

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
    Wishlist.deleteMany({})
  ]);
});

describe("cart auth + empty state", () => {
  it("requires a token (401 without)", async () => {
    const get = await request(app).get("/api/v1/cart");
    expect(get.status).toBe(401);
    const post = await request(app).post("/api/v1/cart").send({ items: [] });
    expect(post.status).toBe(401);
    const wish = await request(app).get("/api/v1/wishlist");
    expect(wish.status).toBe(401);
  });

  it("returns the empty cart shape for new users", async () => {
    const token = await tokenFor("a@x.com");
    const res = await request(app).get("/api/v1/cart").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      items: [],
      count: 0,
      subtotal: 0,
      couponCode: null,
      shippingId: "standard",
      updatedAt: null
    });
  });
});

describe("cart merge + replace", () => {
  it("merges lines, increments on repeat, and caps at availability", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    const id = String(tee._id);

    const first = await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: id, qty: 3, color: "White", size: "M" }] });
    expect(first.status).toBe(200);
    expect(first.body.data.count).toBe(3);
    expect(first.body.data.subtotal).toBe(45 * 3);
    expect(first.body.data.items[0]).toMatchObject({
      productId: id,
      slug: "essential-tee",
      qty: 3,
      available: 5,
      lineTotal: 135
    });

    // 3 + 3 would exceed stock 5 → capped, never rejected.
    const second = await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "essential-tee", qty: 3, color: "White", size: "M" }] });
    expect(second.status).toBe(200);
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.items[0].qty).toBe(5);
    expect(second.body.data.count).toBe(5);
  });

  it("keeps variant combinations as separate lines", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const res = await request(app)
      .post("/api/v1/cart")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { productId: String(tee._id), qty: 1, color: "White", size: "M" },
          { productId: String(tee._id), qty: 1, color: "White", size: "L" }
        ]
      });
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
  });

  it("rejects unknown/inactive/out-of-stock products and bad options (all-or-nothing)", async () => {
    await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };

    const unknown = await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "nope", qty: 1 }] });
    expect(unknown.status).toBe(404);

    for (const bad of ["retired-reel", "pulse-buds"]) {
      const res = await request(app)
        .post("/api/v1/cart")
        .set(auth)
        .send({ items: [{ productId: bad, qty: 1 }] });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_LINES");
    }
    // Nothing was saved by the failed merges.
    const cart = await request(app).get("/api/v1/cart").set(auth);
    expect(cart.body.data.items).toHaveLength(0);

    const badColor = await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "essential-tee", qty: 1, color: "Neon" }] });
    expect(badColor.status).toBe(400);

    const badQty = await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "essential-tee", qty: 0 }] });
    expect(badQty.status).toBe(400);
    expect(badQty.body.code).toBe("VALIDATION_ERROR");
  });

  it("replaces the whole cart, and [] clears it", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: String(tee._id), qty: 2 }] });

    const replaced = await request(app)
      .put("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: "essential-tee", qty: 1, size: "L" }] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.items).toHaveLength(1);
    expect(replaced.body.data.items[0]).toMatchObject({ qty: 1, size: "L" });

    const cleared = await request(app).put("/api/v1/cart").set(auth).send({ items: [] });
    expect(cleared.body.data).toMatchObject({ items: [], count: 0, subtotal: 0 });
  });

  it("stores prefs (coupon uppercased) and keeps them across clear", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/api/v1/cart")
      .set(auth)
      .send({ items: [{ productId: String(tee._id), qty: 1 }], couponCode: "welcome10", shippingId: "express" });

    const patched = await request(app).patch("/api/v1/cart").set(auth).send({ couponCode: "freeship" });
    expect(patched.body.data.couponCode).toBe("FREESHIP");
    expect(patched.body.data.shippingId).toBe("express");

    const cleared = await request(app).delete("/api/v1/cart").set(auth);
    expect(cleared.body.data).toMatchObject({ items: [], couponCode: "FREESHIP", shippingId: "express" });
  });

  it("isolates carts per user", async () => {
    const { tee } = await seedShop();
    const a = await tokenFor("a@x.com");
    const b = await tokenFor("b@x.com");
    await request(app)
      .post("/api/v1/cart")
      .set("Authorization", `Bearer ${a}`)
      .send({ items: [{ productId: String(tee._id), qty: 2 }] });
    const other = await request(app).get("/api/v1/cart").set("Authorization", `Bearer ${b}`);
    expect(other.body.data.items).toHaveLength(0);
  });
});

describe("wishlist", () => {
  it("toggles add/remove and returns id lists", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    const id = String(tee._id);

    const empty = await request(app).get("/api/v1/wishlist").set(auth);
    expect(empty.body.data).toEqual({ items: [] });

    const added = await request(app).post("/api/v1/wishlist/toggle").set(auth).send({ productId: id });
    expect(added.status).toBe(200);
    expect(added.body.data).toEqual({ wished: true, items: [id] });

    const removed = await request(app).post("/api/v1/wishlist/toggle").set(auth).send({ productId: "essential-tee" });
    expect(removed.body.data).toEqual({ wished: false, items: [] });
  });

  it("rejects unknown/inactive products on add", async () => {
    await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    const unknown = await request(app).post("/api/v1/wishlist/toggle").set(auth).send({ productId: "nope" });
    expect(unknown.status).toBe(404);
    const inactive = await request(app)
      .post("/api/v1/wishlist/toggle")
      .set(auth)
      .send({ productId: "retired-reel" });
    expect(inactive.status).toBe(400);
  });

  it("removes idempotently by id or slug", async () => {
    const { tee } = await seedShop();
    const token = await tokenFor("a@x.com");
    const auth = { Authorization: `Bearer ${token}` };
    const id = String(tee._id);
    await request(app).post("/api/v1/wishlist/toggle").set(auth).send({ productId: id });

    const bySlug = await request(app).delete("/api/v1/wishlist/essential-tee").set(auth);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data).toEqual({ items: [] });

    const again = await request(app).delete(`/api/v1/wishlist/${id}`).set(auth);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ items: [] });
  });

  it("isolates wishlists per user", async () => {
    const { tee } = await seedShop();
    const a = await tokenFor("a@x.com");
    const b = await tokenFor("b@x.com");
    await request(app)
      .post("/api/v1/wishlist/toggle")
      .set("Authorization", `Bearer ${a}`)
      .send({ productId: String(tee._id) });
    const other = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${b}`);
    expect(other.body.data).toEqual({ items: [] });
  });
});
