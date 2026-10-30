// Simulated auth. Swap mockFn bodies with real fetch when backend is ready.
import { apiRequest } from "./apiClient.js";
import { ENDPOINTS } from "./endpoints.js";

const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));
function readUsers() {
  try {
    const users = JSON.parse(localStorage.getItem("aura_users") || "[]");
    return Array.isArray(users) ? users : [];
  } catch { return []; }
}
function writeUsers(u) { localStorage.setItem("aura_users", JSON.stringify(u)); }
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
    iterations: 150000,
    hash: "SHA-256",
  }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
function newSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export async function loginApi({ email, password }) {
  return apiRequest(ENDPOINTS.login, {
    method: "POST", body: { email, password },
    mockFn: async () => {
      await delay();
      const users = readUsers();
      const found = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      if (!found?.passwordSalt || !found?.passwordHash) throw new Error("Incorrect email or password.");
      const passwordHash = await hashPassword(password, found.passwordSalt);
      if (found.passwordHash !== passwordHash) throw new Error("Incorrect email or password.");
      const { passwordHash: _hash, passwordSalt: _salt, ...safe } = found;
      return { user: safe, token: "mock-" + btoa(safe.email).slice(0, 12) };
    },
  });
}
export async function registerApi({ name, email, password }) {
  return apiRequest(ENDPOINTS.register, {
    method: "POST", body: { name, email, password },
    mockFn: async () => {
      await delay();
      const users = readUsers();
      if (users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw new Error("An account with this email already exists.");
      const passwordSalt = newSalt();
      const passwordHash = await hashPassword(password, passwordSalt);
      const user = { id: "u_" + Date.now(), name, email, passwordSalt, passwordHash, createdAt: new Date().toISOString() };
      users.push(user); writeUsers(users);
      const { passwordHash: _hash, passwordSalt: _salt, ...safe } = user;
      return { user: safe, token: "mock-" + btoa(safe.email).slice(0, 12) };
    },
  });
}
export async function forgotApi(email) {
  return apiRequest(ENDPOINTS.forgot, {
    method: "POST", body: { email },
    mockFn: async () => { await delay(400); return { ok: true }; },
  });
}
