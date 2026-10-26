import { describe, expect, test } from "bun:test";
import {
  WAITLIST_PURGE_RETENTION_DAYS,
  WaitlistPurgeRefusedError,
  __setWaitlistSqlForTest,
  claimWaitlistInvitation,
  cleanupWaitlistRetention,
  countWaitlistAdmin,
  countWaitlist,
  consumeWaitlistRateLimit,
  evaluateWaitlistPurge,
  listConfirmedWaitlist,
  listInvitableWaitlist,
  listWaitlistAdminEntries,
  purgeWaitlist,
  releaseWaitlistInvitation,
  unsubscribeFromWaitlist,
  waitlistPurgeStatus,
  waitlistRetentionPolicy,
} from "./waitlist-db";
import type { SqlClient } from "./sql-client";

/**
 * Behaviour without a database.
 *
 * These run in the default test environment, where `DATABASE_URL` is unset. What they pin down is
 * that every waitlist function degrades to a safe answer rather than throwing — a marketing page
 * deployed without a database must still render, and the form must fail visibly rather than
 * crashing the page.
 *
 * The paths that need a real database are covered by `deploy/local` plus `db:verify`; this file
 * covers the contract the UI depends on.
 */

describe("without a database", () => {
  test("claiming an invitation reports nothing was claimed rather than throwing", async () => {
    expect(await claimWaitlistInvitation("someone@example.com")).toBeNull();
    expect(await listInvitableWaitlist()).toEqual([]);
    expect(await purgeWaitlist()).toBe(0);
    expect(await waitlistPurgeStatus()).toEqual({ total: 0, invitable: 0, notInvited: 0, lastInvitedAt: null });
  });

  test("unsubscribing reports failure rather than throwing", async () => {
    expect(await unsubscribeFromWaitlist("any-token")).toBe(false);
  });

  test("the export is empty rather than undefined", async () => {
    expect(await listConfirmedWaitlist()).toEqual([]);
  });

  test("counts are zero rather than missing", async () => {
    expect(await countWaitlist()).toEqual({ pending: 0, confirmed: 0 });
    expect(await countWaitlistAdmin()).toEqual({ pending: 0, confirmed: 0, unsubscribed: 0, total: 0 });
  });
});

describe("the export contract", () => {
  test("confirmedAt is a string, not whatever the driver returns", async () => {
    // Regression: `postgres` hands back a Date for a timestamptz while the type said string. The
    // lie went unnoticed until the first caller did `.slice()` on it and crashed.
    for (const entry of await listConfirmedWaitlist()) {
      expect(typeof entry.confirmedAt).toBe("string");
    }
  });
});

describe("admin overview contract", () => {
  test("returns counters and all admin entries with explicit status", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const countRows = [{ pending: 2, confirmed: 3, unsubscribed: 1, total: 6 }];
    const entryRows = [
      {
        email: "first@example.test",
        confirmed_at: new Date("2026-08-01T10:00:00.000Z"),
        unsubscribed_at: null,
        created_at: new Date("2026-08-01T09:00:00.000Z"),
        invited_at: new Date("2026-10-01T09:00:00.000Z"),
        source: "landing",
      },
      {
        email: "pending@example.test",
        confirmed_at: null,
        unsubscribed_at: null,
        created_at: "2026-08-02T09:00:00.000Z",
        invited_at: null,
        source: null,
      },
      {
        email: "unsubscribed@example.test",
        confirmed_at: null,
        unsubscribed_at: "2026-08-03T10:00:00.000Z",
        created_at: "2026-08-03T09:00:00.000Z",
        invited_at: null,
        source: "footer",
      },
    ];
    const tx = (() => Promise.resolve([])) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("select count(*) filter")) return Promise.resolve(countRows);
      if (statement.startsWith("select email, confirmed_at, unsubscribed_at, created_at, invited_at")) return Promise.resolve(entryRows);
      return Promise.resolve([]);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => fn(tx);

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    expect(await countWaitlistAdmin()).toEqual({ pending: 2, confirmed: 3, unsubscribed: 1, total: 6 });
    expect(await listWaitlistAdminEntries()).toEqual([
      {
        email: "first@example.test",
        status: "confirmed",
        confirmedAt: "2026-08-01T10:00:00.000Z",
        unsubscribedAt: null,
        createdAt: "2026-08-01T09:00:00.000Z",
        invitedAt: "2026-10-01T09:00:00.000Z",
        source: "landing",
      },
      {
        email: "pending@example.test",
        status: "pending",
        confirmedAt: null,
        unsubscribedAt: null,
        createdAt: "2026-08-02T09:00:00.000Z",
        invitedAt: null,
        source: null,
      },
      {
        email: "unsubscribed@example.test",
        status: "unsubscribed",
        confirmedAt: null,
        unsubscribedAt: "2026-08-03T10:00:00.000Z",
        createdAt: "2026-08-03T09:00:00.000Z",
        invitedAt: null,
        source: "footer",
      },
    ]);
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;
  });
});

describe("waitlist retention cleanup", () => {
  test("uses conservative default retention days with bounded env overrides", () => {
    expect(waitlistRetentionPolicy({})).toEqual({ pendingDays: 30, unsubscribedDays: 90 });
    expect(
      waitlistRetentionPolicy({
        BLOOMMD_WAITLIST_PENDING_RETENTION_DAYS: "14",
        BLOOMMD_WAITLIST_UNSUBSCRIBED_RETENTION_DAYS: "120",
      }),
    ).toEqual({ pendingDays: 14, unsubscribedDays: 120 });
    expect(
      waitlistRetentionPolicy({
        BLOOMMD_WAITLIST_PENDING_RETENTION_DAYS: "0",
        BLOOMMD_WAITLIST_UNSUBSCRIBED_RETENTION_DAYS: "99999",
      }),
    ).toEqual({ pendingDays: 30, unsubscribedDays: 90 });
  });

  test("dry-runs stale pending and unsubscribed entries before deleting anything", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const tx = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve([]);
    }) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("select count(*) filter")) return Promise.resolve([{ pending: 3, unsubscribed: 2 }]);
      return Promise.resolve([]);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => fn(tx);

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    const result = await cleanupWaitlistRetention({ pendingDays: 31, unsubscribedDays: 91 });
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;

    expect(result).toEqual({ dryRun: true, pendingDays: 31, unsubscribedDays: 91, pending: 3, unsubscribed: 2, total: 5 });
    expect(statements.some((statement) => statement.includes("delete from bloom_waitlist"))).toBe(false);
    expect(statements.some((statement) => statement.includes("make_interval(days => ?)"))).toBe(true);
  });

  test("deletes stale pending and unsubscribed entries only when explicitly applied", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const tx = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve([]);
    }) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("with pending_cleanup as")) return Promise.resolve([{ pending: 1, unsubscribed: 4 }]);
      return Promise.resolve([]);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => fn(tx);

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    const result = await cleanupWaitlistRetention({ dryRun: false });
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;

    expect(result).toEqual({ dryRun: false, pendingDays: 30, unsubscribedDays: 90, pending: 1, unsubscribed: 4, total: 5 });
    const cleanupStatement = statements.find((statement) => statement.startsWith("with pending_cleanup as")) ?? "";
    expect(cleanupStatement).toContain("delete from bloom_waitlist");
    expect(cleanupStatement).toContain("confirmed_at is null");
    expect(cleanupStatement).not.toContain("confirmed_at is not null");
    expect(cleanupStatement).toContain("unsubscribed_at is not null");
  });
});

type FakeSql = ((parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  begin: (fn: (scopedSql: (parts: TemplateStringsArray) => Promise<unknown[]>) => Promise<unknown>) => Promise<unknown>;
};

/** Records every statement with its bound values; `answer` supplies rows by statement text. */
function installFakeSql(answer: (statement: string, values: unknown[]) => unknown[] = () => []) {
  process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
  const calls: Array<{ statement: string; values: unknown[] }> = [];
  const tx = ((parts: TemplateStringsArray) => {
    calls.push({ statement: parts.join("?").replace(/\s+/g, " ").trim(), values: [] });
    return Promise.resolve([]);
  }) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
  const sql = ((parts: TemplateStringsArray, ...values: unknown[]) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    calls.push({ statement, values });
    return Promise.resolve(answer(statement, values));
  }) as FakeSql;
  sql.begin = async (fn) => fn(tx);
  __setWaitlistSqlForTest(sql as unknown as SqlClient);
  return calls;
}

function uninstallFakeSql() {
  __setWaitlistSqlForTest(null);
  delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;
}

describe("the one-time invitation", () => {
  test("claims an address only while it is confirmed, not unsubscribed and not invited", async () => {
    const calls = installFakeSql((statement) => (statement.startsWith("update bloom_waitlist set invited_at") ? [{ id: "1" }] : []));
    const token = await claimWaitlistInvitation("Max@Example.test ");
    uninstallFakeSql();

    expect(token).toBeTruthy();
    const claim = calls.find((call) => call.statement.startsWith("update bloom_waitlist set invited_at"));
    expect(claim?.statement).toContain("confirmed_at is not null");
    expect(claim?.statement).toContain("unsubscribed_at is null");
    expect(claim?.statement).toContain("invited_at is null");
    expect(claim?.values).toContain("max@example.test");
  });

  test("a second claim for the same address gets nothing", async () => {
    installFakeSql(() => []);
    expect(await claimWaitlistInvitation("max@example.test")).toBeNull();
    uninstallFakeSql();
  });

  test("the unsubscribe token is random, not derived from the address, and stored only as a hash", async () => {
    // A token anybody could compute from an email would let a stranger unsubscribe somebody else.
    const calls = installFakeSql((statement) => (statement.startsWith("update bloom_waitlist set invited_at") ? [{ id: "1" }] : []));
    const first = await claimWaitlistInvitation("a@example.com");
    const second = await claimWaitlistInvitation("a@example.com");
    uninstallFakeSql();

    expect(first).not.toBe(second);
    expect(first).not.toContain("a@example.com");
    const stored = calls.filter((call) => call.statement.startsWith("update bloom_waitlist set invited_at")).flatMap((call) => call.values);
    expect(stored).not.toContain(first);
    expect(stored.some((value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value))).toBe(true);
  });

  test("releasing takes the marker and its token back", async () => {
    const calls = installFakeSql();
    await releaseWaitlistInvitation("max@example.test");
    uninstallFakeSql();

    const release = calls.find((call) => call.statement.startsWith("update bloom_waitlist set invited_at = null"));
    expect(release?.statement).toContain("invite_token_hash = null");
  });

  test("lists only confirmed, not unsubscribed, not yet invited addresses", async () => {
    const calls = installFakeSql((statement) =>
      statement.startsWith("select email, confirmed_at, source")
        ? [{ email: "a@example.test", confirmed_at: new Date("2026-08-01T10:00:00.000Z"), source: "landing-en" }]
        : [],
    );
    const entries = await listInvitableWaitlist();
    uninstallFakeSql();

    expect(entries).toEqual([{ email: "a@example.test", confirmedAt: "2026-08-01T10:00:00.000Z", source: "landing-en" }]);
    const select = calls.find((call) => call.statement.startsWith("select email, confirmed_at, source"))?.statement ?? "";
    expect(select).toContain("confirmed_at is not null and unsubscribed_at is null and invited_at is null");
  });

  test("unsubscribing works with the token from the old confirmation mail and from the invitation mail", async () => {
    const calls = installFakeSql((statement) => (statement.startsWith("update bloom_waitlist set unsubscribed_at") ? [{ id: "1" }] : []));
    expect(await unsubscribeFromWaitlist("token-from-a-mail")).toBe(true);
    uninstallFakeSql();

    const statement = calls.find((call) => call.statement.startsWith("update bloom_waitlist set unsubscribed_at"))?.statement ?? "";
    expect(statement).toContain("confirm_token_hash = ?");
    expect(statement).toContain("invite_token_hash = ?");
  });

  test("the schema gets the marker columns without touching existing rows", async () => {
    const calls = installFakeSql();
    await countWaitlist();
    uninstallFakeSql();

    const ddl = calls.map((call) => call.statement);
    expect(ddl).toContain("alter table bloom_waitlist add column if not exists invited_at timestamptz");
    expect(ddl).toContain("alter table bloom_waitlist add column if not exists invite_token_hash text");
  });
});

describe("purge", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-12-01T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * day).toISOString();

  test("the retention period is the named 90 days", () => {
    expect(WAITLIST_PURGE_RETENTION_DAYS).toBe(90);
  });

  test("refuses while confirmed addresses have not been invited yet", () => {
    const verdict = evaluateWaitlistPurge({ total: 10, invitable: 8, notInvited: 3, lastInvitedAt: daysAgo(200) }, now);
    expect(verdict).toEqual({ allowed: false, reason: "invitation-pending", allowedFrom: null });
  });

  test("refuses when no invitation was ever sent", () => {
    const verdict = evaluateWaitlistPurge({ total: 4, invitable: 0, notInvited: 0, lastInvitedAt: null }, now);
    expect(verdict).toEqual({ allowed: false, reason: "no-invitation-sent", allowedFrom: null });
  });

  test("refuses before 90 days after the last invitation and names the date", () => {
    const verdict = evaluateWaitlistPurge({ total: 4, invitable: 4, notInvited: 0, lastInvitedAt: daysAgo(89) }, now);
    expect(verdict).toEqual({
      allowed: false,
      reason: "retention-running",
      allowedFrom: new Date(new Date(daysAgo(89)).getTime() + 90 * day).toISOString(),
    });
  });

  test("allows exactly after the 90 days, and an empty table at any time", () => {
    expect(evaluateWaitlistPurge({ total: 4, invitable: 4, notInvited: 0, lastInvitedAt: daysAgo(90) }, now)).toEqual({ allowed: true });
    expect(evaluateWaitlistPurge({ total: 0, invitable: 0, notInvited: 0, lastInvitedAt: null }, now)).toEqual({ allowed: true });
  });

  test("the library refuses to delete inside the retention period — no delete statement runs", async () => {
    const calls = installFakeSql((statement) =>
      statement.includes("max(invited_at)")
        ? [{ total: 3, invitable: 3, not_invited: 0, last_invited_at: new Date(now.getTime() - 10 * day) }]
        : [],
    );
    await expect(purgeWaitlist(now)).rejects.toBeInstanceOf(WaitlistPurgeRefusedError);
    uninstallFakeSql();

    expect(calls.some((call) => call.statement.startsWith("delete from bloom_waitlist"))).toBe(false);
  });

  test("deletes all entries once the period is over and reports how many", async () => {
    const calls = installFakeSql((statement) => {
      if (statement.includes("max(invited_at)")) {
        return [{ total: 2, invitable: 2, not_invited: 0, last_invited_at: new Date(now.getTime() - 91 * day) }];
      }
      if (statement.startsWith("delete from bloom_waitlist")) return [{ id: "1" }, { id: "2" }];
      return [];
    });
    expect(await purgeWaitlist(now)).toBe(2);
    uninstallFakeSql();

    const deletes = calls.filter((call) => call.statement.startsWith("delete from bloom_waitlist"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.statement).not.toContain("where");
  });
});

describe("schema initialization", () => {
  test("serializes DDL behind a database advisory lock", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const rows = [{ pending: 0, confirmed: 0 }];
    const tx = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve(rows);
    }) as unknown as (parts: TemplateStringsArray) => Promise<typeof rows>;
    const sql = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve(rows);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<typeof rows>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => {
      statements.push("BEGIN");
      return fn(tx);
    };

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    await Promise.all([countWaitlist(), countWaitlist()]);
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;

    expect(statements.filter((statement) => statement === "BEGIN")).toHaveLength(1);
    expect(statements).toContain("select pg_advisory_xact_lock(?::bigint)");
    expect(statements.indexOf("select pg_advisory_xact_lock(?::bigint)")).toBeLessThan(
      statements.findIndex((statement) => statement.startsWith("create extension")),
    );
  });
});

describe("waitlist rate limits", () => {
  test("stores attempts in the waitlist database when configured", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    let attempts = 0;
    const tx = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve([]);
    }) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.includes("insert into bloom_waitlist_rate_limits")) {
        attempts += 1;
        return Promise.resolve([{ attempts }]);
      }
      return Promise.resolve([]);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => fn(tx);

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    const first = await consumeWaitlistRateLimit({
      action: "waitlist",
      keyHash: "hashed",
      windowStartedAt: "2026-08-15T00:00:00.000Z",
      limit: 1,
    });
    const second = await consumeWaitlistRateLimit({
      action: "waitlist",
      keyHash: "hashed",
      windowStartedAt: "2026-08-15T00:00:00.000Z",
      limit: 1,
    });
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;

    expect(first).toEqual({ allowed: true, attempts: 1 });
    expect(second).toEqual({ allowed: false, attempts: 2 });
    expect(statements.some((statement) => statement.includes("create table if not exists bloom_waitlist_rate_limits"))).toBe(true);
  });
});
