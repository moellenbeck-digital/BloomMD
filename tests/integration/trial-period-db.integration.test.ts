/**
 * Trial period and reminders (#274) against a real Postgres: migration 013 (backfill of existing
 * accounts, idempotent), the single setting of trial_ends_at on confirmation and waitlist
 * activation, and the claim/release of the reminders. Runs only with BLOOMMD_TEST_DATABASE_URL (a
 * throwaway database; it is migrated here), e.g.
 * `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { testDatabaseUrl } from "./db-test-url";

const url = testDatabaseUrl();

describe.skipIf(!url)("trial period (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  const address = (name: string) => `${name}-${run}@bloommd.test`;
  const HASH = "pbkdf2-sha256$310000$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
  const DAY = 24 * 60 * 60 * 1000;

  async function userRow(email: string) {
    const rows = await sql`select id, trial_ends_at, trial_legacy, locale, email_verified_at from bloom_users where email = ${email}`;
    return rows[0] as { id: string; trial_ends_at: Date | null; trial_legacy: boolean; locale: string; email_verified_at: Date | null };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    await db.migrateMarketSchema();
  });

  afterAll(async () => {
    await db?.migrateMarketSchema();
    await sql?.end();
  });

  test("the migrated schema passes the readiness check", async () => {
    expect(await db.checkDatabaseReady()).toBe(true);
  });

  test("migration 013 gives every existing account the fixed end and its waitlist language, and runs again without changes", async () => {
    const plain = address("legacy-plain");
    const waitlist = address("legacy-waitlist");
    const confirmed = address("legacy-confirmed");
    await sql`alter table bloom_users drop column trial_legacy, drop column trial_ends_at, drop column locale`;
    await sql`insert into bloom_users (auth_provider, auth_user_id, email) values ('password', ${plain}, ${plain}), ('password', ${waitlist}, ${waitlist})`;
    await sql`insert into bloom_users (auth_provider, auth_user_id, email, password_hash, email_verified_at) values ('password', ${confirmed}, ${confirmed}, ${HASH}, now() - interval '3 days')`;
    await sql`insert into bloom_waitlist_transfers (user_id, locale) select id, 'en' from bloom_users where email = ${waitlist}`;

    await db.migrateMarketSchema();
    for (const email of [plain, waitlist, confirmed]) {
      const row = await userRow(email);
      expect(row.trial_legacy).toBe(true);
      expect(row.trial_ends_at?.toISOString()).toBe("2026-12-15T00:00:00.000Z");
    }
    expect((await userRow(plain)).locale).toBe("de");
    expect((await userRow(waitlist)).locale).toBe("en");

    // An account created after the migration is new: no end until it is confirmed, German by default.
    const created = await db.createPasswordUser({ email: address("new-de"), passwordHash: HASH });
    const row = await userRow(created.email);
    expect(row).toMatchObject({ trial_legacy: false, trial_ends_at: null, locale: "de" });

    await db.migrateMarketSchema();
    expect(await userRow(created.email)).toMatchObject({ trial_legacy: false, trial_ends_at: null });
    expect((await userRow(plain)).trial_legacy).toBe(true);
    expect((await userRow(waitlist)).locale).toBe("en");
  });

  test("signup stores the language; a prepared waitlist account keeps its own", async () => {
    const english = await db.createPasswordUser({ email: address("new-en"), passwordHash: HASH, locale: "en" });
    expect((await userRow(english.email)).locale).toBe("en");
    await db.updatePasswordForEmail({ email: english.email, passwordHash: HASH, locale: "de" });
    expect((await userRow(english.email)).locale).toBe("de");
    await db.updatePasswordForEmail({ email: english.email, passwordHash: HASH });
    expect((await userRow(english.email)).locale).toBe("de");

    const email = address("prepared-en");
    await db.createPreparedWaitlistAccount({ email, locale: "en" });
    expect((await userRow(email)).locale).toBe("en");
  });

  test("confirming the address sets the end 30 days later, once", async () => {
    const user = await db.createPasswordUser({ email: address("confirm"), passwordHash: HASH });
    await db.markEmailVerified(user.id);
    const first = await userRow(user.email);
    expect(first.trial_ends_at!.getTime() - first.email_verified_at!.getTime()).toBe(30 * DAY);

    await sql`update bloom_users set trial_ends_at = trial_ends_at + interval '1 hour' where id = ${user.id}`;
    await db.markEmailVerified(user.id);
    const second = await userRow(user.email);
    expect(second.trial_ends_at!.getTime()).toBe(first.trial_ends_at!.getTime() + 60 * 60 * 1000);
    expect(second.email_verified_at!.getTime()).toBe(first.email_verified_at!.getTime());
  });

  test("an existing account keeps its fixed end when it confirms later", async () => {
    const email = address("legacy-late");
    await sql`insert into bloom_users (auth_provider, auth_user_id, email, password_hash, trial_legacy, trial_ends_at) values ('password', ${email}, ${email}, ${HASH}, true, '2026-12-15T00:00:00Z')`;
    const row = await userRow(email);
    await db.markEmailVerified(row.id);
    expect((await userRow(email)).trial_ends_at?.toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });

  test("activating a prepared waitlist account sets the end once", async () => {
    const email = address("activate");
    const userId = (await db.createPreparedWaitlistAccount({ email, locale: "de" }))!;
    await db.claimWaitlistInvitation(userId);
    const { token } = (await db.createAuthToken({ userId, email, purpose: "waitlist_activation", ttlMinutes: 60 }))!;
    expect(await db.activateWaitlistAccount({ token, passwordHash: HASH })).toMatchObject({ userId });
    const row = await userRow(email);
    expect(row.trial_ends_at!.getTime() - row.email_verified_at!.getTime()).toBe(30 * DAY);
  });

  test("candidates, claim, mark and release of the reminders", async () => {
    const user = await db.createPasswordUser({ email: address("remind"), passwordHash: HASH, locale: "en" });
    const unconfirmed = await db.createPasswordUser({ email: address("remind-unconfirmed"), passwordHash: HASH });
    await db.markEmailVerified(user.id);
    // Confirmed 16 days ago: the 15-day reminder is due.
    await sql`update bloom_users set email_verified_at = now() - interval '16 days', trial_ends_at = now() + interval '14 days' where id = ${user.id}`;
    const now = new Date();

    const listed = await db.listTrialReminderCandidates(now);
    const entry = listed.find((candidate) => candidate.userId === user.id);
    expect(entry).toMatchObject({ locale: "en", existingAccount: false, claimed: [] });
    expect(listed.some((candidate) => candidate.userId === unconfirmed.id)).toBe(false);

    expect(await db.claimTrialReminder(user.id, "15", now)).toBe(true);
    expect(await db.claimTrialReminder(user.id, "15", now)).toBe(false);
    expect((await db.listTrialReminderCandidates(now)).find((candidate) => candidate.userId === user.id)?.claimed).toEqual(["15"]);

    await db.releaseTrialReminder(user.id, "15");
    expect(await db.claimTrialReminder(user.id, "15", now)).toBe(true);
    await db.markTrialReminderSent(user.id, "15");
    await db.releaseTrialReminder(user.id, "15");
    expect(await db.claimTrialReminder(user.id, "15", now)).toBe(false);

    // Not claimable once the trial is over or for an unconfirmed address.
    expect(await db.claimTrialReminder(user.id, "23", new Date(now.getTime() + 15 * DAY))).toBe(false);
    expect(await db.claimTrialReminder(unconfirmed.id, "15", now)).toBe(false);
    expect((await db.listTrialReminderCandidates(new Date(now.getTime() + 15 * DAY))).some((candidate) => candidate.userId === user.id)).toBe(false);
  });

  test("the trial end of an account can be read for the read-only mode", async () => {
    const user = await db.createPasswordUser({ email: address("lock"), passwordHash: HASH });
    expect(await db.getTrialEndsAt(user.id)).toBeNull();
    await db.markEmailVerified(user.id);
    expect(await db.getTrialEndsAt(user.id)).toBe((await userRow(user.email)).trial_ends_at!.toISOString());
    expect(await db.getTrialEndsAt("33333333-3333-4333-8333-333333333333")).toBeNull();
  });

  test("deleting the account removes its reminders", async () => {
    const user = await db.createPasswordUser({ email: address("gone"), passwordHash: HASH });
    await db.markEmailVerified(user.id);
    await sql`insert into bloom_trial_reminders (user_id, kind) values (${user.id}, '15')`;
    await sql`delete from bloom_users where id = ${user.id}`;
    expect((await sql`select 1 from bloom_trial_reminders where user_id = ${user.id}`).length).toBe(0);
  });
});
