import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { __setMarketSqlForTest } from "./db";
import { accountMailLimits, assertAccountMailBudget, MailBudgetError, resetMailBudgetForTests } from "./mail-budget";
import type { SqlClient } from "./sql-client";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  delete mutableEnv.DATABASE_URL;
  delete mutableEnv.BLOOMMD_MAIL_DAILY_LIMIT;
  delete mutableEnv.BLOOMMD_MAIL_HOURLY_LIMIT;
  resetMailBudgetForTests();
});

afterEach(() => {
  if (originalDatabaseUrl == null) delete mutableEnv.DATABASE_URL;
  else mutableEnv.DATABASE_URL = originalDatabaseUrl;
  delete mutableEnv.BLOOMMD_MAIL_DAILY_LIMIT;
  delete mutableEnv.BLOOMMD_MAIL_HOURLY_LIMIT;
  __setMarketSqlForTest(null);
});

const HOUR = 60 * 60 * 1000;
const NOON = Date.UTC(2026, 9, 29, 12, 0, 0);

describe("account mail limits", () => {
  test("default to 60 per hour and 300 per day", () => {
    expect(accountMailLimits({})).toEqual({ hourly: 60, daily: 300 });
  });

  test("read the configuration and fall back to the default for invalid values", () => {
    expect(accountMailLimits({ BLOOMMD_MAIL_DAILY_LIMIT: "500", BLOOMMD_MAIL_HOURLY_LIMIT: " 20 " })).toEqual({ hourly: 20, daily: 500 });
    for (const invalid of ["0", "-1", "abc", "1.5", ""]) {
      expect(accountMailLimits({ BLOOMMD_MAIL_DAILY_LIMIT: invalid, BLOOMMD_MAIL_HOURLY_LIMIT: invalid })).toEqual({ hourly: 60, daily: 300 });
    }
  });
});

describe("account mail budget in memory (no database)", () => {
  test("refuses the mail over the hourly limit and logs one alert", async () => {
    mutableEnv.BLOOMMD_MAIL_HOURLY_LIMIT = "2";
    const alert = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertAccountMailBudget("verification", NOON);
      await assertAccountMailBudget("password-reset", NOON);
      const error = await assertAccountMailBudget("verification", NOON + 1000).catch((e) => e);
      expect(error).toBeInstanceOf(MailBudgetError);
      expect(error).toMatchObject({ scope: "hour", retryAfterSeconds: HOUR / 1000 - 1 });
      await assertAccountMailBudget("verification", NOON + 2000).catch(() => undefined);

      expect(alert).toHaveBeenCalledTimes(1);
      const message = String(alert.mock.calls[0]?.[0]);
      expect(message).toContain("[BloomMD][ALERT]");
      expect(message).toContain("BLOOMMD_MAIL_HOURLY_LIMIT");
    } finally {
      alert.mockRestore();
    }
  });

  test("the next hour has a fresh hourly budget, the day does not", async () => {
    mutableEnv.BLOOMMD_MAIL_HOURLY_LIMIT = "1";
    mutableEnv.BLOOMMD_MAIL_DAILY_LIMIT = "2";
    const alert = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertAccountMailBudget("verification", NOON);
      await expect(assertAccountMailBudget("verification", NOON + 1)).rejects.toBeInstanceOf(MailBudgetError);
      await assertAccountMailBudget("verification", NOON + HOUR);
      await expect(assertAccountMailBudget("verification", NOON + 2 * HOUR)).rejects.toMatchObject({ scope: "day" });
      // A refused attempt does not use up budget of the other window.
      await expect(assertAccountMailBudget("verification", NOON + 25 * HOUR)).resolves.toBeUndefined();
    } finally {
      alert.mockRestore();
    }
  });
});

describe("account mail budget in the database", () => {
  function fakeDatabase() {
    const rows = new Map<string, number>();
    const statements: string[] = [];
    let snapshot = new Map<string, number>();
    const run = (parts: TemplateStringsArray, values: unknown[]) => {
      const statement = parts.join("?").replace(/\s+/g, " ").trim();
      statements.push(statement);
      if (statement.startsWith("insert into bloom_mail_budget")) {
        const [scope, windowStartedAt, limit] = values as [string, string, number];
        const key = `${scope}|${windowStartedAt}`;
        const sent = rows.get(key) ?? 0;
        if (sent >= limit) return Promise.resolve([]);
        rows.set(key, sent + 1);
        return Promise.resolve([{ sent: sent + 1 }]);
      }
      return Promise.resolve([]);
    };
    const sql = ((parts: TemplateStringsArray, ...values: unknown[]) => run(parts, values)) as unknown as SqlClient & {
      begin: (callback: (transaction: SqlClient) => Promise<unknown>) => Promise<unknown>;
    };
    (sql as unknown as { begin: unknown }).begin = async (callback: (transaction: SqlClient) => Promise<unknown>) => {
      snapshot = new Map(rows);
      try {
        return await callback(sql);
      } catch (error) {
        rows.clear();
        for (const [key, value] of snapshot) rows.set(key, value);
        throw error;
      }
    };
    return { sql, rows, statements };
  }

  test("counts in the database, refuses at the limit and rolls back the hourly bump when the day is full", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    mutableEnv.BLOOMMD_MAIL_HOURLY_LIMIT = "5";
    mutableEnv.BLOOMMD_MAIL_DAILY_LIMIT = "2";
    const { sql, rows } = fakeDatabase();
    __setMarketSqlForTest(sql);
    const alert = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await assertAccountMailBudget("verification", NOON);
      await assertAccountMailBudget("password-reset", NOON);
      const hourKey = [...rows.keys()].find((key) => key.startsWith("hour|"))!;
      expect(rows.get(hourKey)).toBe(2);

      await expect(assertAccountMailBudget("verification", NOON)).rejects.toMatchObject({ scope: "day" });
      expect(rows.get(hourKey)).toBe(2);
      expect(alert).toHaveBeenCalledTimes(1);
    } finally {
      alert.mockRestore();
    }
  });
});
