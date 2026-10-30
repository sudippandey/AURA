// Centralized HTTP client. Components NEVER call fetch directly — use *Api modules.
// Mock mode is default; set a backend URL to go live (see src/README.md).
import { CONFIG, isMockMode } from "../../config.js";
import { ENDPOINTS } from "./endpoints.js";

const cache = new Map(); // TanStack-Query-style in-memory cache
const inflight = new Map();
const API_PREFIX = "/api/v1";

export function apiBaseUrl() { return CONFIG.API_BASE_URL; }
export function usingMock() { return isMockMode() || !apiBaseUrl(); }

function cacheKey(url, params) { return url + "::" + JSON.stringify(params || {}); }
export function invalidateCache(prefix) {
  for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix)) cache.delete(k);
}

function getTokens() {
  try {
    return {
      access: localStorage.getItem("aura_token") || "",
      refresh: localStorage.getItem("aura_refresh") || ""
    };
  } catch { return { access: "", refresh: "" }; }
}

function setTokens({ access, refresh }) {
  try {
    if (access) localStorage.setItem("aura_token", access);
    if (refresh) localStorage.setItem("aura_refresh", refresh);
  } catch {}
}

/** Single-flight access-token refresh (live mode). Resolves true when renewed. */
let refreshPromise = null;
async function tryRefresh(base) {
  if (refreshPromise) return refreshPromise;
  const { refresh } = getTokens();
  if (!refresh) return false;
  refreshPromise = (async () => {
    try {
      const res = await fetch(base + API_PREFIX + ENDPOINTS.refresh, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refresh })
      });
      const raw = await res.json().catch(() => null);
      if (!res.ok || !raw?.success) return false;
      setTokens({ access: raw.data.accessToken, refresh: raw.data.refreshToken });
      return true;
    } catch { return false; }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}

/**
 * Live-mode envelope handling (mock path untouched):
 * {success,data,meta?} → data, or {items,total,page,pages} for paginated lists
 * so live responses match the mock shapes exactly. Errors surface `message`.
 */
function unwrap(raw) {
  if (raw && raw.success === true) {
    if (raw.meta && Array.isArray(raw.data)) {
      return {
        items: raw.data,
        total: raw.meta.total ?? raw.data.length,
        page: raw.meta.page ?? 1,
        pages: raw.meta.pages ?? 1
      };
    }
    return raw.data;
  }
  return raw;
}

export async function apiRequest(path, { method = "GET", params = null, body = null, auth = false, cacheTime = 30000, mockFn = null } = {}) {
  const base = apiBaseUrl();
  const qs = params ? "?" + new URLSearchParams(JSON.parse(JSON.stringify(params))).toString() : "";
  // MOCK path — no network, simulated latency, cached like a real query
  if (usingMock()) {
    const key = "mock" + path + "::" + JSON.stringify({ params, body, method });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < cacheTime) return hit.data;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
      const data = mockFn ? await mockFn() : null;
      cache.set(key, { t: Date.now(), data });
      inflight.delete(key);
      return data;
    })();
    inflight.set(key, p);
    return p;
  }
  // REAL backend path
  const url = base + API_PREFIX + path + qs;
  const key = cacheKey(url, { params, body, method });
  if (method === "GET") {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < cacheTime) return hit.data;
  }
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const { access } = getTokens();
    if (access) headers.Authorization = `Bearer ${access}`;
  }
  async function attempt(isRetry) {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401 && !isRetry && !path.startsWith("/auth/")) {
      if (await tryRefresh(base)) return attempt(true);
    }
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const j = await res.json(); msg = j.message || msg; } catch {}
      throw new Error(msg);
    }
    const data = unwrap(await res.json());
    if (method === "GET") cache.set(key, { t: Date.now(), data });
    else invalidateCache(base + API_PREFIX);
    return data;
  }
  return attempt(false);
}

// Normalize paginated responses: backend may return {data,meta} or plain arrays.
export function normalizeList(raw) {
  if (Array.isArray(raw)) return { items: raw, total: raw.length, page: 1, pages: 1 };
  if (raw && Array.isArray(raw.items)) return { items: raw.items, total: raw.total ?? raw.items.length, page: raw.page ?? 1, pages: raw.pages ?? 1 };
  if (raw && Array.isArray(raw.data)) {
    const m = raw.meta || {};
    return { items: raw.data, total: m.total ?? raw.data.length, page: m.page ?? 1, pages: m.pages ?? 1 };
  }
  return { items: [], total: 0, page: 1, pages: 1 };
}
