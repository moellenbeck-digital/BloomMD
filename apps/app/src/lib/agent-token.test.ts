import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessTokenAllows } from "./auth";
import { getMindmapStorage } from "./mindmap-storage";

const request = (method: string, path: string, headers: Record<string, string> = {}) => new Request(`https://app.bloommd.test${path}`, { method, headers });

describe("agent access tokens", () => {
  test("a full token keeps working everywhere", () => {
    const full = { scope: "write" as const, workspaceIds: null };
    expect(accessTokenAllows(request("POST", "/api/account/access-tokens"), full)).toBe(true);
    expect(accessTokenAllows(request("PUT", "/api/mindmaps/a.md"), full)).toBe(true);
  });

  test("a read-only token can only read documents", () => {
    const read = { scope: "read" as const, workspaceIds: null };
    expect(accessTokenAllows(request("GET", "/api/mindmaps"), read)).toBe(true);
    expect(accessTokenAllows(request("GET", "/api/mindmaps/Arbeit%20%E2%80%93%20X.md"), read)).toBe(true);
    expect(accessTokenAllows(request("PUT", "/api/mindmaps/a.md"), read)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/mindmaps"), read)).toBe(false);
    expect(accessTokenAllows(request("GET", "/api/workspaces/x/members"), read)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/sync-ticket"), read)).toBe(false);
  });

  test("a read-only token writes nowhere: no map, node, rename, delete, share link, undo or proposal", () => {
    // The scope decides before any right of the agent does, so not even a proposal can be stored.
    for (const agentName of [null, "OpenClaw"]) {
      const read = { scope: "read" as const, workspaceIds: null, agentName };
      expect(accessTokenAllows(request("GET", "/api/mindmaps/a.md/nodes/n1"), read)).toBe(true);
      for (const [method, path] of [
        ["PUT", "/api/mindmaps/a.md"],
        ["PATCH", "/api/mindmaps/a.md"],
        ["DELETE", "/api/mindmaps/a.md"],
        ["POST", "/api/mindmaps"],
        ["POST", "/api/mindmaps/a.md/nodes"],
        ["PATCH", "/api/mindmaps/a.md/nodes/n1"],
        ["POST", "/api/mindmaps/a.md/share-links"],
        ["DELETE", "/api/mindmaps/a.md/share-links"],
        ["POST", "/api/mindmaps/agent-access/undo"],
        ["POST", "/api/sync-ticket"],
      ] as const) {
        expect(accessTokenAllows(request(method, path), read)).toBe(false);
      }
    }
  });

  test("a write token of an agent reaches the node routes and nothing outside the documents", () => {
    const agent = { scope: "write" as const, workspaceIds: null, agentName: "OpenClaw" };
    expect(accessTokenAllows(request("POST", "/api/mindmaps/a.md/nodes"), agent)).toBe(true);
    expect(accessTokenAllows(request("PATCH", "/api/mindmaps/a.md/nodes/n1"), agent)).toBe(true);
    expect(accessTokenAllows(request("PATCH", "/api/workspaces/x/agent-rights"), agent)).toBe(false);
    expect(accessTokenAllows(request("GET", "/api/workspaces/x/agent-log"), agent)).toBe(false);
    expect(accessTokenAllows(request("GET", "/api/workspaces/x/agent-token-proposals"), agent)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/agent-proposals/p1"), agent)).toBe(false);
  });

  test("a workspace-bound token reaches documents and sync, nothing else", () => {
    const bound = { scope: "write" as const, workspaceIds: ["0b5e8f3e-8a0c-4c55-9a43-6f4a3f9a0b11"] };
    expect(accessTokenAllows(request("PUT", "/api/mindmaps/a.md"), bound)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/sync-ticket"), bound)).toBe(true);
    expect(accessTokenAllows(request("GET", "/api/account/export"), bound)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/invitations"), bound)).toBe(false);
  });

  test("a token named for an agent is limited to documents even without a workspace binding", () => {
    const agent = { scope: "write" as const, workspaceIds: null, agentName: "OpenClaw" };
    expect(accessTokenAllows(request("PUT", "/api/mindmaps/a.md"), agent)).toBe(true);
    expect(accessTokenAllows(request("GET", "/api/mindmaps/agent-access/rights"), agent)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/sync-ticket"), agent)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/account/access-tokens"), agent)).toBe(false);
    expect(accessTokenAllows(request("PUT", "/api/workspaces/x/agent-rights"), agent)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/agent-token-proposals/p1"), agent)).toBe(false);
  });

  test("a person's limited token may use the owner tools for agent rights, nothing else of the workspace", () => {
    const bound = { scope: "write" as const, workspaceIds: ["0b5e8f3e-8a0c-4c55-9a43-6f4a3f9a0b11"], agentName: null };
    expect(accessTokenAllows(request("PUT", "/api/workspaces/x/agent-rights"), bound)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/agent-token-proposals/p1"), bound)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/agent-log/c1"), bound)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/invitations"), bound)).toBe(false);
    const read = { scope: "read" as const, workspaceIds: null, agentName: null };
    expect(accessTokenAllows(request("GET", "/api/workspaces/x/agent-token-proposals"), read)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/agent-token-proposals/p1"), read)).toBe(false);
  });

  test("document storage refuses a workspace the token is not bound to", async () => {
    const identity = {
      authKind: "access-token" as const,
      userId: "8f0c5b1e-1d2a-4b3c-9e4f-5a6b7c8d9e0f",
      tokenId: "t1",
      tokenScope: "write" as const,
      tokenWorkspaceIds: ["0b5e8f3e-8a0c-4c55-9a43-6f4a3f9a0b11"],
      agentName: "OpenClaw",
    };
    const other = request("GET", "/api/mindmaps", { "X-BloomMD-Workspace-ID": "11111111-2222-4333-8444-555555555555" });
    await expect(getMindmapStorage(other, identity)).rejects.toThrow("Workspace not found or access denied.");
  });
});

describe("agent tokens outside the cloud database", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const agent = { authKind: "access-token" as const, userId: user, tokenId: "22222222-2222-4222-8222-222222222222", agentName: "OpenClaw" };
  const personal = { authKind: "access-token" as const, userId: user, tokenId: "33333333-3333-4333-8333-333333333333" };
  const session = { authKind: "session" as const, userId: user };

  const withFilesystem = async (run: () => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), "bloom-agent-storage-"));
    const before = process.env.BLOOMMD_DIR;
    process.env.BLOOMMD_DIR = dir;
    try {
      await run();
    } finally {
      if (before === undefined) delete process.env.BLOOMMD_DIR;
      else process.env.BLOOMMD_DIR = before;
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("every method that changes something is refused with 403 for an agent token, one place for all routes", () =>
    withFilesystem(async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        await expect(getMindmapStorage(request(method, "/api/mindmaps"), agent)).rejects.toMatchObject({ name: "RequestSecurityError", status: 403 });
      }
    }));

  test("reading, personal tokens and sessions are unchanged", () =>
    withFilesystem(async () => {
      for (const method of ["GET", "HEAD"]) expect((await getMindmapStorage(request(method, "/api/mindmaps"), agent)).mode).toBe("filesystem");
      for (const identity of [personal, session]) {
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) expect((await getMindmapStorage(request(method, "/api/mindmaps"), identity)).mode).toBe("filesystem");
      }
    }));
});
