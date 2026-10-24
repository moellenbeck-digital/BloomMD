import { afterEach, describe, expect, test } from "bun:test";
import { isInternalInviteRequestAuthorized } from "./internal-api-auth";

const originalSecret = process.env.BLOOMMD_INTERNAL_INVITE_SECRET;

afterEach(() => {
  if (originalSecret == null) delete process.env.BLOOMMD_INTERNAL_INVITE_SECRET;
  else process.env.BLOOMMD_INTERNAL_INVITE_SECRET = originalSecret;
});

describe("internal invite API auth", () => {
  test("requires a configured bearer secret", () => {
    delete process.env.BLOOMMD_INTERNAL_INVITE_SECRET;
    const request = new Request("https://bloommd.app/api/internal/beta-invites", {
      headers: { Authorization: "Bearer anything" },
    });

    expect(isInternalInviteRequestAuthorized(request)).toBe(false);
  });

  test("accepts the exact configured bearer secret", () => {
    process.env.BLOOMMD_INTERNAL_INVITE_SECRET = "secret-with-enough-length";
    const request = new Request("https://bloommd.app/api/internal/beta-invites", {
      headers: { Authorization: "Bearer secret-with-enough-length" },
    });

    expect(isInternalInviteRequestAuthorized(request)).toBe(true);
  });
});
