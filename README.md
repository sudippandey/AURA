# AURA

AURA is a storefront prototype and an Express/TypeScript API, organized as a small monorepo. The storefront uses native JavaScript modules and CSS; the backend uses MongoDB through Mongoose.

## Project status

- The storefront supports catalog browsing, cart, account, and checkout demonstrations. Mock data and mock mode are enabled by default.
- The backend implements authentication, catalog, cart, wishlist, order, inventory, review, and admin routes, as well as health checks and Swagger documentation. The storefront still uses mock mode by default.
- Checkout and payment are simulated. Do not use real credentials or payment details, and do not treat this demo as a production commerce system.

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

The storefront remains in mock mode by default. Some API endpoints now exist, but storefront authentication and data mapping have not been fully wired and verified end to end. Keep mock mode enabled for regular browsing. Configure the API origin through `window.__API_BASE_URL` or the `aura_api_base_url` local-storage value.

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

The API has a Render Blueprint in `render.yaml`. Create a MongoDB Atlas database first, then deploy the Blueprint and enter its `MONGODB_URI` and `CORS_ORIGINS` values privately in Render. Set `CORS_ORIGINS` to the exact Vercel production URL; include additional preview/custom-domain URLs only if needed. Render generates the JWT secrets.

After both services deploy, verify `https://<api-host>/api/v1/health` reports a connected MongoDB. API routes exist, but payment is simulated and the storefront is not fully integrated with the live API yet. Do not set `aura_use_mock` to `"0"` for general storefront use until that integration has been verified. The free Render service may sleep when idle and is not a production availability plan.

## Repository layout

- `frontend/`: storefront application, API client, mock data, and UI.
- `backend/`: Express application, configuration, middleware, API docs, and tests.

## Collaboration

Create a short-lived branch from `main` for each change, use descriptive Conventional Commit subjects (for example, `feat(api): add product listing endpoint` or `docs: clarify local setup`), and open a pull request with relevant test results. Never commit `.env` files, secrets, or real customer data.