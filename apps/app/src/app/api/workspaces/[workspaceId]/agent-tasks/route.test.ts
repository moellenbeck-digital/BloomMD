import { beforeEach, describe, expect, mock, test } from "bun:test";

const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-822222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
let createdTaskInput: Record<string, unknown> | null = null;

mock.module("../../../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({ authKind: "session", userId, email: "editor@example.test" }),
}));

mock.module("../../../../../lib/db", () => ({
  normalizeUuid: (value: string | undefined) => value ?? null,
  getWorkspaceForUser: async () => ({ id: workspaceId, name: "Product notes", role: "editor" }),
  readCloudDocument: async () => ({ id: documentId, filename: "selected.md", version: 4, markdown: "# Root <!-- bloommd:id=root -->\n\n## Only this document <!-- bloommd:id=node-1 -->\n\nSelected content.\n" }),
  createWorkspaceAgentTask: async (input: Record<string, unknown>) => { createdTaskInput = input; return { id: "55555555-5555-4555-8555-555555555555", agentId, agentName: "OpenClaw" }; },
  listWorkspaceAgentTasks: async () => [],
}));

mock.module("../../../../../lib/request-security", () => ({
  assertRateLimit: async () => undefined,
  assertSameOriginForIdentity: () => undefined,
  readJsonBody: async <T>(request: Request) => await request.json() as T,
}));

mock.module("../../../../../lib/workspace-api", () => ({
  workspaceErrorResponse: (error: unknown) => new Response(JSON.stringify({ error: error instanceof Error ? error.message : "failed" }), { status: 500 }),
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request(`https://bloommd.app/api/workspaces/${workspaceId}/agent-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://bloommd.app" },
    body: JSON.stringify(body),
  });
}

describe("workspace agent task route", () => {
  beforeEach(() => {
    createdTaskInput = null;
  });

  test("queues an instruction without pushing document content to a configured agent endpoint", async () => {
    const response = await POST(request({ agentId, documentId, filename: "selected.md", command: "@OpenClaw Draft the next section." }), {
      params: Promise.resolve({ workspaceId }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ taskId: "55555555-5555-4555-8555-555555555555", status: "queued" });
  });

  test("stores only the selected node as agent context", async () => {
    const response = await POST(request({ agentId, documentId, filename: "selected.md", nodeId: "node-1", command: "@OpenClaw Expand this node." }), {
      params: Promise.resolve({ workspaceId }),
    });

    expect(response.status).toBe(201);
    expect(createdTaskInput).toMatchObject({
      prompt: "Expand this node.",
      node: { id: "node-1", title: "Only this document", path: "Root → Only this document", content: "Selected content." },
    });
  });
});
