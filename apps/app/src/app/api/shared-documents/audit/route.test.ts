import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const calls: unknown[] = [];

mock.module("../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({
    authKind: "access-token",
    userId: "11111111-1111-4111-8111-111111111111",
    email: "tester@example.test",
  }),
}));

mock.module("../../../../lib/db", () => ({
  normalizeUuid: (value: unknown) => typeof value === "string" ? value : null,
  recordSharedDocumentBindingAudit: async (input: unknown) => { calls.push(input); },
}));

mock.module("../../../../lib/request-security", () => ({
  assertRateLimit: async () => undefined,
  assertSameOriginForIdentity: () => undefined,
  readJsonBody: async (request: Request) => request.json(),
}));

mock.module("../../../../lib/workspace-api", () => ({
  workspaceErrorResponse: () => new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
}));

const { POST } = await import("./route");

describe("shared document audit route", () => {
  beforeEach(() => calls.length = 0);
  afterEach(() => mock.restore());

  test("records an explicit binding without accepting local data", async () => {
    const response = await POST(new Request("https://bloommd.app/api/shared-documents/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer bloom_pat_test" },
      body: JSON.stringify({
        action: "bound",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        documentId: "33333333-3333-4333-8333-333333333333",
      }),
    }));

    expect(response.status).toBe(200);
    expect(calls).toEqual([{
      userId: "11111111-1111-4111-8111-111111111111",
      action: "bound",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      documentId: "33333333-3333-4333-8333-333333333333",
    }]);
  });

  test("rejects unknown audit payloads", async () => {
    const response = await POST(new Request("https://bloommd.app/api/shared-documents/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer bloom_pat_test" },
      body: JSON.stringify({ action: "share", localPath: "/Users/private.md" }),
    }));

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
