import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendBetaInviteEmail, sendPasswordResetEmail, sendVerificationEmail, sendWorkspaceInvitationEmail } from "./email";

const originalFetch = globalThis.fetch;
const originalEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  BLOOMMD_E2E_TEST_MODE: process.env.BLOOMMD_E2E_TEST_MODE,
  BLOOMMD_LOCAL_DEPLOYMENT: process.env.BLOOMMD_LOCAL_DEPLOYMENT,
  BLOOMMD_E2E_MAIL_OUTBOX: process.env.BLOOMMD_E2E_MAIL_OUTBOX,
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

describe("E2E mail outbox", () => {
  test("writes mails to the outbox file only with the test marker and never calls the provider", async () => {
    configureEmailTest();
    const directory = mkdtempSync(join(tmpdir(), "bloommd-outbox-"));
    const outbox = join(directory, "mail.jsonl");
    let providerCalls = 0;
    globalThis.fetch = Object.assign(async () => {
      providerCalls += 1;
      return new Response("{}", { status: 200 });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    try {
      setEnvValue("BLOOMMD_E2E_MAIL_OUTBOX", outbox);
      // Without the marker (a real production server) the variable is ignored.
      delete (process.env as Record<string, string | undefined>).BLOOMMD_E2E_TEST_MODE;
      await sendVerificationEmail("max@example.test", "ignored-token");
      expect(providerCalls).toBe(1);

      // The marker alone is not enough in a production build (#169): it needs the local-deployment marker too.
      setEnvValue("BLOOMMD_E2E_TEST_MODE", "1");
      delete (process.env as Record<string, string | undefined>).BLOOMMD_LOCAL_DEPLOYMENT;
      await sendVerificationEmail("max@example.test", "still-ignored-token");
      expect(providerCalls).toBe(2);

      setEnvValue("BLOOMMD_LOCAL_DEPLOYMENT", "1");
      const result = await sendVerificationEmail("max@example.test", "outbox-token");
      expect(result).toEqual({ sent: true });
      expect(providerCalls).toBe(2);

      const [line] = readFileSync(outbox, "utf8").trim().split("\n");
      const mail = JSON.parse(line ?? "{}") as { to: string; text: string };
      expect(mail.to).toBe("max@example.test");
      expect(mail.text).toContain("/api/auth/verify-email?token=outbox-token");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
