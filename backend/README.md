# AURA Backend — Stage 8: Live frontend integration

Express + TypeScript + MongoDB (Mongoose) modular monolith. Versioned API under `/api/v1`.
Stage 8 wires the storefront to this API with no UI changes — the integration
lives entirely in `src/services/api/*`, `src/store/store.js`, and two page
mount hooks. Mock mode stays the default; go live per `src/README.md`.

## Prerequisites

- Node.js ≥ 20 (`node -v`)
- MongoDB: local `mongod` **or** MongoDB Atlas (connection string)
  - Stage 1 works on a single node. **Stage 6 inventory transactions will require a replica set** — even locally (`mongod --replSet rs0`). If you plan ahead, start one now (see below).

## Install & run

```bash
cd backend
npm install
cp .env.example .env   # adjust MONGODB_URI / secrets as needed
npm run seed           # 7 categories + 24 products + 4 demo accounts
npm run dev            # tsx watch — http://localhost:4000
```

Other scripts: `npm run build` + `npm start` (production), `npm run typecheck`, `npm run lint`, `npm test` (vitest; needs MongoDB at `MONGODB_URI_TEST` or `mongodb://127.0.0.1:27017/aura_test`).

## MongoDB configuration

| Setup | `MONGODB_URI` |
|---|---|
| Local single node | `mongodb://127.0.0.1:27017/aura` |
| Local replica set (recommended prep for Stage 6) | start with `mongod --replSet rs0 --dbpath <data>`, then `mongosh --eval "rs.initiate()"`, URI `mongodb://127.0.0.1:27017/aura?replicaSet=rs0` |
| Atlas | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/aura?retryWrites=true&w=majority` |

Development secrets are available locally. Production refuses to boot with development JWT or payment-webhook secrets; Render generates these secrets from `render.yaml`. Never use the development webhook secret for a real payment provider.

`CORS_ORIGINS` is a comma-separated allow-list; set the exact deployed frontend URL in Render.

## Test the health endpoint

```bash
curl -s http://localhost:4000/api/v1/health | jq .
# { "success": true, "data": { "status": "ok", "version": "1.0.0", "env": "development",
#   "uptimeSec": 12, "timestamp": "...", "mongodb": "connected" } }

curl -s http://localhost:4000/api/v1/nope | jq .
# { "success": false, "message": "Route not found: GET /api/v1/nope", "code": "NOT_FOUND" }
```

Interactive docs: `http://localhost:4000/api/docs` (Swagger UI). `npm test` runs the full suite (health + auth + catalogue; needs local Mongo — see below).

## Catalogue (Stage 3)

Public reads, writer writes (`admin`, `inventory-manager`):

- `GET /products` — search (`search`), filters (`category`, `categories`, `brands`, `minPrice`, `maxPrice`, `minRating`, `inStock`, `colors`, `sizes`), sorts (`featured` default, `newest`, `price-asc`, `price-desc`, `rating`, `bestselling`), pagination (`page`, `limit` default 9, `meta: {total,page,pages,limit}`). Writers pass `all=true` (with token) to preview inactive items.
- Rails: `GET /products/featured|trending|bestsellers|new`, type-ahead `GET /products/search?q=`, detail `GET /products/:id` (id **or** slug) + `/slug/:slug`, `GET /products/:id/related`.
- `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` (writers; slug auto-derived from name; 409 `SLUG_TAKEN`).
- Categories: `GET /categories` (live product counts), `GET /categories/:ref` (id or slug), `GET /categories/:ref/products`, writer `POST/PATCH/DELETE` — deletes are safe: 409 `CATEGORY_IN_USE` / `CATEGORY_HAS_CHILDREN`.
- Response shapes match the preview mocks exactly (`category` is the slug string, `stock` is available units, `createdAt` ISO) — see `src/mocks/products.js`.

## Seed the catalogue + demo accounts

```bash
cd backend
npm run seed   # idempotent upserts: 7 categories + 24 products + 4 demo users
```

Demo logins (password from `SEED_PASSWORD`; the default is for local development only):
`admin@aura.shop`, `manager@aura.shop`, `warehouse@aura.shop`, `customer@aura.shop`.
Seed refuses production unless both `SEED_ALLOW_PRODUCTION=true` and a unique `SEED_PASSWORD` are provided. Remove these temporary variables after a one-off production seed.

## Reviews & admin (Stage 7)

- Reviews: `GET /products/:id/reviews` (public, visible only, paginated),
  `POST /products/:id/reviews` (auth, one per user → 409, `verified: true` when a
  non-cancelled order contains the product). `PUT /reviews/:id` and
  `DELETE /reviews/:id` for owners/admins; `PATCH /reviews/:id/status` (admin)
  hides/flags/shows. Product `rating`/`reviewCount` move as running averages so
  the seeded catalogue realism survives the first real reviews.
- Admin (role `admin` only): `GET /admin/users` (search `q`, filter `role`),
  `PATCH /admin/users/:id` (role/activation; self-edits refused),
  `GET /admin/stats` (revenue, orders by status, users, products, stock flags,
  top products by `soldCount`, recent orders).

## Inventory ledger (Stage 6)

Stock staff (`admin`, `inventory-manager`, `warehouse-employee`):

- `POST /inventory/adjust {productId, stock, reason}` — absolute stock-take,
  logs the signed delta (no-op takes log nothing).
- `GET /inventory/movements?productId=&type=&page=` — append-only ledger.
  Checkout writes `sale` lines, order cancels write `restock` lines.
- `GET /inventory/low-stock` — active products at/below threshold by available
  units, worst first. `GET /inventory/overview` — headline counts.

## Orders & checkout (Stage 5)

Auth-required. Server prices every order (coupons `WELCOME10`/`PREMIUM15`/`FREESHIP`,
shipping standard 6.95 / express 14.95 / overnight 24.95 with free $75+ standard,
8% tax — same operation order as the storefront `calculateTotals`):

- `POST /orders` — checkout. Omit `items` to buy the cart (cleared on success),
  or pass explicit buy-now lines. Stock decrements are atomic per line
  (`$inc` guarded by `stock >= qty`); a late race rolls back and returns 409.
  Sale increments `soldCount`. Response is the exact storefront order shape
  (`id: ORD-xxxxxx`, items snapshots, totals, customer, shipping, payment, status).
- `GET /orders` — own history array (newest first); staff add `?all=true` with
  optional `?status=` for the paginated fulfilment queue.
- `GET /orders/:ref` — detail (owner or fulfilment staff; id or ORD-number).
- `PATCH /orders/:ref/status` — owner cancels fresh (`processing`) orders
  (stock restored); warehouse/admins ship → deliver; admin refunds delivered.
  Every change is appended to `history`.

Payment is simulated (the provider SDK plugs into `simulatePayment()` in the
checkout page; `cod` stays `pending`). True multi-line transactions arrive with
the Stage 6 replica-set requirement — see `DATABASE_SCHEMA.md`.

## Shopper state (Stage 4)

Auth-required (Bearer). Guests keep localStorage carts until login, then the
frontend merges via `POST /cart` (Stage 8 wiring).

- `GET /cart` — current cart, or the empty shape when never saved.
- `POST /cart {items, couponCode?, shippingId?}` — sync merge: incoming lines add
  onto existing ones (same product+color+size), each capped at available stock.
  All-or-nothing: unknown products → 404, inactive/out-of-stock/bad options →
  400 `INVALID_LINES` with per-line details, nothing saved.
- `PUT /cart {items}` — full replace (qty edits, removals, `[]` clears). Incoming
  qty capped at availability.
- `PATCH /cart {couponCode?, shippingId?}` — prefs stored verbatim (coupon is
  uppercased); server-side pricing/validation arrives with orders (Stage 5).
- `DELETE /cart` — clears lines, keeps prefs.
- Cart lines echo the catalogue: `{productId, slug, name, brand, price, image,
  qty, color, size, available, lineTotal}`, plus `count` and `subtotal` (current
  prices — indicative until Stage 5 snapshots them). Lines of deleted products
  are pruned on read. One cart per user; last write wins.
- Wishlist: `GET /wishlist` → `{items: [productIds]}` (store shape),
  `POST /wishlist/toggle {productId}` → `{wished, items}`, idempotent
  `DELETE /wishlist/:productId` (id or slug). Adding requires an active product.

Schema reference (incl. the Stage 6 inventory forward-compat: `stock` vs `reservedStock`, `soldCount`, `lowStockThreshold`): `DATABASE_SCHEMA.md`.
Auth flows/roles/tokens: `AUTHENTICATION.md`.

## Response envelope (frontend contract)

- Success: `{ "success": true, "data": <payload>, "meta"?: { total, page, pages, limit } }`
- Error: `{ "success": false, "message": "...", "code": "...", "details"?: [...] }` with proper HTTP status codes.

The existing frontend `apiClient` returns `data` verbatim and reads `message` on errors. In **Stage 8** we add a one-place `unwrap` in `src/services/api/apiClient.js` (return `raw.data`, surface `raw.message`) — **no UI component changes**. Until then the frontend stays in mock mode; nothing here breaks it.

## Security defaults (Stage 1)

helmet headers, CORS allow-list + credentials, global rate limit (500/15 min, tighter auth limits in Stage 2), 256 KB JSON cap, zod-validated env, centralized safe error responses (stack traces never leak; validation `details` only outside production except field errors), `x-powered-by` off.

## Project structure

```
backend/
  src/
    server.ts            bootstrap (DB → app → listen, graceful shutdown)
    app.ts               createApp(): middleware, routes, swagger, 404, errors
    config/env.ts        zod-validated env (fails fast, guards prod secrets)
    config/db.ts         mongoose connect/status/disconnect
    middleware/          asyncHandler, auth (requireAuth/requireRole), validate (zod), errorHandler (AppError + 404)
    models/              User (auth), Category, Product (+ embedded variants)
    services/            authService, catalogService (queries, mappers, CRUD)
    routes/              health, auth (8), products (13), categories (5), productQuery (shared listing query)
    seed/                catalog.ts (24 AURA products + 7 categories) + seed.ts (idempotent, demo users)
    utils/               logger, responses (ok/created/paginated envelope), jwt, password, hash, slug
    docs/                openapi.yaml + loader (Swagger UI at /api/docs)
  tests/health.test.ts   supertest foundation suite (no DB needed)
  tests/auth.test.ts     20 auth cases (needs local mongo)
  tests/catalog.test.ts  ~25 catalogue cases (needs local mongo)
  tests/shopper.test.ts  ~18 cart/wishlist cases (needs local mongo)
  tests/orders.test.ts   ~15 order/checkout cases (needs local mongo)
  tests/inventory.test.ts ~12 ledger/stock-take cases (needs local mongo)
  tests/reviews.test.ts    ~15 review/admin cases (needs local mongo)
```

## Done — full stack live (Stage 8)

- `src/services/api/apiClient.js`: `/api/v1` prefix, `{success,data,meta}` unwrap
  (paginated → `{items,total,page,pages}` mock shape), Bearer auth, one-shot
  401→refresh retry.
- `authApi` maps live tokens to the mock `{user, token}` shape (refresh kept in
  `aura_refresh`); login/register merge device cart/wishlist into the server.
- `productApi` live product cache (cart lines resolve without extra fetches);
  `orderApi` translates checkout drafts to server shape, clears the server cart.
- `cartSync.js`: debounced cart replace on mutation, additive wishlist union on
  login/boot, boot-time merge in `src/app.js`.
- Account orders tab + profile name read/write the server in live mode.
- To run the stack: `npm install && npm run seed && npm test && npm run dev`,
  then set `aura_api_base_url` + `aura_use_mock=0` in the preview (see `src/README.md`).
  `npm run typecheck` and `npm run lint` must pass; `npm test` needs local Mongo.
