import { describe, expect, test } from "bun:test";
import { SyncMutationError } from "./sync-room-status";
import { workspaceErrorResponse } from "./workspace-api";

describe("workspace API error mapping", () => {
  test("protects the last owner with a conflict response", async () => {
    const response = workspaceErrorResponse(new Error("LAST_OWNER"), "fallback");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "The last workspace owner cannot leave, be removed, or be demoted." });
  });

  test("does not expose invitation token details", async () => {
    const response = workspaceErrorResponse(new Error("INVITATION_INVALID"), "fallback");
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "This invitation is expired, revoked, or already used." });
  });

  test("reports an unknown shared document as not found instead of an internal error", async () => {
    const response = workspaceErrorResponse(new Error("Shared document not found."), "fallback");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Shared document not found." });
  });

  test("a change the storage quota stopped is a 413 with its own code, in the request's language (#380)", async () => {
    const error = new SyncMutationError("QUOTA_EXCEEDED", 413, "quota", { usedBytes: 104_857_600, limitBytes: 104_857_600 });
    const request = new Request("https://app.test/api/x?lang=en");
    const response = workspaceErrorResponse(error, "fallback", request);
    expect(response.status).toBe(413);
    const body = await response.json() as { code: string; error: string; usedBytes: number; limitBytes: number };
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(body.error).toContain("100.0 MB of 100 MB");
    expect(body.usedBytes).toBe(104_857_600);
    expect((await workspaceErrorResponse(error, "fallback").json() as { error: string }).error).toContain("100,0 MB von 100 MB");
  });
});
