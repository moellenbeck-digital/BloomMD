import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
let identity: Record<string, unknown> = {};

mock.module("../../../../../lib/auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("../../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async (_user: string, workspaceId?: string | null) => ({ id: workspaceId ?? WORKSPACE }),
  getAgentTokenRights: async () => ({ access: "propose", areas: { "Learnings/dev-team": "write" } }),
  listAgentTokenChanges: async (input: Record<string, unknown>) => [{ id: "c1", tokenId: input.tokenId, workspaceId: input.workspaceId }],
}));

const rights = await import("./route");
const changes = await import("../changes/route");

describe("agent self-service API", () => {
  beforeEach(() => {
    identity = { authKind: "access-token", userId: USER, tokenId: "tok-1", agentName: "OpenClaw", tokenScope: "write", tokenWorkspaceIds: [WORKSPACE] };
  });

  test("an agent token learns its own rights in its workspace", async () => {
    const response = await rights.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/rights"));
    expect(await response.json()).toEqual({ agent: "OpenClaw", workspaceId: WORKSPACE, unrestricted: false, rights: { access: "propose", areas: { "Learnings/dev-team": "write" } } });
  });

  test("a person's own token is not limited and has no agent log", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: "tok-2", agentName: null, tokenScope: "write" };
    expect(await (await rights.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/rights"))).json()).toMatchObject({ agent: null, unrestricted: true });
    expect(await (await changes.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/changes"))).json()).toEqual({ changes: [] });
  });

  test("the log shows only the calling token's entries; another workspace is refused", async () => {
    const own = await (await changes.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/changes?limit=5"))).json() as { changes: Array<{ tokenId: string }> };
    expect(own.changes[0]?.tokenId).toBe("tok-1");
    const other = await rights.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/rights", { headers: { "X-BloomMD-Workspace-ID": "33333333-3333-4333-8333-333333333333" } }));
    expect(other.status).toBe(404);
    identity = {};
    expect((await rights.GET(new Request("https://app.bloommd.test/api/mindmaps/agent-access/rights"))).status).toBe(401);
  });
});
