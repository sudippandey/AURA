import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("health", () => {
  it("GET /api/v1/health returns the success envelope", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(typeof res.body.data.uptimeSec).toBe("number");
    expect(typeof res.body.data.mongodb).toBe("string");
  });

  it("GET /api/v1 returns API info", async () => {
    const res = await request(app).get("/api/v1/");
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("AURA API");
  });

  it("allows the documented local storefront origin", async () => {
    for (const origin of ["http://localhost:8000", "http://127.0.0.1:8765"]) {
      const res = await request(app)
        .options("/api/v1/health")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "GET");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("unknown routes return the 404 envelope (never HTML)", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
