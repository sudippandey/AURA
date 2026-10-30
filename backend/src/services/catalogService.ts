import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { Category, type CategoryDoc } from "../models/Category.js";
import { Product, availableStock, type ProductDoc } from "../models/Product.js";
import { slugify } from "../utils/slug.js";

export type ProductSort = "featured" | "newest" | "price-asc" | "price-desc" | "rating" | "bestselling";

/** Roles allowed to manage the catalogue (write) and to preview inactive items. */
export const CATALOG_WRITERS = ["super-admin", "admin", "product-manager", "inventory-manager"] as const;

export interface ProductListQuery {
  page: number;
  limit: number;
  search: string;
  sort: ProductSort;
  category?: string;
  categories: string[];
  brands: string[];
  minPrice: number;
  maxPrice?: number;
  minRating: number;
  inStock: boolean;
  colors: string[];
  sizes: string[];
  /** Writers only: include inactive products (default false — storefront shows active). */
  includeInactive: boolean;
}

/** Exact shape the storefront productApi expects (see src/services/api/productApi.js). */
export interface FrontendProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number | null;
  images: string[];
  /** Category SLUG string (matches the mock catalogue's `p.category`). */
  category: string;
  brand: string;
  rating: number;
  reviewCount: number;
  /** Available units = stock − reservedStock (Stage 6 holds). */
  stock: number;
  featured: boolean;
  variants: Array<{
    sku: string;
    name: string;
    color: string;
    size: string;
    price: number | null;
    stock: number;
    image: string;
  }>;
  specifications: Record<string, string>;
  createdAt: string;
  tags: string[];
  colors: Array<{ name: string; hex: string }>;
  sizes: string[];
}

/** Exact shape the storefront categoryApi expects. */
export interface FrontendCategory {
  id: string;
  name: string;
  slug: string;
  image: string;
  desc: string;
  productCount: number;
}

type PopulatedProduct = ProductDoc & { category?: { slug: string } | Types.ObjectId | null };

export function toFrontendProduct(p: PopulatedProduct): FrontendProduct {
  const cat = p.category as { slug?: string } | Types.ObjectId | null | undefined;
  const categorySlug =
    cat && typeof cat === "object" && "slug" in cat && typeof cat.slug === "string"
      ? cat.slug
      : "";
  return {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    images: [...(p.images ?? [])],
    category: categorySlug,
    brand: p.brand,
    rating: p.rating,
    reviewCount: p.reviewCount,
    stock: availableStock(p),
    featured: p.featured,
    variants: (p.variants ?? []).map((v) => ({
      sku: v.sku,
      name: v.name ?? "",
      color: v.color ?? "",
      size: v.size ?? "",
      price: v.price ?? null,
      stock: v.stock ?? 0,
      image: v.image ?? ""
    })),
    specifications: Object.fromEntries((p.specifications as Map<string, string>) ?? new Map()),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    tags: [...(p.tags ?? [])],
    colors: (p.colors ?? []).map((c) => ({ name: c.name, hex: c.hex })),
    sizes: [...(p.sizes ?? [])]
  };
}

export function toFrontendCategory(c: CategoryDoc, productCount: number): FrontendCategory {
  return {
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    image: c.image ?? "",
    desc: c.description ?? "",
    productCount
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find one category by ObjectId OR slug. Inactive categories resolve too (callers decide visibility). */
export async function findCategory(ref: string): Promise<CategoryDoc | null> {
  const q = String(ref ?? "").trim();
  if (!q) return null;
  if (Types.ObjectId.isValid(q)) {
    const byId = await Category.findById(q);
    if (byId) return byId;
  }
  return Category.findOne({ slug: q.toLowerCase() });
}

/** Find one product by ObjectId OR slug (populated for the frontend mapper). */
async function findProductPopulated(ref: string): Promise<PopulatedProduct | null> {
  const q = String(ref ?? "").trim();
  if (!q) return null;
  if (Types.ObjectId.isValid(q)) {
    const byId = (await Product.findById(q).populate("category", "slug")) as PopulatedProduct | null;
    if (byId) return byId;
  }
  return (await Product.findOne({ slug: q.toLowerCase() }).populate(
    "category",
    "slug"
  )) as PopulatedProduct | null;
}

/** Active-product counts per category id (string keys). */
async function productCountsByCategory(): Promise<Map<string, number>> {
  const rows = await Product.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { isActive: true } },
    { $group: { _id: "$category", n: { $sum: 1 } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

const SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  featured: { featured: -1, reviewCount: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
  rating: { rating: -1, reviewCount: -1 },
  bestselling: { soldCount: -1, reviewCount: -1 }
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<FrontendCategory[]> {
  const [cats, counts] = await Promise.all([
    Category.find({}).sort({ name: 1 }),
    productCountsByCategory()
  ]);
  return cats.map((c) => toFrontendCategory(c, counts.get(String(c._id)) ?? 0));
}

export async function getCategory(ref: string): Promise<FrontendCategory> {
  const cat = await findCategory(ref);
  if (!cat || !cat.isActive) throw new AppError("Category not found.", 404, "NOT_FOUND");
  const counts = await productCountsByCategory();
  return toFrontendCategory(cat, counts.get(String(cat._id)) ?? 0);
}

export interface CategoryInput {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  isActive?: boolean;
  parent?: string | null;
}

async function resolveParent(parent: string | null | undefined, selfId?: string): Promise<Types.ObjectId | null> {
  if (parent === undefined || parent === null || parent === "") return null;
  const found = await findCategory(parent);
  if (!found || !found.isActive) throw new AppError("Parent category not found.", 404, "CATEGORY_NOT_FOUND");
  if (selfId && String(found._id) === String(selfId)) {
    throw new AppError("A category cannot be its own parent.", 400, "INVALID_PARENT");
  }
  // Walk up the chain so an update can never create a cycle.
  let cursor: CategoryDoc | null = found;
  const seen = new Set<string>([String(found._id)]);
  while (cursor?.parent) {
    const pid = String(cursor.parent);
    if (selfId && pid === String(selfId)) {
      throw new AppError("Parent would create a category cycle.", 400, "INVALID_PARENT");
    }
    if (seen.has(pid)) break;
    seen.add(pid);
    cursor = await Category.findById(cursor.parent);
  }
  return found._id as Types.ObjectId;
}

export async function createCategory(input: CategoryInput): Promise<FrontendCategory> {
  const slug = (input.slug?.trim() || slugify(input.name)).toLowerCase();
  const taken = await Category.findOne({ slug });
  if (taken) throw new AppError(`Category slug "${slug}" is already in use.`, 409, "SLUG_TAKEN");
  const parent = await resolveParent(input.parent);
  const cat = await Category.create({
    name: input.name.trim(),
    slug,
    description: input.description?.trim() ?? "",
    image: input.image?.trim() ?? "",
    isActive: input.isActive ?? true,
    parent
  });
  return toFrontendCategory(cat, 0);
}

export async function updateCategory(ref: string, patch: Partial<CategoryInput>): Promise<FrontendCategory> {
  const cat = await findCategory(ref);
  if (!cat) throw new AppError("Category not found.", 404, "NOT_FOUND");
  if (patch.slug !== undefined || patch.name !== undefined) {
    const slug = (patch.slug?.trim() || slugify(patch.name ?? cat.name)).toLowerCase();
    const clash = await Category.findOne({ slug, _id: { $ne: cat._id } });
    if (clash) throw new AppError(`Category slug "${slug}" is already in use.`, 409, "SLUG_TAKEN");
    cat.slug = slug;
  }
  if (patch.name !== undefined) cat.name = patch.name.trim();
  if (patch.description !== undefined) cat.description = patch.description.trim();
  if (patch.image !== undefined) cat.image = patch.image.trim();
  if (patch.isActive !== undefined) cat.isActive = patch.isActive;
  if (patch.parent !== undefined) cat.parent = await resolveParent(patch.parent, String(cat._id));
  await cat.save();
  const counts = await productCountsByCategory();
  return toFrontendCategory(cat, counts.get(String(cat._id)) ?? 0);
}

/** Safe delete: blocked while products (any status) or child categories reference it. */
export async function deleteCategory(ref: string): Promise<void> {
  const cat = await findCategory(ref);
  if (!cat) throw new AppError("Category not found.", 404, "NOT_FOUND");
  const [using, children] = await Promise.all([
    Product.countDocuments({ category: cat._id }),
    Category.countDocuments({ parent: cat._id })
  ]);
  if (using > 0) {
    throw new AppError(
      `Cannot delete "${cat.name}": ${using} product(s) still use it. Reassign them first.`,
      409,
      "CATEGORY_IN_USE"
    );
  }
  if (children > 0) {
    throw new AppError(
      `Cannot delete "${cat.name}": ${children} subcategor(ies) still nest under it.`,
      409,
      "CATEGORY_HAS_CHILDREN"
    );
  }
  await cat.deleteOne();
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface ProductFilter {
  isActive?: boolean;
  category?: { $in: Types.ObjectId[] };
  brand?: { $in: string[] };
  price?: { $gte?: number; $lte?: number };
  rating?: { $gte: number };
  /** Dot-path key for the embedded color names. */
  "colors.name"?: { $in: string[] };
  sizes?: { $in: string[] };
  $or?: unknown[];
  $expr?: unknown;
}

function splitRefs(refs: string[]): { ids: Types.ObjectId[]; slugs: string[] } {
  const ids: Types.ObjectId[] = [];
  const slugs: string[] = [];
  for (const r of refs) {
    const t = String(r ?? "").trim();
    if (!t) continue;
    if (Types.ObjectId.isValid(t)) ids.push(new Types.ObjectId(t));
    else slugs.push(t.toLowerCase());
  }
  return { ids, slugs };
}

async function buildFilter(q: ProductListQuery): Promise<{ filter: ProductFilter; empty: boolean }> {
  const filter: ProductFilter = {};
  if (!q.includeInactive) filter.isActive = true;

  const refs = [...(q.category ? [q.category] : []), ...q.categories];
  if (refs.length > 0) {
    const { ids, slugs } = splitRefs(refs);
    const ors: unknown[] = [];
    if (ids.length) ors.push({ _id: { $in: ids } });
    if (slugs.length) ors.push({ slug: { $in: slugs } });
    const cats = await Category.find({ $or: ors as never }).select("_id");
    if (cats.length === 0) return { filter, empty: true };
    filter.category = { $in: cats.map((c) => c._id as Types.ObjectId) };
  }

  if (q.brands.length > 0) filter.brand = { $in: q.brands };
  if (q.minPrice > 0 || q.maxPrice !== undefined) {
    filter.price = {};
    if (q.minPrice > 0) filter.price.$gte = q.minPrice;
    if (q.maxPrice !== undefined) filter.price.$lte = q.maxPrice;
  }
  if (q.minRating > 0) filter.rating = { $gte: q.minRating };
  if (q.inStock) {
    // Available units (stock − reservedStage6 holds) above zero.
    filter.$expr = { $gt: [{ $subtract: ["$stock", "$reservedStock"] }, 0] };
  }
  if (q.colors.length > 0) filter["colors.name"] = { $in: q.colors };
  if (q.sizes.length > 0) filter.sizes = { $in: q.sizes };

  if (q.search) {
    const rx = new RegExp(escapeRegExp(q.search.trim()), "i");
    const or: unknown[] = [{ name: rx }, { brand: rx }, { description: rx }, { tags: rx }];
    const matchingCats = await Category.find({ $or: [{ name: rx }, { slug: rx }] }).select("_id");
    if (matchingCats.length > 0) or.push({ category: { $in: matchingCats.map((c) => c._id) } });
    filter.$or = or;
  }
  return { filter, empty: false };
}

export async function listProducts(q: ProductListQuery): Promise<{ items: FrontendProduct[]; total: number }> {
  const { filter, empty } = await buildFilter(q);
  if (empty) return { items: [], total: 0 };
  const [total, docs] = await Promise.all([
    Product.countDocuments(filter as never),
    Product.find(filter as never)
      .populate("category", "slug")
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
  ]);
  return { items: (docs as PopulatedProduct[]).map(toFrontendProduct), total };
}

export async function getProduct(ref: string): Promise<FrontendProduct> {
  const doc = await findProductPopulated(ref);
  if (!doc) throw new AppError("Product not found.", 404, "NOT_FOUND");
  return toFrontendProduct(doc);
}

async function rail(
  match: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  limit: number
): Promise<FrontendProduct[]> {
  const docs = await Product.find({ isActive: true, ...match })
    .populate("category", "slug")
    .sort(sort)
    .limit(limit);
  return (docs as PopulatedProduct[]).map(toFrontendProduct);
}

export const getFeaturedProducts = (limit = 8): Promise<FrontendProduct[]> =>
  rail({ featured: true }, { reviewCount: -1, createdAt: -1 }, limit);

export const getTrendingProducts = (limit = 4): Promise<FrontendProduct[]> =>
  rail({ tags: "trending" }, { reviewCount: -1 }, limit);

export const getBestSellers = (limit = 4): Promise<FrontendProduct[]> =>
  rail({}, { soldCount: -1, reviewCount: -1 }, limit);

export const getNewArrivals = (limit = 4): Promise<FrontendProduct[]> =>
  rail({}, { createdAt: -1 }, limit);

export async function searchProducts(query: string, limit = 8): Promise<FrontendProduct[]> {
  const q = query.trim();
  if (!q) return [];
  const rx = new RegExp(escapeRegExp(q), "i");
  const docs = await Product.find({
    isActive: true,
    $or: [{ name: rx }, { brand: rx }, { description: rx }, { tags: rx }]
  })
    .populate("category", "slug")
    .sort({ reviewCount: -1 })
    .limit(limit);
  return (docs as PopulatedProduct[]).map(toFrontendProduct);
}

export async function getRelatedProducts(ref: string, limit = 4): Promise<FrontendProduct[]> {
  const self = await findProductPopulated(ref);
  if (!self) throw new AppError("Product not found.", 404, "NOT_FOUND");
  const docs = await Product.find({
    isActive: true,
    _id: { $ne: self._id },
    $or: [{ category: self.category as Types.ObjectId }, { brand: (self as ProductDoc).brand }]
  })
    .populate("category", "slug")
    .sort({ featured: -1, reviewCount: -1 })
    .limit(limit);
  return (docs as PopulatedProduct[]).map(toFrontendProduct);
}

// --- writes ---

export interface ProductInput {
  name: string;
  slug?: string;
  description?: string;
  brand: string;
  /** Category ObjectId or slug. */
  category: string;
  price: number;
  originalPrice?: number | null;
  images?: string[];
  stock?: number;
  lowStockThreshold?: number;
  featured?: boolean;
  isActive?: boolean;
  tags?: string[];
  colors?: Array<{ name: string; hex: string }>;
  sizes?: string[];
  variants?: ProductVariantInput[];
  specifications?: Record<string, string>;
}

export interface ProductVariantInput {
  sku: string;
  name?: string;
  color?: string;
  size?: string;
  price?: number | null;
  stock?: number;
  image?: string;
}

function assertVariantSkus(variants: ProductVariantInput[] | undefined): void {
  if (!variants?.length) return;
  const seen = new Set<string>();
  for (const v of variants) {
    const sku = v.sku.trim();
    if (!sku) throw new AppError("Variant SKUs cannot be blank.", 400, "INVALID_SKU");
    const key = sku.toLowerCase();
    if (seen.has(key)) throw new AppError(`Duplicate variant SKU "${sku}".`, 400, "DUPLICATE_SKU");
    seen.add(key);
  }
}

export async function createProduct(input: ProductInput): Promise<FrontendProduct> {
  const cat = await findCategory(input.category);
  if (!cat || !cat.isActive) throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  const slug = (input.slug?.trim() || slugify(input.name)).toLowerCase();
  if (await Product.exists({ slug })) {
    throw new AppError(`Product slug "${slug}" is already in use.`, 409, "SLUG_TAKEN");
  }
  assertVariantSkus(input.variants);
  const doc = (await Product.create({
    name: input.name.trim(),
    slug,
    description: input.description?.trim() ?? "",
    brand: input.brand.trim(),
    category: cat._id,
    price: input.price,
    originalPrice: input.originalPrice ?? null,
    images: input.images ?? [],
    stock: input.stock ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? 5,
    featured: input.featured ?? false,
    isActive: input.isActive ?? true,
    tags: input.tags ?? [],
    colors: input.colors ?? [],
    sizes: input.sizes ?? [],
    variants: (input.variants ?? []).map((v) => ({
      sku: v.sku.trim(),
      name: v.name?.trim() ?? "",
      color: v.color?.trim() ?? "",
      size: v.size?.trim() ?? "",
      price: v.price ?? null,
      stock: v.stock ?? 0,
      image: v.image?.trim() ?? ""
    })),
    specifications: input.specifications ?? {}
  }).catch((err: unknown) => {
    // Race guard: two concurrent creates with the same slug — one wins.
    const code = (err as { code?: unknown }).code;
    if (code === 11000 || code === "11000") {
      throw new AppError(`Product slug "${slug}" is already in use.`, 409, "SLUG_TAKEN");
    }
    throw err;
  })) as ProductDoc;
  await doc.populate("category", "slug");
  return toFrontendProduct(doc as PopulatedProduct);
}

export async function updateProduct(ref: string, patch: Partial<ProductInput>): Promise<FrontendProduct> {
  const doc = await findProductPopulated(ref);
  if (!doc) throw new AppError("Product not found.", 404, "NOT_FOUND");
  const full = doc as ProductDoc;
  if (patch.slug !== undefined || patch.name !== undefined) {
    const slug = (patch.slug?.trim() || slugify(patch.name ?? full.name)).toLowerCase();
    const clash = await Product.findOne({ slug, _id: { $ne: full._id } });
    if (clash) throw new AppError(`Product slug "${slug}" is already in use.`, 409, "SLUG_TAKEN");
    full.slug = slug;
  }
  if (patch.name !== undefined) full.name = patch.name.trim();
  if (patch.description !== undefined) full.description = patch.description.trim();
  if (patch.brand !== undefined) full.brand = patch.brand.trim();
  if (patch.category !== undefined) {
    const cat = await findCategory(patch.category);
    if (!cat || !cat.isActive) throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
    full.category = cat._id as Types.ObjectId;
  }
  if (patch.price !== undefined) full.price = patch.price;
  if (patch.originalPrice !== undefined) full.originalPrice = patch.originalPrice;
  if (patch.images !== undefined) full.images = patch.images;
  if (patch.stock !== undefined) full.stock = patch.stock;
  if (patch.lowStockThreshold !== undefined) full.lowStockThreshold = patch.lowStockThreshold;
  if (patch.featured !== undefined) full.featured = patch.featured;
  if (patch.isActive !== undefined) full.isActive = patch.isActive;
  if (patch.tags !== undefined) full.tags = patch.tags;
  if (patch.colors !== undefined) full.colors = patch.colors as never;
  if (patch.sizes !== undefined) full.sizes = patch.sizes;
  if (patch.variants !== undefined) {
    assertVariantSkus(patch.variants);
    full.variants = patch.variants.map((v) => ({
      sku: v.sku.trim(),
      name: v.name?.trim() ?? "",
      color: v.color?.trim() ?? "",
      size: v.size?.trim() ?? "",
      price: v.price ?? null,
      stock: v.stock ?? 0,
      image: v.image?.trim() ?? ""
    })) as never;
  }
  if (patch.specifications !== undefined) full.specifications = patch.specifications as never;
  await full.save();
  await full.populate("category", "slug");
  return toFrontendProduct(full as PopulatedProduct);
}

export async function deleteProduct(ref: string): Promise<void> {
  const doc = await findProductPopulated(ref);
  if (!doc) throw new AppError("Product not found.", 404, "NOT_FOUND");
  // Order line-items snapshot product data at purchase time (Stage 5), so catalogue
  // deletes stay hard deletes. Reviews (Stage 5) cascade separately.
  await (doc as ProductDoc).deleteOne();
}

export async function listBrands(): Promise<Array<{ name: string; products: number }>> {
  const rows = await Product.aggregate<{ _id: string; n: number }>([{ $match: { isActive: true } }, { $group: { _id: '$brand', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  return rows.map((r) => ({ name: r._id, products: r.n }));
}
