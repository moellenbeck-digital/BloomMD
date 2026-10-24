import { describe, expect, test } from "bun:test";
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

  test("a workspace-bound token reaches documents and sync, nothing else", () => {
    const bound = { scope: "write" as const, workspaceIds: ["0b5e8f3e-8a0c-4c55-9a43-6f4a3f9a0b11"] };
    expect(accessTokenAllows(request("PUT", "/api/mindmaps/a.md"), bound)).toBe(true);
    expect(accessTokenAllows(request("POST", "/api/sync-ticket"), bound)).toBe(true);
    expect(accessTokenAllows(request("GET", "/api/account/export"), bound)).toBe(false);
    expect(accessTokenAllows(request("POST", "/api/workspaces/x/invitations"), bound)).toBe(false);
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
