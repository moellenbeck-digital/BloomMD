import { describe, expect, test } from "bun:test";
import { purgeUnactivatedWaitlistAccounts, purgeUnconfirmedAccounts, UNCONFIRMED_ACCOUNT_RETENTION_DAYS } from "./unconfirmed-accounts";
import type { SqlClient } from "./sql-client";

function fakeSql(row: Record<string, unknown>) {
  const calls: Array<{ statement: string; values: unknown[] }> = [];
  const sql = ((parts: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ statement: parts.join("?").replace(/\s+/g, " ").trim(), values });
    return Promise.resolve([row]);
  }) as unknown as SqlClient;
  return { sql, calls };
}

describe("purging unconfirmed accounts (#169)", () => {
  test("defaults to 7 days", () => {
    expect(UNCONFIRMED_ACCOUNT_RETENTION_DAYS).toBe(7);
  });

  test("a dry run only counts and deletes nothing", async () => {
    const { sql, calls } = fakeSql({ accounts: 3, tokens: 4, oldest_created_at: new Date("2026-10-01T10:00:00Z") });

    const result = await purgeUnconfirmedAccounts(sql, { dryRun: true });

    expect(result).toEqual({ dryRun: true, days: 7, accounts: 3, tokens: 4, oldestCreatedAt: "2026-10-01T10:00:00.000Z" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.statement).not.toMatch(/\bdelete\b/i);
    expect(calls[0]!.values).toEqual([7]);
  });

  test("applying deletes the accounts and orphan tokens in one statement, and only unused password accounts", async () => {
    const { sql, calls } = fakeSql({ accounts: 2, tokens: 2, oldest_created_at: null });

    const result = await purgeUnconfirmedAccounts(sql, { days: 14, dryRun: false });

    expect(result).toMatchObject({ dryRun: false, days: 14, accounts: 2, tokens: 2, oldestCreatedAt: null });
    expect(calls).toHaveLength(1);
    const { statement, values } = calls[0]!;
    expect(values).toEqual([14]);
    expect(statement).toContain("delete from bloom_users");
    expect(statement).toContain("delete from bloom_auth_tokens");
    // Never a confirmed account, never one with a password-less (other provider) login.
    expect(statement).toContain("u.email_verified_at is null");
    expect(statement).toContain("u.auth_provider = 'password'");
    expect(statement).toContain("u.password_hash is not null");
    expect(statement).toContain("u.stripe_customer_id is null");
    for (const table of ["bloom_workspace_members", "bloom_workspaces", "bloom_access_tokens", "bloom_workspace_invitations"]) {
      expect(statement).toContain(`not exists (select 1 from ${table}`);
    }
  });

  test("rejects an invalid age", async () => {
    const { sql, calls } = fakeSql({});
    for (const days of [0, -1, 1.5, Number.NaN]) {
      await expect(purgeUnconfirmedAccounts(sql, { days, dryRun: false })).rejects.toThrow("positive integer");
    }
    expect(calls).toHaveLength(0);
  });
});

describe("purging unactivated waitlist accounts (#105)", () => {
  test("defaults to 90 days, the retention of the waitlist entries", async () => {
    const { sql, calls } = fakeSql({ accounts: 4 });

    const result = await purgeUnactivatedWaitlistAccounts(sql, { dryRun: true });

    expect(result).toEqual({ dryRun: true, days: 90, accounts: 4 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.statement).not.toMatch(/\bdelete\b/i);
    expect(calls[0]!.values).toEqual([90]);
  });

  test("applying deletes only prepared accounts nobody used, counted from the mail or else the creation", async () => {
    const { sql, calls } = fakeSql({ accounts: 2 });

    const result = await purgeUnactivatedWaitlistAccounts(sql, { days: 30, dryRun: false });

    expect(result).toEqual({ dryRun: false, days: 30, accounts: 2 });
    const { statement, values } = calls[0]!;
    expect(values).toEqual([30]);
    expect(statement).toContain("delete from bloom_users");
    expect(statement).toContain("using bloom_waitlist_transfers t");
    expect(statement).toContain("t.activated_at is null");
    expect(statement).toContain("u.password_hash is null");
    expect(statement).toContain("u.email_verified_at is null");
    expect(statement).toContain("u.stripe_customer_id is null");
    expect(statement).toContain("coalesce(t.invited_at, t.created_at)");
    for (const table of ["bloom_workspace_members", "bloom_workspaces", "bloom_access_tokens"]) {
      expect(statement).toContain(`not exists (select 1 from ${table}`);
    }
  });

  test("rejects an invalid age", async () => {
    const { sql, calls } = fakeSql({});
    for (const days of [0, -1, 1.5, Number.NaN]) {
      await expect(purgeUnactivatedWaitlistAccounts(sql, { days, dryRun: false })).rejects.toThrow("positive integer");
    }
    expect(calls).toHaveLength(0);
  });
});
