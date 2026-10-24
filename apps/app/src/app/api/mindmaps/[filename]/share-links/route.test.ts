import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile, type MindMapDocument } from "@bloommd/core";

let mode: "database" | "filesystem" = "database";
let created: unknown[] = [];
let revoked: unknown[] = [];
const SESSION = { authKind: "session", userId: "11111111-1111-4111-8111-111111111111" };
let identity: Record<string, unknown> = SESSION;

mock.module("../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => identity,
}));

mock.module("../../../../../lib/request-security", () => ({
  assertSameOriginForIdentity: () => undefined,
  assertRateLimit: async () => undefined,
  readJsonBody: async (request: Request) => request.json(),
  RequestSecurityError: class RequestSecurityError extends Error { status = 403; },
  RateLimitError: class RateLimitError extends Error { retryAfterSeconds = 1; },
}));

mock.module("../../../../../lib/mindmap-storage", () => ({
  getMindmapStorage: async () => ({
    read: async () => ({
      ...parseFile("plan.md", "# Plan\n"),
      storage: mode === "database" ? { mode: "database", documentId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", version: 2 } : undefined,
    }) as MindMapDocument,
  }),
}));

mock.module("../../../../../lib/db", () => ({
  // Bun shares module mocks across test files; keep what request-security needs from lib/db.
  consumeRateLimit: async () => null,
  createShareLink: async (input: unknown) => { created.push(input); return { token: "bloom_share_abc", id: "l1", createdAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-31T00:00:00Z" }; },
  listShareLinks: async () => [{ id: "l1", createdAt: "x", expiresAt: "y", revokedAt: null, lastViewedAt: null }],
  revokeShareLink: async (...args: unknown[]) => { revoked.push(args); return true; },
}));

const route = await import("./route");
const params = { params: Promise.resolve({ filename: "plan.md" }) };
const request = (method: string, body?: unknown) => new Request("https://app.bloommd.test/api/mindmaps/plan.md/share-links", { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

describe("share links API", () => {
  beforeEach(() => {
    mode = "database";
    created = [];
    revoked = [];
    identity = SESSION;
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.bloommd.app";
  });

  test("creates a read-only link for a cloud map and returns its URL once", async () => {
    const response = await route.POST(request("POST", { expiresInDays: 14 }), params);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "l1", url: "https://app.bloommd.app/share/bloom_share_abc" });
    expect(created).toEqual([{ userId: "11111111-1111-4111-8111-111111111111", documentId: "22222222-2222-4222-8222-222222222222", expiresInDays: 14 }]);
  });

  test("lists links without tokens and revokes them", async () => {
    const listed = await (await route.GET(request("GET"), params)).json() as { links: Array<Record<string, unknown>> };
    expect(listed.links[0]).not.toHaveProperty("token");
    expect((await route.DELETE(request("DELETE", { id: "l1" }), params)).status).toBe(200);
    expect(revoked).toHaveLength(1);
  });

  test("an empty or null body creates a link with the default expiry", async () => {
    const response = await route.POST(new Request("https://app.bloommd.test/api/mindmaps/plan.md/share-links", { method: "POST", body: "null" }), params);
    expect(response.status).toBe(201);
    expect(created).toEqual([{ userId: "11111111-1111-4111-8111-111111111111", documentId: "22222222-2222-4222-8222-222222222222" }]);
  });

  test("agent tokens share only when their owner allowed it, and the audit names the agent", async () => {
    identity = { ...SESSION, authKind: "access-token", tokenId: "tok-1", tokenScope: "write", agentName: "OpenClaw", tokenAllowShare: false };
    expect((await route.POST(request("POST", {}), params)).status).toBe(403);
    expect(created).toHaveLength(0);
    identity = { ...identity, tokenAllowShare: true };
    expect((await route.POST(request("POST", {}), params)).status).toBe(201);
    expect(created[0]).toMatchObject({ tokenId: "tok-1", agentName: "OpenClaw" });
    // Plain scripts' tokens (no agent name) act for their owner.
    identity = { ...SESSION, authKind: "access-token", tokenId: "tok-2", tokenScope: "write", agentName: null };
    expect((await route.POST(request("POST", {}), params)).status).toBe(201);
  });

  test("refuses local maps and invalid expiry", async () => {
    expect((await route.POST(request("POST", { expiresInDays: 0 }), params)).status).toBe(400);
    mode = "filesystem";
    expect((await route.POST(request("POST", {}), params)).status).toBe(400);
  });
});
