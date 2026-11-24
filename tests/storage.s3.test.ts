import { beforeAll, describe, expect, it, vi } from "vitest";

let createS3PresignedGetUrl: (key: string, now?: Date) => string;

beforeAll(async () => {
  vi.stubEnv("S3_ENDPOINT", "https://hb.ru-msk.vkcloud-storage.ru");
  vi.stubEnv("S3_BUCKET", "bucket-test");
  vi.stubEnv("S3_ACCESS_KEY", "access-test");
  vi.stubEnv("S3_SECRET_KEY", "secret-test");
  vi.stubEnv("S3_REGION", "ru-msk");
  ({ createS3PresignedGetUrl } = await import("../server/storage"));
});

describe("VK Cloud S3 signing", () => {
  it("uses bucket-host addressing and keeps the bucket out of the object path", () => {
    const url = new URL(createS3PresignedGetUrl("healthchecks/report one.txt", new Date("2026-01-02T03:04:05.000Z")));
    expect(url.hostname).toBe("bucket-test.hb.ru-msk.vkcloud-storage.ru");
    expect(url.pathname).toBe("/healthchecks/report%20one.txt");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/20260102/ru-msk/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects traversal keys", () => {
    expect(() => createS3PresignedGetUrl("photos/../secret.txt")).toThrow("Invalid storage key");
  });
});
