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
import { isE2EAuthBypassEnabled } from "./e2e-mode";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalBypass = process.env.BLOOMMD_E2E_AUTH_BYPASS;
const originalE2ETestMode = process.env.BLOOMMD_E2E_TEST_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalLocalDeployment = process.env.BLOOMMD_LOCAL_DEPLOYMENT;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  process.env.BLOOMMD_E2E_AUTH_BYPASS = originalBypass;
  process.env.BLOOMMD_E2E_TEST_MODE = originalE2ETestMode;
  mutableEnv.NODE_ENV = originalNodeEnv;
  delete mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER;
  if (originalLocalDeployment == null) delete mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT;
  else mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT = originalLocalDeployment;
  resetMemoryRateLimitsForTests();
});

describe("request security", () => {
  test("requires the test and local-deployment markers before enabling the bypass in a production server (#169)", () => {
    mutableEnv.NODE_ENV = "production";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "1";
    delete process.env.BLOOMMD_E2E_TEST_MODE;
    delete mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT;
    expect(isE2EAuthBypassEnabled()).toBe(false);

    process.env.BLOOMMD_E2E_TEST_MODE = "1";
    expect(isE2EAuthBypassEnabled()).toBe(false);

    mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT = "1";
    expect(isE2EAuthBypassEnabled()).toBe(true);

    delete process.env.BLOOMMD_E2E_TEST_MODE;
    expect(isE2EAuthBypassEnabled()).toBe(false);

    // The local-deployment marker alone never turns the bypass on.
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
    process.env.BLOOMMD_E2E_TEST_MODE = "1";
    expect(isE2EAuthBypassEnabled()).toBe(false);
  });

  test("outside production the bypass flag alone is enough", () => {
    mutableEnv.NODE_ENV = "development";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "1";
    delete process.env.BLOOMMD_E2E_TEST_MODE;
    delete mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT;
    expect(isE2EAuthBypassEnabled()).toBe(true);
  });

  test("a production server without all markers still enforces the rate limit and the honeypot", async () => {
    mutableEnv.NODE_ENV = "production";
    process.env.DATABASE_URL = "";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "1";
    process.env.BLOOMMD_E2E_TEST_MODE = "1";
    delete mutableEnv.BLOOMMD_LOCAL_DEPLOYMENT;
    const request = new Request("https://bloommd.app", { headers: { "x-forwarded-for": "203.0.113.77" } });
    const options = { action: "test-fail-closed", limit: 1, windowMs: 60_000 };

    await assertRateLimit(request, options);
    await expect(assertRateLimit(request, options)).rejects.toBeInstanceOf(RateLimitError);
    expect(() => assertHumanFormSignal(new URLSearchParams({ website: "bot", formStartedAt: String(Date.now() - 5_000) }))).toThrow(FormSpamError);
  });

  test("requires an exact same origin for cookie-backed mutations", () => {
    const valid = new Request("https://bloommd.app/api/mindmaps", { headers: { Origin: "https://bloommd.app" } });
    expect(() => assertSameOrigin(valid)).not.toThrow();
    expect(() => assertSameOrigin(new Request("https://bloommd.app/api/mindmaps"))).toThrow(RequestSecurityError);
    expect(() => assertSameOrigin(new Request("https://bloommd.app/api/mindmaps", { headers: { Origin: "https://attacker.example" } }))).toThrow(RequestSecurityError);
    expect(() => assertSameOriginForIdentity(new Request("https://bloommd.app/api/mindmaps"), { authKind: "access-token" })).not.toThrow();
  });

  test("rejects oversized and invalid JSON request bodies", async () => {
    const tooLarge = new Request("https://bloommd.app/api/mindmaps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "123456" }),
    });
    await expect(readJsonBody(tooLarge, 5)).rejects.toMatchObject({ status: 413 });

    const invalid = new Request("https://bloommd.app/api/mindmaps", { method: "POST", body: "{" });
    await expect(readJsonBody(invalid, 100)).rejects.toMatchObject({ status: 400 });
  });

  test("accepts only bounded URL-encoded forms", async () => {
    const request = new Request("https://bloommd.app/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=user%40example.com",
    });
    expect((await readUrlEncodedForm(request)).get("email")).toBe("user@example.com");
    const multipart = new Request("https://bloommd.app/api/auth/login", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "ignored",
    });
    await expect(readUrlEncodedForm(multipart)).rejects.toMatchObject({ status: 415 });
  });

  describe("client address (#169)", () => {
    const req = (headers: Record<string, string>) => new Request("https://bloommd.app", { headers });

    test("believes the last x-forwarded-for entry by default, not the first", () => {
      mutableEnv.NODE_ENV = "production";
      expect(clientAddress(req({ "x-forwarded-for": "198.51.100.99, 203.0.113.4" }))).toBe("203.0.113.4");
      expect(clientAddress(req({ "x-forwarded-for": "203.0.113.4" }))).toBe("203.0.113.4");
    });

    test("ignores vendor headers in production unless they are configured", () => {
      mutableEnv.NODE_ENV = "production";
      const headers = {
        "x-vercel-forwarded-for": "198.51.100.1",
        "cf-connecting-ip": "198.51.100.2",
        "x-real-ip": "198.51.100.3",
      };
      expect(clientAddress(req(headers))).toBe(UNATTRIBUTED_SOURCE);
      expect(clientAddress(req({ ...headers, "x-forwarded-for": "203.0.113.4" }))).toBe("203.0.113.4");

      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "CF-Connecting-IP";
      expect(clientAddress(req({ ...headers, "x-forwarded-for": "203.0.113.4" }))).toBe("198.51.100.2");
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "x-vercel-forwarded-for";
      expect(clientAddress(req(headers))).toBe("198.51.100.1");
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "x-real-ip";
      expect(clientAddress(req(headers))).toBe("198.51.100.3");
    });

    test("counts requests without the trusted header under one shared key in production", () => {
      mutableEnv.NODE_ENV = "production";
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "cf-connecting-ip";
      // x-forwarded-for is not the configured header, so it is not believed either.
      expect(clientAddress(req({ "x-forwarded-for": "203.0.113.4" }))).toBe(UNATTRIBUTED_SOURCE);
      expect(clientAddress(req({}))).toBe(UNATTRIBUTED_SOURCE);
      mutableEnv.BLOOMMD_TRUSTED_PROXY_HEADER = "not a header!";
      expect(clientAddress(req({ "x-forwarded-for": "203.0.113.4" }))).toBe(UNATTRIBUTED_SOURCE);
    });

    test("stays practical outside production", () => {
      mutableEnv.NODE_ENV = "development";
      expect(clientAddress(req({ "x-real-ip": "203.0.113.5" }))).toBe("203.0.113.5");
      expect(clientAddress(req({ "cf-connecting-ip": "203.0.113.6" }))).toBe("203.0.113.6");
      expect(clientAddress(req({}))).toBe("unknown");
    });

    test("validates the configured header name", () => {
      expect(trustedProxyHeaderName({})).toBeNull();
      expect(trustedProxyHeaderName({ BLOOMMD_TRUSTED_PROXY_HEADER: " CF-Connecting-IP " })).toBe("cf-connecting-ip");
      expect(trustedProxyHeaderName({ BLOOMMD_TRUSTED_PROXY_HEADER: "x forwarded" })).toBeUndefined();
      expect(trustedProxyHeaderName({ BLOOMMD_TRUSTED_PROXY_HEADER: "a:b" })).toBeUndefined();
    });

    test("forged headers cannot bypass the per-address limit", async () => {
      mutableEnv.NODE_ENV = "production";
      process.env.DATABASE_URL = "";
      process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
      const options = { action: "test-forged", limit: 2, sourceLimit: 2, windowMs: 60_000 };
      const attempt = (headers: Record<string, string>, n: number) =>
        assertRateLimit(req(headers), { ...options, identifier: `user${n}@example.com` });

      // The attacker prepends random entries; the proxy appends the real address last.
      await attempt({ "x-forwarded-for": "198.51.100.1, 203.0.113.50" }, 1);
      await attempt({ "x-forwarded-for": "198.51.100.2, 203.0.113.50" }, 2);
      await expect(attempt({ "x-forwarded-for": "198.51.100.3, 203.0.113.50" }, 3)).rejects.toBeInstanceOf(RateLimitError);

      // Headers nobody vouches for do not buy a fresh bucket; they land in the shared one.
      await attempt({ "cf-connecting-ip": "198.51.100.10" }, 4);
      await attempt({ "x-real-ip": "198.51.100.11" }, 5);
      await expect(attempt({ "x-vercel-forwarded-for": "198.51.100.12" }, 6)).rejects.toBeInstanceOf(RateLimitError);
    });
  });

  test("limits both IP and account identifiers", async () => {
    process.env.DATABASE_URL = "";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
    const request = new Request("https://bloommd.app", { headers: { "x-real-ip": "203.0.113.5" } });
    const options = { action: "test-login", identifier: "USER@example.com", limit: 2, windowMs: 60_000 };

    await assertRateLimit(request, options);
    await assertRateLimit(request, options);
    await expect(assertRateLimit(request, options)).rejects.toBeInstanceOf(RateLimitError);
  });

  test("limits the client address separately from, and higher than, one account", async () => {
    process.env.DATABASE_URL = "";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
    const request = new Request("https://bloommd.app", { headers: { "x-real-ip": "203.0.113.6" } });
    const options = { action: "test-signup", limit: 2, sourceLimit: 4, windowMs: 60_000 };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      // Different accounts from one address stay under their own limit but spend the shared one.
      await assertRateLimit(request, { ...options, identifier: `user${attempt}@example.com` });
    }
    await assertRateLimit(request, { ...options, identifier: "user4@example.com" });
    await expect(assertRateLimit(request, { ...options, identifier: "user5@example.com" })).rejects.toBeInstanceOf(RateLimitError);

    // Another address is unaffected, but one account is still capped at `limit` across addresses.
    const other = (address: string) => new Request("https://bloommd.app", { headers: { "x-real-ip": address } });
    await assertRateLimit(other("203.0.113.7"), { ...options, identifier: "shared@example.com" });
    await assertRateLimit(other("203.0.113.8"), { ...options, identifier: "shared@example.com" });
    await expect(assertRateLimit(other("203.0.113.9"), { ...options, identifier: "shared@example.com" })).rejects.toBeInstanceOf(RateLimitError);
  });

  test("keeps the source limit at `limit` when no separate source limit is given", async () => {
    process.env.DATABASE_URL = "";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "";
    const request = new Request("https://bloommd.app", { headers: { "x-real-ip": "203.0.113.10" } });
    const options = { action: "test-default-source", limit: 1, windowMs: 60_000 };

    await assertRateLimit(request, { ...options, identifier: "a@example.com" });
    await expect(assertRateLimit(request, { ...options, identifier: "b@example.com" })).rejects.toBeInstanceOf(RateLimitError);
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
