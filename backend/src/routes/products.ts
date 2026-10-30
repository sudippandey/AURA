import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok, created, paginated } from "../utils/responses.js";
import { verifyAccessToken } from "../utils/jwt.js";
import * as catalog from "../services/catalogService.js";
import { CATALOG_WRITERS } from "../services/catalogService.js";
import { limitQuerySchema, productQuerySchema, searchQuerySchema } from "./productQuery.js";
import { createReview, listReviews } from "../services/reviewService.js";
import type { ProductListQuery } from "../services/catalogService.js";

const writers = requireRole(...CATALOG_WRITERS);

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug.")
  .optional();

const hexColor = z.object({
  name: z.string().trim().min(1).max(40),
  hex: z.string().trim().regex(/^#[0-9a-fA-F]{3,8}$/, "hex like #rrggbb")
});

const variantInput = z.object({
  sku: z.string().trim().min(1, "Variant SKU is required.").max(60),
  name: z.string().trim().max(80).optional(),
  color: z.string().trim().max(40).optional(),
  size: z.string().trim().max(20).optional(),
  price: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional(),
  image: z.string().trim().max(2048).optional()
});

const productBody = z.object({
  name: z.string().trim().min(2, "Please enter a product name.").max(120),
  slug: slugField,
  description: z.string().trim().max(5000).optional(),
  brand: z.string().trim().min(1, "Brand is required.").max(80),
  category: z.string().trim().min(1, "Category id or slug is required.").max(100),
  price: z.number().min(0, "Price cannot be negative."),
  originalPrice: z.number().min(0).nullable().optional(),
  images: z.array(z.string().trim().max(2048)).max(20).optional(),
  stock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string().trim().max(40)).max(30).optional(),
  colors: z.array(hexColor).max(30).optional(),
  sizes: z.array(z.string().trim().max(20)).max(30).optional(),
  variants: z.array(variantInput).max(100).optional(),
  specifications: z.record(z.string().trim().max(80), z.string().max(500)).optional()
});

const productPatchBody = productBody.partial().omit({ name: true }).extend({
  name: z.string().trim().min(2).max(120).optional()
});

const idParams = z.object({ id: z.string().trim().min(1, "Product id or slug is required.") });
const slugParams = z.object({ slug: z.string().trim().min(1, "Product slug is required.") });

export const reviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2, "Please add a headline.").max(120),
  body: z.string().trim().min(2, "Please write a few words.").max(2000)
});

export const reviewsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

/**
 * Writers may preview inactive products with `?all=true`. The listing stays
 * public: without a valid writer token the flag is silently ignored.
 */
function canPreviewInactive(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  try {
    const payload = verifyAccessToken(token);
    return (CATALOG_WRITERS as readonly string[]).includes(payload.role);
  } catch {
    return false;
  }
}

function toListQuery(q: z.output<typeof productQuerySchema>, includeInactive: boolean): ProductListQuery {
  return {
    page: q.page,
    limit: q.limit,
    search: q.search,
    sort: q.sort,
    category: q.category,
    categories: q.categories,
    brands: q.brands,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    minRating: q.minRating,
    inStock: q.inStock,
    colors: q.colors,
    sizes: q.sizes,
    includeInactive
  };
}

export const productsRouter = Router();

// --- rails & search (BEFORE /:id so they never collide) ---

productsRouter.get(
  "/featured",
  validate({ query: limitQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    ok(res, await catalog.getFeaturedProducts(q.limit));
  })
);

productsRouter.get(
  "/trending",
  validate({ query: limitQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    ok(res, await catalog.getTrendingProducts(q.limit));
  })
);

productsRouter.get(
  "/bestsellers",
  validate({ query: limitQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    ok(res, await catalog.getBestSellers(q.limit));
  })
);

productsRouter.get(
  "/new",
  validate({ query: limitQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    ok(res, await catalog.getNewArrivals(q.limit));
  })
);

productsRouter.get(
  "/search",
  validate({ query: searchQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { q: string; limit: number };
    ok(res, await catalog.searchProducts(q.q, q.limit));
  })
);

// --- collection ---

productsRouter.get(
  "/",
  validate({ query: productQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof productQuerySchema>;
    const includeInactive = q.all === true && canPreviewInactive(req.headers.authorization);
    const { items, total } = await catalog.listProducts(toListQuery(q, includeInactive));
    paginated(res, items, total, q.page, q.limit);
  })
);

productsRouter.post(
  "/",
  requireAuth,
  writers,
  validate({ body: productBody }),
  asyncHandler(async (req, res) => {
    created(res, await catalog.createProduct(req.body));
  })
);

// --- single product (slug alias + id-or-slug) ---

productsRouter.get(
  "/slug/:slug",
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    ok(res, await catalog.getProduct(req.params.slug));
  })
);

productsRouter.get(
  "/:id",
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    ok(res, await catalog.getProduct(req.params.id));
  })
);

productsRouter.get(
  "/:id/related",
  validate({ params: idParams, query: limitQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    ok(res, await catalog.getRelatedProducts(req.params.id, q.limit));
  })
);

/** Public review list (visible only, newest first). */
productsRouter.get(
  "/:id/reviews",
  validate({ params: idParams, query: reviewsQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof reviewsQuery>;
    const { items, total } = await listReviews(req.params.id, q.page, q.limit);
    paginated(res, items, total, q.page, q.limit);
  })
);

/** One review per user per product (409 on re-post; verified auto-detected). */
productsRouter.post(
  "/:id/reviews",
  requireAuth,
  validate({ params: idParams, body: reviewBody }),
  asyncHandler(async (req, res) => {
    created(res, await createReview(req.user!.id, req.params.id, req.body));
  })
);

productsRouter.patch(
  "/:id",
  requireAuth,
  writers,
  validate({ params: idParams, body: productPatchBody }),
  asyncHandler(async (req, res) => {
    ok(res, await catalog.updateProduct(req.params.id, req.body));
  })
);

productsRouter.delete(
  "/:id",
  requireAuth,
  writers,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await catalog.deleteProduct(req.params.id);
    ok(res, { message: "Product deleted." });
  })
);
