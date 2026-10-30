import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface CategoryAttrs {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  isActive?: boolean;
  parent?: Types.ObjectId | string | null;
}

export interface CategoryDoc extends Document {
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  parent: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be URL-safe (e.g. stoneware-mugs)."]
    },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    image: { type: String, default: "", trim: true, maxlength: 2048 },
    isActive: { type: Boolean, default: true, index: true },
    // Optional hierarchy for later navigation depth. Deletion is blocked while children exist.
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true }
  },
  { timestamps: true }
);

/**
 * Slugs are derived in the service layer (create/update resolve name → slug via
 * slugify and enforce uniqueness with a 409). No pre-validate hook here on
 * purpose: document-middleware `this`-typing is brittle across Mongoose majors,
 * and the service is the only writer path (seed sets slugs explicitly too).
 */

export const Category: Model<CategoryDoc> =
  model<CategoryDoc>("Category", categorySchema);
