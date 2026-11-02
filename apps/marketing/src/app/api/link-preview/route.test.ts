import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { LINK_PREVIEW_RATE_LIMIT } from "../../../lib/link-preview-rate-limit";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";
import { GET } from "./route";

// No module mocks here: marketing runs all tests in one process and Bun shares mocks between files.
const mutableEnv = process.env as Record<string, string | undefined>;
const savedEnv = { ...mutableEnv };
const realFetch = globalThis.fetch;
const realNow = Date.now;
const WINDOW = LINK_PREVIEW_RATE_LIMIT.windowMs;
const START = Math.floor(1_800_000_000_000 / WINDOW) * WINDOW;
const PUBLIC_URL = "http://93.184.216.34/page";
let now = START;
let outbound: string[] = [];
let warn: ReturnType<typeof spyOn<Console, "warn">>;

const preview = (url = PUBLIC_URL, client = "203.0.113.10") =>
  GET(new Request(`https://bloommd.test/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { "x-forwarded-for": client } }));

beforeEach(() => {
  delete mutableEnv.BLOOMMD_WAITLIST_DATABASE_URL;
  delete mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER;
  mutableEnv.BLOOMMD_E2E_AUTH_BYPASS = "";
  resetMemoryRateLimitsForTests();
  now = START;
  Date.now = () => now;
  outbound = [];
  warn = spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = (async (input: Request | string | URL) => {
    outbound.push(String(input));
    return new Response("<html><head><title>Example</title></head></html>", { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
});

afterEach(() => {
  warn.mockRestore();
  Date.now = realNow;
  globalThis.fetch = realFetch;
  for (const key of ["BLOOMMD_WAITLIST_DATABASE_URL", "BLOOMMD_TRUSTED_PROXY_HEADER", "BLOOMMD_E2E_AUTH_BYPASS"]) {
    if (savedEnv[key] === undefined) delete mutableEnv[key];
    else mutableEnv[key] = savedEnv[key];
  }
  resetMemoryRateLimitsForTests();
});

describe("link-preview rate limit (marketing)", () => {
  test("serves requests up to the limit, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) {
      expect((await preview()).status).toBe(200);
    }
    now = START + 10_000;
    const blocked = await preview();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("50");
    expect(blocked.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await blocked.json()).toMatchObject({ error: expect.any(String) });
  });

  test("counts invalid URLs too: 422 up to the limit, then 429", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) {
      expect((await preview("http://127.0.0.1/admin")).status).toBe(422);
    }
    expect((await preview("http://127.0.0.1/admin")).status).toBe(429);
  });

  test("makes no outbound request for a rejected call", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await preview();
    expect(outbound).toHaveLength(LINK_PREVIEW_RATE_LIMIT.perSource);
    expect((await preview()).status).toBe(429);
    expect((await preview()).status).toBe(429);
    expect(outbound).toHaveLength(LINK_PREVIEW_RATE_LIMIT.perSource);
  });

  test("allows requests again once the window has passed", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await preview();
    now = START + WINDOW - 1;
    expect((await preview()).status).toBe(429);
    now = START + WINDOW;
    expect((await preview()).status).toBe(200);
  });

  test("keeps clients apart", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await preview(PUBLIC_URL, "203.0.113.10");
    expect((await preview(PUBLIC_URL, "203.0.113.10")).status).toBe(429);
    expect((await preview(PUBLIC_URL, "203.0.113.11")).status).toBe(200);
  });

  test("a forged leading x-forwarded-for entry does not buy a new allowance", async () => {
    const send = (forged: string) =>
      GET(new Request(`https://bloommd.test/api/link-preview?url=${encodeURIComponent(PUBLIC_URL)}`, { headers: { "x-forwarded-for": `${forged}, 203.0.113.10` } }));
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await send(`198.51.100.${i}`);
    expect((await send("198.51.100.200")).status).toBe(429);
  });

  test("logs a structured, hashed entry for each rejection and nothing identifying", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await preview(PUBLIC_URL, "203.0.113.10");
    await preview("http://93.184.216.34/secret-path", "203.0.113.10");
    await preview("http://93.184.216.34/secret-path", "203.0.113.10");
    expect(warn).toHaveBeenCalledTimes(2);
    const [first, second] = warn.mock.calls.map(([line]) => String(line));
    expect(JSON.parse(first!)).toEqual({
      event: "rate-limit-exceeded",
      action: "link-preview",
      windowSeconds: 60,
      subject: "anonymous",
      key: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(JSON.parse(second!).key).toBe(JSON.parse(first!).key);
    expect(first).not.toContain("203.0.113.10");
    expect(first).not.toContain("secret-path");
  });

  test("counts in memory without a waitlist database", async () => {
    for (let i = 0; i < LINK_PREVIEW_RATE_LIMIT.perSource; i += 1) await preview();
    expect((await preview()).status).toBe(429);
    resetMemoryRateLimitsForTests();
    expect((await preview()).status).toBe(200);
  });
});
