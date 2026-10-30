import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Cart } from "../src/models/Cart.js";
import { Category } from "../src/models/Category.js";
import { Order } from "../src/models/Order.js";
import { Product } from "../src/models/Product.js";
import { Review } from "../src/models/Review.js";
import { User } from "../src/models/User.js";
import { StockMovement } from "../src/models/StockMovement.js";
import { signAccessToken } from "../src/utils/jwt.js";
import { getTestDbUri } from "./testDb.js";

const uri = getTestDbUri();
const app = createApp();

type Role = "admin" | "inventory-manager" | "warehouse-employee" | "customer";

async function tokenFor(email: string, role: Role = "customer", name?: string): Promise<string> {
  const user = await User.create({
    name: name ?? `${role} tester`,
    email,
    passwordHash: "unused-test-hash",
    role
  });
  return signAccessToken(String(user._id), role);
}

async function seedReviewShop() {
  const cat = await Category.create({ name: "Audio", slug: "audio" });
  const buds = await Product.create({
    name: "Pulse Buds",
    slug: "pulse-buds",
    description: "Fixture.",
    brand: "Aural",
    category: cat._id,
    price: 100,
    images: ["https://x/b.jpg"],
    rating: 4.0,
    reviewCount: 2,
    stock: 10,
    tags: [],
    colors: [],
    sizes: [],
    variants: [],
    specifications: {}
  });
  return { buds };
}

const checkoutPayload = {
  customer: { firstName: "Ada", lastName: "T", email: "ada@x.com" },
  shipping: { address: "1 Main St", city: "Springfield", zip: "12345", country: "United States", method: "standard" },
  payment: { method: "card" }
};

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
    Review.deleteMany({}),
    StockMovement.deleteMany({})
  ]);
});

describe("reviews", () => {
  it("requires auth and valid ratings", async () => {
    await seedReviewShop();
    const anon = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .send({ rating: 5, title: "Great", body: "Loved it." });
    expect(anon.status).toBe(401);

    const buyer = await tokenFor("ada@x.com", "customer", "Ada Tester");
    const bad = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ rating: 6, title: "Great", body: "Loved it." });
    expect(bad.status).toBe(400);
  });

  it("creates reviews (verified when bought) and keeps a running average", async () => {
    const { buds } = await seedReviewShop();
    const buyer = await tokenFor("ada@x.com", "customer", "Ada Tester");
    const browser = await tokenFor("bo@x.com", "customer", "Bo Browser");

    await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ items: [{ productId: String(buds._id), qty: 1 }], ...checkoutPayload });

    const verified = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ rating: 5, title: "Exceeded expectations", body: "Flawless." });
    expect(verified.status).toBe(201);
    expect(verified.body.data).toMatchObject({ author: "Ada Tester", rating: 5, verified: true });

    const plain = await request(app)
      .post(`/api/v1/products/${String(buds._id)}/reviews`)
      .set("Authorization", `Bearer ${browser}`)
      .send({ rating: 4, title: "Good", body: "Solid buds." });
    expect(plain.body.data.verified).toBe(false);

    // (4.0×2 + 5 + 4) / 4 = 4.25 → 4.3 in two steps: 4.3 then 4.3? step1: 13/3=4.333→4.3; step2: (4.3×3+4)/4=16.9/4=4.225→4.2
    const product = await Product.findById(buds._id);
    expect(product?.reviewCount).toBe(4);
    expect(product?.rating).toBe(4.2);

    const dup = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ rating: 5, title: "Again", body: "Second take." });
    expect(dup.status).toBe(409);
  });

  it("lists visible reviews publicly, newest first", async () => {
    await seedReviewShop();
    const admin = await tokenFor("root@x.com", "admin");
    const a = await tokenFor("a@x.com", "customer", "Amy");
    const b = await tokenFor("b@x.com", "customer", "Ben");
    const first = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${a}`)
      .send({ rating: 5, title: "First", body: "Old review." });
    await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${b}`)
      .send({ rating: 3, title: "Second", body: "Newer review." });
    await request(app)
      .patch(`/api/v1/reviews/${first.body.data.id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "hidden" });

    const list = await request(app).get("/api/v1/products/pulse-buds/reviews");
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ title: "Second", verified: false });
    expect(new Date(list.body.data[0].date).toString()).not.toBe("Invalid Date");
  });

  it("lets owners edit/delete; strangers get 404; averages follow", async () => {
    const { buds } = await seedReviewShop();
    const owner = await tokenFor("o@x.com", "customer", "Olive");
    const stranger = await tokenFor("s@x.com");
    const created = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${owner}`)
      .send({ rating: 5, title: "Mine", body: "Mine." });
    const id = created.body.data.id as string;

    const denied = await request(app)
      .put(`/api/v1/reviews/${id}`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ rating: 1 });
    expect(denied.status).toBe(404);

    const edited = await request(app)
      .put(`/api/v1/reviews/${id}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ rating: 2, title: "Mine (updated)" });
    expect(edited.body.data.rating).toBe(2);
    // step1: (4.0×2+5)/3 = 13/3 → 4.3; edit 5→2: (4.3×3−5+2)/3 = 9.9/3 = 3.3
    const afterEdit = await Product.findById(buds._id);
    expect(afterEdit?.rating).toBe(3.3);

    const gone = await request(app).delete(`/api/v1/reviews/${id}`).set("Authorization", `Bearer ${owner}`);
    expect(gone.status).toBe(200);
    const afterDelete = await Product.findById(buds._id);
    expect(afterDelete?.reviewCount).toBe(2);
    expect(afterDelete?.rating).toBe(4.0);
  });

  it("moderates visibility as admin (hidden leaves the average)", async () => {
    const { buds } = await seedReviewShop();
    const admin = await tokenFor("root@x.com", "admin");
    const author = await tokenFor("w@x.com", "customer", "Wren");
    const created = await request(app)
      .post("/api/v1/products/pulse-buds/reviews")
      .set("Authorization", `Bearer ${author}`)
      .send({ rating: 1, title: "Meh", body: "Not for me." });
    const id = created.body.data.id as string;
    // (4.0×2+1)/3 = 3.0
    expect((await Product.findById(buds._id))?.rating).toBe(3.0);

    const hidden = await request(app)
      .patch(`/api/v1/reviews/${id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "hidden" });
    expect(hidden.status).toBe(200);
    expect((await Product.findById(buds._id))?.reviewCount).toBe(2);

    const shown = await request(app)
      .patch(`/api/v1/reviews/${id}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "visible" });
    expect(shown.status).toBe(200);
    expect((await Product.findById(buds._id))?.reviewCount).toBe(3);

    const customer = await tokenFor("c@x.com");
    const modDenied = await request(app)
      .patch(`/api/v1/reviews/${id}/status`)
      .set("Authorization", `Bearer ${customer}`)
      .send({ status: "hidden" });
    expect(modDenied.status).toBe(403);
  });
});

describe("admin", () => {
  it("locks admin routes to admins", async () => {
    await seedReviewShop();
    const customer = await tokenFor("c@x.com");
    const anonStats = await request(app).get("/api/v1/admin/stats");
    expect(anonStats.status).toBe(401);
    const denied = await request(app).get("/api/v1/admin/stats").set("Authorization", `Bearer ${customer}`);
    expect(denied.status).toBe(403);
  });

  it("manages users (lists, filters, role/status changes, self-edit refused)", async () => {
    await seedReviewShop();
    const admin = await tokenFor("root@x.com", "admin", "Root");
    const userToken = await tokenFor("mallory@x.com");
    const user = await User.findOne({ email: "mallory@x.com" });
    const auth = { Authorization: `Bearer ${admin}` };

    const list = await request(app).get("/api/v1/admin/users").set(auth);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0]).toMatchObject({ email: expect.any(String), role: expect.any(String) });

    const filtered = await request(app).get("/api/v1/admin/users?role=customer").set(auth);
    expect(filtered.body.meta.total).toBe(1);
    const searched = await request(app).get("/api/v1/admin/users?q=mallory").set(auth);
    expect(searched.body.meta.total).toBe(1);

    const promoted = await request(app)
      .patch(`/api/v1/admin/users/${String(user?._id)}`)
      .set(auth)
      .send({ role: "inventory-manager" });
    expect(promoted.body.data.role).toBe("inventory-manager");

    const deactivated = await request(app)
      .patch(`/api/v1/admin/users/${String(user?._id)}`)
      .set(auth)
      .send({ isActive: false });
    expect(deactivated.body.data.isActive).toBe(false);

    const me = await User.findOne({ email: "root@x.com" });
    const selfEdit = await request(app)
      .patch(`/api/v1/admin/users/${String(me?._id)}`)
      .set(auth)
      .send({ role: "customer" });
    expect(selfEdit.status).toBe(400);

    const missing = await request(app)
      .patch("/api/v1/admin/users/64f000000000000000000001")
      .set(auth)
      .send({ role: "customer" });
    expect(missing.status).toBe(404);

    const badRole = await request(app)
      .patch(`/api/v1/admin/users/${String(user?._id)}`)
      .set(auth)
      .send({ role: "superadmin" });
    expect(badRole.status).toBe(400);
    void userToken;
  });

  it("reports dashboard stats", async () => {
    const { buds } = await seedReviewShop();
    const admin = await tokenFor("root@x.com", "admin");
    const buyer = await tokenFor("buyer@x.com");
    await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${buyer}`)
      .send({ items: [{ productId: String(buds._id), qty: 2 }], ...checkoutPayload });

    const stats = await request(app).get("/api/v1/admin/stats").set("Authorization", `Bearer ${admin}`);
    expect(stats.status).toBe(200);
    // 2×100 = 200, free ship (≥75), tax 16 → 216
    expect(stats.body.data).toMatchObject({
      revenue: 216,
      orders: 1,
      users: 2,
      products: 1
    });
    expect(stats.body.data.ordersByStatus.processing).toBe(1);
    expect(stats.body.data.topProducts[0]).toMatchObject({ slug: "pulse-buds", soldCount: 2 });
    expect(stats.body.data.recentOrders[0].id).toMatch(/^ORD-/);
  });
});
