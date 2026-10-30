# AURA Database Schema — Stage 3: Catalogue

Users/roles/sessions are documented in `AUTHENTICATION.md`. This file covers
`categories` and `products`, plus how Stage 6 (inventory) attaches without a migration.

## Collections

### categories

| Field | Type | Notes |
|---|---|---|
| `name` | String, required 2–80 | Display name (`Audio`) |
| `slug` | String, unique, indexed | URL-safe (`audio`); auto-derived from name |
| `description` | String, default `""` | Mapped to storefront `desc` |
| `image` | String, default `""` | Card image URL |
| `isActive` | Boolean, indexed, default `true` | Inactive categories 404 publicly |
| `parent` | ObjectId → Category, nullable, indexed | Optional hierarchy; deletes blocked while children exist |
| `createdAt` / `updatedAt` | Date | Managed by Mongoose |

### products

| Field | Type | Notes |
|---|---|---|
| `name` / `slug` | String required / unique+indexed | Slug auto-derived from name |
| `description` | String ≤ 5000 | Long-form copy |
| `brand` | String, indexed | Exact-match filter |
| `category` | ObjectId → Category, required, indexed | Mapped to storefront as the category **slug** |
| `price` | Number ≥ 0, required | Current price |
| `originalPrice` | Number ≥ 0, nullable | Strike-through; `null` = no sale |
| `images` | String[≤20] | Gallery URLs, first = hero |
| `rating` / `reviewCount` | Number | Maintained by reviews (Stage 5); drive `rating` sort + badges |
| `soldCount` | Number ≥ 0, default 0 | Written by orders (Stage 5); drives `bestselling` sort |
| `stock` | Number ≥ 0, default 0 | **On-hand** units (see below) |
| `reservedStock` | Number ≥ 0, default 0 | **Stage 6 holds** (cart/order allocation); 0 until then |
| `lowStockThreshold` | Number, default 5 | Stage 6 back-in-stock / reorder alerts |
| `featured` / `isActive` | Boolean, indexed | Rails / storefront visibility |
| `tags` | String[≤30], indexed | e.g. `trending`, `bestseller`, `new` |
| `colors` | `{name, hex}[]` | Filtered by `name` |
| `sizes` | String[] | Any-match filter |
| `variants` | embedded subdocs (see below) | Per-SKU overrides |
| `specifications` | Map<String,String> | Spec table (`{ Driver: "40mm" }`) |
| `createdAt` / `updatedAt` | Date | Drives `newest` sort |

Compound/text indexes: `{name,description,brand}` text · `{category,isActive}` ·
`{brand,isActive}` · `{price}` · `{rating:-1}` · `{featured:-1,isActive}` · `{tags}` ·
`{soldCount:-1}` · `{createdAt:-1}`.

### variants (embedded in products)

## Shopper state (Stage 4)

### carts

| Field | Notes |
|---|---|
| `user` | ObjectId → User, **unique** (one cart per user) |
| `items[]` | `{product → Product, qty 1–99, color?, size?}`, `_id: false` |
| `couponCode` | Uppercased string or null — echoed verbatim, validated in Stage 5 |
| `shippingId` | Verbatim, default `"standard"` — priced in Stage 5 |

Merge (`POST`) adds incoming qty onto matching lines, capped at
`min(available, 99)`; replace (`PUT`) sets exact qty capped the same way.
Validation is all-or-nothing (`INVALID_LINES` + per-line details; unknown
product → 404). `available`/`lineTotal` use **current** catalogue prices —
indicative until Stage 5 snapshots them into orders. Lines of deleted products
are pruned on read. Concurrency: single doc, last write wins (Stage 6
transactions cover checkout races).

### wishlists

### stockmovements

| Field | Notes |
|---|---|
| `product` | → Product, indexed |
| `type` | `sale` / `restock` / `adjustment`, indexed |
| `qty` | Signed delta (sales negative) |
| `balance` | On-hand stock afterwards |
| `reason` | Human note (e.g. `Sale ORD-482913`, `Year-end count`) |
| `orderNumber` / `actor` | Linkage when applicable |

Compound index `{product, createdAt}` + `{createdAt}` for the ledger feed.
NOTE: replicas-set transactions are still the planned hardening for multi-line
checkout atomicity (today: per-line atomic guards + rollback + ledger).

### reviews

| Field | Notes |
|---|---|
| `product` / `user` | Refs, indexed; unique compound (one review per user per product) |
| `author` | Name snapshot at post time |
| `rating` 1–5, `title`, `body` | Validated; edits re-validate |
| `verified` | Set when a non-cancelled/non-refunded order contains the product |
| `status` | `visible` / `hidden` / `flagged` — only `visible` lists and counts |

Product aggregates move as running averages (add/change/remove/hide/show),
rounded to 1 decimal — seeded counts are preserved, not recomputed.

### users (admin surface)

Role/activation management only — see `AUTHENTICATION.md` for the auth model.
Self-edits refused. Dashboard stats aggregate live orders/products/users.

## Orders (Stage 5)

### orders

| Field | Notes |
|---|---|
| `orderNumber` | Unique `ORD-xxxxxx` — the displayed/linked id |
| `user` | Owner → User, indexed |
| `items[]` | Price/name/brand/image/qty snapshots at purchase (`_id: false`) |
| `customer` | Name/email/phone snapshot |
| `shipping` | Address snapshot + method + charged cost |
| `payment` | Method + simulated reference/status (`cod` → pending) |
| `subtotal/discount/couponCode/shippingCost/tax/total` | Server-computed (`utils/pricing.ts`) |
| `status` | `pending → processing → shipped → delivered`, `cancelled`, `refunded` |
| `history[]` | Every transition with timestamp + note |

Indexes: `{user, createdAt}`, `{status, createdAt}` + unique orderNumber.
Checkout decrements `stock` atomically per line and bumps `soldCount`;
cancel restocks `stock` (soldCount keeps gross sales).
`utils/pricing.ts` is the single server pricing truth (coupons, shipping table,
8% tax). Multi-line atomicity today = per-line guards + rollback; Stage 6
transactions (replica set required) make checkout fully atomic.

| Field | Notes |
|---|---|
| `user` | ObjectId → User, **unique** |
| `products` | ObjectId[] → Product (store-id shape; populate via catalogue when needed) |

Toggle validates the product exists and is active; removal is idempotent and
accepts id or slug.

`{ sku (required, unique per product, case-insensitive), name, color, size,
price (nullable override), stock, image }`. No `_id` — addressed by SKU.
Embedded deliberately: catalogues are small, the storefront always renders them
with the product, and single-document writes stay atomic without transactions.
If variant counts ever explode, promote to a `productvariants` collection with a
`product` ref; the TS interface in `models/Product.ts` stays valid.

## Stage 6 forward-compat (inventory)

- Shopper-visible availability is **computed**, never stored:
  `available = max(0, stock − reservedStock)` (`availableStock()` in the model).
- `inStock` filter and the storefront `stock` field both use `available`.
- Stage 6 adds: writers of `reservedStock` (cart holds, order allocation/release),
  a `stockmovements` collection (audit log), and low-stock jobs keyed off
  `lowStockThreshold`. No migration of `stock` needed.
- Stage 6 order placement uses **multi-document transactions** → MongoDB must run
  as a replica set (even locally: `mongod --replSet rs0`). See README.

## Catalogue API (all under `/api/v1`)

| Method + path | Auth | Notes |
|---|---|---|
| `GET /products` | public | Search/filter/sort/pagination (below) |
| `GET /products/featured|trending|bestsellers|new` | public | `?limit=` rails |
| `GET /products/search?q=&limit=` | public | Name/brand/description/tags |
| `GET /products/slug/:slug`, `GET /products/:id` | public | `:id` accepts ObjectId **or** slug |
| `GET /products/:id/related` | public | Same category/brand, `?limit=` |
| `POST /products` | writer | `admin`, `inventory-manager` |
| `PATCH /products/:id`, `DELETE /products/:id` | writer | 404/409 coded errors |
| `GET /categories` | public | With live active-product counts |
| `GET /categories/:ref`, `GET /categories/:ref/products` | public | `:ref` = id or slug |
| `POST /categories` | writer | Auto-slug; 409 `SLUG_TAKEN` |
| `PATCH /categories/:ref` | writer | Cycle-safe parent changes |
| `DELETE /categories/:ref` | writer | Blocked: 409 `CATEGORY_IN_USE` / `CATEGORY_HAS_CHILDREN` |

Listing query: `search, sort=featured|newest|price-asc|price-desc|rating|bestselling
(default featured), category, categories[], brands[], minPrice, maxPrice,
minRating, inStock, colors[], sizes[], page (default 1), limit (default 9, max 100)`.
Multi-value params accept `?a=x&a=y` or `?a=x,y`. Writers may add `all=true`
(with token) to preview inactive products. Response: `{ success, data: FrontendProduct[],
meta: { total, page, pages, limit } }` — `category` is the slug string, `stock` is
available units, `createdAt` ISO, exactly matching the mock shape in
`src/mocks/products.js`.

## Seed

`npm run seed` upserts 7 categories + 24 products (mirrored from the frontend
preview mocks, `createdAt` preserved) and 4 demo accounts
(`admin|manager|warehouse|customer @aura.shop`, password `SEED_PASSWORD` or
`aura-demo-1234`). Refuses production unless `SEED_ALLOW_PRODUCTION=true`.
