# AURA — Premium E-commerce Frontend

Production-quality demo storefront. Zero-build preview (native ESM) that mirrors a Vite + React + TS architecture 1:1, so you can port it without touching UI logic.

## Run the preview
Open the generator — `index.html` boots `src/app.js`. No build step.
Preview routing is in-memory (the Perchance editor owns `location.hash`);
the Vite port restores URL routing with React Router using the same route table.

## Port to Vite + React + TS (local)
The file map is deliberate:

| Preview (this repo) | Vite equivalent |
|---|---|
| `src/services/api/apiClient.js` | `src/services/api/apiClient.ts` (axios/fetch wrapper) |
| `src/services/api/endpoints.ts` | same path, same names |
| `src/services/api/productApi.ts` | `getProducts, getProductById, getFeaturedProducts, getRelatedProducts, searchProducts, getProductsByCategory, getProductReviews` |
| `src/hooks/useProducts.ts` | TanStack Query `useQuery` wrappers with identical keys |
| `src/store/store.js` | Zustand store with identical actions |
| `src/pages/*` | React Router routes with identical paths |

`package.json` deps for local Vite: `react react-dom react-router-dom @tanstack/react-query zustand react-hook-form zod framer-motion lucide-react`.

Routes: `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout`, `/success`, `/login`, `/register`, `/forgot`, `/account(/:tab)`, `/wishlist`, `/about`, `/contact`, `/faq`, `/shipping`, `/returns`, `/privacy`, `/terms`.

## Connect the AURA backend (done — Stage 8)

The companion Express/Mongo API in `backend/` speaks this storefront natively:

1. Run it: `cd backend && npm install && npm run seed && npm run dev` (http://localhost:4000).
2. Point the preview at it: `localStorage.setItem("aura_api_base_url", "http://localhost:4000")`.
3. Reload the preview. A configured backend URL uses live requests automatically; set `localStorage.setItem("aura_use_mock", "1")` to force mock data.

What happens in live mode (`src/services/api/*` only — no UI changes):
- `apiClient.js` prefixes `/api/v1`, unwraps the `{success,data,meta}` envelope
  (paginated lists surface as `{items,total,page,pages}`, exactly the mock shape),
  sends `Authorization: Bearer` from `aura_token`, and refreshes an expired
  access token once via `aura_refresh` before surfacing a 401.
- `authApi.js` maps `{user, accessToken, refreshToken}` to the mock `{user, token}`
  shape; logout revokes server-side. Login/register merge the device cart +
  wishlist into the server ones (`cartSync.js`); every cart/wishlist mutation
  syncs in the background (debounced replace / fire-and-forget toggle).
- `productApi.js` caches live products so cart lines resolve offline of extra
  round-trips; `orderApi.js` translates the checkout draft to the server shape
  (server prices every order) and clears the server cart after purchase.
- Account orders tab re-reads from `GET /orders`; profile name saves to the server.

To switch back to live requests after forcing mock mode, set `aura_use_mock` to `"0"` or remove it. With no backend URL, requests use mocks.

## Connect YOUR OWN backend API instead
1. Set the base URL — one of:
   - `localStorage.setItem("aura_api_base_url", "https://api.yours.com")`, or
   - define `window.__API_BASE_URL = "https://api.yours.com"` before `src/app.js` loads, or
   - edit `CONFIG.API_BASE_URL` in `src/config.js`.
2. Live requests are enabled when a backend URL is configured; set `localStorage.setItem("aura_use_mock", "1")` to force mock mode.
3. Match endpoints in `src/services/api/endpoints.js`, or keep your backend REST shape and only edit the `*Api.js` mappers.
4. Auth: `authApi.js` sends `Authorization: Bearer <token>` automatically when `aura_token` exists (see `apiClient.js`).
5. Response mapping: `apiClient.normalizeList()` accepts `{items,total,page,pages}` OR `{data,meta}` OR plain arrays — adjust in one place.

### Function inventory (all mock-backed, UI never calls fetch)
- `productApi`: `getProducts({page,limit,sort,filters,search})`, `getProductById(id)`, `getFeaturedProducts()`, `getTrendingProducts()`, `getBestSellers()`, `getNewArrivals()`, `getRelatedProducts(id)`, `searchProducts(q)`, `getProductsByCategory(id)`, `getProductReviews(id)`
- `categoryApi`: `getCategories()`, `getCategoryById(id)`
- `cartApi`: `calculateTotals(lines,{couponCode,shippingId})`, `validateCoupon(code,subtotal)`, `fetchCart/syncCart`
- `authApi`: `loginApi`, `registerApi`, `forgotApi`
- `orderApi`: `createOrderApi`, `getOrdersApi`

### Product schema
`{ id, name, slug, description, price, originalPrice, images[], category, brand, rating, reviewCount, stock, featured, variants[], specifications{}, createdAt, tags[], colors[{name,hex}], sizes[] }`

## Payments (demo ↔ real)
Checkout calls `simulatePayment()` in `src/pages/checkout.js`. Replace its body with Stripe/Adyen SDK — the form validation, order creation (`orderApi.createOrderApi`) and success page stay unchanged.

## Demo shortcuts
Coupons: `WELCOME10` (10%), `PREMIUM15` (15% over $200), `FREESHIP` (free standard). Auth: register a fresh account, or login with any registered one. Orders persist to `localStorage aura_orders`. Cart/wishlist/recent persist across refresh.

## Admin dashboard (`/admin`)

Same app, same backend, same database — no second stack. Staff-only area with its own layout/sidebar (in-memory route `/admin/...`; the editor owns `location.hash`).

- Guard: `src/admin/layout.js` `guardAdmin()` blocks logged-out users and `role: customer`. UI hiding is convenience only — every `/api/v1/admin/*` route re-checks action-level permissions server-side (`backend/src/middleware/permissions.ts`).
- Without a backend URL, dashboard/catalog/orders/etc. render mock data with a "Sample data" label. A configured backend URL uses live APIs; set `aura_use_mock=1` to force a mock preview. Log in with a staff account to access live admin data.
- Money rules: payments live apart from orders; only provider-confirmed records count; webhooks need `x-webhook-signature` (HMAC, `PAYMENT_WEBHOOK_SECRET`) and are idempotent; refunds complete only on provider confirmation or documented manual completion.
- Inventory rules: checkout decrements atomically with rollback; reservations hold availability without touching on-hand; dispatch deducts both; every movement is logged with reason + actor.
