import { describe, expect, mock, test } from "bun:test";

const agent = { id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-822222222222", displayName: "OpenClaw" };
let receivedProposal: unknown;

mock.module("../../../../../../../lib/db", () => ({
  authenticateWorkspaceAgent: async () => agent,
  completeWorkspaceAgentTaskByAgent: async (input: { proposal?: unknown }) => {
    receivedProposal = input.proposal;
    return { proposalId: "33333333-3333-4333-8333-333333333333" };
  },
}));
mock.module("../../../../../../../lib/request-security", () => ({
  assertRateLimit: async () => undefined,
  readJsonBody: async <T>(request: Request) => await request.json() as T,
}));
mock.module("../../../../../../../lib/workspace-agent-auth", () => ({
  readWorkspaceAgentBearerToken: () => "bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012",
}));

const { POST } = await import("./route");

describe("workspace agent result route", () => {
  test("accepts a node-only proposal from a paired agent", async () => {
    const response = await POST(new Request("https://bloommd.app/api/agent/v1/tasks/33333333-3333-4333-8333-333333333333/result", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" },
      body: JSON.stringify({ summary: "Node expanded.", proposal: { nodeContent: "Only this node changes.", rationale: "Scoped review." } }),
    }), { params: Promise.resolve({ taskId: "33333333-3333-4333-8333-333333333333" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "proposed", proposalId: "33333333-3333-4333-8333-333333333333" });
    expect(receivedProposal).toEqual({ markdown: undefined, nodeContent: "Only this node changes.", childNodes: undefined, rationale: "Scoped review." });
  });

  test("accepts typed task and decision children without a direct write", async () => {
    const response = await POST(new Request("https://bloommd.app/api/agent/v1/tasks/33333333-3333-4333-8333-333333333333/result", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" },
      body: JSON.stringify({
        summary: "Structured follow-up prepared.",
        proposal: {
          childNodes: [
            { title: "Check retry budget", content: "Confirm the current retry policy.", kind: "task" },
            { title: "Select sync owner", content: "Capture the rationale before implementation.", kind: "decision" },
          ],
          rationale: "The follow-ups remain explicit and reviewable.",
        },
      }),
    }), { params: Promise.resolve({ taskId: "33333333-3333-4333-8333-333333333333" }) });

    expect(response.status).toBe(200);
    expect(receivedProposal).toEqual({
      markdown: undefined,
      nodeContent: undefined,
      childNodes: [
        { title: "Check retry budget", content: "Confirm the current retry policy.", kind: "task" },
        { title: "Select sync owner", content: "Capture the rationale before implementation.", kind: "decision" },
      ],
      rationale: "The follow-ups remain explicit and reviewable.",
    });
  });
});
