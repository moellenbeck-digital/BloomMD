import { describe, expect, mock, test } from "bun:test";

const agent = { id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-822222222222", displayName: "Local OpenClaw" };
mock.module("../../../../../../lib/db", () => ({
  authenticateWorkspaceAgent: async () => agent,
  claimWorkspaceAgentTask: async () => ({ id: "33333333-3333-4333-8333-333333333333", workspace: { id: agent.workspaceId, name: "Research" }, command: "Draft an outline", context: { filename: "note.md", markdown: "Only this node.\n", version: 7, node: { id: "node-1", title: "Scoped node", path: "Root → Scoped node", content: "Only this node." } } }),
}));
mock.module("../../../../../../lib/request-security", () => ({ assertRateLimit: async () => undefined }));

const { POST } = await import("./route");

describe("workspace agent next-task route", () => {
  test("returns only the task claimed by the authenticated local agent", async () => {
    const response = await POST(new Request("https://bloommd.app/api/agent/v1/tasks/next", { method: "POST", headers: { authorization: "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task: { id: "33333333-3333-4333-8333-333333333333", workspace: { id: agent.workspaceId, name: "Research" }, command: "Draft an outline", context: { filename: "note.md", markdown: "Only this node.\n", version: 7, node: { id: "node-1", title: "Scoped node", path: "Root → Scoped node", content: "Only this node." } } } });
  });
});
