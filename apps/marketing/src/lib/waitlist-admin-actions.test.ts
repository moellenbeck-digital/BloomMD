import { afterEach, describe, expect, test } from "bun:test";
import {
  deleteWaitlistEntry,
  inviteWaitlistEntry,
  resendWaitlistConfirmation,
} from "./waitlist-admin-actions";
import { __setWaitlistSqlForTest } from "./waitlist-db";
import type { SqlClient } from "./sql-client";

const originalEnv = {
  BLOOMMD_WAITLIST_DATABASE_URL: process.env.BLOOMMD_WAITLIST_DATABASE_URL,
  BLOOMMD_INTERNAL_INVITE_SECRET: process.env.BLOOMMD_INTERNAL_INVITE_SECRET,
};

afterEach(() => {
  __setWaitlistSqlForTest(null);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

function setEnvValue(key: string, value: string | undefined) {
  if (value == null) delete (process.env as Record<string, string | undefined>)[key];
  else (process.env as Record<string, string | undefined>)[key] = value;
}

function installWaitlistRows(rows: Array<{ email: string; confirmed_at: string | null; unsubscribed_at: string | null }>) {
  const tx = (() => Promise.resolve([])) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
  const sql = ((parts: TemplateStringsArray) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    if (statement.startsWith("select email, confirmed_at, unsubscribed_at, created_at")) {
      return Promise.resolve(rows.map((row) => ({
        ...row,
        created_at: "2026-08-15T10:00:00.000Z",
        source: "landing",
      })));
    }
    if (statement.startsWith("update bloom_waitlist set confirm_token_hash")) return Promise.resolve([{ id: "row-1" }]);
    if (statement.startsWith("delete from bloom_waitlist")) return Promise.resolve([{ id: "row-1" }]);
    return Promise.resolve([]);
  }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
    begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
  };
  sql.begin = async (fn) => fn(tx);
  __setWaitlistSqlForTest(sql as unknown as SqlClient);
}

describe("waitlist admin mutation domain", () => {
  test("returns precise validation and configuration failures", async () => {
    expect(await inviteWaitlistEntry("bad-email")).toEqual({ ok: false, error: "invalid-email" });
    expect(await inviteWaitlistEntry("tester@example.test", "unexpected-mode")).toEqual({
      ok: false,
      error: "invalid-mode",
      email: "tester@example.test",
    });

    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", undefined);
    expect(await inviteWaitlistEntry("tester@example.test")).toEqual({
      ok: false,
      error: "waitlist-not-configured",
      email: "tester@example.test",
    });

    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    expect(await inviteWaitlistEntry("tester@example.test")).toEqual({
      ok: false,
      error: "invite-api-not-configured",
      email: "tester@example.test",
    });
    expect(await deleteWaitlistEntry("tester@example.test", "")).toEqual({
      ok: false,
      error: "missing-confirmation",
      email: "tester@example.test",
    });
  });

  test("distinguishes a configured pending entry from an email delivery failure", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    installWaitlistRows([{ email: "pending@example.test", confirmed_at: null, unsubscribed_at: null }]);

    expect(await resendWaitlistConfirmation("PENDING@example.test")).toEqual({
      ok: false,
      error: "email-send-failed",
      email: "pending@example.test",
    });
  });

  test("deletes any existing entry after explicit confirmation", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    installWaitlistRows([
      { email: "pending@example.test", confirmed_at: null, unsubscribed_at: null },
      { email: "confirmed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: null },
    ]);

    expect(await deleteWaitlistEntry("pending@example.test", "delete")).toEqual({
      ok: true,
      action: "delete",
      email: "pending@example.test",
    });
    expect(await deleteWaitlistEntry("confirmed@example.test", "delete")).toEqual({
      ok: true,
      action: "delete",
      email: "confirmed@example.test",
    });
  });

  test("reports when an entry no longer exists", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    installWaitlistRows([]);

    expect(await deleteWaitlistEntry("missing@example.test", "delete")).toEqual({
      ok: false,
      error: "not-found",
      email: "missing@example.test",
    });
  });
});
