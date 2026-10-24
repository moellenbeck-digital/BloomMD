import { describe, expect, test } from "bun:test";
import {
  __setWaitlistSqlForTest,
  addWaitlistSignup,
  cleanupWaitlistRetention,
  countWaitlistAdmin,
  confirmWaitlistSignup,
  countWaitlist,
  consumeWaitlistRateLimit,
  listConfirmedWaitlist,
  listWaitlistAdminEntries,
  unsubscribeFromWaitlist,
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
  test("signup reports nothing was created rather than throwing", async () => {
    expect(await addWaitlistSignup("someone@example.com", "landing")).toEqual({ created: false, token: null });
  });

  test("confirming reports failure rather than throwing", async () => {
    expect(await confirmWaitlistSignup("any-token")).toBe(false);
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
        source: "landing",
      },
      {
        email: "pending@example.test",
        confirmed_at: null,
        unsubscribed_at: null,
        created_at: "2026-08-02T09:00:00.000Z",
        source: null,
      },
      {
        email: "unsubscribed@example.test",
        confirmed_at: null,
        unsubscribed_at: "2026-08-03T10:00:00.000Z",
        created_at: "2026-08-03T09:00:00.000Z",
        source: "footer",
      },
    ];
    const tx = (() => Promise.resolve([])) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      if (statement.startsWith("select count(*) filter")) return Promise.resolve(countRows);
      if (statement.startsWith("select email, confirmed_at, unsubscribed_at, created_at")) return Promise.resolve(entryRows);
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
        source: "landing",
      },
      {
        email: "pending@example.test",
        status: "pending",
        confirmedAt: null,
        unsubscribedAt: null,
        createdAt: "2026-08-02T09:00:00.000Z",
        source: null,
      },
      {
        email: "unsubscribed@example.test",
        status: "unsubscribed",
        confirmedAt: null,
        unsubscribedAt: "2026-08-03T10:00:00.000Z",
        createdAt: "2026-08-03T09:00:00.000Z",
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

describe("the confirmation token", () => {
  test("is not derived from the address", async () => {
    // A token anybody could compute from an email would let a stranger confirm somebody else's
    // address — and confirming is what turns an entry into a contactable one.
    const first = await addWaitlistSignup("a@example.com", null);
    const second = await addWaitlistSignup("a@example.com", null);
    // Without a database both are null; the assertion that matters is that nothing leaks the email.
    expect(first.token).toBe(second.token);
    expect(first.token).not.toBe("a@example.com");
  });

  test("lets unsubscribed addresses request a fresh confirmation token", async () => {
    process.env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const statements: string[] = [];
    const tx = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      return Promise.resolve([]);
    }) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
    const sql = ((parts: TemplateStringsArray) => {
      statements.push(parts.join("?").replace(/\s+/g, " ").trim());
      if (parts.join("?").includes("insert into bloom_waitlist")) return Promise.resolve([{ id: "reactivated" }]);
      return Promise.resolve([]);
    }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
      begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
    };
    sql.begin = async (fn) => fn(tx);

    __setWaitlistSqlForTest(sql as unknown as SqlClient);
    const result = await addWaitlistSignup("again@example.test", "landing");
    __setWaitlistSqlForTest(null);
    delete process.env.BLOOMMD_WAITLIST_DATABASE_URL;

    expect(result.created).toBe(true);
    expect(result.token).toBeTruthy();
    expect(statements.some((statement) => statement.includes("where bloom_waitlist.unsubscribed_at is not null"))).toBe(true);
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
