import { expect, test, type Page } from "@playwright/test";
import { createSqlClient } from "../src/lib/sql-client";
import { latestLink } from "./fixtures/mail-outbox";

/**
 * Read-only mode after the trial and its exception for accounts with an active plan (#274, #378).
 * Real database and auth, BLOOMMD_TRIAL_READONLY=1, no bypass. Run with `bun run test:e2e:trial-readonly`;
 * see playwright.trial-readonly.config.ts. Not part of the CI job `full-e2e` (it has no database).
 *
 * Both accounts are registered and confirmed for real; the trial end (in the past) and the plan
 * (`bloom_entitlements` row) are set per SQL, which stands in for what the billing ticket will write.
 */

const PASSWORD = "Testpass12345";
const ORIGIN = process.env.PLAYWRIGHT_TRIAL_READONLY_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_TRIAL_READONLY_PORT ?? "3512"}`;
const DATABASE_URL = process.env.PLAYWRIGHT_TRIAL_READONLY_DATABASE_URL ?? process.env.DATABASE_URL;
const DAY = 24 * 60 * 60 * 1000;

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let counter = 0;
const uniqueEmail = (label: string) => `e2e-trial-${label}-${runId}-${(counter += 1)}@bloommd.local`;

/** A client address nobody else uses, so rate limits of earlier runs never interfere. */
function uniqueAddress() {
  const hextet = () => Math.floor(Math.random() * 0xffff).toString(16);
  return `2001:db8:${hextet()}:${hextet()}::${hextet()}`;
}

async function withDatabase<T>(work: (sql: ReturnType<typeof createSqlClient>) => Promise<T>): Promise<T> {
  if (!DATABASE_URL) throw new Error("PLAYWRIGHT_TRIAL_READONLY_DATABASE_URL (or DATABASE_URL) is required.");
  const sql = createSqlClient(DATABASE_URL);
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
}

/** Registers, confirms and signs in a new account; the page's request context then carries the session. */
async function signedInAccount(page: Page, label: string) {
  const email = uniqueEmail(label);
  const address = uniqueAddress();
  const headers = { Origin: ORIGIN, "X-Forwarded-For": address };

  const signup = await page.request.post("/api/auth/signup", {
    headers,
    form: { name: "Trial E2E", email, password: PASSWORD, next: "/app", website: "", formStartedAt: String(Date.now() - 2_000), acceptTerms: "1" },
    maxRedirects: 0,
  });
  expect(signup.status()).toBe(303);
  await expect.poll(() => latestLink(email, "/api/auth/verify-email")).not.toBeNull();
  await page.request.get(latestLink(email, "/api/auth/verify-email")!, { headers: { "X-Forwarded-For": address } });

  const login = await page.request.post("/api/auth/login", { headers, form: { email, password: PASSWORD, next: "/app" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
  expect(decodeURIComponent(login.headers().location ?? "")).toContain("/app");
  return { email, headers };
}

/** The trial of the account ended a day ago, as if the 30 days had passed. */
async function endTrial(email: string) {
  await withDatabase(async (sql) => {
    const rows = await sql`update bloom_users set trial_ends_at = ${new Date(Date.now() - DAY).toISOString()} where email = ${email} returning id`;
    expect(rows).toHaveLength(1);
  });
}

/** An active plan, as `recordStripeSubscription` writes it: `expires_at` is the end of the period. */
async function givePlan(email: string, expiresAt: Date | null) {
  await withDatabase(async (sql) => {
    await sql`
      insert into bloom_entitlements (user_id, feature, source, active, expires_at)
      select id, 'cloud', ${`sub_e2e_${runId}`}, true, ${expiresAt ? expiresAt.toISOString() : null} from bloom_users where email = ${email}
    `;
  });
}

const createTeamWorkspace = (page: Page, headers: Record<string, string>, name: string) =>
  page.request.post("/api/workspaces", { headers: { ...headers, "Content-Type": "application/json" }, data: { name } });

// The global mail budget lives in the database and outlasts a run (see open-signup.spec.ts): start with a fresh one.
test.beforeAll(() => withDatabase(async (sql) => { await sql`delete from bloom_mail_budget`; }));

test.describe("read-only mode after the trial, with and without a plan @t378", () => {
  test("expired trial without a plan: writing is refused with TRIAL_EXPIRED, the notice shows, the export works @t378", async ({ page }) => {
    const { email, headers } = await signedInAccount(page, "free");
    await endTrial(email);

    const write = await createTeamWorkspace(page, headers, `Gesperrt ${runId}`);
    expect(write.status()).toBe(403);
    expect(await write.json()).toEqual({ error: expect.stringContaining("Testzeitraum ist abgelaufen"), code: "TRIAL_EXPIRED" });

    // Reading and the export stay open, nothing was written.
    expect((await page.request.get("/api/workspaces")).status()).toBe(200);
    const exported = await page.request.get("/api/account/export");
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("bloommd-account-export-");
    expect(JSON.stringify(await exported.json())).toContain(email);

    await page.goto("/account");
    await expect(page.getByTestId("trial-expired-banner")).toBeVisible();
    await expect(page.getByTestId("trial-expired-banner")).toContainText("Testzeitraum abgelaufen");
    await expect(page.getByTestId("trial-expired-banner")).toContainText("nur lesbar");
  });

  test("expired trial with an active plan: writing is allowed and no notice shows @t378", async ({ page }) => {
    const { email, headers } = await signedInAccount(page, "paid");
    await endTrial(email);
    await givePlan(email, new Date(Date.now() + 30 * DAY));

    const write = await createTeamWorkspace(page, headers, `Erlaubt ${runId}`);
    expect(write.status()).toBe(201);
    expect(((await write.json()) as { workspace: { name: string } }).workspace.name).toBe(`Erlaubt ${runId}`);

    expect((await page.request.get("/api/account/export")).status()).toBe(200);

    await page.goto("/account");
    await expect(page.getByText("E-Mail-Adresse bestätigt")).toBeVisible();
    await expect(page.getByTestId("trial-expired-banner")).toHaveCount(0);
  });

  test("a plan that has run out locks the account again, a plan without an end does not @t378", async ({ page }) => {
    const { email, headers } = await signedInAccount(page, "lapsed");
    await endTrial(email);
    await givePlan(email, new Date(Date.now() - 1_000));

    const refused = await createTeamWorkspace(page, headers, `Abgelaufen ${runId}`);
    expect(refused.status()).toBe(403);
    expect((await refused.json()) as { code: string }).toMatchObject({ code: "TRIAL_EXPIRED" });

    await withDatabase(async (sql) => {
      await sql`update bloom_entitlements set expires_at = null where source = ${`sub_e2e_${runId}`}`;
    });
    const allowed = await createTeamWorkspace(page, headers, `Offen ${runId}`);
    expect(allowed.status()).toBe(201);
  });
});
