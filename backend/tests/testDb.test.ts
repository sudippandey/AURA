import { afterEach, describe, expect, it } from "vitest";
import { getTestDbUri } from "./testDb.js";

const originalUri = process.env.MONGODB_URI_TEST;

afterEach(() => {
  if (originalUri === undefined) delete process.env.MONGODB_URI_TEST;
  else process.env.MONGODB_URI_TEST = originalUri;
});

describe("test database guard", () => {
  it("uses the local disposable test database by default", () => {
    delete process.env.MONGODB_URI_TEST;
    expect(getTestDbUri()).toBe("mongodb://127.0.0.1:27017/aura_test");
  });

  it("rejects remote database URIs", () => {
    process.env.MONGODB_URI_TEST = "mongodb+srv://example.invalid/aura_test";
    expect(getTestDbUri).toThrow("Tests only connect to a local MongoDB database");
  });

  it("rejects local databases not named for testing", () => {
    process.env.MONGODB_URI_TEST = "mongodb://127.0.0.1:27017/aura";
    expect(getTestDbUri).toThrow("Tests only connect to a local MongoDB database");
  });
});
