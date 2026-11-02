import { afterEach, describe, expect, test } from "bun:test";
import {
  assertHumanFormSignal,
  assertRateLimit,
  assertSameOrigin,
  assertSameOriginForIdentity,
  clientAddress,
  trustedProxyHeaderName,
  UNATTRIBUTED_SOURCE,
  FormSpamError,
  RateLimitError,
  readJsonBody,
  readUrlEncodedForm,
  RequestSecurityError,
  resetMemoryRateLimitsForTests,
} from "./request-security";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBypass = process.env.BLOOMMD_E2E_AUTH_BYPASS;
const originalWaitlistDatabaseUrl = process.env.BLOOMMD_WAITLIST_DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalDatabaseUrl == null) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  process.env.BLOOMMD_E2E_AUTH_BYPASS = originalBypass;
  if (originalWaitlistDatabaseUrl == null) delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;
  else process.env.BLOOMMD_WAITLIST_DATABASE_URL = originalWaitlistDatabaseUrl;
  mutableEnv.NODE_ENV = originalNodeEnv;
  delete mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER;
  resetMemoryRateLimitsForTests();
});

describe("request security", () => {
  test("requires an exact same origin for cookie-backed mutations", () => {
    const valid = new Request("https://bloommd.io/api/waitlist", { headers: { Origin: "https://bloommd.io" } });
    expect(() => assertSameOrigin(valid)).not.toThrow();
    expect(() => assertSameOrigin(new Request("https://bloommd.io/api/waitlist"))).toThrow(RequestSecurityError);
    expect(() => assertSameOrigin(new Request("https://bloommd.io/api/waitlist", { headers: { Origin: "https://attacker.example" } }))).toThrow(RequestSecurityError);
    expect(() => assertSameOriginForIdentity(new Request("https://bloommd.io/api/waitlist"), { authKind: "access-token" })).not.toThrow();
  });

  test("rejects oversized and invalid JSON request bodies", async () => {
    const tooLarge = new Request("https://bloommd.io/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "123456" }),
    });
    await expect(readJsonBody(tooLarge, 5)).rejects.toMatchObject({ status: 413 });

    const invalid = new Request("https://bloommd.io/api/waitlist", { method: "POST", body: "{" });
    await expect(readJsonBody(invalid, 100)).rejects.toMatchObject({ status: 400 });
  });

  test("accepts only bounded URL-encoded forms", async () => {
    const request = new Request("https://bloommd.io/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=user%40example.com",
    });
    expect((await readUrlEncodedForm(request)).get("email")).toBe("user@example.com");
    const multipart = new Request("https://bloommd.io/api/waitlist", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "ignored",
    });
    await expect(readUrlEncodedForm(multipart)).rejects.toMatchObject({ status: 415 });
  });

  describe("client address (#208, same rule as apps/app)", () => {
    const req = (headers: Record<string, string>) => new Request("https://bloommd.io", { headers });

    test("believes the last x-forwarded-for entry by default, not the first", () => {
      mutableEnv.NODE_ENV = "production";
      expect(clientAddress(req({ "x-forwarded-for": "198.51.100.99, 203.0.113.4" }))).toBe("203.0.113.4");
      expect(clientAddress(req({ "x-forwarded-for": "203.0.113.4" }))).toBe("203.0.113.4");
    });

    test("in production only the configured header or x-forwarded-for is believed", () => {
      mutableEnv.NODE_ENV = "production";
      const headers = { "x-vercel-forwarded-for": "198.51.100.1", "cf-connecting-ip": "198.51.100.2", "x-real-ip": "198.51.100.3" };
      expect(clientAddress(req(headers))).toBe(UNATTRIBUTED_SOURCE);
      expect(clientAddress(req({ ...headers, "x-forwarded-for": "203.0.113.4" }))).toBe("203.0.113.4");
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "cf-connecting-ip";
      expect(clientAddress(req({ ...headers, "x-forwarded-for": "203.0.113.4" }))).toBe("198.51.100.2");
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "x-vercel-forwarded-for";
      expect(clientAddress(req(headers))).toBe("198.51.100.1");
      // x-forwarded-for is not the configured header, so it is not believed either.
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "cf-connecting-ip";
      expect(clientAddress(req({ "x-forwarded-for": "203.0.113.4" }))).toBe(UNATTRIBUTED_SOURCE);
    });

    test("outside production the other common headers keep local development distinguishable", () => {
      expect(clientAddress(req({ "x-vercel-forwarded-for": "198.51.100.1" }))).toBe("198.51.100.1");
      expect(clientAddress(req({ "x-real-ip": "203.0.113.5" }))).toBe("203.0.113.5");
      expect(clientAddress(req({}))).toBe("unknown");
    });

    test("validates the configured header name", () => {
      expect(trustedProxyHeaderName({})).toBeNull();
      expect(trustedProxyHeaderName({ BLOOMMD_TRUSTED_PROXY_HEADER: " CF-Connecting-IP " })).toBe("cf-connecting-ip");
      expect(trustedProxyHeaderName({ BLOOMMD_TRUSTED_PROXY_HEADER: "a:b" })).toBeUndefined();
    });
  });

  test("limits both IP and account identifiers", async () => {
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
    const request = new Request("https://bloommd.io", { headers: { "x-real-ip": "203.0.113.5" } });
    const options = { action: "test-login", identifier: "USER@example.com", limit: 2, windowMs: 60_000 };

    await assertRateLimit(request, options);
    await assertRateLimit(request, options);
    await expect(assertRateLimit(request, options)).rejects.toBeInstanceOf(RateLimitError);
  });

  test("accepts forms that leave the honeypot empty and waited briefly", () => {
    const form = new URLSearchParams({ website: "", formStartedAt: String(1_000) });
    expect(() => assertHumanFormSignal(form, { now: 2_000 })).not.toThrow();
  });

  test("rejects filled honeypots and instant submissions", () => {
    expect(() => assertHumanFormSignal(new URLSearchParams({ website: "bot", formStartedAt: "1000" }), { now: 2_000 })).toThrow(FormSpamError);
    expect(() => assertHumanFormSignal(new URLSearchParams({ website: "", formStartedAt: "1950" }), { now: 2_000 })).toThrow(FormSpamError);
  });
});
