# AURA Authentication

JWT access + rotating refresh tokens, bcrypt passwords, role-based authorization.
Base path: `/api/v1/auth`. All error bodies: `{ success:false, message, code, details? }`.

## Token model

| Token | Lifetime (`JWT_*_TTL`) | Contents | Transport |
|---|---|---|---|
| Access | 15m | `{ sub, role, type:"access" }` | `Authorization: Bearer <token>` |
| Refresh | 30d | `{ sub, jti, type:"refresh" }` | JSON body `{ refreshToken }` |

`requireAuth` is **stateless**: id + role come from the access token (role changes apply at next login/refresh — acceptable with a 15-minute TTL). Refresh sessions (`jti` + expiry, max 5 per user, oldest pruned) are stored on the User document.

**Rotation + reuse detection:** every `/refresh` deletes the presented `jti` and issues a new pair. A valid signature with an unknown `jti` means the token was replayed → **all sessions revoked** (`TOKEN_REUSED`, client must log in again). `POST /logout` is idempotent (always 200).

## Roles

`customer | admin | inventory-manager | warehouse-employee`. Roles are **never read from the client**: registration forces `customer` (extra `role` keys are stripped by validation and ignored by the service), and `PATCH /me` only accepts `name`. Admins arrive via the Stage-3 seed script or direct DB insert:

```js
// mongosh aura
db.users.updateOne({ email: "you@shop.com" }, { $set: { role: "admin" } });
```

Protect routes with `requireAuth` then `requireRole("admin")` (403 `FORBIDDEN` otherwise).

## Endpoints

| Method & path | Auth | Notes |
|---|---|---|
| `POST /auth/register` `{name,email,password}` | strict-ish limit | 201 `{user, accessToken, refreshToken}`; 409 `EMAIL_TAKEN` |
| `POST /auth/login` | 20/15min | 401 `INVALID_CREDENTIALS`; 403 `ACCOUNT_DISABLED` |
| `POST /auth/refresh` `{refreshToken}` | 60/15min | 401 `INVALID_TOKEN` / `TOKEN_REUSED` |
| `POST /auth/logout` `{refreshToken?}` | 60/15min | always 200 |
| `GET /auth/me` | Bearer | 401 `UNAUTHENTICATED` / `INVALID_TOKEN` |
| `PATCH /auth/me` `{name}` | Bearer | email/role immutable here |
| `POST /auth/forgot-password` `{email}` | 20/15min | **always 200** (no enumeration); non-prod also returns `resetToken` for testing |
| `POST /auth/reset-password` `{token,password}` | 20/15min | 400 `INVALID_TOKEN`; clears reset + revokes all sessions |

Passwords: bcrypt (`BCRYPT_ROUNDS`, default 12; use 4–6 in test envs), 8–72 chars. Reset tokens: 256-bit random, **SHA-256 hash stored**, 1-hour expiry. Secrets/password hashes are never serialized (`select:false` + `toJSON` transform + explicit `toPublicUser` mapping).

## Frontend wiring (Stage 8, no UI changes)

1. Point `apiBaseUrl` at the API, set `aura_use_mock="0"`.
2. `loginApi`/`registerApi` store `user` + `aura_token` (existing `setSession` shape already matches `{user, token}` — keep it, then also persist `refreshToken`).
3. Add a refresh-on-401 interceptor in `apiClient`: on `INVALID_TOKEN`, call `/auth/refresh` once, retry the original request, else redirect to `/login`.
4. Call `/auth/logout` with the refresh token inside the existing `logout()`.
5. Until then the frontend stays in mock mode — nothing in the UI needs to change for Stage 2.

## Running the auth tests (needs local MongoDB)

```bash
BCRYPT_ROUNDS=4 MONGODB_URI_TEST=mongodb://127.0.0.1:27017/aura_test npm test -- tests/auth.test.ts
```

Covers: registration, forced-customer role, duplicate 409 (incl. concurrent race), validation 400s, login ok/bad/disabled, protected 401s, profile update with role ignored, admin allow/deny, rotation, reuse→revoke-all, idempotent logout, forgot/reset incl. enumeration resistance.
