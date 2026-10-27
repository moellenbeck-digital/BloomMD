import { describe, expect, test } from "bun:test";
import { agentGate, agentOutsideCloudResponse } from "./agent-gate";
import type { ApiRequestIdentity } from "./auth";

const agent: ApiRequestIdentity = { authKind: "access-token", userId: "11111111-1111-4111-8111-111111111111", tokenId: "22222222-2222-4222-8222-222222222222", agentName: "Bot" };
const personal: ApiRequestIdentity = { authKind: "access-token", userId: agent.userId, tokenId: agent.tokenId };
const session: ApiRequestIdentity = { authKind: "session", userId: agent.userId };

describe("agent gate without a workspace", () => {
  test("an agent token without a workspace may only read: the gate fails closed", async () => {
    const gate = await agentGate(agent, undefined, "Learnings › dev-team – Idee.md");
    expect(gate).toMatchObject({ access: "read", area: "Learnings/dev-team", agentName: "Bot", tokenId: agent.tokenId });
  });

  test("tokens without an agent name and sessions are not limited by the gate", async () => {
    expect(await agentGate(personal, undefined, "a.md")).toBeNull();
    expect(await agentGate(session, undefined, "a.md")).toBeNull();
  });

  test("outside the cloud database an agent token is refused with 403; everyone else and the cloud are untouched", async () => {
    const refused = agentOutsideCloudResponse(agent, "filesystem");
    expect(refused?.status).toBe(403);
    expect(await refused?.json()).toMatchObject({ code: "AGENT_WORKSPACE_REQUIRED", agent: "Bot" });
    expect(agentOutsideCloudResponse(agent, "database")).toBeNull();
    expect(agentOutsideCloudResponse(personal, "filesystem")).toBeNull();
    expect(agentOutsideCloudResponse(session, "filesystem")).toBeNull();
  });
});
