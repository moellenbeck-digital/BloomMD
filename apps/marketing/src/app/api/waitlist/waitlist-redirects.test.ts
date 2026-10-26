import { afterEach, describe, expect, test } from "bun:test";
import { GET as confirmWaitlist, POST as postConfirm } from "./confirm/route";
import { POST as postWaitlist } from "./route";
import { GET as unsubscribeWaitlist } from "./unsubscribe/route";
import { __setWaitlistSqlForTest } from "../../../lib/waitlist-db";
import type { SqlClient } from "../../../lib/sql-client";

const originalMarketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.BLOOMMD_WAITLIST_DATABASE_URL;

function setEnvValue(key: string, value: string) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

function deleteEnvValue(key: string) {
  delete (process.env as Record<string, string | undefined>)[key];
}

function restore(key: string, value: string | undefined) {
  if (value == null) deleteEnvValue(key);
  else setEnvValue(key, value);
}

afterEach(() => {
  restore("NEXT_PUBLIC_MARKETING_URL", originalMarketingUrl);
  restore("NEXT_PUBLIC_SITE_URL", originalSiteUrl);
  restore("NEXT_PUBLIC_APP_URL", originalAppUrl);
  restore("NODE_ENV", originalNodeEnv);
  restore("BLOOMMD_WAITLIST_DATABASE_URL", originalDatabaseUrl);
  __setWaitlistSqlForTest(null);
});

/** A database that fails the test on any statement: the closed waitlist must not touch it. */
function installForbiddenDatabase() {
  setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
  const statements: string[] = [];
  const record = (parts: TemplateStringsArray) => {
    statements.push(parts.join("?").replace(/\s+/g, " ").trim());
    return Promise.resolve([]);
  };
  const sql = Object.assign(record, { begin: async (fn: (tx: typeof record) => Promise<unknown>) => fn(record) });
  __setWaitlistSqlForTest(sql as unknown as SqlClient);
  return statements;
}

describe("closed waitlist: old confirmation links and signups", () => {
  test("a confirmation link redirects permanently to the registration and confirms nothing", async () => {
    // Install first: the test hook is a no-op once NODE_ENV is "production".
    const statements = installForbiddenDatabase();
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://bloommd.app";

    const response = await confirmWaitlist(new Request("https://bloommd.io/api/waitlist/confirm?token=abc"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://bloommd.app/signup");
    expect(statements).toEqual([]);
  });

  test("the language of the link is kept", async () => {
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "https://bloommd.app";

    const response = await confirmWaitlist(new Request("https://bloommd.io/api/waitlist/confirm?token=abc&lang=en"));

    expect(response.headers.get("location")).toBe("https://bloommd.app/signup?lang=en");
  });

  test("the redirect does not point to localhost from production when runtime env is stale", async () => {
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3210";

    const response = await confirmWaitlist(new Request("http://localhost:3000/api/waitlist/confirm?token=abc"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://bloommd.app/signup");
  });

  test("POST to confirm and POST to the signup endpoint answer 410 and write nothing", async () => {
    const statements = installForbiddenDatabase();

    const confirm = await postConfirm();
    const signup = await postWaitlist();

    expect(confirm.status).toBe(410);
    expect(signup.status).toBe(410);
    expect(((await signup.json()) as { signup: string }).signup).toContain("/signup");
    expect(statements).toEqual([]);
  });
});

describe("waitlist unsubscribe stays reachable", () => {
  test("an unknown token ends on the unsubscribe page, not on a redirect to the registration", async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await unsubscribeWaitlist(new Request("http://localhost:3000/api/waitlist/unsubscribe?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/abgemeldet?status=ungueltig");
  });

  test("a valid token unsubscribes and lands on the confirmation page", async () => {
    setEnvValue("BLOOMMD_WAITLIST_DATABASE_URL", "postgresql://test:test@localhost:5432/test?sslmode=require");
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    const record = (parts: TemplateStringsArray) =>
      Promise.resolve(parts.join("?").includes("set unsubscribed_at") ? [{ id: "1" }] : []);
    const sql = Object.assign(record, { begin: async (fn: (tx: typeof record) => Promise<unknown>) => fn(record) });
    __setWaitlistSqlForTest(sql as unknown as SqlClient);

    const response = await unsubscribeWaitlist(new Request("https://bloommd.io/api/waitlist/unsubscribe?token=valid&lang=en"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/abgemeldet?lang=en");
  });

  test("unsubscribe redirects to the configured marketing origin, not the request origin", async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = "https://bloommd.io";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await unsubscribeWaitlist(new Request("http://localhost:3000/api/waitlist/unsubscribe?token=invalid"));

    expect(new URL(response.headers.get("location") ?? "").origin).toBe("https://bloommd.io");
  });

  test("unsubscribe does not redirect to localhost from production when runtime env is stale", async () => {
    setEnvValue("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_MARKETING_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const response = await unsubscribeWaitlist(new Request("http://localhost:3000/api/waitlist/unsubscribe?token=invalid"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://bloommd.io/waitlist/abgemeldet?status=ungueltig");
  });
});
