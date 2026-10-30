// Centralized HTTP client. Components NEVER call fetch directly — use *Api modules.
// Mock mode is default; set a backend URL to go live (see README.md).
import { CONFIG, isMockMode } from "../config.js";

const cache = new Map(); // TanStack-Query-style in-memory cache
const inflight = new Map();

export function apiBaseUrl() {
  const base = CONFIG.API_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) return "";
  return /\/api\/v1$/i.test(base) ? base : `${base}/api/v1`;
}
export function usingMock() { return isMockMode() || !apiBaseUrl(); }

function cacheKey(url, params) { return url + "::" + JSON.stringify(params || {}); }
export function invalidateCache(prefix) {
  for (const k of [...cache.keys()]) if (!prefix || k.startsWith(prefix)) cache.delete(k);
}

export async function apiRequest(path, { method = "GET", params = null, body = null, auth = false, cacheTime = 30000, mockFn = null, allowMock = true } = {}) {
  const base = apiBaseUrl();
  const qs = params ? "?" + new URLSearchParams(JSON.parse(JSON.stringify(params))).toString() : "";
  // MOCK path — no network, simulated latency, cached like a real query
  if (allowMock && usingMock()) {
    const key = method === "GET" ? "mock" + path + "::" + JSON.stringify(params || {}) : null;
    if (key) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.t < cacheTime) return hit.data;
      if (inflight.has(key)) return inflight.get(key);
    }
    const p = (async () => {
      try {
        await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
        const data = mockFn ? await mockFn() : null;
        if (key) cache.set(key, { t: Date.now(), data });
        return data;
      } finally {
        if (key) inflight.delete(key);
      }
    })();
    if (key) inflight.set(key, p);
    return p;
  }
  // REAL backend path
  const key = method === "GET" ? cacheKey(path, { base, params }) : null;
  if (method === "GET") {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < cacheTime) return hit.data;
  }
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    try {
      const token = localStorage.getItem("aura_token");
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {}
  }
  const res = await fetch(base + path + qs, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.message || msg; } catch {}
    throw new Error(msg);
  }
  const raw = await res.json();
  const data = raw && typeof raw === "object" && raw.success === true && Object.hasOwn(raw, "data")
    ? (raw.meta ? { data: raw.data, meta: raw.meta } : raw.data)
    : raw;
  if (method === "GET") cache.set(key, { t: Date.now(), data });
  return data;
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
