import { beforeAll, describe, expect, it } from "vitest";

let sdk: typeof import("../server/_core/sdk").sdk;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.MANUS_PROJECT_ID = "audit-test-app";
  process.env.MANUS_JWT_SECRET = "audit-test-secret-that-is-long-enough";
  const module = await import("../server/_core/sdk");
  sdk = module.sdk;
});

describe("session security regressions", () => {
  it("accepts a token bound to the configured app", async () => {
    const token = await sdk.signSession({ openId: "user-1", appId: "audit-test-app", name: "Test User" });
    await expect(sdk.verifySession(token)).resolves.toMatchObject({ openId: "user-1", appId: "audit-test-app" });
  });

  it("rejects a valid JWT issued for a different app", async () => {
    const token = await sdk.signSession({ openId: "user-1", appId: "another-app", name: "Test User" });
    await expect(sdk.verifySession(token)).resolves.toBeNull();
  });
});
