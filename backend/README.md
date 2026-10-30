# AURA API

Express + TypeScript + MongoDB (Mongoose), versioned under `/api/v1`.

## Current scope

The API includes:

- Registration, login, refresh/logout, profile, and password-reset flows with JWTs, bcrypt, and role-based access.
- Product and category catalog/search endpoints.
- Authenticated cart and wishlist endpoints.
- Order checkout/history/status endpoints.
- Inventory adjustments/ledger, review moderation, and admin endpoints.
- Health checks, Swagger documentation, validation, centralized errors, CORS allow-listing, and rate limiting.

Payment processing is simulated; do not treat order/payment data as production-ready. Review the endpoint details in `src/docs/openapi.yaml`, authentication notes in `AUTHENTICATION.md`, and data model notes in `DATABASE_SCHEMA.md`.

## Prerequisites and local setup

- Node.js 20 or newer.
- MongoDB locally or MongoDB Atlas.

```sh
cd backend
npm install
cp .env.example .env
# Set MONGODB_URI and replace development secrets in .env as appropriate.
npm run dev
```

The API listens on port 4000 by default. Swagger UI is at `http://localhost:4000/api/docs`; health is at `http://localhost:4000/api/v1/health`.

## Commands

```sh
npm test
npm run typecheck
npm run build
npm run lint
npm run seed
```

Integration tests connect to `MONGODB_URI_TEST` (default: `mongodb://127.0.0.1:27017/aura_test`) and **drop that database before running**. Set it to a disposable, isolated test database; never point it at production or a database containing data you need.

The seed command creates demo catalog data and accounts. It refuses to run in production unless `SEED_ALLOW_PRODUCTION=true` is explicitly set. Set a private `SEED_PASSWORD` before seeding and change/remove seeded credentials before any shared deployment.

## Render preview deployment

The repository root `render.yaml` defines the Render service, installs development dependencies for TypeScript compilation, copies the OpenAPI file into `dist`, and configures the API health check. Set `MONGODB_URI` and the exact frontend origin(s) in Render's private environment settings. Render generates JWT secrets. Do not commit `.env` files or paste secrets into chat.

The Blueprint uses Render's free service plan, which may sleep when idle. Treat it as a preview deployment, not a production availability plan. Product, auth, cart, and order routes exist, but payment remains simulated and the storefront still defaults to mock mode until its API integration is completed and verified.
