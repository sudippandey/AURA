import { Schema, model, type Document, type Model, type Types } from "mongoose";

/**
 * Embedded variant. Variants live INSIDE Product.variants (no separate collection):
 * the catalogue is small, the storefront always renders them with the product, and
 * single-document writes stay atomic without transactions.
 * If variant counts ever explode (Stage 6+), promote this schema to its own
 * `productvariants` collection with a `product` ref — the TS interface below stays valid.
 */
export interface ProductVariantAttrs {
  sku: string;
  name?: string;
  color?: string;
  size?: string;
  price?: number;
  stock?: number;
  image?: string;
}

export interface ProductVariant {
  sku: string;
  name: string;
  color: string;
  size: string;
  price: number | null;
  stock: number;
  image: string;
}

const productVariantSchema = new Schema<ProductVariant>(
  {
    sku: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    price: { type: Number, min: 0, default: null },
    stock: { type: Number, min: 0, default: 0 },
    image: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductDoc extends Document {
  name: string;
  slug: string;
  description: string;
  brand: string;
  category: Types.ObjectId;
  price: number;
  originalPrice: number | null;
  images: string[];
  rating: number;
  reviewCount: number;
  /** Lifetime units sold. Written by orders (Stage 5); drives the `bestselling` sort. */
  soldCount: number;
  /**
   * On-hand units. STAGE 6 FORWARD-COMPAT: availability shown to shoppers is
   * `stock - reservedStock` (see availableStock()). Stage 6 adds reservations
   * (cart holds / order allocation) via `reservedStock` + a movements log —
   * no schema migration needed, only new writers of that field.
   */
  stock: number;
  /** Units held for open carts/orders. Stage 6 writes this; until then it stays 0. */
  reservedStock: number;
  lowStockThreshold: number;
  featured: boolean;
  isActive: boolean;
  tags: string[];
  colors: ProductColor[];
  sizes: string[];
  variants: ProductVariant[];
  specifications: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const productColorSchema = new Schema<ProductColor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    hex: { type: String, required: true, trim: true, match: [/^#[0-9a-fA-F]{3,8}$/, "hex like #rrggbb"] }
  },
  { _id: false }
);

const productSchema = new Schema<ProductDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be URL-safe."]
    },
    description: { type: String, default: "", trim: true, maxlength: 5000 },
    brand: { type: String, required: true, trim: true, maxlength: 80, index: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0, default: null },
    images: { type: [String], default: [] },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    reservedStock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    featured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    tags: { type: [String], default: [] },
    colors: { type: [productColorSchema], default: [] },
    sizes: { type: [String], default: [] },
    variants: { type: [productVariantSchema], default: [] },
    specifications: { type: Map, of: String, default: {} }
  },
  { timestamps: true }
);

productSchema.index({ name: "text", description: "text", brand: "text" });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ brand: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ featured: -1, isActive: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ soldCount: -1 });
productSchema.index({ createdAt: -1 });

/**
 * Slugs are derived in the service layer, not in a pre hook (see Category.ts).
 * Single-document writes therefore stay atomic without relying on middleware.
 */

/** Shopper-visible availability. Stage 6 holds decrement this without touching `stock`. */
export function availableStock(p: { stock: number; reservedStock: number }): number {
  return Math.max(0, (p.stock ?? 0) - (p.reservedStock ?? 0));
}

export const Product: Model<ProductDoc> =
  model<ProductDoc>("Product", productSchema);
