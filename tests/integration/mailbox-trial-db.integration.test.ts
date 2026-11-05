/**
 * Protection against several free trials for one mailbox (#277) against a real Postgres: migration
 * 014 (backfill of the canonical address with existing collisions, idempotent), the lookup of a
 * confirmed twin, and the atomic confirmation (markEmailVerified, activateWaitlistAccount) including
 * the partial unique index that decides simultaneous confirmations. Runs only with
 * BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here), e.g.
 * `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;

describe.skipIf(!url)("mailbox trial protection (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let canonicalEmail: typeof import("../../apps/app/src/lib/email-canonical").canonicalEmail;
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  // A fresh domain per run keeps the canonical addresses of this file apart from other tests.
  const domain = `mb${run}.test`;
  const address = (local: string, host = domain) => `${local}@${host}`;
  const HASH = "pbkdf2-sha256$310000$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";

  async function register(email: string) {
    return db.createPasswordUser({ email, passwordHash: HASH });
  }

  async function row(email: string) {
    const rows = await sql`select id, email_canonical, trial_guarded, trial_legacy, email_verified_at, trial_ends_at from bloom_users where email = ${email}`;
    return rows[0] as { id: string; email_canonical: string; trial_guarded: boolean; trial_legacy: boolean; email_verified_at: Date | null; trial_ends_at: Date | null };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    ({ canonicalEmail } = await import("../../apps/app/src/lib/email-canonical"));
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

  test("migration 014 backfills existing accounts, leaves existing collisions alone, and runs again without changes", async () => {
    const first = address("old.name");
    const second = address("old.name+x");
    const gmailA = "old.name@gmail.com";
    const gmailB = "oldname+q@googlemail.com";
    await sql`alter table bloom_users drop column email_canonical, drop column trial_guarded`;
    // Existing accounts that collide, even both confirmed: the migration must not fail on them.
    for (const email of [first, second, gmailA, gmailB]) {
      await sql`insert into bloom_users (auth_provider, auth_user_id, email, password_hash, email_verified_at) values ('password', ${email}, ${email}, ${HASH}, now() - interval '2 days') on conflict do nothing`;
    }

    await db.migrateMarketSchema();
    const rows = await Promise.all([first, second, gmailA, gmailB].map(row));
    expect(rows.map((r) => r.email_canonical)).toEqual([address("old.name"), address("old.name"), "oldname@gmail.com", "oldname@gmail.com"]);
    // The SQL column and the TypeScript function agree.
    for (const [index, email] of [first, second, gmailA, gmailB].entries()) expect(rows[index]!.email_canonical).toBe(canonicalEmail(email));
    // Existing rows are not guarded; nothing about them changed.
    expect(rows.every((r) => r.trial_guarded === false && r.email_verified_at !== null)).toBe(true);

    await db.migrateMarketSchema();
    expect((await row(first)).trial_guarded).toBe(false);

    // An account created after the migration is guarded.
    const created = await register(address("after.migration"));
    expect((await row(created.email)).trial_guarded).toBe(true);
    expect((await row(created.email)).email_canonical).toBe(address("after.migration"));
  });

  test("the canonical address follows the rules: +tag, Gmail dots, googlemail", async () => {
    const created = await Promise.all([
      register(address("Plus.Tag+shop")),
      register(`Dots.In.Name+x@GoogleMail.com`.replace("Name", `n${run}`)),
      register(`+${run}@${domain}`),
    ]);
    expect((await row(created[0]!.email)).email_canonical).toBe(address("plus.tag"));
    expect((await row(created[1]!.email)).email_canonical).toBe(`dotsinn${run}@gmail.com`);
    expect((await row(created[2]!.email)).email_canonical).toBe(`+${run}@${domain}`);
  });

  test("only a confirmed account with another address of the same mailbox counts as a twin", async () => {
    const plain = await register(address("twin"));
    const variant = address("twin+2");
    expect(await db.hasConfirmedMailboxTwin(variant)).toBe(false);
    // Unconfirmed accounts do not block (nobody can occupy somebody else's address).
    await register(variant);
    expect(await db.hasConfirmedMailboxTwin(address("twin+3"))).toBe(false);

    expect(await db.markEmailVerified(plain.id)).toBe("ok");
    expect(await db.hasConfirmedMailboxTwin(variant)).toBe(true);
    expect(await db.hasConfirmedMailboxTwin(address("TWIN+4"))).toBe(true);
    // The confirmed account itself is no twin of its own address.
    expect(await db.hasConfirmedMailboxTwin(plain.email)).toBe(false);
    expect(await db.hasConfirmedMailboxTwin(address("other"))).toBe(false);
    expect(await db.hasConfirmedMailboxTwin(address("twin", `x${domain}`))).toBe(false);
  });

  test("a second account of a mailbox is not confirmed and gets no trial; the first keeps its trial", async () => {
    const first = await register(address("single"));
    const second = await register(address("single+shop"));
    const third = await register(address("single+news"));

    expect(await db.markEmailVerified(first.id)).toBe("ok");
    const confirmed = await row(first.email);
    expect(confirmed.email_verified_at).not.toBeNull();
    expect(confirmed.trial_ends_at).not.toBeNull();

    expect(await db.markEmailVerified(second.id)).toBe("duplicate-trial");
    expect(await db.markEmailVerified(third.id)).toBe("duplicate-trial");
    for (const email of [second.email, third.email]) {
      const blocked = await row(email);
      expect(blocked.email_verified_at).toBeNull();
      expect(blocked.trial_ends_at).toBeNull();
    }
    const audit = await sql`select count(*)::int as count from bloom_audit_events where actor_user_id = ${second.id} and event_type = 'email.verification_blocked'`;
    expect((audit[0] as { count: number }).count).toBe(1);

    // Confirming the first one again changes nothing and is not blocked by the others.
    expect(await db.markEmailVerified(first.id)).toBe("ok");
    expect((await row(first.email)).trial_ends_at?.getTime()).toBe(confirmed.trial_ends_at!.getTime());
    // An unknown account stays a no-op.
    expect(await db.markEmailVerified("00000000-0000-4000-8000-000000000000")).toBe("ok");
  });

  test("two confirmations at the same moment: exactly one account gets the trial", async () => {
    const accounts = await Promise.all([register(address("race")), register(address("race+a")), register(address("race+b"))]);
    const results = await Promise.all(accounts.map((account) => db.markEmailVerified(account.id)));
    expect(results.filter((result) => result === "ok")).toHaveLength(1);
    expect(results.filter((result) => result === "duplicate-trial")).toHaveLength(2);
    const confirmed = await sql`select count(*)::int as count from bloom_users where id = any(${accounts.map((a) => a.id)}) and email_verified_at is not null`;
    expect((confirmed[0] as { count: number }).count).toBe(1);
  });

  test("the unique index alone refuses a second confirmed guarded account, even when the check is bypassed", async () => {
    const a = await register(address("index"));
    const b = await register(address("index+b"));
    await sql`update bloom_users set email_verified_at = now() where id = ${a.id}`;
    let code: string | undefined;
    try {
      await sql`update bloom_users set email_verified_at = now() where id = ${b.id}`;
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code).toBe("23505");
    expect((await row(b.email)).email_verified_at).toBeNull();
  });

  test("an old account does not block a new one when it is unconfirmed, but a confirmed old one does", async () => {
    const legacyConfirmed = address("legacy.confirmed");
    const legacyUnconfirmed = address("legacy.open");
    for (const [email, confirmed] of [[legacyConfirmed, true], [legacyUnconfirmed, false]] as const) {
      await sql`insert into bloom_users (auth_provider, auth_user_id, email, password_hash, email_verified_at, trial_guarded) values ('password', ${email}, ${email}, ${HASH}, ${confirmed ? new Date() : null}, false)`;
    }
    // A new variant of the confirmed old account is refused ...
    const blockedByOld = await register(address("legacy.confirmed+new"));
    expect(await db.markEmailVerified(blockedByOld.id)).toBe("duplicate-trial");
    // ... an unconfirmed old account blocks nobody, and an old (unguarded) account is not checked itself.
    const newVariant = await register(address("legacy.open+new"));
    expect(await db.markEmailVerified(newVariant.id)).toBe("ok");
    const oldId = (await row(legacyUnconfirmed)).id;
    expect(await db.markEmailVerified(oldId)).toBe("ok");
  });

  test("activating a prepared waitlist account is refused for a second mailbox account, and the token is used up", async () => {
    const owner = await register(address("wl"));
    expect(await db.markEmailVerified(owner.id)).toBe("ok");

    const email = address("wl+list");
    const userId = (await db.createPreparedWaitlistAccount({ email, locale: "de" }))!;
    await db.claimWaitlistInvitation(userId);
    const token = (await db.createAuthToken({ userId, email, purpose: "waitlist_activation", ttlMinutes: 60 }))!.token;
    expect(await db.activateWaitlistAccount({ token, passwordHash: HASH })).toEqual({ blocked: "duplicate-trial" });
    const after = await row(email);
    expect(after.email_verified_at).toBeNull();
    expect(after.trial_ends_at).toBeNull();
    expect(await db.activateWaitlistAccount({ token, passwordHash: HASH })).toBeNull();

    // An ordinary activation of an unrelated prepared account still works.
    const other = address("wl-other");
    const otherId = (await db.createPreparedWaitlistAccount({ email: other, locale: "de" }))!;
    await db.claimWaitlistInvitation(otherId);
    const otherToken = (await db.createAuthToken({ userId: otherId, email: other, purpose: "waitlist_activation", ttlMinutes: 60 }))!.token;
    expect(await db.activateWaitlistAccount({ token: otherToken, passwordHash: HASH })).toEqual({ userId: otherId, email: other });
  });

  test("deleting an account frees the mailbox for a new trial", async () => {
    const first = await register(address("gone"));
    expect(await db.markEmailVerified(first.id)).toBe("ok");
    const second = await register(address("gone+again"));
    expect(await db.markEmailVerified(second.id)).toBe("duplicate-trial");
    await sql`delete from bloom_users where id = ${first.id}`;
    expect(await db.markEmailVerified(second.id)).toBe("ok");
  });
});
