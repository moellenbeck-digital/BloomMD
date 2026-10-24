import { describe, expect, test } from "bun:test";
import { appendAuthParams, createWorkspaceInviteHandoff, parseWorkspaceInviteHandoff } from "./invite-intent";

const invitationId = "11111111-1111-4111-8111-111111111111";

describe("workspace invite handoff", () => {
  test("round-trips only the invitation id and expiry", () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const handoff = createWorkspaceInviteHandoff({ invitationId, expiresAt });
    expect(handoff).toMatch(/^bloom_invite_intent_v1_/);
    const parsed = parseWorkspaceInviteHandoff(handoff);
    expect(parsed?.invitationId).toBe(invitationId);
    expect(new Date(parsed?.expiresAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000);
  });

  test("rejects tampered, malformed, and overlong values", () => {
    const handoff = createWorkspaceInviteHandoff({ invitationId, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const tampered = `${handoff.slice(0, -1)}${handoff.endsWith("a") ? "b" : "a"}`;
    expect(parseWorkspaceInviteHandoff(tampered)).toBeNull();
    expect(parseWorkspaceInviteHandoff("bloom_invite_intent_v1_not-a-token")).toBeNull();
    expect(parseWorkspaceInviteHandoff(`${handoff}${"x".repeat(400)}`)).toBeNull();
  });

  test("keeps auth continuations internal and serializes spaces predictably", () => {
    const path = appendAuthParams("/login?next=%2Fapp", { invite: "handoff value", lang: "de" });
    expect(path).toBe("/login?next=%2Fapp&invite=handoff%20value&lang=de");
  });
});
