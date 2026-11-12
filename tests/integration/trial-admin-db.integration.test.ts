/**
 * Operator command for the trial (#277) against a real Postgres: extension of the trial end with its
 * reminders, release of the mailbox rule, exception for one more account of a mailbox, and the audit
 * event of each run (time, operator, account id, old and new value, no address). The mailbox rule of
 * #289 itself is in mailbox-trial-db.integration.test.ts. Runs only with BLOOMMD_TEST_DATABASE_URL
 * (a throwaway database; it is migrated here), e.g. `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { testDatabaseUrl } from "./db-test-url";

const url = testDatabaseUrl();
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!url)("trial admin command (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let trial: typeof import("../../apps/app/src/lib/trial");
  let admin: typeof import("../../apps/app/src/lib/trial-admin");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  // A fresh domain per run keeps the canonical addresses of this file apart from other tests.
  const domain = `ta${run}.test`;
  const address = (local: string) => `${local}@${domain}`;
  const HASH = "pbkdf2-sha256$310000$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";

  const register = (email: string) => db.createPasswordUser({ email, passwordHash: HASH });
  const row = async (id: string) =>
    (await sql`select id, trial_guarded, trial_legacy, email_verified_at, trial_ends_at from bloom_users where id = ${id}`)[0] as {
      id: string;
      trial_guarded: boolean;
      trial_legacy: boolean;
      email_verified_at: Date | null;
      trial_ends_at: Date | null;
    };
  const audit = (id: string | null, type: string) =>
    sql`select actor_user_id, actor_agent_id, event_type, target_type, target_id, details, created_at from bloom_audit_events where event_type = ${type} and target_id is not distinct from ${id}::uuid order by created_at, id`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    trial = await import("../../apps/app/src/lib/trial");
    admin = await import("../../apps/app/src/lib/trial-admin");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    await db.migrateMarketSchema();
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("the migrated schema passes the readiness check and has the exceptions table", async () => {
    expect(await db.checkDatabaseReady()).toBe(true);
    const rows = await sql`select to_regclass('public.bloom_trial_exceptions') as t`;
    expect((rows[0] as { t: string | null }).t).toBe("bloom_trial_exceptions");
    await db.migrateMarketSchema();
  });

  test("an extension moves the end, gives the reminders back so they follow the new end, and is logged", async () => {
    const user = await register(address("extend"));
    await db.markEmailVerified(user.id);
    const before = await row(user.id);
    const now = new Date();
    expect(await db.claimTrialReminder(user.id, "15", now)).toBe(true);
    await db.markTrialReminderSent(user.id, "15");

    const dry = await db.adminSetTrialEnd({ operator: "max", accountId: user.id, extendDays: 60, now, apply: false });
    expect(dry).toMatchObject({ applied: false, remindersReset: 1 });
    expect((await row(user.id)).trial_ends_at?.toISOString()).toBe(before.trial_ends_at!.toISOString());
    expect(await audit(user.id, "trial.extended")).toHaveLength(0);

    const outcome = await db.adminSetTrialEnd({ operator: "max", accountId: user.id, extendDays: 60, now, apply: true });
    const newEnd = new Date(before.trial_ends_at!.getTime() + 60 * DAY);
    expect(outcome).toMatchObject({ applied: true, oldValue: before.trial_ends_at!.toISOString(), newValue: newEnd.toISOString(), remindersReset: 1 });
    expect((await row(user.id)).trial_ends_at?.toISOString()).toBe(newEnd.toISOString());
    expect(await sql`select 1 from bloom_trial_reminders where user_id = ${user.id}`).toHaveLength(0);

    const events = await audit(user.id, "trial.extended");
    expect(events).toHaveLength(1);
    const event = events[0] as { actor_user_id: string | null; actor_agent_id: string | null; target_type: string; details: Record<string, string>; created_at: Date };
    expect(event.actor_user_id).toBeNull();
    expect(event.actor_agent_id).toBeNull();
    expect(event.target_type).toBe("account");
    expect(event.details).toEqual({ operator: "max", field: "trial_ends_at", old: before.trial_ends_at!.toISOString(), new: newEnd.toISOString(), remindersReset: "1" });
    expect(Math.abs(event.created_at.getTime() - Date.now())).toBeLessThan(60_000);
    expect(JSON.stringify(event)).not.toContain("@");

    // The reminders now follow the new end: not due 16 days before it, due (once) 15 days before it.
    const candidates = async (at: Date) => (await db.listTrialReminderCandidates(at)).find((candidate) => candidate.userId === user.id);
    expect(await candidates(new Date(newEnd.getTime() - 16 * DAY))).toBeUndefined();
    const dueAt = new Date(newEnd.getTime() - 15 * DAY);
    const candidate = await candidates(dueAt);
    expect(candidate).toMatchObject({ trialEndsAt: newEnd.toISOString(), claimed: [] });
    expect(trial.dueTrialReminder(candidate!.trialEndsAt, dueAt, candidate!.claimed)).toBe("15");
  });

  test("an end that is no extension, an unknown account and a bad id change nothing", async () => {
    const user = await register(address("noext"));
    await db.markEmailVerified(user.id);
    const before = await row(user.id);
    await expect(db.adminSetTrialEnd({ operator: "max", accountId: user.id, endsAt: new Date(before.trial_ends_at!.getTime() - DAY), apply: true })).rejects.toBeInstanceOf(admin.TrialAdminError);
    expect(await db.adminSetTrialEnd({ operator: "max", accountId: "22222222-2222-4222-8222-222222222222", extendDays: 5, apply: true })).toBeNull();
    expect(await db.adminSetTrialEnd({ operator: "max", accountId: "not-a-uuid", extendDays: 5, apply: true })).toBeNull();
    expect((await row(user.id)).trial_ends_at?.toISOString()).toBe(before.trial_ends_at!.toISOString());
    expect(await audit(user.id, "trial.extended")).toHaveLength(0);
  });

  test("an end set by the operator survives migration 015, a second db:migrate and the confirmation", async () => {
    const user = await register(address("legacy"));
    await sql`update bloom_users set trial_legacy = true, trial_ends_at = '2026-12-15T00:00:00Z', email_verified_at = now() - interval '40 days' where id = ${user.id}`;
    const endsAt = new Date(Date.now() + 100 * DAY);
    await db.adminSetTrialEnd({ operator: "max", accountId: user.id, endsAt, apply: true });

    await db.migrateMarketSchema();
    await db.markEmailVerified(user.id);
    expect((await row(user.id)).trial_ends_at?.toISOString()).toBe(endsAt.toISOString());
  });

  test("an exception lets exactly one more account of a mailbox confirm; the rule stays for every other address", async () => {
    const first = await register(address("box+a"));
    expect(await db.markEmailVerified(first.id)).toBe("ok");
    const second = address("box+b");
    expect(await db.hasConfirmedMailboxTwin(second)).toBe(true);

    const granted = await db.adminGrantTrialException({ operator: "max", address: second, validDays: 14, apply: true });
    expect(granted).toMatchObject({ applied: true, accountId: null, oldValue: "none" });
    expect(await db.hasConfirmedMailboxTwin(second)).toBe(false);
    // Only that exact address: another variant of the mailbox is still a twin.
    expect(await db.hasConfirmedMailboxTwin(address("box+c"))).toBe(true);

    const user = await register(second);
    expect(await db.markEmailVerified(user.id)).toBe("ok");
    const confirmed = await row(user.id);
    expect(confirmed.trial_guarded).toBe(false);
    expect(confirmed.trial_ends_at).not.toBeNull();
    expect((await row(first.id)).trial_guarded).toBe(true);

    // Another variant cannot confirm, also not at the same time as the exception account.
    const third = await register(address("box+c"));
    expect(await db.markEmailVerified(third.id)).toBe("duplicate-trial");

    const stored = await sql`select email_hash, created_by from bloom_trial_exceptions where email_hash = ${admin.trialExceptionKey(second)}`;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ created_by: "max" });
    // The table and the log hold the key, never the address.
    expect(JSON.stringify(await sql`select * from bloom_trial_exceptions where email_hash = ${admin.trialExceptionKey(second)}`)).not.toContain("box+b");
    const events = await audit(null, "trial.exception_granted");
    const mine = events.filter((event) => (event.details as Record<string, string>).key === admin.trialExceptionKey(second).slice(0, 12));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ target_type: "trial_exception", actor_user_id: null });
    expect(JSON.stringify(mine[0])).not.toContain("box");
  });

  test("an exception for an address with an account is logged with the account id and ends after its time", async () => {
    const first = await register(address("late+a"));
    await db.markEmailVerified(first.id);
    const blocked = await register(address("late+b"));
    expect(await db.markEmailVerified(blocked.id)).toBe("duplicate-trial");

    await db.adminGrantTrialException({ operator: "max", address: address("late+b"), validDays: 3, apply: true });
    const events = await audit(blocked.id, "trial.exception_granted");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ target_type: "account", actor_user_id: null });

    // The time is over: the rule applies again.
    await sql`update bloom_trial_exceptions set expires_at = now() - interval '1 minute' where email_hash = ${admin.trialExceptionKey(address("late+b"))}`;
    expect(await db.hasConfirmedMailboxTwin(address("late+b"))).toBe(true);
    expect(await db.markEmailVerified(blocked.id)).toBe("duplicate-trial");

    // A renewal replaces the time and logs the old one.
    await db.adminGrantTrialException({ operator: "max", address: address("late+b"), validDays: 7, apply: true });
    const renewed = (await audit(blocked.id, "trial.exception_granted")).at(-1) as { details: Record<string, string> };
    expect(renewed.details.old).not.toBe("none");
    expect(await db.markEmailVerified(blocked.id)).toBe("ok");
  });

  test("releasing the guard of a blocked account lets it confirm; a second run changes and logs nothing", async () => {
    const first = await register(address("rel+a"));
    await db.markEmailVerified(first.id);
    const blocked = await register(address("rel+b"));
    expect(await db.markEmailVerified(blocked.id)).toBe("duplicate-trial");

    const outcome = await db.adminReleaseTrialGuard({ operator: "max", accountId: blocked.id, apply: true });
    expect(outcome).toMatchObject({ changed: true, applied: true, oldValue: "true", newValue: "false" });
    expect(await db.markEmailVerified(blocked.id)).toBe("ok");
    const events = await audit(blocked.id, "trial.guard_released");
    expect(events).toHaveLength(1);
    expect((events[0] as { details: Record<string, string> }).details).toEqual({ operator: "max", field: "trial_guarded", old: "true", new: "false" });

    expect(await db.adminReleaseTrialGuard({ operator: "max", accountId: blocked.id, apply: true })).toMatchObject({ changed: false, applied: false });
    expect(await audit(blocked.id, "trial.guard_released")).toHaveLength(1);
  });
});
