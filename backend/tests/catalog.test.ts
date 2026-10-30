import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Category } from "../src/models/Category.js";
import { Product } from "../src/models/Product.js";
import { User } from "../src/models/User.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { getTestDbUri } from "./testDb.js";

const uri = getTestDbUri();
const app = createApp();

async function tokenFor(role: "admin" | "inventory-manager" | "customer", email: string): Promise<string> {
  const user = await User.create({
    name: `${role} tester`,
    email,
    passwordHash: "unused-test-hash",
    role
  });
  return signAccessToken(String(user._id), role);
}

async function seedCatalog() {
  const audio = await Category.create({ name: "Audio", slug: "audio" });
  const watches = await Category.create({ name: "Watches", slug: "watches" });
  const mk = (o: Record<string, unknown>) =>
    Product.create({
      description: "Fixture product.",
      brand: "Aural",
      images: [],
      rating: 4.5,
      reviewCount: 100,
      stock: 10,
      featured: false,
      tags: [],
      colors: [],
      sizes: [],
      variants: [],
      specifications: {},
      ...o
    });
  const a = await mk({
    name: "Aria Headphones",
    slug: "aria-headphones",
    brand: "Aural",
    category: audio._id,
    price: 349,
    originalPrice: 429,
    rating: 4.8,
    reviewCount: 2314,
    stock: 34,
    featured: true,
    tags: ["trending", "bestseller"],
    colors: [{ name: "Charcoal", hex: "#2b2b2b" }],
    sizes: [],
    specifications: { Driver: "40mm" },
    createdAt: new Date("2026-06-02")
  });
  const b = await mk({
    name: "Pulse Buds",
    slug: "pulse-buds",
    brand: "Aural",
    category: audio._id,
    price: 179,
    rating: 4.5,
    reviewCount: 1740,
    stock: 0,
    tags: ["trending"],
    createdAt: new Date("2026-08-21")
  });
  const c = await mk({
    name: "Meridian Chrono",
    slug: "meridian-chrono",
    brand: "Nordmark",
    category: watches._id,
    price: 489,
    rating: 4.9,
    reviewCount: 642,
    stock: 12,
    featured: true,
    tags: ["bestseller"],
    colors: [{ name: "Tan", hex: "#b98a4e" }],
    sizes: ["41mm", "45mm"],
    createdAt: new Date("2026-07-10")
  });
  const d = await mk({
    name: "Retired Reel",
    slug: "retired-reel",
    brand: "Aural",
    category: audio._id,
    price: 99,
    isActive: false,
    createdAt: new Date("2025-01-01")
  });
  return { audio, watches, a, b, c, d };
}

beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.db?.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Promise.all([Category.deleteMany({}), Product.deleteMany({}), User.deleteMany({})]);
});

describe("categories", () => {
  it("lists categories with live product counts (public)", async () => {
    await seedCatalog();
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    const audio = res.body.data.find((c: { slug: string }) => c.slug === "audio");
    expect(audio.productCount).toBe(2); // inactive product excluded
    expect(audio.desc).toBeDefined();
  });

  it("resolves by id and by slug; 404 for unknown", async () => {
    const { audio } = await seedCatalog();
    const bySlug = await request(app).get("/api/v1/categories/audio");
    expect(bySlug.status).toBe(200);
    const byId = await request(app).get(`/api/v1/categories/${String(audio._id)}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.slug).toBe("audio");
    const missing = await request(app).get("/api/v1/categories/nope");
    expect(missing.status).toBe(404);
  });

  it("creates as a writer (201), blocks customers (403) and strangers (401)", async () => {
    const admin = await tokenFor("admin", "a@x.com");
    const customer = await tokenFor("customer", "c@x.com");
    const created = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Skincare" });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe("skincare"); // auto-slugified

    const dup = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Skincare" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("SLUG_TAKEN");

    const forbidden = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${customer}`)
      .send({ name: "Nope" });
    expect(forbidden.status).toBe(403);

    const anon = await request(app).post("/api/v1/categories").send({ name: "Nope" });
    expect(anon.status).toBe(401);

    const bad = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "x" });
    expect(bad.status).toBe(400);
  });

  it("safe-deletes: blocks while products reference it, allows empty ones", async () => {
    await seedCatalog();
    const admin = await tokenFor("admin", "a@x.com");
    const blocked = await request(app)
      .delete("/api/v1/categories/audio")
      .set("Authorization", `Bearer ${admin}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CATEGORY_IN_USE");

    const empty = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Empty" });
    const gone = await request(app)
      .delete(`/api/v1/categories/${empty.body.data.id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(gone.status).toBe(200);
  });

  it("blocks deletes while child categories nest under it", async () => {
    const admin = await tokenFor("admin", "a@x.com");
    const parent = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Parent" });
    await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "Child", parent: parent.body.data.id });
    const blocked = await request(app)
      .delete(`/api/v1/categories/${parent.body.data.id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CATEGORY_HAS_CHILDREN");
  });

  it("serves a category's products with pagination", async () => {
    await seedCatalog();
    const res = await request(app).get("/api/v1/categories/audio/products?limit=1&page=2");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 2, page: 2, pages: 2, limit: 1 });
    expect(res.body.data).toHaveLength(1);
  });
});

describe("product listing", () => {
  it("returns the paginated envelope and hides inactive products", async () => {
    await seedCatalog();
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1, limit: 9 });
    const item = res.body.data[0];
    expect(item).toMatchObject({ id: expect.any(String), category: expect.any(String) });
    expect(item.stock).toBeDefined();
    expect(new Date(item.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("filters by category (slug or id), brand, price, rating, stock, color, size", async () => {
    const { audio } = await seedCatalog();
    const bySlug = await request(app).get("/api/v1/products?category=audio");
    expect(bySlug.body.meta.total).toBe(2);
    const byId = await request(app).get(`/api/v1/products?category=${String(audio._id)}`);
    expect(byId.body.meta.total).toBe(2);
    const brand = await request(app).get("/api/v1/products?brands=Nordmark");
    expect(brand.body.meta.total).toBe(1);
    const price = await request(app).get("/api/v1/products?minPrice=400&maxPrice=500");
    expect(price.body.meta.total).toBe(1);
    const rating = await request(app).get("/api/v1/products?minRating=4.85");
    expect(rating.body.meta.total).toBe(1);
    const stock = await request(app).get("/api/v1/products?inStock=true");
    expect(stock.body.meta.total).toBe(2);
    const color = await request(app).get("/api/v1/products?colors=Charcoal");
    expect(color.body.meta.total).toBe(1);
    const size = await request(app).get("/api/v1/products?sizes=41mm");
    expect(size.body.meta.total).toBe(1);
  });

  it("searches across name/brand/description", async () => {
    await seedCatalog();
    const res = await request(app).get("/api/v1/products?search=chrono");
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].slug).toBe("meridian-chrono");
  });

  it("sorts price-asc, newest, rating and defaults to featured-first", async () => {
    await seedCatalog();
    const asc = await request(app).get("/api/v1/products?sort=price-asc");
    expect(asc.body.data.map((p: { price: number }) => p.price)).toEqual([179, 349, 489]);
    const newest = await request(app).get("/api/v1/products?sort=newest");
    expect(newest.body.data[0].slug).toBe("pulse-buds");
    const rating = await request(app).get("/api/v1/products?sort=rating");
    expect(rating.body.data[0].slug).toBe("meridian-chrono");
    const def = await request(app).get("/api/v1/products");
    expect(def.body.data[0].featured).toBe(true);
  });

  it("serves rails, single lookups, search and related", async () => {
    const { a } = await seedCatalog();
    for (const rail of ["featured", "trending", "bestsellers", "new"]) {
      const res = await request(app).get(`/api/v1/products/${rail}?limit=2`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
    const search = await request(app).get("/api/v1/products/search?q=aria");
    expect(search.body.data[0].slug).toBe("aria-headphones");

    const byId = await request(app).get(`/api/v1/products/${String(a._id)}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.slug).toBe("aria-headphones");
    const bySlug = await request(app).get("/api/v1/products/slug/pulse-buds");
    expect(bySlug.status).toBe(200);

    const related = await request(app).get(`/api/v1/products/${String(a._id)}/related`);
    expect(related.status).toBe(200);
    expect(related.body.data.length).toBeGreaterThan(0);

    const missing = await request(app).get("/api/v1/products/does-not-exist");
    expect(missing.status).toBe(404);
  });

  it("lets writers preview inactive products with ?all=true", async () => {
    await seedCatalog();
    const admin = await tokenFor("admin", "a@x.com");
    const pub = await request(app).get("/api/v1/products");
    expect(pub.body.meta.total).toBe(3);
    const preview = await request(app).get("/api/v1/products?all=true").set("Authorization", `Bearer ${admin}`);
    expect(preview.body.meta.total).toBe(4);
    const anon = await request(app).get("/api/v1/products?all=true");
    expect(anon.body.meta.total).toBe(3); // flag silently ignored
  });
});

describe("product writes", () => {
  it("creates with auto-slug; customers and strangers are blocked", async () => {
    await seedCatalog();
    const admin = await tokenFor("admin", "a@x.com");
    const customer = await tokenFor("customer", "c@x.com");
    const res = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Cloudspun Sweater",
        brand: "Field",
        category: "audio",
        price: 189,
        colors: [{ name: "Oat", hex: "#d9cfb8" }],
        sizes: ["M"],
        specifications: { Yarn: "Cashmere" }
      });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("cloudspun-sweater");
    expect(res.body.data.category).toBe("audio");
    expect(res.body.data.specifications).toEqual({ Yarn: "Cashmere" });

    expect((await request(app).post("/api/v1/products").send({ name: "x" })).status).toBe(401);
    const forbidden = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${customer}`)
      .send({ name: "Sneaky", brand: "X", category: "audio", price: 10 });
    expect(forbidden.status).toBe(403);
  });

  it("rejects bad input, unknown categories and duplicate slugs/SKUs", async () => {
    await seedCatalog();
    const admin = await tokenFor("admin", "a@x.com");
    const auth = { Authorization: `Bearer ${admin}` };
    const badPrice = await request(app)
      .post("/api/v1/products")
      .set(auth)
      .send({ name: "Bad", brand: "X", category: "audio", price: -5 });
    expect(badPrice.status).toBe(400);
    const badCat = await request(app)
      .post("/api/v1/products")
      .set(auth)
      .send({ name: "Lost", brand: "X", category: "nope", price: 10 });
    expect(badCat.status).toBe(404);
    const dupSlug = await request(app)
      .post("/api/v1/products")
      .set(auth)
      .send({ name: "Aria Headphones", brand: "X", category: "audio", price: 10 });
    expect(dupSlug.status).toBe(409);
    const dupSku = await request(app)
      .post("/api/v1/products")
      .set(auth)
      .send({
        name: "SKU Clash",
        brand: "X",
        category: "audio",
        price: 10,
        variants: [
          { sku: "A-1", price: 10 },
          { sku: "a-1", price: 12 }
        ]
      });
    expect(dupSku.status).toBe(400);
  });

  it("updates and deletes (writers only)", async () => {
    const { a } = await seedCatalog();
    const admin = await tokenFor("admin", "a@x.com");
    const customer = await tokenFor("customer", "c@x.com");
    const id = String(a._id);
    const patched = await request(app)
      .patch(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ price: 299, isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.data.price).toBe(299);

    const denied = await request(app)
      .delete(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${customer}`);
    expect(denied.status).toBe(403);

    const gone = await request(app)
      .delete(`/api/v1/products/${id}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(gone.status).toBe(200);
    const after = await request(app).get(`/api/v1/products/${id}`);
    expect(after.status).toBe(404);
  });
});
