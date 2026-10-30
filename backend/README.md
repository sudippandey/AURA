# AURA Backend — Stage 1: Foundation

Express + TypeScript + MongoDB (Mongoose) modular monolith. Versioned API under `/api/v1`.
Stage 1 delivers the runnable foundation: config, security middleware, error handling, health checks, docs.

## Prerequisites

- Node.js ≥ 20 (`node -v`)
- MongoDB: local `mongod` **or** MongoDB Atlas (connection string)
  - Stage 1 works on a single node. **Stage 6 inventory transactions will require a replica set** — even locally (`mongod --replSet rs0`). If you plan ahead, start one now (see below).

## Install & run

```bash
cd backend
npm install
cp .env.example .env   # adjust MONGODB_URI / secrets as needed
npm run dev            # tsx watch — http://localhost:4000
```

Other scripts: `npm run build` + `npm start` (production), `npm run typecheck`, `npm run lint`, `npm test` (vitest).

## MongoDB configuration

| Setup | `MONGODB_URI` |
|---|---|
| Local single node | `mongodb://127.0.0.1:27017/aura` |
| Local replica set (recommended prep for Stage 6) | start with `mongod --replSet rs0 --dbpath <data>`, then `mongosh --eval "rs.initiate()"`, URI `mongodb://127.0.0.1:27017/aura?replicaSet=rs0` |
| Atlas | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/aura?retryWrites=true&w=majority` |

JWT secrets: dev defaults exist so the server boots out of the box; **production refuses to boot** with them (see `src/config/env.ts`). Generate real ones: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

`CORS_ORIGINS` is a comma-separated allow-list (defaults include local frontend origins on ports 5173, 8000, and 8765).

## Test the health endpoint

```bash
curl -s http://localhost:4000/api/v1/health | jq .
# { "success": true, "data": { "status": "ok", "version": "1.0.0", "env": "development",
#   "uptimeSec": 12, "timestamp": "...", "mongodb": "connected" } }

curl -s http://localhost:4000/api/v1/nope | jq .
# { "success": false, "message": "Route not found: GET /api/v1/nope", "code": "NOT_FOUND" }
```

Interactive docs: `http://localhost:4000/api/docs` (Swagger UI). `npm test` runs the health suite.

## Render deployment preview

The repository root `render.yaml` defines a demo web service with this directory as its root, a build that includes TypeScript's development dependencies and copies the OpenAPI document into the production output, generated JWT secrets, and a health check. Before deploying it, create a MongoDB Atlas database. Enter the Atlas connection string as `MONGODB_URI` and the exact deployed frontend URL(s) as comma-separated `CORS_ORIGINS` values in Render's environment settings. Do not commit these values. The Blueprint uses Render's free service plan, which may sleep when idle and is intended for preview/demo use.

## Response envelope (frontend contract)

- Success: `{ "success": true, "data": <payload>, "meta"?: { total, page, pages, limit } }`
- Error: `{ "success": false, "message": "...", "code": "...", "details"?: [...] }` with proper HTTP status codes.

The storefront API client adds the `/api/v1` prefix and unwraps this success envelope centrally. The current backend implements only API info and health routes; storefront catalog, auth, cart, and order endpoints remain future work, so keep mock mode enabled until those routes are implemented.

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
    middleware/          asyncHandler, errorHandler (AppError + 404), validate (zod)
    routes/health.ts     GET /api/v1 (+ /health)
    utils/               logger, responses (ok/created/paginated envelope)
    docs/                openapi.yaml + loader (Swagger UI at /api/docs)
  tests/health.test.ts   supertest suite for the foundation
```

## Next (Stage 2): database + authentication

User model (roles: customer/admin/inventory-manager/warehouse-employee, never trusted from client), bcrypt hashing, register/login/refresh/logout, `GET /auth/me`, `validate`+`requireAuth`+`requireRole` middleware, per-route auth rate limits, tests for every path above.
