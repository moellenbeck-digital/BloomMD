import { afterEach, describe, expect, test } from "bun:test";
import { sendWaitlistInvitationEmail } from "./email";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOOMMD_LOG_DEV_EMAILS: process.env.BLOOMMD_LOG_DEV_EMAILS,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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

interface CapturedMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Replaces the mail provider (Resend) with a recorder; nothing leaves the process. */
async function captureInvitationMail(locale?: "de" | "en") {
  const requests: Array<{ url: string; authorization: string | null; body: CapturedMail }> = [];
  const mockFetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
      body: JSON.parse(String(init?.body)) as CapturedMail,
    });
    return new Response("{}", { status: 200 });
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  globalThis.fetch = mockFetch;

  const result = await sendWaitlistInvitationEmail("max@example.test", "token with space", locale);
  if (requests.length !== 1) throw new Error(`Expected exactly one provider request, got ${requests.length}.`);
  return { result, request: requests[0]! };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) restoreEnvValue(key);
});

describe("waitlist invitation mail", () => {
  test("goes to the provider with the recipient and links to the registration and the unsubscribe route", async () => {
    configureEmailTest();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://bloommd.app";
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";

    const { result, request } = await captureInvitationMail();

    expect(result).toEqual({ sent: true });
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.authorization).toBe("Bearer re_test");
    expect(request.body.to).toBe("max@example.test");
    expect(request.body.from).toBe("BloomMD <hello@bloommd.io>");
    expect(request.body.subject).toContain("Warteliste");
    expect(request.body.text).toContain("https://bloommd.app/signup");
    expect(request.body.html).toContain('href="https://bloommd.app/signup"');
    expect(request.body.text).toContain("https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space");
    expect(request.body.html).toContain('href="https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space"');
  });

  test("tells the recipient this is the only mail and when the address is deleted", async () => {
    configureEmailTest();
    const { request } = await captureInvitationMail("de");

    expect(request.body.text).toContain("einzige Nachricht");
    expect(request.body.text).toContain("90 Tage nach dieser E-Mail gelöscht");
    expect(request.body.html).toContain("90 Tage nach dieser E-Mail gelöscht");
    expect(request.body.text).not.toContain("/api/waitlist/confirm");
  });

  test("English mail links to the English registration and unsubscribe page", async () => {
    configureEmailTest();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://bloommd.app";
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";

    const { request } = await captureInvitationMail("en");

    expect(request.body.subject).toContain("waitlist has ended");
    expect(request.body.text).toContain("https://bloommd.app/signup?lang=en");
    expect(request.body.text).toContain("https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space&lang=en");
    expect(request.body.text).toContain("deleted 90 days after this email");
    expect(request.body.html).toContain('href="https://bloommd.app/signup?lang=en"');
  });

  test("does not send localhost links from production mail if runtime env is stale", async () => {
    configureEmailTest();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3210";
    process.env.NEXT_PUBLIC_MARKETING_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const { request } = await captureInvitationMail();

    expect(request.body.text).toContain("https://bloommd.app/signup");
    expect(request.body.text).toContain("https://bloommd.io/api/waitlist/unsubscribe?token=token%20with%20space");
    expect(request.body.text).not.toContain("localhost");
    expect(request.body.html).not.toContain("localhost");
  });

  test("reports a provider error instead of claiming it was sent", async () => {
    configureEmailTest();
    globalThis.fetch = Object.assign(async () => new Response("{}", { status: 500 }), { preconnect: originalFetch.preconnect }) as typeof fetch;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      expect(await sendWaitlistInvitationEmail("max@example.test", "t")).toEqual({ sent: false, reason: "provider-error" });
    } finally {
      console.error = originalConsoleError;
    }
  });
});
