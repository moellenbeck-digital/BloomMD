import { describe, expect, mock, test } from "bun:test";

const agent = { id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-822222222222", displayName: "Local OpenClaw" };
mock.module("../../../../../lib/db", () => ({ authenticateWorkspaceAgent: async () => agent }));
mock.module("../../../../../lib/request-security", () => ({ assertRateLimit: async () => undefined }));

const { GET } = await import("./route");

describe("workspace agent status route", () => {
  test("confirms the authenticated local agent without claiming a task", async () => {
    const response = await GET(new Request("https://bloommd.app/api/agent/v1/status", { headers: { authorization: "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agent });
  });
});
