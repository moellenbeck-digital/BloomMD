import { describe, expect, mock, test } from "bun:test";

const agent = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-822222222222",
  displayName: "Local OpenClaw",
};

type EventListener = (event: {
  workspaceId: string;
  agentId?: string;
  taskId?: string;
  type:
    | "task.queued"
    | "task.running"
    | "task.proposed"
    | "task.completed"
    | "task.failed"
    | "proposal.reviewed"
    | "agent.presence";
}) => void;

let listener: EventListener | null = null;
let queuedTask = false;

mock.module("../../../../../lib/db", () => ({
  authenticateWorkspaceAgent: async () => agent,
  hasQueuedWorkspaceAgentTask: async () => queuedTask,
  subscribeWorkspaceAgentEvents: async (
    _workspaceId: string,
    callback: EventListener,
  ) => {
    listener = callback;
    return () => {
      listener = null;
    };
  },
}));

const { GET } = await import("./route");

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
) {
  const decoder = new TextDecoder();
  let output = "";
  for (let index = 0; index < 4 && !output.includes(expected); index += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    output += decoder.decode(chunk.value, { stream: true });
  }
  return output;
}

describe("workspace agent event route", () => {
  test("requires an agent bearer token", async () => {
    const response = await GET(
      new Request("https://bloommd.app/api/agent/v1/events"),
    );
    expect(response.status).toBe(401);
  });

  test("wakes a newly connected agent when it already has a queued task", async () => {
    queuedTask = true;
    const response = await GET(
      new Request("https://bloommd.app/api/agent/v1/events", {
        headers: {
          authorization:
            "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012",
        },
      }),
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const output = await readUntil(reader, "event: task-available");
    expect(output).toContain("event: connected");
    expect(output).toContain("event: task-available");
    await reader.cancel();
    queuedTask = false;
  });

  test("wakes only for a queued task assigned to this agent", async () => {
    queuedTask = false;
    const response = await GET(
      new Request("https://bloommd.app/api/agent/v1/events", {
        headers: {
          authorization:
            "Bearer bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012",
        },
      }),
    );
    const reader = response.body!.getReader();
    await readUntil(reader, "event: connected");
    listener?.({
      workspaceId: agent.workspaceId,
      agentId: "other-agent",
      type: "task.queued",
    });
    listener?.({
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      taskId: "task-1",
      type: "task.queued",
    });
    const output = await readUntil(reader, "event: task-available");
    expect(output).toContain("event: task-available");
    expect(output).toContain('"taskId":"task-1"');
    await reader.cancel();
  });
});
