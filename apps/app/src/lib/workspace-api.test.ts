import { describe, expect, test } from "bun:test";
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
});
