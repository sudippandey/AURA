# AURA

AURA is a storefront prototype and an Express/TypeScript API foundation, organized as a small monorepo. The storefront uses native JavaScript modules and CSS; the backend uses MongoDB through Mongoose.

## Project status

- The storefront supports catalog browsing, cart, account, and checkout demonstrations. Mock data and mock mode are enabled by default.
- The backend currently provides API information, health checks, and Swagger documentation. Product, authentication, cart, and order endpoints are not implemented yet.
- Checkout and payment are simulated. Do not use real credentials or payment details, and do not treat this demo as a production commerce system.

## Run locally

Requirements: Node.js 20 or newer. MongoDB is optional for the current health/API foundation; health reports its connection status.

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

The storefront remains in mock mode by default. To send API requests, configure `aura_use_mock` as `"0"` in browser local storage. Only the API information and health routes currently exist; storefront features continue to need mock mode until their server endpoints are implemented. Configure the API origin through `window.__API_BASE_URL` or the `aura_api_base_url` local-storage value.

## Validation

Run backend tests, type checking, build, and lint:

```sh
cd backend
npm test
npm run typecheck
npm run build
npm run lint
```

## Repository layout

- `frontend/`: storefront application, API client, mock data, and UI.
- `backend/`: Express application, configuration, middleware, API docs, and tests.

## Collaboration

Create a short-lived branch from `main` for each change, use descriptive Conventional Commit subjects (for example, `feat(api): add product listing endpoint` or `docs: clarify local setup`), and open a pull request with relevant test results. Never commit `.env` files, secrets, or real customer data.