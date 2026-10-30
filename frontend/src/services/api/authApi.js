// Auth: mock users on-device; live tokens against the backend (same {user, token} shape).
import { apiRequest, usingMock } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
function readUsers() {
  try { return JSON.parse(localStorage.getItem("aura_users") || "[]"); } catch { return []; }
}
function writeUsers(u) { localStorage.setItem("aura_users", JSON.stringify(u)); }

function stashRefresh(token) {
  try { if (token) localStorage.setItem("aura_refresh", token); } catch {}
}

/** Live: {user, accessToken, refreshToken} → mock shape {user, token}. */
function toSession(live) {
  stashRefresh(live.refreshToken);
  return { user: live.user, token: live.accessToken };
}

export async function loginApi({ email, password }) {
  const res = await apiRequest(ENDPOINTS.login, {
    method: "POST", body: { email, password },
    mockFn: async () => {
      await delay();
      const users = readUsers();
      const found = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!found || found.password !== password) throw new Error("Incorrect email or password.");
      const { password: _p, ...safe } = found;
      return { user: safe, token: "mock-" + btoa(safe.email).slice(0, 12) };
    },
  });
  return usingMock() ? res : toSession(res);
}
export async function registerApi({ name, email, password }) {
  const res = await apiRequest(ENDPOINTS.register, {
    method: "POST", body: { name, email, password },
    mockFn: async () => {
      await delay();
      const users = readUsers();
      if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with this email already exists.");
      const user = { id: "u_" + Date.now(), name, email, password, createdAt: new Date().toISOString() };
      users.push(user); writeUsers(users);
      const { password: _p, ...safe } = user;
      return { user: safe, token: "mock-" + btoa(safe.email).slice(0, 12) };
    },
  });
  return usingMock() ? res : toSession(res);
}
export async function forgotApi(email) {
  const res = await apiRequest(ENDPOINTS.forgot, {
    method: "POST", body: { email },
    mockFn: async () => { await delay(400); return { ok: true }; },
  });
  return usingMock() ? res : { ok: true };
}

/** Live-only helpers (mock mode keeps everything in the store/localStorage). */
export async function getProfileApi() {
  return apiRequest(ENDPOINTS.profile, { auth: true });
}
export async function updateProfileApi(name) {
  return apiRequest(ENDPOINTS.profile, { method: "PATCH", body: { name }, auth: true });
}
export async function logoutApi() {
  let refresh = null;
  try { refresh = localStorage.getItem("aura_refresh"); } catch {}
  try {
    await apiRequest(ENDPOINTS.logout, { method: "POST", body: { refreshToken: refresh }, auth: true });
  } catch { /* best effort — local session always clears */ }
  try { localStorage.removeItem("aura_refresh"); } catch {}
}
