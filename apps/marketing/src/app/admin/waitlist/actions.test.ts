import { afterEach, describe, expect, test } from "bun:test";
import { POST as deleteEntry } from "./delete/route";
import { POST as resendConfirmation } from "./resend-confirmation/route";
import { __setWaitlistSqlForTest } from "../../../lib/waitlist-db";
import type { SqlClient } from "../../../lib/sql-client";

const originalEnv = {
  BLOOMMD_WAITLIST_DATABASE_URL: process.env.BLOOMMD_WAITLIST_DATABASE_URL,
};

afterEach(() => {
  __setWaitlistSqlForTest(null);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function formRequest(path: string, form: Record<string, string>, origin = "https://bloommd.io") {
  return new Request(`https://bloommd.io${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
}

function redirectParams(response: Response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("Missing redirect location.");
  return new URL(location).searchParams;
}

function installWaitlistRows(rows: Array<{
  email: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}>) {
  const statements: string[] = [];
  const tx = (() => Promise.resolve([])) as unknown as (parts: TemplateStringsArray) => Promise<unknown[]>;
  const sql = ((parts: TemplateStringsArray) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    statements.push(statement);
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
  return statements;
}

describe("waitlist admin resend and delete routes", () => {
  test("rejects cross-origin posts before mutating waitlist data", async () => {
    const response = await resendConfirmation(formRequest(
      "/admin/waitlist/resend-confirmation",
      { email: "pending@example.test" },
      "https://attacker.example",
    ));

    expect(response.status).toBe(303);
    expect(redirectParams(response).get("resendError")).toBe("invalid-origin");
  });

  test("resends confirmation only for pending entries", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    const statements = installWaitlistRows([{ email: "pending@example.test", confirmed_at: null, unsubscribed_at: null }]);

    const response = await resendConfirmation(formRequest("/admin/waitlist/resend-confirmation", { email: "pending@example.test" }));

    expect(response.status).toBe(303);
    expect(redirectParams(response).get("resendError")).toBe("email-send-failed");
    expect(statements.some((statement) => statement.includes("confirmed_at is null") && statement.includes("unsubscribed_at is null"))).toBe(true);
  });

  test("does not resend confirmation for confirmed entries", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    installWaitlistRows([{ email: "confirmed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: null }]);

    const response = await resendConfirmation(formRequest("/admin/waitlist/resend-confirmation", { email: "confirmed@example.test" }));

    expect(redirectParams(response).get("resendError")).toBe("not-pending");
    expect(redirectParams(response).get("actionEmail")).toBe("confirmed@example.test");
  });

  test("deletes any waitlist entry and requires explicit confirmation", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    const statements = installWaitlistRows([{
      email: "pending@example.test",
      confirmed_at: null,
      unsubscribed_at: null,
    }]);

    const missingConfirmation = await deleteEntry(formRequest("/admin/waitlist/delete", { email: "pending@example.test" }));
    expect(redirectParams(missingConfirmation).get("deleteError")).toBe("missing-confirmation");
    expect(redirectParams(missingConfirmation).get("actionEmail")).toBe("pending@example.test");

    const response = await deleteEntry(formRequest("/admin/waitlist/delete", { email: "pending@example.test", confirm: "delete" }));
    expect(response.status).toBe(303);
    expect(redirectParams(response).get("deleted")).toBe("pending@example.test");
    expect(statements.some((statement) => statement.startsWith("delete from bloom_waitlist"))).toBe(true);
    expect(statements.some((statement) => statement.includes("unsubscribed_at is not null"))).toBe(false);
  });
});
