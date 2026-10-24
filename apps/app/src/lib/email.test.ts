import { afterEach, describe, expect, test } from "bun:test";
import { sendBetaInviteEmail, sendPasswordResetEmail, sendVerificationEmail, sendWorkspaceInvitationEmail } from "./email";

const originalFetch = globalThis.fetch;
const originalEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
};

function restoreEnvValue(key: keyof typeof originalEnv) {
  const value = originalEnv[key];
  if (value == null) {
    delete (process.env as Record<string, string | undefined>)[key];
    return;
  }
  setEnvValue(key, value);
}

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function configureEmailTest() {
  setEnvValue("NODE_ENV", "production");
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "BloomMD Accounts <account@bloommd.app>";
}

async function captureMail(send: () => Promise<unknown>) {
  let body: { text: string; html: string } | null = null;
  const mockFetch = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    body = JSON.parse(String(init?.body)) as { text: string; html: string };
    return new Response("{}", { status: 200 });
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  globalThis.fetch = mockFetch;

  await send();
  if (!body) throw new Error("Expected account mail request body.");
  return body as { text: string; html: string };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) restoreEnvValue(key);
});

describe("account email links", () => {
  test("verification mails do not use localhost in production", async () => {
    configureEmailTest();

    const body = await captureMail(() => sendVerificationEmail("max@example.test", "token with space"));

    expect(body.text).toContain("https://bloommd.app/api/auth/verify-email?token=token%20with%20space");
    expect(body.html).not.toContain("localhost");
  });

  test("password reset mails do not use localhost in production", async () => {
    configureEmailTest();

    const body = await captureMail(() => sendPasswordResetEmail("max@example.test", "token with space"));

    expect(body.text).toContain("https://bloommd.app/reset-password?token=token%20with%20space");
    expect(body.html).not.toContain("localhost");
  });

  test("beta invite mails point to the app signup form with the invited address", async () => {
    configureEmailTest();

    const body = await captureMail(() => sendBetaInviteEmail("max@example.test"));

    expect(body.text).toContain("https://bloommd.app/signup?email=max%40example.test&next=%2Fapp");
    expect(body.text).toContain("Account erstellen.");
    expect(body.text).toContain("Der Link braucht keinen Einladungscode.");
    expect(body.html).not.toContain("localhost");
    expect(body.html).toContain("<strong>Account erstellen</strong>");
    expect(body.html).toContain("Der Link braucht keinen Einladungscode.");
  });

  test("English beta invite mails keep the signup journey in English", async () => {
    configureEmailTest();

    const body = await captureMail(() => sendBetaInviteEmail("max@example.test", { lang: "en" }));

    expect(body.text).toContain("You are invited to the closed BloomMD beta.");
    expect(body.text).toContain("https://bloommd.app/signup?email=max%40example.test&next=%2Fapp&lang=en");
    expect(body.text).toContain("No invitation code is needed.");
    expect(body.text).not.toContain("Du bist zur geschlossenen");
  });

  test("workspace invitation mails preserve the one-time token and invite context", async () => {
    configureEmailTest();

    const body = await captureMail(() => sendWorkspaceInvitationEmail({
      email: "max@example.test",
      workspaceName: "Research Team",
      role: "editor",
      token: "bloom_workspace_invite_token-value",
      expiresAt: "2026-08-28T12:00:00.000Z",
      inviterName: "Dr. Example",
      inviterEmail: "inviter@example.test",
    }));

    expect(body.text).toContain("https://bloommd.app/invite/bloom_workspace_invite_token-value");
    expect(body.text).toContain("Dr. Example lädt dich");
    expect(body.text).toContain("Eingeladene E-Mail: max@example.test");
    expect(body.text).toContain("Editor");
    expect(body.text).toContain("Läuft ab:");
    expect(body.html).not.toContain("localhost");
  });
});
