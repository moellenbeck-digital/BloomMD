import { afterEach, describe, expect, test } from "bun:test";
import { POST } from "./route";
import { __setWaitlistSqlForTest } from "../../../../lib/waitlist-db";
import type { SqlClient } from "../../../../lib/sql-client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOOMMD_APP_INTERNAL_URL: process.env.BLOOMMD_APP_INTERNAL_URL,
  BLOOMMD_INTERNAL_INVITE_SECRET: process.env.BLOOMMD_INTERNAL_INVITE_SECRET,
  BLOOMMD_WAITLIST_DATABASE_URL: process.env.BLOOMMD_WAITLIST_DATABASE_URL,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  __setWaitlistSqlForTest(null);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
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
    return Promise.resolve([]);
  }) as unknown as ((parts: TemplateStringsArray) => Promise<unknown[]>) & {
    begin: (fn: (scopedSql: typeof tx) => Promise<unknown>) => Promise<unknown>;
  };
  sql.begin = async (fn) => fn(tx);
  __setWaitlistSqlForTest(sql as unknown as SqlClient);
}

function inviteRequest(email: string, origin = "https://bloommd.io") {
  return new Request("https://bloommd.io/admin/waitlist/invite", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ email }).toString(),
  });
}

function resendInviteRequest(email: string) {
  return new Request("https://bloommd.io/admin/waitlist/invite", {
    method: "POST",
    headers: {
      Origin: "https://bloommd.io",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ email, mode: "resend" }).toString(),
  });
}

function redirectParams(response: Response) {
  const location = response.headers.get("location");
  if (!location) throw new Error("Missing redirect location.");
  return new URL(location).searchParams;
}

describe("waitlist admin invite route", () => {
  test("invites confirmed waitlist entries through the internal app API", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    setEnvValue("BLOOMMD_APP_INTERNAL_URL", "https://internal.bloommd.app");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    installWaitlistRows([{ email: "confirmed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: null }]);

    let requestedBody: unknown;
    globalThis.fetch = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestedBody = JSON.parse(String(init?.body));
      return Response.json({ invite: { email: "confirmed@example.test", status: "invited" }, mail: { sent: true } });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    const response = await POST(inviteRequest("CONFIRMED@example.test"));

    expect(response.status).toBe(303);
    expect(redirectParams(response).get("invited")).toBe("confirmed@example.test");
    expect(redirectParams(response).get("inviteMail")).toBe("sent");
    expect(requestedBody).toEqual({ email: "confirmed@example.test", source: "waitlist", sendEmail: true, lang: "de" });
  });

  test("resends active beta invitations through the internal app API", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    setEnvValue("BLOOMMD_APP_INTERNAL_URL", "https://internal.bloommd.app");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    installWaitlistRows([{ email: "confirmed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: null }]);

    let requestedBody: unknown;
    globalThis.fetch = Object.assign(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requestedBody = JSON.parse(String(init?.body));
      return Response.json({ invite: { email: "confirmed@example.test", status: "invited" }, mail: { sent: false, reason: "provider-error" } });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    const response = await POST(resendInviteRequest("confirmed@example.test"));

    expect(response.status).toBe(303);
    expect(redirectParams(response).get("invited")).toBe("confirmed@example.test");
    expect(redirectParams(response).get("inviteMail")).toBe("provider-error");
    expect(requestedBody).toEqual({ email: "confirmed@example.test", source: "waitlist", sendEmail: true, forceSendEmail: true, lang: "de" });
  });

  test("refuses pending and unsubscribed waitlist entries", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    setEnvValue("BLOOMMD_APP_INTERNAL_URL", "https://internal.bloommd.app");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    installWaitlistRows([
      { email: "pending@example.test", confirmed_at: null, unsubscribed_at: null },
      { email: "unsubscribed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: "2026-08-15T11:00:00.000Z" },
    ]);

    let fetchCalls = 0;
    globalThis.fetch = Object.assign(async () => {
      fetchCalls += 1;
      return Response.json({ ok: true });
    }, { preconnect: originalFetch.preconnect }) as typeof fetch;

    const pendingResponse = await POST(inviteRequest("pending@example.test"));
    const unsubscribedResponse = await POST(inviteRequest("unsubscribed@example.test"));

    expect(redirectParams(pendingResponse).get("inviteError")).toBe("not-confirmed");
    expect(redirectParams(pendingResponse).get("actionEmail")).toBe("pending@example.test");
    expect(redirectParams(unsubscribedResponse).get("inviteError")).toBe("not-confirmed");
    expect(redirectParams(unsubscribedResponse).get("actionEmail")).toBe("unsubscribed@example.test");
    expect(fetchCalls).toBe(0);
  });

  test("rejects cross-origin invite posts before reading waitlist data", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    setEnvValue("BLOOMMD_INTERNAL_INVITE_SECRET", "secret-123");
    installWaitlistRows([{ email: "confirmed@example.test", confirmed_at: "2026-08-15T10:00:00.000Z", unsubscribed_at: null }]);

    const response = await POST(inviteRequest("confirmed@example.test", "https://attacker.example"));

    expect(response.status).toBe(303);
    expect(redirectParams(response).get("inviteError")).toBe("invalid-origin");
  });
});
