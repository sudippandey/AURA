/**
 * AURA catalogue seed — idempotent (upserts by slug, demo users by email).
 *
 *   cd backend && npm run seed
 *
 * Seeds the 7 storefront categories + 24 products (mirrored from the frontend
 * preview mocks) and 4 demo accounts. Re-running only updates changed fields.
 * Refuses production unless SEED_ALLOW_PRODUCTION=true (demo passwords live here).
 */
import "dotenv/config";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDb, disconnectDb } from "../config/db.js";
import { Category } from "../models/Category.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { hashPassword } from "../utils/password.js";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./catalog.js";

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "aura-demo-1234";

const DEMO_USERS = [
  { name: "AURA Admin", email: "admin@aura.shop", role: "admin" },
  { name: "AURA Manager", email: "manager@aura.shop", role: "inventory-manager" },
  { name: "AURA Warehouse", email: "warehouse@aura.shop", role: "warehouse-employee" },
  { name: "AURA Customer", email: "customer@aura.shop", role: "customer" }
] as const;

async function seedCategories(): Promise<Map<string, mongoose.Types.ObjectId>> {
  const ids = new Map<string, mongoose.Types.ObjectId>();
  for (const c of SEED_CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      {
        $set: {
          name: c.name,
          slug: c.slug,
          description: c.description,
          image: c.image,
          isActive: true
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    if (!doc) throw new Error(`[seed] Failed to upsert category "${c.slug}"`);
    ids.set(c.slug, doc._id as mongoose.Types.ObjectId);
  }
  return ids;
}

async function seedProducts(catIds: Map<string, mongoose.Types.ObjectId>): Promise<void> {
  for (const p of SEED_PRODUCTS) {
    const category = catIds.get(p.categorySlug);
    if (!category) throw new Error(`[seed] Unknown category "${p.categorySlug}" for ${p.slug}`);
    await Product.findOneAndUpdate(
      { slug: p.slug },
      {
        $set: {
          name: p.name,
          slug: p.slug,
          description: p.description,
          brand: p.brand,
          category,
          price: p.price,
          originalPrice: p.originalPrice,
          images: p.images,
          rating: p.rating,
          reviewCount: p.reviewCount,
          stock: p.stock,
          featured: p.featured,
          tags: p.tags,
          colors: p.colors,
          sizes: p.sizes,
          variants: p.variants,
          specifications: p.specifications,
          isActive: true,
          createdAt: new Date(p.createdAt)
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
  }
}

async function seedUsers(): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const u of DEMO_USERS) {
    await User.findOneAndUpdate(
      { email: u.email },
      {
        $setOnInsert: {
          name: u.name,
          email: u.email,
          passwordHash,
          role: u.role,
          isActive: true
        }
      },
      { upsert: true, new: true }
    );
  }
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    console.error("[seed] Refusing to seed production. Set SEED_ALLOW_PRODUCTION=true to override.");
    process.exit(1);
  }
  await connectDb();
  try {
    const catIds = await seedCategories();
    await seedProducts(catIds);
    await seedUsers();
    const [cats, prods, users] = await Promise.all([
      Category.countDocuments(),
      Product.countDocuments(),
      User.countDocuments()
    ]);
    console.log(`[seed] Done: ${cats} categories, ${prods} products, ${users} users.`);
    console.log("[seed] Demo logins (password in SEED_PASSWORD env or aura-demo-1234):");
    for (const u of DEMO_USERS) console.log(`[seed]   ${u.role} → ${u.email}`);
  } finally {
    await disconnectDb();
    // dotenv/mongoose handles may keep the loop alive; force a clean exit like server shutdown does.
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  }
}

void main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
