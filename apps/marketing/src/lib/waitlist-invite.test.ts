import { afterEach, describe, expect, test } from "bun:test";
import { runWaitlistInvitation, waitlistInviteLocale, type WaitlistInviteDeps } from "./waitlist-invite";
import type { ConfirmedWaitlistEntry } from "./waitlist-db";

const originalFetch = globalThis.fetch;
const originalResendKey = process.env.RESEND_API_KEY;
const originalResendFrom = process.env.RESEND_FROM_EMAIL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalResendKey == null) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
  if (originalResendFrom == null) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalResendFrom;
});

const entry = (email: string, source: string | null = "landing"): ConfirmedWaitlistEntry => ({
  email,
  confirmedAt: "2026-08-01T10:00:00.000Z",
  source,
});

/** In-memory stand-in for the table: who is invitable and who has been claimed. */
function fakeTable(entries: ConfirmedWaitlistEntry[]) {
  const claimed = new Set<string>();
  const sentTo: Array<{ email: string; token: string; locale: string }> = [];
  const released: string[] = [];
  let failFor = new Set<string>();
  const deps: WaitlistInviteDeps = {
    list: async () => entries.filter((candidate) => !claimed.has(candidate.email)),
    claim: async (email) => {
      if (claimed.has(email)) return null;
      claimed.add(email);
      return `token-for-${email}`;
    },
    release: async (email) => {
      claimed.delete(email);
      released.push(email);
    },
    send: async (email, token, locale) => {
      if (failFor.has(email)) return { sent: false };
      sentTo.push({ email, token, locale });
      return { sent: true };
    },
  };
  return { deps, claimed, sentTo, released, failFor: (emails: string[]) => (failFor = new Set(emails)) };
}

describe("waitlist invitation run", () => {
  test("dry-run lists the addresses and sends and marks nothing", async () => {
    const table = fakeTable([entry("a@example.test"), entry("b@example.test")]);
    const result = await runWaitlistInvitation({}, table.deps);

    expect(result).toEqual({ apply: false, candidates: ["a@example.test", "b@example.test"], sent: [], skipped: [], failed: [] });
    expect(table.sentTo).toEqual([]);
    expect(table.claimed.size).toBe(0);
  });

  test("apply sends one mail per address with its own unsubscribe token", async () => {
    const table = fakeTable([entry("a@example.test"), entry("b@example.test", "landing-en")]);
    const result = await runWaitlistInvitation({ apply: true }, table.deps);

    expect(result.sent).toEqual(["a@example.test", "b@example.test"]);
    expect(table.sentTo).toEqual([
      { email: "a@example.test", token: "token-for-a@example.test", locale: "de" },
      { email: "b@example.test", token: "token-for-b@example.test", locale: "en" },
    ]);
  });

  test("a second run writes to nobody again", async () => {
    const table = fakeTable([entry("a@example.test"), entry("b@example.test")]);
    await runWaitlistInvitation({ apply: true }, table.deps);
    const second = await runWaitlistInvitation({ apply: true }, table.deps);

    expect(second.candidates).toEqual([]);
    expect(second.sent).toEqual([]);
    expect(table.sentTo).toHaveLength(2);
  });

  test("an address claimed by another run in between is skipped, not mailed", async () => {
    const table = fakeTable([entry("a@example.test"), entry("b@example.test")]);
    // The list was read before the other run claimed "a".
    const deps: WaitlistInviteDeps = { ...table.deps, list: async () => [entry("a@example.test"), entry("b@example.test")] };
    table.claimed.add("a@example.test");

    const result = await runWaitlistInvitation({ apply: true }, deps);

    expect(result.skipped).toEqual(["a@example.test"]);
    expect(result.sent).toEqual(["b@example.test"]);
    expect(table.sentTo.map((sent) => sent.email)).toEqual(["b@example.test"]);
  });

  test("a failed send gives the marker back so the next run tries again, and does not stop the others", async () => {
    const table = fakeTable([entry("a@example.test"), entry("b@example.test")]);
    table.failFor(["a@example.test"]);

    const first = await runWaitlistInvitation({ apply: true }, table.deps);
    expect(first.failed).toEqual(["a@example.test"]);
    expect(first.sent).toEqual(["b@example.test"]);
    expect(table.released).toEqual(["a@example.test"]);

    table.failFor([]);
    const second = await runWaitlistInvitation({ apply: true }, table.deps);
    expect(second.sent).toEqual(["a@example.test"]);
    expect(table.sentTo.map((sent) => sent.email)).toEqual(["b@example.test", "a@example.test"]);
  });

  test("a throwing provider counts as failed and releases the marker", async () => {
    const table = fakeTable([entry("a@example.test")]);
    const deps: WaitlistInviteDeps = {
      ...table.deps,
      send: async () => {
        throw new Error("network down");
      },
    };
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const result = await runWaitlistInvitation({ apply: true }, deps);
      expect(result.failed).toEqual(["a@example.test"]);
    } finally {
      console.error = originalConsoleError;
    }
    expect(table.released).toEqual(["a@example.test"]);
  });

  test("picks the language from the signup source", () => {
    expect(waitlistInviteLocale("landing-en")).toBe("en");
    expect(waitlistInviteLocale("landing")).toBe("de");
    expect(waitlistInviteLocale(null)).toBe("de");
  });
});

describe("waitlist invitation against a mocked mail provider", () => {
  test("apply sends exactly one provider request per address with the right content", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "BloomMD <hello@bloommd.io>";
    const bodies: Array<{ to: string; subject: string; text: string }> = [];
    globalThis.fetch = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      bodies.push(JSON.parse(String(init?.body)) as { to: string; subject: string; text: string });
      return new Response("{}", { status: 200 });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    const table = fakeTable([entry("a@example.test"), entry("b@example.test", "landing-en")]);
    // Real mail code, fake table: the send dependency is left at its default via the real module.
    const { sendWaitlistInvitationEmail } = await import("./email");
    const result = await runWaitlistInvitation({ apply: true }, { ...table.deps, send: sendWaitlistInvitationEmail });

    expect(result.sent).toEqual(["a@example.test", "b@example.test"]);
    expect(bodies.map((body) => body.to)).toEqual(["a@example.test", "b@example.test"]);
    expect(bodies[0]?.text).toContain("/signup");
    expect(bodies[0]?.text).toContain("/api/waitlist/unsubscribe?token=token-for-a%40example.test");
    expect(bodies[1]?.subject).toContain("waitlist has ended");
  });
});
