import { afterEach, describe, expect, test } from "bun:test";
import { getBetaInviteStatuses, inviteBetaTesterFromWaitlist, isBetaInviteClientConfigured } from "./beta-invite-client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOOMMD_APP_INTERNAL_URL: process.env.BLOOMMD_APP_INTERNAL_URL,
  BLOOMMD_INTERNAL_INVITE_SECRET: process.env.BLOOMMD_INTERNAL_INVITE_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

describe("beta invite client", () => {
  test("is disabled until the shared internal secret exists", () => {
    delete process.env.BLOOMMD_INTERNAL_INVITE_SECRET;
    expect(isBetaInviteClientConfigured()).toBe(false);
  });

  test("creates waitlist-sourced beta invites through the app internal API", async () => {
    setEnvValue("NODE_ENV", "production");
    setEnvValue("BLOOMMD_APP_INTERNAL_URL", "https://internal.bloommd.app");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    let request: { url: string; authorization: string | null; body: unknown } | undefined;
    globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      request = {
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      };
      return Response.json({ ok: true });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    await inviteBetaTesterFromWaitlist("max@example.test");

    expect(request).toEqual({
      url: "https://internal.bloommd.app/api/internal/beta-invites",
      authorization: "Bearer secret-123",
      body: { email: "max@example.test", source: "waitlist", sendEmail: true },
    });
  });

  test("maps invite statuses by lowercase email", async () => {
    setEnvValue("NODE_ENV", "production");
    setEnvValue("BLOOMMD_APP_INTERNAL_URL", "https://internal.bloommd.app");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    globalThis.fetch = Object.assign(async () => Response.json({
      entries: [{ email: "max@example.test", status: "invited" }],
    }), { preconnect: originalFetch.preconnect }) as typeof fetch;

    const statuses = await getBetaInviteStatuses(["MAX@example.test"]);

    expect(statuses.get("max@example.test")).toBe("invited");
  });
});
