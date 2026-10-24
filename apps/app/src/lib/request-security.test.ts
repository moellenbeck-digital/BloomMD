import { afterEach, describe, expect, test } from "bun:test";
import {
  assertHumanFormSignal,
  assertRateLimit,
  assertSameOrigin,
  assertSameOriginForIdentity,
  clientAddress,
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
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
  process.env.BLOOMMD_E2E_AUTH_BYPASS = originalBypass;
  process.env.BLOOMMD_E2E_TEST_MODE = originalE2ETestMode;
  mutableEnv.NODE_ENV = originalNodeEnv;
  resetMemoryRateLimitsForTests();
});

describe("request security", () => {
  test("requires an explicit test marker before enabling the bypass in a production server", () => {
    mutableEnv.NODE_ENV = "production";
    process.env.BLOOMMD_E2E_AUTH_BYPASS = "1";
    delete process.env.BLOOMMD_E2E_TEST_MODE;
    expect(isE2EAuthBypassEnabled()).toBe(false);

    process.env.BLOOMMD_E2E_TEST_MODE = "1";
    expect(isE2EAuthBypassEnabled()).toBe(true);
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

  test("uses the first trusted proxy address", () => {
    const request = new Request("https://bloommd.app", {
      headers: { "x-vercel-forwarded-for": "203.0.113.4, 10.0.0.1" },
    });
    expect(clientAddress(request)).toBe("203.0.113.4");
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

  test("accepts forms that leave the honeypot empty and waited briefly", () => {
    const form = new URLSearchParams({ website: "", formStartedAt: String(1_000) });
    expect(() => assertHumanFormSignal(form, { now: 2_000 })).not.toThrow();
  });

  test("rejects filled honeypots and instant submissions", () => {
    expect(() => assertHumanFormSignal(new URLSearchParams({ website: "bot", formStartedAt: "1000" }), { now: 2_000 })).toThrow(FormSpamError);
    expect(() => assertHumanFormSignal(new URLSearchParams({ website: "", formStartedAt: "1950" }), { now: 2_000 })).toThrow(FormSpamError);
  });
});
