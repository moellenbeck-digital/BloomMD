import { afterEach, describe, expect, test } from "bun:test";
import { isFeedbackStorageConfigured, storeFeedbackAttachment } from "./feedback-storage";

const originalEnv = {
  BLOOMMD_FEEDBACK_S3_ENDPOINT: process.env.BLOOMMD_FEEDBACK_S3_ENDPOINT,
  BLOOMMD_FEEDBACK_S3_REGION: process.env.BLOOMMD_FEEDBACK_S3_REGION,
  BLOOMMD_FEEDBACK_S3_BUCKET: process.env.BLOOMMD_FEEDBACK_S3_BUCKET,
  BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID: process.env.BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID,
  BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY: process.env.BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY,
};

function configureStorage() {
  process.env.BLOOMMD_FEEDBACK_S3_ENDPOINT = "https://s3.example.test";
  process.env.BLOOMMD_FEEDBACK_S3_REGION = "eu-central-1";
  process.env.BLOOMMD_FEEDBACK_S3_BUCKET = "bloommd-feedback";
  process.env.BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID = "feedback-access-key";
  process.env.BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY = "feedback-secret-key-with-enough-entropy";
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

describe("feedback attachment storage", () => {
  test("requires a complete S3-compatible configuration", () => {
    delete process.env.BLOOMMD_FEEDBACK_S3_ENDPOINT;
    expect(isFeedbackStorageConfigured()).toBe(false);
    configureStorage();
    expect(isFeedbackStorageConfigured()).toBe(true);
  });

  test("uploads with a server-side signature and returns a signed read URL", async () => {
    configureStorage();
    let uploadUrl = "";
    let authorization = "";
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      uploadUrl = String(url);
      authorization = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const stored = await storeFeedbackAttachment({
      feedbackId: "11111111-1111-4111-8111-111111111111",
      now: new Date("2026-08-15T10:00:00.000Z"),
      fetcher,
      attachment: {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "screenshot",
        filename: "screen.png",
        mimeType: "image/png",
        sizeBytes: 3,
        bytes: new Uint8Array([1, 2, 3]),
        sha256: "a".repeat(64),
      },
    });

    expect(uploadUrl).toContain("/bloommd-feedback/feedback/11111111-1111-4111-8111-111111111111/screenshot/");
    expect(authorization).toStartWith("AWS4-HMAC-SHA256");
    expect(stored.signedUrl).toContain("X-Amz-Signature=");
  });
});
