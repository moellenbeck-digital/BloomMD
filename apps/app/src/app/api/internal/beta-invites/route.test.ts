import { afterEach, describe, expect, test } from "bun:test";
import { POST } from "./route";
import { __setMarketSqlForTest } from "../../../../lib/db";
import type { SqlClient } from "../../../../lib/sql-client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOOMMD_INTERNAL_INVITE_SECRET: process.env.BLOOMMD_INTERNAL_INVITE_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
};

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else setEnvValue(key, value);
  }
}

function betaInviteRow(extra: { should_send_email?: boolean } = {}) {
  return {
    email: "tester@example.test",
    status: "invited",
    source: "waitlist",
    note: null,
    batch_id: null,
    invited_at: "2026-08-15T10:00:00.000Z",
    accepted_at: null,
    expires_at: null,
    revoked_at: null,
    ...(extra.should_send_email == null ? {} : { should_send_email: extra.should_send_email }),
  };
}

function installSql(insertRows: unknown[], selectRows: unknown[] = []) {
  const statements: string[] = [];
  const sql = ((parts: TemplateStringsArray) => {
    const statement = parts.join("?").replace(/\s+/g, " ").trim();
    statements.push(statement);
    if (statement.startsWith("insert into bloom_beta_invites")) return Promise.resolve(insertRows);
    if (statement.startsWith("select email, case when revoked_at")) return Promise.resolve(selectRows);
    return Promise.resolve([]);
  }) as unknown as SqlClient;
  __setMarketSqlForTest(sql);
  return statements;
}

function configureRouteTest() {
  setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "invite-secret");
  setEnvValue("DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
  setEnvValue("NEXT_PUBLIC_APP_URL", "https://bloommd.app");
  setEnvValue("NEXT_PUBLIC_SITE_URL", "https://bloommd.io");
  setEnvValue("NODE_ENV", "test");
  setEnvValue("RESEND_API_KEY", "re_test");
  setEnvValue("RESEND_FROM_EMAIL", "BloomMD Accounts <account@bloommd.app>");
}

function inviteRequest(body: Record<string, unknown>) {
  return new Request("https://bloommd.app/api/internal/beta-invites", {
    method: "POST",
    headers: {
      Authorization: "Bearer invite-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function installMailResponse(status: number) {
  let calls = 0;
  globalThis.fetch = Object.assign(async () => {
    calls += 1;
    return new Response("{}", { status });
  }, { preconnect: originalFetch.preconnect }) as typeof fetch;
  return () => calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  __setMarketSqlForTest(null);
  restoreEnv();
});

describe("internal beta invite API", () => {
  test("sends mail for a newly created invite", async () => {
    configureRouteTest();
    installSql([betaInviteRow({ should_send_email: true })]);
    const mailCalls = installMailResponse(200);

    const response = await POST(inviteRequest({ email: "Tester@Example.test", source: "waitlist" }));
    const body = await response.json() as { invite: { email: string; status: string }; mail: { sent: boolean; reason?: string } };

    expect(response.status).toBe(200);
    expect(body.invite.email).toBe("tester@example.test");
    expect(body.invite.status).toBe("invited");
    expect(body.mail).toEqual({ sent: true });
    expect(mailCalls()).toBe(1);
  });

  test("resends mail for an already active invite when forceSendEmail is true", async () => {
    configureRouteTest();
    installSql([], [betaInviteRow()]);
    const mailCalls = installMailResponse(200);

    const response = await POST(inviteRequest({ email: "tester@example.test", source: "waitlist", forceSendEmail: true }));
    const body = await response.json() as { mail: { sent: boolean; reason?: string } };

    expect(response.status).toBe(200);
    expect(body.mail).toEqual({ sent: true });
    expect(mailCalls()).toBe(1);
  });

  test("does not resend mail for an already active invite without forceSendEmail", async () => {
    configureRouteTest();
    installSql([], [betaInviteRow()]);
    const mailCalls = installMailResponse(200);

    const response = await POST(inviteRequest({ email: "tester@example.test", source: "waitlist" }));
    const body = await response.json() as { mail: { sent: boolean; reason?: string } };

    expect(response.status).toBe(200);
    expect(body.mail).toEqual({ sent: false, reason: "already-invited" });
    expect(mailCalls()).toBe(0);
  });

  test("returns provider errors as visible mail status", async () => {
    configureRouteTest();
    installSql([], [betaInviteRow()]);
    const mailCalls = installMailResponse(500);

    const response = await POST(inviteRequest({ email: "tester@example.test", source: "waitlist", forceSendEmail: true }));
    const body = await response.json() as { mail: { sent: boolean; reason?: string } };

    expect(response.status).toBe(200);
    expect(body.mail).toEqual({ sent: false, reason: "provider-error" });
    expect(mailCalls()).toBe(1);
  });
});
