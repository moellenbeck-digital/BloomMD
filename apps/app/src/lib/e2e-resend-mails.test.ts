import { describe, expect, test } from "bun:test";
import { createResendMailReader, htmlToText, parseResendTimestamp } from "../../e2e/fixtures/resend-mails";

/**
 * The Resend reader of the E2E proof for #274 (`e2e/fixtures/resend-mails.ts`). The proof itself needs a
 * test system and a key; this pins the reader's behaviour against a fake API (paging, filter, retry, no key in errors).
 */

const SINCE = Date.parse("2026-11-21T10:00:00Z");

function fakeApi(pages: Array<{ data: unknown[]; has_more: boolean }>, details: Record<string, { text?: string | null; html?: string | null }>, options: { rateLimitFirst?: boolean; status?: number } = {}) {
  const calls: string[] = [];
  let limited = false;
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push(url);
    expect(init?.headers?.Authorization).toBe("Bearer re_test_key");
    if (options.status) return { ok: false, status: options.status, headers: { get: () => null }, json: async () => ({ message: "secret detail re_test_key" }) };
    if (options.rateLimitFirst && !limited) {
      limited = true;
      return { ok: false, status: 429, headers: { get: (name: string) => (name === "retry-after" ? "1" : null) }, json: async () => ({}) };
    }
    const path = url.replace("https://api.resend.com", "");
    const ok = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
    if (path.startsWith("/emails?")) {
      const after = new URL(url).searchParams.get("after");
      return ok(after ? pages[1] : pages[0]);
    }
    const id = decodeURIComponent(path.replace("/emails/", ""));
    return ok(details[id] ?? {});
  };
  return { fetch, calls };
}

const row = (id: string, to: string, subject: string, createdAt: string) => ({ id, to: [to], subject, created_at: createdAt });
const reader = (api: ReturnType<typeof fakeApi>) => createResendMailReader({ apiKey: "re_test_key", since: SINCE, fetch: api.fetch, spacingMs: 0, sleep: async () => {} });

describe("Resend mail reader (E2E proof #274)", () => {
  test("reads Resend's timestamp format", () => {
    expect(parseResendTimestamp("2026-11-21 10:30:15.123456+00")).toBe(Date.parse("2026-11-21T10:30:15.123Z"));
    expect(parseResendTimestamp("2026-11-21T10:30:15.000Z")).toBe(Date.parse("2026-11-21T10:30:15.000Z"));
    expect(parseResendTimestamp(null)).toBeNaN();
  });

  test("returns only mails to the address since the start, oldest first, with their text", async () => {
    const api = fakeApi(
      [{ data: [
        row("m3", "Delivered+T274-A@resend.dev", "Dein BloomMD-Testzeitraum endet in 15 Tagen", "2026-11-21 10:30:00+00"),
        row("x1", "delivered+other@resend.dev", "Anderes Konto", "2026-11-21 10:20:00+00"),
        row("m1", "delivered+t274-a@resend.dev", "Confirm your BloomMD email", "2026-11-21 10:10:00+00"),
        row("old", "delivered+t274-a@resend.dev", "Alter Lauf", "2026-11-20 08:00:00+00"),
      ], has_more: true }],
      { m1: { text: "Bitte bestätigen: https://x/api/auth/verify-email?token=1" }, m3: { text: null, html: '<p>Noch 15 Tage.</p><p><a href="https://bloommd.app">BloomMD öffnen</a></p>' } },
    );
    const mails = await reader(api).mailsTo("delivered+t274-a@resend.dev");
    expect(mails.map((mail) => mail.id)).toEqual(["m1", "m3"]);
    expect(mails[0]!.text).toContain("verify-email?token=1");
    expect(mails[1]!.text).toContain("https://bloommd.app");
    // The list stopped at the first mail older than the start: one list call, two detail calls.
    expect(api.calls.filter((url) => url.includes("/emails?"))).toHaveLength(1);
  });

  test("follows the pages while nothing older was seen, and fetches each body once", async () => {
    const api = fakeApi(
      [
        { data: [row("b", "delivered+t274-a@resend.dev", "B", "2026-11-21 11:00:00+00")], has_more: true },
        { data: [row("a", "delivered+t274-a@resend.dev", "A", "2026-11-21 10:30:00+00")], has_more: false },
      ],
      { a: { text: "A" }, b: { text: "B" } },
    );
    const r = reader(api);
    expect((await r.mailsTo("delivered+t274-a@resend.dev")).map((mail) => mail.id)).toEqual(["a", "b"]);
    await r.mailsTo("delivered+t274-a@resend.dev");
    expect(api.calls.filter((url) => url.includes("/emails/"))).toHaveLength(2);
  });

  test("retries after HTTP 429", async () => {
    const api = fakeApi([{ data: [], has_more: false }], {}, { rateLimitFirst: true });
    expect(await reader(api).mailsTo("delivered+t274-a@resend.dev")).toEqual([]);
    expect(api.calls).toHaveLength(2);
  });

  test("an unusable key is reported without the key or the response body", async () => {
    const error = await reader(fakeApi([], {}, { status: 403 })).mailsTo("a@resend.dev").catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("full access");
    expect((error as Error).message).not.toContain("re_test_key");
    expect((error as Error).message).not.toContain("secret detail");
  });

  test("htmlToText keeps links next to their text", () => {
    expect(htmlToText('<p>Hallo &amp; Tschüss</p><p><a href="https://bloommd.app/a?b=1&amp;c=2">Öffnen</a></p>')).toBe("Hallo & Tschüss\n\nÖffnen https://bloommd.app/a?b=1&c=2");
  });
});
