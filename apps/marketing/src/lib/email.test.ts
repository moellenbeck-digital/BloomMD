import { afterEach, describe, expect, test } from "bun:test";
import { sendWaitlistConfirmationEmail } from "./email";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOOMMD_LOG_DEV_EMAILS: process.env.BLOOMMD_LOG_DEV_EMAILS,
  NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
};

function restoreEnvValue(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value == null) {
    delete process.env[key];
    return;
  }
  setEnvValue(key, value);
}

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function configureEmailTest() {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "BloomMD <hello@bloommd.io>";
}

async function captureWaitlistMail() {
  let body: { text: string; html: string } | null = null;
  const mockFetch = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    body = JSON.parse(String(init?.body)) as { text: string; html: string };
    return new Response("{}", { status: 200 });
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  globalThis.fetch = mockFetch;

  await sendWaitlistConfirmationEmail("max@example.test", "token with space");
  if (!body) throw new Error("Expected waitlist mail request body.");
  return body as { text: string; html: string };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) restoreEnvValue(key);
});

describe("waitlist email links", () => {
  test("use the configured marketing origin instead of a local site origin", async () => {
    configureEmailTest();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const body = await captureWaitlistMail();

    expect(body.text).toContain("https://bloommd.io/api/waitlist/confirm?token=token%20with%20space");
    expect(body.html).toContain("https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space");
    expect(body.text).not.toContain("localhost");
    expect(body.html).not.toContain("localhost");
  });

  test("does not send localhost links from production mail if runtime env is stale", async () => {
    configureEmailTest();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_MARKETING_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const body = await captureWaitlistMail();

    expect(body.text).toContain("https://bloommd.io/api/waitlist/confirm?token=token%20with%20space");
    expect(body.html).toContain("https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space");
    expect(body.text).not.toContain("localhost");
    expect(body.html).not.toContain("localhost");
  });
});
