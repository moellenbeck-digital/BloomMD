import { describe, expect, mock, test } from "bun:test";

mock.module("../../../../../lib/db", () => ({
  pairWorkspaceAgent: async (pairingCode: string) => {
    if (pairingCode !== "bloom_pair_abcdefghijklmnopqrstuvwxyz123456") throw new Error("Invalid or expired pairing code.");
    return { agent: { id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-822222222222", displayName: "Local OpenClaw" }, token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" };
  },
}));

mock.module("../../../../../lib/request-security", () => ({
  assertRateLimit: async () => undefined,
  readJsonBody: async <T>(request: Request) => await request.json() as T,
}));

const { POST } = await import("./route");

describe("workspace agent pairing route", () => {
  test("exchanges a one-time pairing code for a local agent token", async () => {
    const response = await POST(new Request("https://bloommd.app/api/agent/v1/pair", { method: "POST", body: JSON.stringify({ pairingCode: "bloom_pair_abcdefghijklmnopqrstuvwxyz123456" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ agent: { id: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-822222222222", displayName: "Local OpenClaw" }, token: "bloom_agent_abcdefghijklmnopqrstuvwxyz123456789012" });
  });
});
