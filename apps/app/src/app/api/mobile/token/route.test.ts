import { beforeEach, describe, expect, mock, test } from "bun:test";
import { randomBytes } from "node:crypto";

let exchanged: unknown[] = [];
let result: unknown = null;

mock.module("../../../../lib/auth", () => ({
  getSession: async () => null,
  getApiRequestIdentity: async () => null,
}));

mock.module("../../../../lib/db", () => ({
  // Bun shares module mocks across test files: every mobile route test provides the same exports.
  consumeRateLimit: async () => null,
  exchangeMobileAuthCode: async (input: unknown) => { exchanged.push(input); return result; },
  normalizeUuid: (value: string | null | undefined) => (value && /^[0-9a-f-]{36}$/.test(value) ? value : null),
  createMobileAuthCode: async () => ({ code: "bloom_mac_unused", expiresAt: "2026-10-04T10:05:00Z" }),
  revokeMobileAppToken: async () => false,
}));

const { resetMemoryRateLimitsForTests } = await import("../../../../lib/request-security");
const route = await import("./route");

const code = `bloom_mac_${randomBytes(32).toString("base64url")}`;
const verifier = randomBytes(32).toString("base64url");
const state = randomBytes(16).toString("base64url");
const post = (body: unknown, ip = "203.0.113.7") => route.POST(new Request("https://app.bloommd.test/api/mobile/token", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, Origin: "capacitor://localhost" },
  body: JSON.stringify(body),
}));

describe("POST /api/mobile/token", () => {
  beforeEach(() => {
    exchanged = [];
    result = null;
    resetMemoryRateLimitsForTests();
  });

  test("exchanges a valid code and returns the token with user and workspaces", async () => {
    result = {
      token: "bloom_pat_abc", tokenId: "t1", expiresAt: "2027-10-04T00:00:00Z", deviceName: "iPad",
      user: { id: "u1", email: "max@bloommd.test", name: "Max" },
      workspaces: [{ id: "w1", name: "Persönlich", kind: "personal", role: "owner" }],
    };
    const response = await post({ code, verifier, state, device: "iPad" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ token: "bloom_pat_abc", tokenId: "t1", user: { email: "max@bloommd.test", name: "Max" }, workspaces: [{ id: "w1" }] });
    expect(body.user).not.toHaveProperty("id");
    expect(exchanged).toEqual([{ code, verifier, state }]);
  });

  test("answers invalid_grant for unknown, expired, reused or wrongly verified codes", async () => {
    const response = await post({ code, verifier, state });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });

  test("rejects malformed input before touching the database", async () => {
    for (const body of [null, {}, { code, verifier }, { code: "bloom_pat_x", verifier, state }, { code, verifier: "short", state }, { code, verifier, state: 1 }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(exchanged).toHaveLength(0);
  });

  test("is rate limited per client address", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await post({ code, verifier, state })).status).toBe(400);
    const limited = await post({ code, verifier, state });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await post({ code, verifier, state }, "198.51.100.1")).status).toBe(400);
  });
});
