import { Schema, model, type Document, type Model, type Types } from "mongoose";

export interface WishlistDoc extends Document {
  /** Owner. One wishlist per user (unique). Stores product ids (store shape). */
  user: Types.ObjectId;
  products: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<WishlistDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    products: { type: [{ type: Schema.Types.ObjectId, ref: "Product" }], default: [] }
  },
  { timestamps: true }
);

export const Wishlist: Model<WishlistDoc> =
  model<WishlistDoc>("Wishlist", wishlistSchema);
