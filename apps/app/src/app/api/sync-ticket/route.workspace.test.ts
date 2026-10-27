import { beforeEach, describe, expect, mock, test } from "bun:test";

const USER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let tokenWorkspaceIds: string[] | null = [WORKSPACE_A];
let requested: Array<string | null | undefined> = [];
let rights: { access: "read" | "propose" | "write"; areas: Record<string, "read" | "propose" | "write"> } = { access: "write", areas: {} };

mock.module("../../../lib/auth", () => ({
  getApiRequestIdentity: async () => ({ authKind: "access-token", userId: USER, tokenId: "tok-1", tokenScope: "write", tokenWorkspaceIds, agentName: "OpenClaw" }),
}));

mock.module("../../../lib/db", () => ({
  // request-security (real here) rate-limits through the database; null falls back to memory.
  consumeRateLimit: async () => null,
  normalizeUuid: (value: string | null | undefined) => (value && /^[0-9a-f-]{36}$/i.test(value) ? value : null),
  // The user is a member of both workspaces; only the token limits access.
  getWorkspaceForUser: async (_userId: string, workspaceId?: string | null) => {
    requested.push(workspaceId);
    return { id: workspaceId ?? WORKSPACE_B, role: "owner" };
  },
  readCloudDocument: async (_userId: string, filename: string, workspaceId: string) => ({ id: "doc-1", filename, workspaceId }),
  getAgentTokenRights: async () => rights,
}));

process.env.NEXT_PUBLIC_SYNC_URL = "wss://sync.bloommd.test";
process.env.BLOOMMD_SYNC_SECRET = "s".repeat(40);
const { POST } = await import("./route");

const ticket = (body: Record<string, unknown>) => POST(new Request("https://app.bloommd.test/api/sync-ticket", {
  method: "POST",
  headers: { Authorization: "Bearer bloom_pat_x", "Content-Type": "application/json" },
  body: JSON.stringify(body),
}));

describe("POST /api/sync-ticket with a workspace-bound token", () => {
  beforeEach(() => {
    tokenWorkspaceIds = [WORKSPACE_A];
    requested = [];
    rights = { access: "write", areas: {} };
  });

  test("refuses a ticket for another workspace", async () => {
    const response = await ticket({ filename: "plan.md", workspaceId: WORKSPACE_B });
    expect(response.status).toBe(403);
    expect(requested).toEqual([]);
  });

  test("defaults to the token's first workspace and allows its own", async () => {
    expect((await ticket({ filename: "plan.md" })).status).toBe(200);
    expect((await ticket({ filename: "plan.md", workspaceId: WORKSPACE_A })).status).toBe(200);
    expect(requested).toEqual([WORKSPACE_A, WORKSPACE_A]);
  });

  test("an unbound token keeps the requested workspace", async () => {
    tokenWorkspaceIds = null;
    expect((await ticket({ filename: "plan.md", workspaceId: WORKSPACE_B })).status).toBe(200);
    expect(requested).toEqual([WORKSPACE_B]);
  });

  test("a live editing ticket is read-only where the agent token may not write", async () => {
    rights = { access: "write", areas: { Arbeit: "propose", Learnings: "read" } };
    const permission = async (filename: string) => ((await (await ticket({ filename })).json()) as { permission: string }).permission;
    expect(await permission("Arbeit – Plan.md")).toBe("read");
    expect(await permission("Learnings – Idee.md")).toBe("read");
    expect(await permission("Privat – Plan.md")).toBe("write");
    rights = { access: "propose", areas: {} };
    expect(await permission("Privat – Plan.md")).toBe("read");
  });
});
