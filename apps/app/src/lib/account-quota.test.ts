import { describe, expect, test } from "bun:test";
import {
  ACCOUNT_QUOTA_BYTES,
  accountQuotaStatus,
  isAccountQuotaEnforced,
  quotaExceededResponse,
  quotaRequestLocale,
  summarizeQuotaUsage,
} from "./account-quota";

const MB = 1024 * 1024;

describe("account quota status (#380)", () => {
  test("shows usage, share and level for the account page", () => {
    expect(accountQuotaStatus(0, false)).toEqual({ enforced: false, usedBytes: 0, limitBytes: ACCOUNT_QUOTA_BYTES, percent: 0, level: "ok" });
    expect(accountQuotaStatus(79 * MB, true).level).toBe("ok");
    expect(accountQuotaStatus(80 * MB, true)).toMatchObject({ percent: 80, level: "warning" });
    expect(accountQuotaStatus(100 * MB, true)).toMatchObject({ percent: 100, level: "reached" });
    expect(accountQuotaStatus(130 * MB, true)).toMatchObject({ percent: 130, level: "reached" });
  });

  test("the switch is off by default", () => {
    expect(isAccountQuotaEnforced({})).toBe(false);
    expect(isAccountQuotaEnforced({ BLOOMMD_ACCOUNT_QUOTA: "1" })).toBe(true);
  });
});

describe("quota refusal of the API (#380)", () => {
  test("is a 413 with code, usage and limit, in German by default", async () => {
    const response = quotaExceededResponse(new Request("https://app.test/api/mindmaps"), 100 * MB);
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json() as { error: string; code: string; usedBytes: number; limitBytes: number };
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(body.usedBytes).toBe(100 * MB);
    expect(body.limitBytes).toBe(ACCOUNT_QUOTA_BYTES);
    expect(body.error).toContain("100,0 MB von 100 MB");
    expect(body.error).toContain("Lesen, Export und Löschen");
  });

  test("follows ?lang=en and the Accept-Language header like the trial refusal", async () => {
    expect(quotaRequestLocale(new Request("https://app.test/api/x?lang=en"))).toBe("en");
    expect(quotaRequestLocale(new Request("https://app.test/api/x", { headers: { "accept-language": "en-US,en;q=0.9" } }))).toBe("en");
    expect(quotaRequestLocale(new Request("https://app.test/api/x", { headers: { "accept-language": "de-DE" } }))).toBe("de");
    expect(quotaRequestLocale()).toBe("de");
    const en = await quotaExceededResponse(new Request("https://app.test/api/x?lang=en"), 100 * MB).json() as { error: string };
    expect(en.error).toContain("read, export and delete");
  });
});

describe("ops report (db:quota-report)", () => {
  const rows = [
    { accountId: "a", usedBytes: 10 * MB },
    { accountId: "b", usedBytes: 80 * MB },
    { accountId: "c", usedBytes: 100 * MB },
    { accountId: "d", usedBytes: 130 * MB },
    { accountId: "e", usedBytes: 0 },
  ];

  test("counts accounts, the sum in bytes and the accounts from 80 % and from 100 %", () => {
    const report = summarizeQuotaUsage(rows);
    expect(report.accounts).toBe(5);
    expect(report.totalBytes).toBe(320 * MB);
    expect(report.over80).toBe(3);
    expect(report.over100).toBe(2);
    expect(report.limitBytes).toBe(ACCOUNT_QUOTA_BYTES);
    expect(report.enforced).toBe(false);
  });

  test("lists the accounts from 80 % biggest first, or all of them", () => {
    expect(summarizeQuotaUsage(rows).perAccount).toEqual([
      { accountId: "d", usedBytes: 130 * MB, percent: 130 },
      { accountId: "c", usedBytes: 100 * MB, percent: 100 },
      { accountId: "b", usedBytes: 80 * MB, percent: 80 },
    ]);
    expect(summarizeQuotaUsage(rows, { all: true }).perAccount.map((row) => row.accountId)).toEqual(["d", "c", "b", "a", "e"]);
  });

  test("an empty database gives zeros, and the line holds no address", () => {
    const report = summarizeQuotaUsage([], { enforced: true });
    expect(report).toMatchObject({ accounts: 0, totalBytes: 0, over80: 0, over100: 0, perAccount: [], enforced: true });
    expect(JSON.stringify(summarizeQuotaUsage(rows))).not.toContain("@");
  });
});
