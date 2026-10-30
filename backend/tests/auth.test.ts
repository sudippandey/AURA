import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import { createApp } from "../src/app.js";
import { getTestDbUri } from "./testDb.js";
import { User } from "../src/models/User.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { hashPassword } from "../src/utils/password.js";

const uri = getTestDbUri();
const app = createApp();

async function registerAgent(email = "ada@aura.shop") {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Ada Tester", email, password: "password123" });
  return res;
}

beforeAll(async () => {
  await mongoose.connect(uri);
  await mongoose.connection.db?.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe("registration", () => {
  it("registers a customer and returns tokens (role forced to customer)", async () => {
    const res = await registerAgent();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("ada@aura.shop");
    expect(res.body.data.user.role).toBe("customer");
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
  });

  it("ignores a client-supplied role (no privilege escalation)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Mallory", email: "mallory@x.com", password: "password123", role: "admin" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("customer");
  });

  it("rejects duplicate emails with 409", async () => {
    await registerAgent();
    const res = await registerAgent();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid email and short password with 400", async () => {
    const badEmail = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Bo", email: "not-an-email", password: "password123" });
    expect(badEmail.status).toBe(400);
    const shortPw = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Bo", email: "bo@x.com", password: "short" });
    expect(shortPw.status).toBe(400);
    expect(shortPw.body.code).toBe("VALIDATION_ERROR");
  });

  it("handles concurrent duplicate registrations (one wins)", async () => {
    const [a, b] = await Promise.all([registerAgent("race@x.com"), registerAgent("race@x.com")]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([201, 409]);
  });
});

describe("login", () => {
  it("logs in with correct credentials", async () => {
    await registerAgent();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ada@aura.shop", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it("rejects wrong password and unknown email with 401", async () => {
    await registerAgent();
    const wrong = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ada@aura.shop", password: "wrongpassword" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("INVALID_CREDENTIALS");
    const unknown = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@x.com", password: "password123" });
    expect(unknown.status).toBe(401);
  });

  it("rejects disabled accounts with 403", async () => {
    await registerAgent();
    await User.updateOne({ email: "ada@aura.shop" }, { isActive: false });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ada@aura.shop", password: "password123" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("protected routes + roles", () => {
  it("GET /me requires a token (401 without)", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("GET /me returns the profile with a token", async () => {
    const reg = await registerAgent();
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("ada@aura.shop");
  });

  it("PATCH /me updates name but ignores role", async () => {
    const reg = await registerAgent();
    const token = reg.body.data.accessToken;
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ada Updated", role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Ada Updated");
    expect(res.body.data.role).toBe("customer");
  });

  it("requireRole blocks non-admins with 403 and allows admins", async () => {
    const probe = express();
    probe.get("/admin-only", requireAuth, requireRole("admin"), (_req, res) => res.json({ ok: true }));
    const customer = await registerAgent("cust@x.com");
    const denied = await request(probe)
      .get("/admin-only")
      .set("Authorization", `Bearer ${customer.body.data.accessToken}`);
    expect(denied.status).toBe(403);

    await User.create({
      name: "Root",
      email: "root@aura.shop",
      passwordHash: await hashPassword("password123"),
      role: "admin"
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "root@aura.shop", password: "password123" });
    const allowed = await request(probe)
      .get("/admin-only")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(allowed.status).toBe(200);
  });
});

describe("refresh + logout", () => {
  it("rotates refresh tokens and rejects reuse (theft detection)", async () => {
    const reg = await registerAgent();
    const first = reg.body.data.refreshToken;
    const rotated = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(first);

    // Replaying the old token triggers reuse detection and revokes everything…
    const replay = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: first });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("TOKEN_REUSED");

    // …so even the rotated token no longer works.
    const after = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(after.status).toBe(401);
  });

  it("logout revokes the session; logout is idempotent", async () => {
    const reg = await registerAgent();
    const token = reg.body.data.refreshToken;
    const out = await request(app).post("/api/v1/auth/logout").send({ refreshToken: token });
    expect(out.status).toBe(200);
    const reuse = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: token });
    expect(reuse.status).toBe(401);
    const again = await request(app).post("/api/v1/auth/logout").send({ refreshToken: "garbage" });
    expect(again.status).toBe(200);
  });
});

describe("forgot + reset", () => {
  it("issues a reset token (dev) and resets the password", async () => {
    await registerAgent();
    const forgot = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ada@aura.shop" });
    expect(forgot.status).toBe(200);
    const token = forgot.body.data.resetToken as string | undefined;
    expect(typeof token).toBe("string");

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "newpassword456" });
    expect(reset.status).toBe(200);

    const loginNew = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ada@aura.shop", password: "newpassword456" });
    expect(loginNew.status).toBe(200);
    const loginOld = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ada@aura.shop", password: "password123" });
    expect(loginOld.status).toBe(401);
  });

  it("does not enumerate accounts (unknown email still 200)", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "ghost@x.com" });
    expect(res.status).toBe(200);
    expect(res.body.data.resetToken).toBeUndefined();
  });

  it("rejects invalid reset tokens with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "bogus", password: "newpassword456" });
    expect(res.status).toBe(400);
  });
});
