import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { canonicalEmail } from "../src/lib/email-canonical";
import { createSqlClient } from "../src/lib/sql-client";
import { formatTrialEnd, LEGACY_TRIAL_ENDS_AT, trialEndsAt } from "../src/lib/trial";
import { MAIL_OUTBOX_PATH, readMails } from "./fixtures/mail-outbox";
import { createResendMailReader } from "./fixtures/resend-mails";

/**
 * Proof of the visible criteria of the free trial account (#274): the trial ends 30 days after the email
 * confirmation, reminder mails after 15 and after 23 days. The implementation is merged (migration 013, job
 * `db:trial-reminders`, banner); this suite shows K1-K7 end to end with a real registration, real mails and the real job.
 *
 * Two ways to run it (both need a migrated Postgres; see e2e/README.md, section "Testkonto: Testzeitraum und Hinweis-Mails (#274)"):
 * - locally: `bun run test:e2e:trial-reminders` (own server, mails into the file outbox, like open-signup/t378);
 * - against the test system: `playwright.testsystem.config.ts --grep @t274` with `PLAYWRIGHT_RESEND_API_KEY` (the mails are
 *   read through the Resend API) and `PLAYWRIGHT_T274_DATABASE_URL` (the database of that system).
 * Without a database, or without the key on a test system, every test is skipped with the reason.
 *
 * Day 15 and day 23 are not waited for: the job runs as a child process with `--jetzt <confirmation + n days>` and
 * `--konto <id>`, so only the account of this suite is looked at, claimed and mailed, never another account of a shared
 * database. The job gets its own environment (no mail provider locally, `BLOOMMD_TRIAL_REMINDERS_EXISTING` off).
 *
 * Mails go to test addresses only: `delivered+<label>@resend.dev` on a test system (accepted by Resend, delivered to nobody),
 * `...@bloommd.local` locally (outbox). All of a run's accounts share one mailbox (the +label is not part of the canonical
 * address, #277), so they are created one after the other and each is deleted before the next; leftovers of an earlier
 * run are removed at the start. On a test system with `BLOOMMD_E2E_AUTH_BYPASS=1` no real registration is possible
 * (the bypass signs in without creating an account or sending a mail); the suite then skips with that reason.
 */

const PASSWORD = "Testpass12345";
const DAY = 24 * 60 * 60 * 1000;
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LOCAL = process.env.PLAYWRIGHT_TRIAL_REMINDERS_LOCAL === "1";
const DATABASE_URL = process.env.PLAYWRIGHT_T274_DATABASE_URL?.trim() ?? "";
const RESEND_API_KEY = process.env.PLAYWRIGHT_RESEND_API_KEY?.trim() ?? "";
const RESEND_FROM = process.env.PLAYWRIGHT_T274_RESEND_FROM_EMAIL?.trim() || "BloomMD Accounts <account@bloommd.app>";
const MAIL_BASE = (process.env.PLAYWRIGHT_T274_MAIL_BASE?.trim() || (LOCAL ? "e2e-t274@bloommd.local" : "delivered@resend.dev")).toLowerCase();
/** The link the reminder mails carry: the job is run like in production, with the public app domain. */
const PUBLIC_APP_URL = "https://bloommd.app";
const ORIGIN = new URL(process.env.PLAYWRIGHT_BASE_URL?.trim() || `http://localhost:${process.env.PLAYWRIGHT_TRIAL_REMINDERS_PORT ?? "3513"}`).origin;

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const startedAt = Date.now() - 60_000;

const [mailLocal, mailDomain] = MAIL_BASE.split("@") as [string, string];
const addressFor = (label: string) => `${mailLocal.split("+")[0]}+${label}-${runId}@${mailDomain}`;

/** Mails of this suite go to test addresses only; anything else is refused before an account is created. */
function assertTestMailbox() {
  if (!/^[^@\s]+@(resend\.dev|bloommd\.local)$/.test(MAIL_BASE)) {
    throw new Error(`PLAYWRIGHT_T274_MAIL_BASE must be a test address (…@resend.dev or …@bloommd.local), got a different domain.`);
  }
}

interface Mail { subject: string; text: string }

const resend = !LOCAL && RESEND_API_KEY ? createResendMailReader({ apiKey: RESEND_API_KEY, since: startedAt }) : null;

async function mailsTo(address: string): Promise<Mail[]> {
  if (resend) return resend.mailsTo(address);
  return readMails(address);
}

const isReminder = (mail: Mail) => /endet in \d+ Tag|trial ends in \d+ day/.test(mail.subject);
const reminders = async (address: string) => (await mailsTo(address)).filter(isReminder);
/** A mail needs a moment to show up in the Resend list; before a "no mail" check the run waits a little. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, LOCAL ? 300 : 4_000));

function confirmationPath(mails: Mail[]): string | null {
  for (const mail of [...mails].reverse()) {
    const link = mail.text.split(/\s+/).find((word) => /^https?:\/\//.test(word) && word.includes("/api/auth/verify-email"));
    if (link) {
      // Only path and query: the link points at the public domain, the test stays on its own origin.
      const url = new URL(link);
      return `${url.pathname}${url.search}`;
    }
  }
  return null;
}

async function withDatabase<T>(work: (sql: ReturnType<typeof createSqlClient>) => Promise<T>): Promise<T> {
  const sql = createSqlClient(DATABASE_URL);
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
}

/** Removes every account of the test mailbox (also from earlier runs): they share one canonical address and would block each other. */
async function deleteMailboxAccounts() {
  assertTestMailbox();
  await withDatabase(async (sql) => {
    await sql`delete from bloom_users where email_canonical = ${canonicalEmail(MAIL_BASE)}`;
  });
}

function uniqueAddress() {
  const hextet = () => Math.floor(Math.random() * 0xffff).toString(16);
  return `2001:db8:${hextet()}:${hextet()}::${hextet()}`;
}

interface JobResult {
  dryRun: boolean;
  includeExisting: boolean;
  due: number;
  dueByKind: { "15": number; "23": number };
  heldBackExisting: number;
  deferred: number;
  mailSent: number;
  mailFailed: number;
  notClaimed: number;
}

/**
 * Runs `bun run scripts/trial-reminders.ts --apply --konto <id> --jetzt <at>` with its own environment, so nothing of the
 * runner's (a provider key, `BLOOMMD_TRIAL_REMINDERS_EXISTING`, a `.env` file) leaks in and, locally, nothing can be sent.
 */
function runJob(accountId: string, at: Date): JobResult {
  const mailEnv = LOCAL
    ? { BLOOMMD_E2E_TEST_MODE: "1", BLOOMMD_E2E_MAIL_OUTBOX: MAIL_OUTBOX_PATH, BLOOMMD_LOCAL_DEPLOYMENT: "1", RESEND_API_KEY: "", RESEND_FROM_EMAIL: "" }
    : { BLOOMMD_E2E_TEST_MODE: "", BLOOMMD_E2E_MAIL_OUTBOX: "", BLOOMMD_LOCAL_DEPLOYMENT: "", RESEND_API_KEY, RESEND_FROM_EMAIL: RESEND_FROM };
  const child = spawnSync("bun", ["--no-env-file", "run", "scripts/trial-reminders.ts", "--apply", "--konto", accountId, "--jetzt", at.toISOString()], {
    cwd: APP_DIR,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      TMPDIR: process.env.TMPDIR ?? "",
      BUN_USE_VERSION: process.env.BUN_USE_VERSION ?? "",
      DATABASE_URL,
      NEXT_PUBLIC_APP_URL: PUBLIC_APP_URL,
      NEXT_PUBLIC_SITE_URL: PUBLIC_APP_URL,
      BLOOMMD_TRIAL_REMINDERS_EXISTING: "",
      ...mailEnv,
    },
  });
  const lastLine = (child.stdout ?? "").trim().split("\n").pop() ?? "";
  // No address and no key are printed by the job; the exit code is 1 when a mail failed or the run stopped early.
  if (child.status !== 0) throw new Error(`The reminder job failed (exit ${child.status ?? child.signal}): ${lastLine} ${(child.stderr ?? "").trim().split("\n").slice(-3).join(" | ")}`);
  return JSON.parse(lastLine) as JobResult;
}

interface Account {
  email: string;
  id: string;
  headers: Record<string, string>;
  verifiedAt?: Date;
}

const state: { skipReason: string | null; account?: Account; deReminderSubjects: string[] } = { skipReason: null, deReminderSubjects: [] };

function skipUnlessRunnable() {
  const reason =
    state.skipReason ??
    (!DATABASE_URL
      ? "PLAYWRIGHT_T274_DATABASE_URL fehlt: Ohne die Datenbank des Systems lassen sich Bestätigungszeitpunkt und Job nicht prüfen."
      : !LOCAL && !RESEND_API_KEY
        ? "PLAYWRIGHT_RESEND_API_KEY fehlt: Gegen ein Testsystem werden die Mails über die Resend-API gelesen (Key mit Vollzugriff)."
        : null);
  test.skip(reason !== null, reason ?? "");
}

/** Registers a new account (signup form, like the browser) and waits for its confirmation mail. */
async function register(page: Page, label: string, lang: "de" | "en"): Promise<Account> {
  const email = addressFor(label);
  const headers = { Origin: ORIGIN, "X-Forwarded-For": uniqueAddress() };
  const signup = await page.request.post("/api/auth/signup", {
    headers,
    form: { name: "Trial Reminders E2E", email, password: PASSWORD, lang, next: "/app", website: "", formStartedAt: String(Date.now() - 2_000), acceptTerms: "1" },
    maxRedirects: 0,
  });
  expect(signup.status()).toBe(303);
  const location = decodeURIComponent(signup.headers().location ?? "");
  if (!location.includes("verification=sent")) {
    state.skipReason = "Das System legt bei der Registrierung kein Konto an und sendet keine Bestätigungsmail (BLOOMMD_E2E_AUTH_BYPASS=1?). Für diesen Nachweis muss es mit echter Anmeldung laufen.";
    test.skip(true, state.skipReason);
  }
  const rows = await withDatabase((sql) => sql`select id from bloom_users where email = ${email}`);
  expect(rows, "Die Registrierung hat kein Konto in der Datenbank angelegt (falsche DATABASE_URL für dieses System?).").toHaveLength(1);
  return { email, id: String(rows[0]!.id), headers };
}

async function confirmAndLogin(page: Page, account: Account) {
  await expect
    .poll(async () => confirmationPath(await mailsTo(account.email)), { message: "Die Bestätigungsmail ist nicht angekommen.", timeout: 90_000, intervals: [2_000] })
    .not.toBeNull();
  await page.request.get(confirmationPath(await mailsTo(account.email))!, { headers: { "X-Forwarded-For": account.headers["X-Forwarded-For"]! } });
  const rows = await withDatabase((sql) => sql`select email_verified_at, trial_ends_at from bloom_users where id = ${account.id}`);
  const verifiedAt = rows[0]?.email_verified_at ? new Date(rows[0].email_verified_at as string) : undefined;
  expect(verifiedAt, "Die Bestätigung hat die Adresse nicht bestätigt.").toBeDefined();
  account.verifiedAt = verifiedAt;
  const login = await page.request.post("/api/auth/login", { headers: account.headers, form: { email: account.email, password: PASSWORD, next: "/app" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
}

async function deleteViaApp(page: Page, account: Account) {
  const response = await page.request.post("/api/account/delete", { headers: account.headers, form: { confirmation: account.email, password: PASSWORD }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(decodeURIComponent(response.headers().location ?? "")).toContain("account=deleted");
  const rows = await withDatabase((sql) => sql`select id from bloom_users where id = ${account.id}`);
  expect(rows).toHaveLength(0);
}

/**
 * `days` after the confirmation. The database keeps microseconds and a Date only milliseconds, so the run is a second
 * late for the exact reminder instant (day 15, day 23): the coarse selection in SQL compares with full precision.
 */
const at = (account: Account, days: number, lateMs = 0) => new Date(account.verifiedAt!.getTime() + days * DAY + lateMs);
const SECOND = 1_000;

test.describe.configure({ mode: "serial", timeout: 240_000 });

test.describe("free trial: end after 30 days, reminders after 15 and 23 days @t274", () => {
  test.beforeAll(async () => {
    if (!DATABASE_URL || (!LOCAL && !RESEND_API_KEY)) return;
    await deleteMailboxAccounts();
  });
  test.afterAll(async () => {
    if (!DATABASE_URL || state.skipReason) return;
    await deleteMailboxAccounts();
  });

  test("K2 an unconfirmed account has no trial end and gets no reminder @t274", async ({ page }) => {
    skipUnlessRunnable();
    const account = await register(page, "de", "de");
    state.account = account;

    const rows = await withDatabase((sql) => sql`select email_verified_at, trial_ends_at from bloom_users where id = ${account.id}`);
    expect(rows[0]).toMatchObject({ email_verified_at: null, trial_ends_at: null });

    // Even a long time later (the job's clock is moved by 16 and 40 days) nothing is due for an unconfirmed address.
    for (const days of [16, 40]) {
      const result = runJob(account.id, new Date(Date.now() + days * DAY));
      expect(result).toMatchObject({ due: 0, mailSent: 0, mailFailed: 0 });
    }
    await settle();
    expect(await reminders(account.email)).toHaveLength(0);
  });

  test("K1 registering: the confirmation mail arrives, after confirming the app shows the trial until confirmation + 30 days @t274", async ({ page }) => {
    skipUnlessRunnable();
    const account = state.account!;
    await confirmAndLogin(page, account);

    const mails = await mailsTo(account.email);
    expect(mails.some((mail) => confirmationPath([mail]) !== null)).toBe(true);

    const rows = await withDatabase((sql) => sql`select trial_ends_at from bloom_users where id = ${account.id}`);
    const endsAt = new Date(rows[0]!.trial_ends_at as string);
    expect(endsAt.getTime()).toBe(trialEndsAt(account.verifiedAt!).getTime());
    expect(endsAt.getTime() - account.verifiedAt!.getTime()).toBe(30 * DAY);

    await page.goto("/account?lang=de");
    const banner = page.getByTestId("account-trial-end");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Testzeitraum bis");
    await expect(banner).toContainText(formatTrialEnd(endsAt, "de"));
    await page.goto("/account?lang=en");
    await expect(page.getByTestId("account-trial-end")).toContainText(`Trial period until ${formatTrialEnd(endsAt, "en")}`);
  });

  test("K3 day 15: exactly one reminder with 15 days left and a link to bloommd.app, none on day 14 @t274", async () => {
    skipUnlessRunnable();
    const account = state.account!;

    const day14 = runJob(account.id, at(account, 14));
    expect(day14).toMatchObject({ due: 0, mailSent: 0 });
    await settle();
    expect(await reminders(account.email)).toHaveLength(0);

    const day15 = runJob(account.id, at(account, 15, SECOND));
    expect(day15).toMatchObject({ due: 1, dueByKind: { "15": 1, "23": 0 }, mailSent: 1, mailFailed: 0, heldBackExisting: 0 });
    await expect.poll(async () => (await reminders(account.email)).length, { message: "Die Hinweis-Mail für Tag 15 ist nicht angekommen.", timeout: 60_000, intervals: [2_000] }).toBe(1);
    await settle();
    const [mail] = await reminders(account.email);
    expect(await reminders(account.email)).toHaveLength(1);
    expect(mail!.subject).toBe("Dein BloomMD-Testzeitraum endet in 15 Tagen");
    expect(mail!.text).toContain("noch 15 Tage");
    expect(mail!.text).toContain(PUBLIC_APP_URL);
    state.deReminderSubjects.push(mail!.subject);
  });

  test("K4 day 23: exactly one second reminder with 7 days left, none on day 22 @t274", async () => {
    skipUnlessRunnable();
    const account = state.account!;

    const day22 = runJob(account.id, at(account, 22));
    expect(day22).toMatchObject({ due: 0, mailSent: 0 });
    await settle();
    expect(await reminders(account.email)).toHaveLength(1);

    const day23 = runJob(account.id, at(account, 23, SECOND));
    expect(day23).toMatchObject({ due: 1, dueByKind: { "15": 0, "23": 1 }, mailSent: 1, mailFailed: 0 });
    await expect.poll(async () => (await reminders(account.email)).length, { message: "Die Hinweis-Mail für Tag 23 ist nicht angekommen.", timeout: 60_000, intervals: [2_000] }).toBe(2);
    const second = (await reminders(account.email))[1]!;
    expect(second.subject).toBe("Dein BloomMD-Testzeitraum endet in 7 Tagen");
    expect(second.text).toContain("noch 7 Tage");
    expect(second.text).toContain(PUBLIC_APP_URL);
    state.deReminderSubjects.push(second.subject);
  });

  test("K5 running the job again sends nothing (idempotent) @t274", async () => {
    skipUnlessRunnable();
    const account = state.account!;
    for (const days of [15, 23, 23]) {
      const result = runJob(account.id, at(account, days, SECOND));
      expect(result).toMatchObject({ due: 0, mailSent: 0, mailFailed: 0, notClaimed: 0 });
    }
    await settle();
    expect(await reminders(account.email)).toHaveLength(2);
    const claims = await withDatabase((sql) => sql`select kind, sent_at from bloom_trial_reminders where user_id = ${account.id} order by kind`);
    expect(claims.map((claim) => claim.kind)).toEqual(["15", "23"]);
    expect(claims.every((claim) => claim.sent_at !== null)).toBe(true);
  });

  test("K6 language: an EN account gets the English reminder, the DE account got the German ones @t274", async ({ page }) => {
    skipUnlessRunnable();
    expect(state.deReminderSubjects).toEqual(["Dein BloomMD-Testzeitraum endet in 15 Tagen", "Dein BloomMD-Testzeitraum endet in 7 Tagen"]);

    // The mailbox allows one confirmed account: the German one goes first (this also removes it for K7).
    await loginAgain(page, state.account!);
    await deleteViaApp(page, state.account!);

    const account = await register(page, "en", "en");
    state.account = account;
    await confirmAndLogin(page, account);
    const rows = await withDatabase((sql) => sql`select locale from bloom_users where id = ${account.id}`);
    expect(rows[0]!.locale).toBe("en");

    const result = runJob(account.id, at(account, 15, SECOND));
    expect(result).toMatchObject({ due: 1, dueByKind: { "15": 1, "23": 0 }, mailSent: 1 });
    await expect.poll(async () => (await reminders(account.email)).length, { message: "Die englische Hinweis-Mail ist nicht angekommen.", timeout: 60_000, intervals: [2_000] }).toBe(1);
    const [mail] = await reminders(account.email);
    expect(mail!.subject).toBe("Your BloomMD trial ends in 15 days");
    expect(mail!.text).toContain("15 days left");
    expect(mail!.text).toContain("read-only");
    expect(mail!.text).not.toContain("Testzeitraum");
    expect(mail!.text).toContain(PUBLIC_APP_URL);
  });

  test("K7 an existing account (switch off) and a deleted account get no mail @t274", async ({ page }) => {
    skipUnlessRunnable();
    const account = state.account!;
    const before = (await reminders(account.email)).length;

    // Existing account: as migration 013 marks it, with the fixed trial end; its reminder day (30 Dec 2026) is due.
    await withDatabase(async (sql) => {
      await sql`delete from bloom_trial_reminders where user_id = ${account.id}`;
      await sql`update bloom_users set trial_legacy = true, trial_ends_at = ${LEGACY_TRIAL_ENDS_AT}::timestamptz where id = ${account.id}`;
    });
    const legacyDay = new Date("2026-12-30T00:00:00Z");
    const held = runJob(account.id, legacyDay);
    expect(held).toMatchObject({ includeExisting: false, due: 1, heldBackExisting: 1, mailSent: 0, mailFailed: 0 });
    await settle();
    expect(await reminders(account.email)).toHaveLength(before);
    const claims = await withDatabase((sql) => sql`select count(*)::int as n from bloom_trial_reminders where user_id = ${account.id}`);
    expect(claims[0]!.n).toBe(0);

    // Deleted account: it is due as well, then the account is removed through the app; the job finds nothing.
    await loginAgain(page, account);
    await deleteViaApp(page, account);
    const gone = runJob(account.id, legacyDay);
    expect(gone).toMatchObject({ due: 0, mailSent: 0, mailFailed: 0 });
    await settle();
    expect(await reminders(account.email)).toHaveLength(before);
  });
});

/** The session of an earlier test may have expired or belong to another context: sign in again. */
async function loginAgain(page: Page, account: Account) {
  const login = await page.request.post("/api/auth/login", { headers: account.headers, form: { email: account.email, password: PASSWORD, next: "/app" }, maxRedirects: 0 });
  expect(login.status()).toBe(303);
}
