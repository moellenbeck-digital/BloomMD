import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "33333333-3333-4333-8333-333333333333";
let identity: Record<string, unknown> = {};
let saved: Array<Record<string, unknown>> = [];
let role = "owner";

mock.module("../../../../../lib/auth", () => ({ getApiRequestIdentity: async () => identity }));
mock.module("../../../../../lib/db", () => ({
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | undefined | null) => value ?? null,
  getWorkspaceForUser: async () => ({ id: WORKSPACE, name: "Team", slug: "team", kind: "team", role }),
  // Bun shares module mocks across test files; every export agent-review imports must exist.
  completeAgentTokenUndo: async () => true,
  createAgentTokenProposal: async () => "p-x",
  getAgentTokenChangeForUndo: async () => null,
  getAgentTokenRights: async () => ({ access: "propose", areas: {} }),
  getAgentTokenProposal: async () => { throw new Error("not used"); },
  finishAgentTokenProposal: async () => { throw new Error("not used"); },
  readCloudDocument: async () => null,
  listAgentTokensForWorkspace: async () => {
    if (role !== "owner") throw new Error("Only workspace owners can manage agent rights and proposals.");
    return [{ tokenId: TOKEN, agentName: "OpenClaw", rights: { access: "propose", areas: {} } }];
  },
  setAgentTokenRights: async (input: Record<string, unknown>) => { saved.push(input); return input.rights; },
}));

const route = await import("./route");
const params = { params: Promise.resolve({ workspaceId: WORKSPACE }) };
const put = (body: unknown) => route.PUT(new Request(`https://app.bloommd.test/api/workspaces/${WORKSPACE}/agent-rights`, { method: "PUT", headers: { Origin: "https://app.bloommd.test", "Content-Type": "application/json" }, body: JSON.stringify(body) }), params);

describe("agent rights API", () => {
  beforeEach(() => {
    identity = { authKind: "session", userId: USER, email: "owner@example.test" };
    saved = [];
    role = "owner";
  });

  test("the owner lists agent tokens with their rights", async () => {
    const response = await route.GET(new Request(`https://app.bloommd.test/api/workspaces/${WORKSPACE}/agent-rights`), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspaceId: WORKSPACE, tokens: [{ tokenId: TOKEN, agentName: "OpenClaw" }] });
  });

  test("sub-areas are stored in their normal spelling", async () => {
    const response = await put({ tokenId: TOKEN, access: "propose", areas: { " Learnings / dev-team ": "write", Learnings: "read" } });
    expect(response.status).toBe(200);
    expect(saved).toMatchObject([{ userId: USER, workspaceId: WORKSPACE, tokenId: TOKEN, rights: { access: "propose", areas: { "Learnings/dev-team": "write", Learnings: "read" } } }]);
  });

  test("invalid rights are refused before anything is stored", async () => {
    expect((await put({ tokenId: TOKEN, access: "root" })).status).toBe(400);
    expect((await put({ tokenId: TOKEN, access: "read", areas: { Arbeit: "everything" } })).status).toBe(400);
    expect((await put({ access: "read" })).status).toBe(400);
    expect(saved).toHaveLength(0);
  });

  test("an agent token cannot read or change rights, not even its own", async () => {
    identity = { authKind: "access-token", userId: USER, tokenId: TOKEN, agentName: "OpenClaw", tokenScope: "write" };
    expect((await route.GET(new Request("https://app.bloommd.test/x"), params)).status).toBe(403);
    const response = await put({ tokenId: TOKEN, access: "write", areas: {} });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe("AGENT_FORBIDDEN");
    expect(saved).toHaveLength(0);
  });

  test("editors and viewers cannot manage rights; strangers are told to sign in", async () => {
    role = "editor";
    expect((await route.GET(new Request("https://app.bloommd.test/x"), params)).status).toBe(403);
    identity = {};
    expect((await route.GET(new Request("https://app.bloommd.test/x"), params)).status).toBe(401);
  });
});
