# AURA storefront demo

AURA is a dependency-free storefront prototype built with native JavaScript modules and CSS. It uses a local mock catalog and simulated checkout; it is not a production commerce system.

## Run locally

Serve this directory over HTTP so the browser can load JavaScript modules:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. No package installation or build step is required.

## Included demo behavior

- Product catalog, filters, search, product details, cart, wishlist, and account screens.
- Mock accounts and orders stored in this browser's local storage.
- Checkout and payment are simulated; no payment is taken and no order is fulfilled.
- Mock mode is enabled by default.

Use test-only credentials in this demo. Do not enter real passwords or payment details: browser storage and the client-side mock authentication are not a substitute for a secure backend.

## Backend integration

The frontend defaults to `http://localhost:4000` as its backend origin. Start the backend, then set `aura_use_mock` to `"0"` in local storage to send requests to it. The API client adds the backend's `/api/v1` prefix and unwraps its success envelope. To use another backend, set `window.__API_BASE_URL` before `app.js` loads or save `aura_api_base_url` in local storage; use the origin only (for example `https://api.example.com`).

The current backend implements only API info and `GET /health`; catalog, authentication, cart, and order routes are not implemented yet. Leave mock mode enabled for the storefront until those routes are available. Backend CORS defaults permit local frontend servers on ports 5173, 8000, and 8765; configure `CORS_ORIGINS` for other origins.

The current checkout still calls a simulated payment function. Before handling real customers or payments, implement server-side authentication, authorization, validation, order and inventory management, and payment-provider integration. Do not treat client-side totals or order data as authoritative.

## Project layout

- `app.js`, `index.html`, `styles.css`: browser entrypoint, router, and styling.
- `api/`: mock-backed API functions and the HTTP client.
- `components/`, `hooks/`, `lib/`: UI helpers, cached data helpers, formatting, and validation.
- `pages/`: storefront routes.
- `mocks/`: demo products, categories, and reviews.
- `store.js`: cart, account, and browser persistence.
