import { describe, expect, test } from "bun:test";
import { isWaitlistAdminAuthConfigured, isWaitlistAdminAuthorized, waitlistAdminHeaders, type WaitlistAdminAuthEnv } from "./waitlist-admin-auth";

function basic(value: string) {
  return `Basic ${btoa(value)}`;
}

describe("waitlist admin auth", () => {
  test("is disabled until a token or complete basic-auth credentials are configured", () => {
    expect(isWaitlistAdminAuthConfigured({})).toBe(false);
    expect(isWaitlistAdminAuthConfigured({ BLOOMMD_WAITLIST_ADMIN_USER: "admin" })).toBe(false);
    expect(isWaitlistAdminAuthConfigured({ BLOOMMD_WAITLIST_ADMIN_TOKEN: "secret" })).toBe(true);
    expect(isWaitlistAdminAuthConfigured({ BLOOMMD_WAITLIST_ADMIN_USER: "admin", BLOOMMD_WAITLIST_ADMIN_PASSWORD: "secret" })).toBe(true);
  });

  test("accepts bearer token authorization", () => {
    const env: WaitlistAdminAuthEnv = { BLOOMMD_WAITLIST_ADMIN_TOKEN: "token-123" };
    expect(isWaitlistAdminAuthorized("Bearer token-123", env)).toBe(true);
    expect(isWaitlistAdminAuthorized("Bearer wrong", env)).toBe(false);
  });

  test("accepts basic authorization with exact configured credentials", () => {
    const env: WaitlistAdminAuthEnv = { BLOOMMD_WAITLIST_ADMIN_USER: "admin", BLOOMMD_WAITLIST_ADMIN_PASSWORD: "secret" };
    expect(isWaitlistAdminAuthorized(basic("admin:secret"), env)).toBe(true);
    expect(isWaitlistAdminAuthorized(basic("admin:wrong"), env)).toBe(false);
    expect(isWaitlistAdminAuthorized(basic("other:secret"), env)).toBe(false);
  });

  test("marks admin responses private, uncached and noindex", () => {
    expect(waitlistAdminHeaders()).toEqual({
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });
});
