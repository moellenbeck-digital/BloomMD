import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { __setMarketSqlForTest, adminGrantTrialException, adminReleaseTrialGuard, adminSetTrialEnd, ensureMarketSchema, hasConfirmedMailboxTwin, migrateMarketSchema } from "./db";
import type { SqlClient } from "./sql-client";
import { trialExceptionKey } from "./trial-admin";

/**
 * The operator command of the trial (#277) against a recording SQL client: what is written, in which
 * transaction, and what the audit event holds. The real database behaviour (index, race, reminders)
 * is in tests/integration/trial-admin-db.integration.test.ts.
 */

const originalDatabaseUrl = process.env.DATABASE_URL;
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-01T10:00:00.000Z");
const normalize = (text: string) => text.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();

interface Recorded {
  statement: string;
  values: unknown[];
  transaction: boolean;
}

async function recordingSql(answers: (statement: string) => unknown[] | undefined) {
  const recorded: Recorded[] = [];
  let inTransaction = false;
  const sql = ((parts: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    // `tx(kinds)` (a list helper) is called without a template.
    if (!Array.isArray(parts) || !("raw" in parts)) return { list: parts };
    const statement = normalize(parts.join("?"));
    recorded.push({ statement, values, transaction: inTransaction });
    return Promise.resolve(answers(statement) ?? []);
  }) as unknown as SqlClient & { json: (value: unknown) => unknown; begin: <T>(fn: (tx: SqlClient) => Promise<T>) => Promise<T> };
  sql.json = (value) => ({ json: value });
  sql.begin = async (fn) => {
    inTransaction = true;
    try {
      return await fn(sql);
    } finally {
      inTransaction = false;
    }
  };
  __setMarketSqlForTest(sql);
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
  // The first call migrates; start recording after that.
  await ensureMarketSchema();
  recorded.length = 0;
  return recorded;
}

const writes = (recorded: Recorded[]) => recorded.filter((entry) => /^(insert|update|delete)/.test(entry.statement));
const audit = (recorded: Recorded[]) => recorded.find((entry) => entry.statement.startsWith("insert into bloom_audit_events"));

afterEach(() => {
  if (originalDatabaseUrl == null) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  __setMarketSqlForTest(null);
});

describe("db:trial-admin: extension", () => {
  const answers = (statement: string) => {
    if (statement.startsWith("select trial_ends_at from bloom_users")) return [{ trial_ends_at: new Date(now.getTime() + 5 * DAY) }];
    if (statement.startsWith("select count(*)")) return [{ n: 2 }];
    return undefined;
  };

  test("a dry run reads and writes nothing", async () => {
    const recorded = await recordingSql(answers);
    const outcome = await adminSetTrialEnd({ operator: "max", accountId: ACCOUNT, extendDays: 30, now, apply: false });

    expect(outcome).toMatchObject({ event: "trial.extended", accountId: ACCOUNT, field: "trial_ends_at", applied: false, remindersReset: 2 });
    expect(outcome?.oldValue).toBe(new Date(now.getTime() + 5 * DAY).toISOString());
    expect(outcome?.newValue).toBe(new Date(now.getTime() + 35 * DAY).toISOString());
    expect(writes(recorded)).toEqual([]);
  });

  test("apply sets the end, gives the reminders back and logs old and new value with the operator, all in one transaction", async () => {
    const recorded = await recordingSql(answers);
    const outcome = await adminSetTrialEnd({ operator: "max", accountId: ACCOUNT, extendDays: 30, now, apply: true });

    expect(outcome?.applied).toBe(true);
    const written = writes(recorded);
    expect(written.map((entry) => entry.statement.split(" ").slice(0, 3).join(" "))).toEqual(["update bloom_users set", "delete from bloom_trial_reminders", "insert into bloom_audit_events"]);
    expect(written.every((entry) => entry.transaction)).toBe(true);
    expect(recorded[0]!.statement).toContain("for update");

    const event = audit(recorded)!;
    // actor user, actor agent, event type, target type, target id, details
    expect(event.values.slice(0, 5)).toEqual([null, null, "trial.extended", "account", ACCOUNT]);
    expect(event.values[5]).toEqual({
      json: { operator: "max", field: "trial_ends_at", old: new Date(now.getTime() + 5 * DAY).toISOString(), new: new Date(now.getTime() + 35 * DAY).toISOString(), remindersReset: "2" },
    });
  });

  test("an unknown account and an end that is no extension write nothing", async () => {
    let recorded = await recordingSql(() => []);
    expect(await adminSetTrialEnd({ operator: "max", accountId: ACCOUNT, extendDays: 30, now, apply: true })).toBeNull();
    expect(writes(recorded)).toEqual([]);

    recorded = await recordingSql(answers);
    await expect(adminSetTrialEnd({ operator: "max", accountId: ACCOUNT, endsAt: new Date(now.getTime() + DAY), now, apply: true })).rejects.toThrow("after the current one");
    expect(writes(recorded)).toEqual([]);
  });
});

describe("db:trial-admin: release of the mailbox rule", () => {
  test("a guarded account is released and logged; an already released one is left alone, without a log line", async () => {
    let recorded = await recordingSql((statement) => (statement.startsWith("select trial_guarded") ? [{ trial_guarded: true }] : undefined));
    const outcome = await adminReleaseTrialGuard({ operator: "max", accountId: ACCOUNT, apply: true });
    expect(outcome).toMatchObject({ event: "trial.guard_released", changed: true, applied: true, oldValue: "true", newValue: "false" });
    expect(writes(recorded).map((entry) => entry.statement.split(" ").slice(0, 3).join(" "))).toEqual(["update bloom_users set", "insert into bloom_audit_events"]);
    expect(audit(recorded)!.values.slice(0, 5)).toEqual([null, null, "trial.guard_released", "account", ACCOUNT]);
    expect(audit(recorded)!.values[5]).toEqual({ json: { operator: "max", field: "trial_guarded", old: "true", new: "false" } });

    recorded = await recordingSql((statement) => (statement.startsWith("select trial_guarded") ? [{ trial_guarded: false }] : undefined));
    expect(await adminReleaseTrialGuard({ operator: "max", accountId: ACCOUNT, apply: true })).toMatchObject({ changed: false, applied: false });
    expect(writes(recorded)).toEqual([]);

    recorded = await recordingSql((statement) => (statement.startsWith("select trial_guarded") ? [{ trial_guarded: true }] : undefined));
    expect(await adminReleaseTrialGuard({ operator: "max", accountId: ACCOUNT, apply: false })).toMatchObject({ changed: true, applied: false });
    expect(writes(recorded)).toEqual([]);
  });
});

describe("db:trial-admin: exception for an address", () => {
  const address = "person+b@example.test";

  test("stores the key of the address, never the address, and logs the account id when the account exists", async () => {
    const recorded = await recordingSql((statement) => (statement.startsWith("select id from bloom_users") ? [{ id: ACCOUNT }] : undefined));
    const outcome = await adminGrantTrialException({ operator: "max", address, validDays: 14, now, apply: true });

    expect(outcome).toMatchObject({ event: "trial.exception_granted", accountId: ACCOUNT, oldValue: "none", newValue: new Date(now.getTime() + 14 * DAY).toISOString(), applied: true });
    const key = trialExceptionKey(address);
    const insert = recorded.find((entry) => entry.statement.startsWith("insert into bloom_trial_exceptions"))!;
    expect(insert.values[0]).toBe(key);
    expect(insert.values[1]).toBe("max");
    expect(audit(recorded)!.values.slice(0, 5)).toEqual([null, null, "trial.exception_granted", "account", ACCOUNT]);
    expect(audit(recorded)!.values[5]).toEqual({ json: { operator: "max", field: "exception_valid_until", old: "none", new: outcome.newValue, key: key.slice(0, 12) } });
    // Nothing that is written carries the address (only the lookup of the account does).
    expect(JSON.stringify(writes(recorded).map((entry) => [entry.statement, entry.values]))).not.toContain("example.test");
    expect(writes(recorded).every((entry) => entry.transaction)).toBe(true);
  });

  test("without an account the event targets the exception only; a dry run writes nothing", async () => {
    let recorded = await recordingSql(() => undefined);
    await adminGrantTrialException({ operator: "max", address, validDays: 14, now, apply: true });
    expect(audit(recorded)!.values.slice(0, 5)).toEqual([null, null, "trial.exception_granted", "trial_exception", null]);

    recorded = await recordingSql(() => undefined);
    expect(await adminGrantTrialException({ operator: "max", address, validDays: 14, now, apply: false })).toMatchObject({ applied: false });
    expect(writes(recorded)).toEqual([]);
  });
});

describe("the mailbox rule with an exception", () => {
  test("sign-up looks for a twin only when the address has no valid exception", async () => {
    const recorded = await recordingSql(() => []);
    await hasConfirmedMailboxTwin("Person+B@Example.test");
    const lookup = recorded.find((entry) => entry.statement.includes("from bloom_users"))!;
    expect(lookup.statement).toContain("not exists (select 1 from bloom_trial_exceptions x where x.email_hash = ? and x.expires_at > now())");
    expect(lookup.values).toContain(trialExceptionKey("person+b@example.test"));
  });

  test("the migration file and the schema db:migrate applies create the same exceptions table (#277)", async () => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test?sslmode=require";
    const file = readFileSync(join(import.meta.dir, "../../db/016_trial_exceptions.sql"), "utf8");
    const expected = file.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").split(";").map(normalize).filter(Boolean);
    const statements: string[] = [];
    const sql = ((parts: TemplateStringsArray) => {
      statements.push(normalize(parts.join("?")));
      return Promise.resolve([]);
    }) as unknown as SqlClient;
    __setMarketSqlForTest(sql);
    await migrateMarketSchema();
    expect(expected.length).toBe(1);
    expect(statements).toContain(expected[0]!);
    expect(expected[0]).toContain("email_hash text primary key");
  });
});
