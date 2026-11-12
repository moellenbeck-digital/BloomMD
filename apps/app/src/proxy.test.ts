import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { createSessionToken } from "./lib/auth";

/**
 * The read-only mode of expired trial accounts (#274) through the real proxy: with the switch off
 * nothing changes, with it on writes of an expired account are refused in one place, reading and
 * the export stay open. Only the database lookups are replaced.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const TOKEN_USER = "22222222-2222-4222-8222-222222222222";
const DAY = 24 * 60 * 60 * 1000;
const ends: Record<string, string | null> = {};
const plans = new Set<string>();
let lookups = 0;
let planLookups = 0;
let planFails = false;

const realDb = await import("./lib/db");
mock.module("./lib/db", () => ({
  ...realDb,
  getTrialEndsAt: async (userId: string) => {
    lookups += 1;
    return ends[userId] ?? null;
  },
  hasActiveEntitlement: async (userId: string) => {
    planLookups += 1;
    if (planFails) throw new Error("db down");
    return plans.has(userId);
  },
  resolveAccessToken: async (token: string) => (token === "bloom_pat_good" ? { userId: TOKEN_USER, email: "t@example.test", scope: "write", workspaceIds: null } : null),
}));

process.env.BLOOMMD_AUTH_SECRET = "Uz8v-71mQp4R_yB6tK2sL9wX0c3D5e7F";
const { proxy } = await import("./proxy");

function cookie(userId: string) {
  return `bloommd_session=${createSessionToken({ provider: "password", userId, email: "a@example.test", createdAt: Date.now() })}`;
}

function request(method: string, path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://app.bloommd.test${path}`, { method, headers });
}

const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("proxy: read-only mode of expired trial accounts (#274)", () => {
  beforeEach(() => {
    lookups = 0;
    planLookups = 0;
    planFails = false;
    plans.clear();
    ends[USER] = new Date(Date.now() - DAY).toISOString();
    ends[TOKEN_USER] = new Date(Date.now() - DAY).toISOString();
    process.env.BLOOMMD_TRIAL_READONLY = "1";
  });
  afterEach(() => {
    delete process.env.BLOOMMD_TRIAL_READONLY;
  });

  test("off by default: an expired account stays fully writable and the database is not asked", async () => {
    delete process.env.BLOOMMD_TRIAL_READONLY;
    const response = await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) }));
    expect(passes(response)).toBe(true);
    expect(lookups).toBe(0);
  });

  test("on: a write of an expired account is refused with a clear German message and a code", async () => {
    const response = await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: expect.stringContaining("Testzeitraum ist abgelaufen"), code: "TRIAL_EXPIRED" });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  test("on: the message is English with ?lang=en or an English browser", async () => {
    const byQuery = await proxy(request("POST", "/api/workspaces?lang=en", { cookie: cookie(USER) }));
    expect(((await byQuery.json()) as { error: string }).error).toContain("trial period has ended");
    const byHeader = await proxy(request("DELETE", "/api/mindmaps/plan.md", { cookie: cookie(USER), "accept-language": "en-GB,en;q=0.8" }));
    expect(((await byHeader.json()) as { error: string }).error).toContain("read-only");
  });

  test("on: an access token of an expired account is refused as well, an unknown one is left to the route", async () => {
    const good = await proxy(request("POST", "/api/account/access-tokens", { authorization: "Bearer bloom_pat_good" }));
    expect(good.status).toBe(403);
    const unknown = await proxy(request("POST", "/api/account/access-tokens", { authorization: "Bearer bloom_pat_unknown" }));
    expect(passes(unknown)).toBe(true);
  });

  test("on: reading and the export of an expired account stay open", async () => {
    for (const path of ["/api/mindmaps", "/api/mindmaps/plan.md", "/api/account/export", "/api/workspaces"]) {
      expect(passes(await proxy(request("GET", path, { cookie: cookie(USER) })))).toBe(true);
    }
    expect(lookups).toBe(0);
  });

  test("on: sign-in, deleting the account and feedback stay open for an expired account", async () => {
    for (const path of ["/api/auth/login", "/api/account/delete", "/api/feedback", "/api/sync-ticket"]) {
      expect(passes(await proxy(request("POST", path, { cookie: cookie(USER) })))).toBe(true);
    }
  });

  test("on: an account whose trial still runs, has no trial end or is not signed in can write", async () => {
    ends[USER] = new Date(Date.now() + DAY).toISOString();
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    ends[USER] = null;
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md")))).toBe(true);
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: "bloommd_session=forged.value" })))).toBe(true);
  });

  test("on: a failing lookup does not block; the route behind it decides", async () => {
    const original = console.error;
    console.error = () => {};
    const stored = ends[USER];
    Object.defineProperty(ends, USER, { get() { throw new Error("db down"); }, configurable: true });
    try {
      expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    } finally {
      Object.defineProperty(ends, USER, { value: stored, writable: true, configurable: true, enumerable: true });
      console.error = original;
    }
  });

  test("on: an expired account with an active plan can write, by session and by access token (#378)", async () => {
    plans.add(USER);
    plans.add(TOKEN_USER);
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    expect(passes(await proxy(request("POST", "/api/account/access-tokens", { authorization: "Bearer bloom_pat_good" })))).toBe(true);
    expect(planLookups).toBe(2);
    plans.delete(USER);
    expect((await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) }))).status).toBe(403);
  });

  test("on: the plan is only looked up for an expired account (#378)", async () => {
    ends[USER] = new Date(Date.now() + DAY).toISOString();
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    ends[USER] = null;
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    expect(planLookups).toBe(0);
    // Off: neither the trial end nor the plan is asked.
    delete process.env.BLOOMMD_TRIAL_READONLY;
    ends[USER] = new Date(Date.now() - DAY).toISOString();
    expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
    expect(planLookups).toBe(0);
  });

  test("on: a failing plan lookup does not block either (#378)", async () => {
    const original = console.error;
    console.error = () => {};
    planFails = true;
    try {
      expect(passes(await proxy(request("PUT", "/api/mindmaps/plan.md", { cookie: cookie(USER) })))).toBe(true);
      expect(planLookups).toBe(1);
    } finally {
      console.error = original;
    }
  });

  test("the mobile CORS headers are kept on a refusal", async () => {
    const response = await proxy(request("POST", "/api/mindmaps", { authorization: "Bearer bloom_pat_good", origin: "capacitor://localhost" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
});

describe("proxy: first-party Plausible routes (#299)", () => {
  const rewriteTarget = (response: Response) => response.headers.get("x-middleware-rewrite");

  beforeEach(() => {
    // Every guard that could redirect or block a visitor is on: the routes must still be reachable.
    lookups = 0;
    ends[USER] = new Date(Date.now() - DAY).toISOString();
    process.env.BLOOMMD_REQUIRE_AUTH = "1";
    process.env.BLOOMMD_TRIAL_READONLY = "1";
  });
  afterEach(() => {
    delete process.env.BLOOMMD_REQUIRE_AUTH;
    delete process.env.BLOOMMD_TRIAL_READONLY;
    delete process.env.BLOOMMD_PLAUSIBLE_TARGET_URL;
  });

  test("the public paths are rewritten to internal segments, without a session and with every guard on", async () => {
    const script = await proxy(request("GET", "/_plausible/js/script.js"));
    expect(rewriteTarget(script)).toEndWith("/plausible-proxy/script");
    expect(script.status).toBe(200);
    const event = await proxy(request("POST", "/_plausible/api/event"));
    expect(rewriteTarget(event)).toEndWith("/plausible-proxy/event");
    expect(lookups).toBe(0);
  });

  test("an expired trial account does not block the event POST, and nothing is redirected", async () => {
    const response = await proxy(request("POST", "/_plausible/api/event", { cookie: cookie(USER) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(rewriteTarget(response)).toEndWith("/plausible-proxy/event");
  });

  test("the internal segments are not reachable from outside", async () => {
    for (const path of ["/plausible-proxy", "/plausible-proxy/script", "/plausible-proxy/event", "/plausible-proxy/event/"]) {
      const response = await proxy(request("POST", path, { "x-bloommd-plausible-proxy": "1" }));
      expect(response.status).toBe(404);
      expect(rewriteTarget(response)).toBeNull();
    }
  });

  test("other paths under /_plausible are not rewritten", async () => {
    expect(rewriteTarget(await proxy(request("GET", "/_plausible/js/other.js")))).toBeNull();
    expect(rewriteTarget(await proxy(request("GET", "/_plausible")))).toBeNull();
  });

  test("the CSP has no Plausible or foreign host, with or without a target set", async () => {
    for (const target of [undefined, "https://plausible.ops.moellenbeck-digital.io", "https://ping.bloommd.app"]) {
      if (target) process.env.BLOOMMD_PLAUSIBLE_TARGET_URL = target;
      const csp = (await proxy(request("GET", "/app"))).headers.get("content-security-policy") ?? "";
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("script-src 'self'");
      for (const forbidden of ["plausible", "ping.bloommd.app", "moellenbeck-digital", "ops."]) expect(csp).not.toContain(forbidden);
    }
  });
});
