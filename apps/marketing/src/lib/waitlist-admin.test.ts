import { describe, expect, test } from "bun:test";
import {
  formatWaitlistAllowlist,
  normalizeWaitlistAllowlistLimit,
  normalizeWaitlistStatusFilter,
  waitlistAdminActionRedirectPath,
  waitlistEntriesToCsv,
} from "./waitlist-admin";
import { normalizeWaitlistAdminEmail } from "./waitlist-admin-actions";
import type { ConfirmedWaitlistEntry } from "./waitlist-db";

const entries: ConfirmedWaitlistEntry[] = [
  { email: "first@example.test", confirmedAt: "2026-08-01T10:00:00.000Z", source: "landing" },
  { email: "second@example.test", confirmedAt: "2026-08-02T10:00:00.000Z", source: "demo,cta" },
  { email: "third@example.test", confirmedAt: "2026-08-03T10:00:00.000Z", source: null },
];

describe("waitlist admin helpers", () => {
  test("formats the first confirmed addresses as beta allowlist env", () => {
    expect(formatWaitlistAllowlist(entries, 2)).toBe("BLOOMMD_BETA_ALLOWED_EMAILS=first@example.test,second@example.test");
  });

  test("normalizes invalid or too-large allowlist limits", () => {
    expect(normalizeWaitlistAllowlistLimit("abc", 10)).toBe(10);
    expect(normalizeWaitlistAllowlistLimit("0", 10)).toBe(10);
    expect(normalizeWaitlistAllowlistLimit("900", 10)).toBe(500);
  });

  test("normalizes status and validates admin email input", () => {
    expect(normalizeWaitlistStatusFilter("confirmed")).toBe("confirmed");
    expect(normalizeWaitlistStatusFilter("stale-status")).toBe("all");
    expect(normalizeWaitlistAdminEmail(" TESTER@example.test ")).toEqual({ email: "tester@example.test" });
    expect(normalizeWaitlistAdminEmail("not-an-email")).toEqual({ error: "invalid-email" });
    expect(normalizeWaitlistAdminEmail("")).toEqual({ error: "missing-email" });
  });

  test("redirects actions while replacing stale result parameters", () => {
    const form = new FormData();
    form.set("email", "tester@example.test");
    form.set("intent", "invite");
    form.set("status", "confirmed");
    form.set("limit", "25");
    const path = waitlistAdminActionRedirectPath(form, {
      ok: false,
      error: "invite-server-error",
      email: "tester@example.test",
    });
    expect(path).toBe("/admin/waitlist?limit=25&status=confirmed&actionEmail=tester%40example.test&inviteError=invite-server-error");
  });

  test("exports confirmed entries as escaped CSV", () => {
    expect(waitlistEntriesToCsv(entries)).toBe([
      "email,confirmed_at,source",
      "first@example.test,2026-08-01T10:00:00.000Z,landing",
      "second@example.test,2026-08-02T10:00:00.000Z,\"demo,cta\"",
      "third@example.test,2026-08-03T10:00:00.000Z,",
      "",
    ].join("\n"));
  });
});
