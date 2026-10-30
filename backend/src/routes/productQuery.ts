import { z } from "zod";

/** Coerces `?brands=a,b` / `?brands=a&brands=b` / missing → string[]. */
const strList = z.preprocess((v) => {
  if (Array.isArray(v)) {
    return v.flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}, z.array(z.string().max(80)));

const flag = z.preprocess(
  (v) => v === true || v === "true" || v === "1",
  z.boolean()
);

/**
 * Shared `GET /products` query — also reused by `GET /categories/:ref/products`
 * (which forces the category and ignores any category params in the query).
 * Defaults mirror the storefront: page 1, 9 per page, `featured` sort.
 */
export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(9),
  search: z.string().trim().max(120).default(""),
  sort: z
    .enum(["featured", "newest", "price-asc", "price-desc", "rating", "bestselling"])
    .default("featured"),
  category: z.string().trim().max(100).optional(),
  categories: strList,
  brands: strList,
  minPrice: z.coerce.number().min(0).default(0),
  // The storefront sends maxPrice: Infinity as JSON null when unfiltered.
  maxPrice: z.preprocess(
    (v) => (v === null || v === "null" || v === "" || v === undefined ? undefined : v),
    z.coerce.number().min(0).optional()
  ),
  minRating: z.coerce.number().min(0).max(5).default(0),
  inStock: flag,
  colors: strList,
  sizes: strList,
  /** Writers (with token) may pass all=true to preview inactive products. */
  all: flag
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(4)
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required.").max(120),
  limit: z.coerce.number().int().min(1).max(50).default(8)
});
