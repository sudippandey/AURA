import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ok, created, paginated } from "../utils/responses.js";
import * as catalog from "../services/catalogService.js";
import { CATALOG_WRITERS } from "../services/catalogService.js";
import { productQuerySchema } from "./productQuery.js";

const writers = requireRole(...CATALOG_WRITERS);

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a URL-safe slug (e.g. stoneware-mugs).")
  .optional();

const categoryBody = z.object({
  name: z.string().trim().min(2, "Please enter a category name.").max(80),
  slug: slugField,
  description: z.string().trim().max(500).optional(),
  image: z.string().trim().max(2048).optional(),
  isActive: z.boolean().optional(),
  parent: z.string().trim().min(1).max(100).nullable().optional()
});

const categoryPatchBody = categoryBody.partial().omit({ name: true }).extend({
  name: z.string().trim().min(2).max(80).optional()
});

const refParams = z.object({ ref: z.string().trim().min(1, "Category id or slug is required.") });

export const categoriesRouter = Router();

/** Public storefront listing with live product counts. */
categoriesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    ok(res, await catalog.listCategories());
  })
);

categoriesRouter.post(
  "/",
  requireAuth,
  writers,
  validate({ body: categoryBody }),
  asyncHandler(async (req, res) => {
    created(res, await catalog.createCategory(req.body));
  })
);

categoriesRouter.get(
  "/:ref",
  validate({ params: refParams }),
  asyncHandler(async (req, res) => {
    ok(res, await catalog.getCategory(req.params.ref));
  })
);

/** Paginated products in one category — same filters/sorts as GET /products. */
categoriesRouter.get(
  "/:ref/products",
  validate({ params: refParams, query: productQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.output<typeof productQuerySchema>;
    const cat = await catalog.getCategory(req.params.ref);
    const { items, total } = await catalog.listProducts({
      page: q.page,
      limit: q.limit,
      search: q.search,
      sort: q.sort,
      category: cat.slug,
      categories: [],
      brands: q.brands,
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      minRating: q.minRating,
      inStock: q.inStock,
      colors: q.colors,
      sizes: q.sizes,
      includeInactive: false
    });
    paginated(res, items, total, q.page, q.limit);
  })
);

categoriesRouter.patch(
  "/:ref",
  requireAuth,
  writers,
  validate({ params: refParams, body: categoryPatchBody }),
  asyncHandler(async (req, res) => {
    ok(res, await catalog.updateCategory(req.params.ref, req.body));
  })
);

categoriesRouter.delete(
  "/:ref",
  requireAuth,
  writers,
  validate({ params: refParams }),
  asyncHandler(async (req, res) => {
    await catalog.deleteCategory(req.params.ref);
    ok(res, { message: "Category deleted." });
  })
);
