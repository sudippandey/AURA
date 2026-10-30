# AURA

AURA is a storefront with a staff admin panel and an Express/TypeScript API, organized as a small monorepo. The frontend uses native JavaScript modules and CSS; the backend uses MongoDB through Mongoose.

## Project status

- The storefront supports catalog browsing, cart, account, and checkout. The `/admin` area provides staff operations and is guarded by backend role permissions.
- The API includes authentication, catalog, cart, wishlist, orders, inventory, reviews, payments, refunds, coupons, shipping, reporting, staff, and settings endpoints.
- The storefront mock mode remains enabled by default. Payment is simulated; do not use real credentials or payment details or treat this demo as a production commerce system.

## Run locally

Requirements: Node.js 20 or newer and MongoDB for backend features. MongoDB may be unavailable for the health endpoint, but data-backed routes require a working database.

Start the backend:

```sh
cd backend
npm install
cp .env.example .env
npm run dev
```

In another terminal, serve the frontend:

```sh
cd frontend
python3 -m http.server 8000
```

Open <http://localhost:8000>. The API health endpoint is <http://localhost:4000/api/v1/health> and the interactive API docs are at <http://localhost:4000/api/docs>.

The storefront remains in mock mode by default. Configure the API origin through `window.__API_BASE_URL` or the `aura_api_base_url` local-storage value. To try the admin screen against mock data, visit `/admin`; to use live data, first seed the backend with a unique admin password and configure the API URL.

## Validation

Run backend tests, type checking, build, and lint:

```sh
cd backend
npm test
npm run typecheck
npm run build
npm run lint
```

## Deployment preview

The storefront can be deployed as a static Vercel project with the project root set to `frontend`. Its Vercel build configuration creates `frontend/dist`. Set the Vercel environment variable `API_BASE_URL` to the deployed API origin (for example `https://aura-api.onrender.com`) and redeploy after the backend URL is known.

The API has a Render Blueprint in `render.yaml`. Create a MongoDB Atlas database first, then deploy the Blueprint and enter its `MONGODB_URI` and `CORS_ORIGINS` values privately in Render. Set `CORS_ORIGINS` to the exact Vercel production URL; include additional preview/custom-domain URLs only if needed. Render generates the JWT and payment-webhook secrets.

After both services deploy, verify `https://<api-host>/api/v1/health` reports a connected MongoDB. The storefront uses `API_BASE_URL` at build time; keep mock mode enabled until the live site and admin are verified. The free Render service may sleep when idle and is not a production availability plan.

## Repository layout

- `frontend/`: storefront application, API client, mock data, and UI.
- `backend/`: Express application, configuration, middleware, API docs, and tests.

## Collaboration

Create a short-lived branch from `main` for each change, use descriptive Conventional Commit subjects (for example, `feat(api): add product listing endpoint` or `docs: clarify local setup`), and open a pull request with relevant test results. Never commit `.env` files, secrets, or real customer data.