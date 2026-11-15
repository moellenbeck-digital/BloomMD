import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_QUOTA_BYTES,
  AccountQuotaExceededError,
  decideQuotaWrite,
  formatQuotaMegabytes,
  formatQuotaUsage,
  isAccountQuotaEnforced,
  quotaBytes,
  quotaExceededMessage,
  quotaLevel,
} from "./account-quota";

describe("account quota (#380)", () => {
  test("the limit is 100 MB as 100 × 1024 × 1024 bytes", () => {
    expect(ACCOUNT_QUOTA_BYTES).toBe(104_857_600);
  });

  test("enforcement is off unless BLOOMMD_ACCOUNT_QUOTA is exactly 1", () => {
    expect(isAccountQuotaEnforced({})).toBe(false);
    expect(isAccountQuotaEnforced({ BLOOMMD_ACCOUNT_QUOTA: "" })).toBe(false);
    expect(isAccountQuotaEnforced({ BLOOMMD_ACCOUNT_QUOTA: "0" })).toBe(false);
    expect(isAccountQuotaEnforced({ BLOOMMD_ACCOUNT_QUOTA: "true" })).toBe(false);
    expect(isAccountQuotaEnforced({ BLOOMMD_ACCOUNT_QUOTA: "1" })).toBe(true);
  });

  test("usage counts UTF-8 bytes, not characters", () => {
    expect(quotaBytes("abc")).toBe(3);
    expect(quotaBytes("äöü")).toBe(6);
    expect(quotaBytes("€")).toBe(3);
    expect(quotaBytes("😀")).toBe(4);
    expect(quotaBytes("")).toBe(0);
  });

  test("levels: warning from 80 %, reached at the limit", () => {
    const limit = ACCOUNT_QUOTA_BYTES;
    expect(quotaLevel(0)).toBe("ok");
    expect(quotaLevel(limit * 0.8 - 1)).toBe("ok");
    expect(quotaLevel(limit * 0.8)).toBe("warning");
    expect(quotaLevel(limit - 1)).toBe("warning");
    expect(quotaLevel(limit)).toBe("reached");
    expect(quotaLevel(limit + 5)).toBe("reached");
  });

  test("a write that grows the usage within the limit is allowed", () => {
    expect(decideQuotaWrite({ usedBytes: 100, oldBytes: 10, newBytes: 50, limitBytes: 200 })).toEqual({ allowed: true, deltaBytes: 40, usedAfterBytes: 140 });
  });

  test("a write that ends exactly at the limit is allowed, one byte more is refused", () => {
    expect(decideQuotaWrite({ usedBytes: 100, oldBytes: 0, newBytes: 100, limitBytes: 200 }).allowed).toBe(true);
    expect(decideQuotaWrite({ usedBytes: 100, oldBytes: 0, newBytes: 101, limitBytes: 200 }).allowed).toBe(false);
  });

  test("at the limit every growth is refused, also a single byte", () => {
    expect(decideQuotaWrite({ usedBytes: 200, oldBytes: 5, newBytes: 6, limitBytes: 200 }).allowed).toBe(false);
  });

  test("shrinking and equal-size writes are allowed at and over the limit", () => {
    expect(decideQuotaWrite({ usedBytes: 200, oldBytes: 50, newBytes: 49, limitBytes: 200 }).allowed).toBe(true);
    expect(decideQuotaWrite({ usedBytes: 250, oldBytes: 50, newBytes: 50, limitBytes: 200 }).allowed).toBe(true);
    expect(decideQuotaWrite({ usedBytes: 250, oldBytes: 50, newBytes: 0, limitBytes: 200 })).toEqual({ allowed: true, deltaBytes: -50, usedAfterBytes: 200 });
  });

  test("an existing account over the limit may still shrink, but not grow", () => {
    const over = ACCOUNT_QUOTA_BYTES + 1_000_000;
    expect(decideQuotaWrite({ usedBytes: over, oldBytes: 1000, newBytes: 900 }).allowed).toBe(true);
    expect(decideQuotaWrite({ usedBytes: over, oldBytes: 1000, newBytes: 1001 }).allowed).toBe(false);
  });

  test("formats usage like the interface shows it", () => {
    expect(formatQuotaMegabytes(Math.round(37.2 * 1024 * 1024))).toBe("37,2 MB");
    expect(formatQuotaMegabytes(Math.round(37.2 * 1024 * 1024), "en")).toBe("37.2 MB");
    expect(formatQuotaUsage(Math.round(37.2 * 1024 * 1024), ACCOUNT_QUOTA_BYTES)).toBe("37,2 MB von 100 MB");
    expect(formatQuotaUsage(Math.round(37.2 * 1024 * 1024), ACCOUNT_QUOTA_BYTES, "en")).toBe("37.2 MB of 100 MB");
  });

  test("the refusal names usage and limit and that reading, export and deleting still work (de + en)", () => {
    const de = quotaExceededMessage("de", ACCOUNT_QUOTA_BYTES);
    expect(de).toContain("100,0 MB von 100 MB");
    expect(de).toContain("Lesen, Export und Löschen");
    const en = quotaExceededMessage("en", ACCOUNT_QUOTA_BYTES);
    expect(en).toContain("100.0 MB of 100 MB");
    expect(en).toContain("read, export and delete");
  });

  test("the error carries usage and limit", () => {
    const error = new AccountQuotaExceededError(123);
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.usedBytes).toBe(123);
    expect(error.limitBytes).toBe(ACCOUNT_QUOTA_BYTES);
  });
});
