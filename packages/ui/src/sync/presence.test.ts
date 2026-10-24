import { describe, expect, test } from "bun:test";
import { getAwarenessColor, getPresenceInitials, getPresenceLabel, shouldShowPresence } from "./presence";

describe("presence helpers", () => {
  test("creates initials from a display name without exposing the e-mail", () => {
    expect(getPresenceInitials("Martin Moellenbeck", "martin@example.test")).toBe("MM");
    expect(getPresenceInitials(undefined, "moellenbeck@example.test")).toBe("MO");
  });

  test("provides a useful hover label with optional e-mail", () => {
    expect(getPresenceLabel("Martin", "martin@example.test")).toBe("Martin · martin@example.test");
    expect(getPresenceLabel(undefined, undefined, "User 42")).toBe("User 42");
  });

  test("keeps a user's initial color stable", () => {
    const identity = { name: "Martin", email: "martin@example.test" };
    expect(getAwarenessColor(identity, 12)).toBe(getAwarenessColor(identity, 99));
    expect(getAwarenessColor(identity, 12)).not.toBe("");
  });
});

describe("presence visibility", () => {
  test("keeps known collaborators visible while an active provider reconnects", () => {
    expect(shouldShowPresence(true, 1)).toBe(true);
  });

  test("does not show stale collaborators after an explicit provider disconnect", () => {
    expect(shouldShowPresence(false, 1)).toBe(false);
    expect(shouldShowPresence(true, 0)).toBe(false);
  });
});
