import { beforeEach, describe, expect, mock, test } from "bun:test";
import { randomBytes, createHash } from "node:crypto";

const USER = "11111111-1111-4111-8111-111111111111";
let session: Record<string, unknown> | null = null;
let created: unknown[] = [];

mock.module("../../../../lib/auth", () => ({
  getSession: async () => session,
  getApiRequestIdentity: async () => null,
}));

mock.module("../../../../lib/db", () => ({
  // Bun shares module mocks across test files: every mobile route test provides the same exports.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | null | undefined) => (value && /^[0-9a-f-]{36}$/.test(value) ? value : null),
  createMobileAuthCode: async (input: unknown) => { created.push(input); return { code: "bloom_mac_one", expiresAt: "2026-10-04T10:05:00Z" }; },
  exchangeMobileAuthCode: async () => null,
  revokeMobileAppToken: async () => false,
}));

const { resetMemoryRateLimitsForTests } = await import("../../../../lib/request-security");
const route = await import("./route");

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("base64url");
const post = (body: unknown, origin = "https://app.bloommd.test") => route.POST(new Request("https://app.bloommd.test/api/mobile/authorize", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(body),
}));

describe("POST /api/mobile/authorize", () => {
  beforeEach(() => {
    session = { provider: "password", userId: USER, email: "max@bloommd.test", createdAt: Date.now() };
    created = [];
    resetMemoryRateLimitsForTests();
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  test("creates a one-time code and redirects only to the app scheme", async () => {
    const response = await post({ challenge, state, device: "  Max’ iPad " });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redirectUrl: `bloommd://auth?code=bloom_mac_one&state=${state}` });
    expect(created).toEqual([{ userId: USER, challenge, state, deviceName: "Max’ iPad" }]);
  });

  test("requires a signed-in user", async () => {
    session = null;
    expect((await post({ challenge, state, device: "iPad" })).status).toBe(401);
    expect(created).toHaveLength(0);
  });

  test("rejects cross-site requests", async () => {
    expect((await post({ challenge, state, device: "iPad" }, "https://evil.example")).status).toBe(403);
    expect((await post({ challenge, state, device: "iPad" }, "capacitor://localhost")).status).toBe(403);
    expect(created).toHaveLength(0);
  });

  test("rejects malformed challenge, state or device", async () => {
    for (const body of [{ challenge: verifier.slice(0, 20), state, device: "iPad" }, { challenge, state: "x", device: "iPad" }, { challenge, state, device: "\u0000" }, { challenge, state }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(created).toHaveLength(0);
  });
});
