import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
let identity: Record<string, unknown> | null = null;
let revoked: unknown[] = [];

mock.module("../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => identity,
  getSession: async () => null,
}));

mock.module("../../../../lib/db", () => ({
  // Bun shares module mocks across test files: every mobile route test provides the same exports.
  consumeRateLimit: async () => null,
  revokeMobileAppToken: async (...args: unknown[]) => { revoked.push(args); return true; },
  normalizeUuid: (value: string | null | undefined) => (value && /^[0-9a-f-]{36}$/.test(value) ? value : null),
  createMobileAuthCode: async () => ({ code: "bloom_mac_unused", expiresAt: "2026-10-04T10:05:00Z" }),
  exchangeMobileAuthCode: async () => null,
}));

const logout = await import("./route");
const sessionRoute = await import("../session/route");
const request = (method: string) => new Request("https://app.bloommd.test/api/mobile/logout", { method, headers: { Authorization: "Bearer bloom_pat_x" } });

describe("app sign-out and session check", () => {
  beforeEach(() => {
    identity = { authKind: "access-token", userId: USER, email: "max@bloommd.test", name: "Max", tokenId: "t1", tokenClient: "mobile_app", tokenExpiresAt: "2027-10-04T00:00:00Z" };
    revoked = [];
  });

  test("the token revokes itself", async () => {
    const response = await logout.POST(request("POST"));
    expect(response.status).toBe(200);
    expect(revoked).toEqual([[USER, "t1"]]);
  });

  test("browser sessions and anonymous requests cannot use it", async () => {
    identity = { authKind: "session", userId: USER, email: "max@bloommd.test" };
    expect((await logout.POST(request("POST"))).status).toBe(401);
    identity = null;
    expect((await logout.POST(request("POST"))).status).toBe(401);
    expect(revoked).toHaveLength(0);
  });

  test("the session check names the signed-in user", async () => {
    const response = await sessionRoute.GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { email: "max@bloommd.test", name: "Max" }, tokenId: "t1", expiresAt: "2027-10-04T00:00:00Z", client: "mobile_app" });
    identity = null;
    expect((await sessionRoute.GET(request("GET"))).status).toBe(401);
  });
});
