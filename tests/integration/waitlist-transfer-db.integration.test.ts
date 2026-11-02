/**
 * Waitlist transfer (#105) against a real Postgres: prepared accounts, the one-time claim of the
 * activation mail, and the activation itself (single-use, expiry, origin, confirmed accounts left
 * alone). Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here), e.g.
 * `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const url = process.env.BLOOMMD_TEST_DATABASE_URL;

describe.skipIf(!url)("waitlist transfer (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let transfer: typeof import("../../apps/app/src/lib/waitlist-transfer");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  const address = (name: string) => `${name}-${run}@bloommd.test`;
  const HASH = "pbkdf2-sha256$310000$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";

  async function prepared(name: string) {
    const email = address(name);
    const userId = (await db.createPreparedWaitlistAccount({ email, locale: "de" }))!;
    return { email, userId };
  }

  async function issue(userId: string, email: string, purpose: "waitlist_activation" | "password_reset" | "email_verification" = "waitlist_activation") {
    return (await db.createAuthToken({ userId, email, purpose, ttlMinutes: 60 }))!.token;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    transfer = await import("../../apps/app/src/lib/waitlist-transfer");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    await db.migrateMarketSchema();
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("the migrated schema passes the readiness check", async () => {
    expect(await db.checkDatabaseReady()).toBe(true);
  });

  test("a prepared account has no password and an unconfirmed address, and an existing account is never touched", async () => {
    const { email, userId } = await prepared("fresh");
    const user = await db.findPasswordUserByEmail(email);
    expect(user).toMatchObject({ id: userId, passwordHash: null, emailVerifiedAt: null });
    expect(await db.findWaitlistTransferState(email)).toEqual({ userId, hasPassword: false, emailVerified: false, transfer: { invitedAt: null } });
    expect(await db.createPreparedWaitlistAccount({ email: email.toUpperCase(), locale: "en" })).toBeNull();

    const registered = await db.createPasswordUser({ email: address("registered"), passwordHash: HASH });
    expect(await db.createPreparedWaitlistAccount({ email: registered.email, locale: "de" })).toBeNull();
    expect(await db.findWaitlistTransferState(registered.email)).toMatchObject({ hasPassword: true, transfer: null });
    expect((await db.findPasswordUserByEmail(registered.email))?.passwordHash).toBe(HASH);
  });

  test("the mail is claimed once; a released claim can be taken again", async () => {
    const { userId, email } = await prepared("claim");
    expect(await db.claimWaitlistInvitation(userId)).toBe("de");
    expect(await db.claimWaitlistInvitation(userId)).toBeNull();
    expect((await db.findWaitlistTransferState(email))?.transfer?.invitedAt).not.toBeNull();
    await db.releaseWaitlistInvitation(userId);
    expect(await db.claimWaitlistInvitation(userId)).toBe("de");
  });

  test("the link activates once: password set, address confirmed, replay refused", async () => {
    const { userId, email } = await prepared("activate");
    await db.claimWaitlistInvitation(userId);
    const token = await issue(userId, email);

    expect(await db.isPreparedWaitlistAccount((await db.findPasswordUserByEmail(email))!)).toBe(true);
    expect(await db.activateWaitlistAccount({ token, passwordHash: HASH })).toEqual({ userId, email });
    const user = await db.findPasswordUserByEmail(email);
    expect(user?.passwordHash).toBe(HASH);
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(await db.isPreparedWaitlistAccount(user!)).toBe(false);
    expect(await db.activateWaitlistAccount({ token, passwordHash: "pbkdf2-sha256$310000$other$other" })).toBeNull();
    expect((await db.findPasswordUserByEmail(email))?.passwordHash).toBe(HASH);
    const row = await sql`select activated_at from bloom_waitlist_transfers where user_id = ${userId}`;
    expect(row[0]!.activated_at).not.toBeNull();
  });

  test("nothing activates without the claimed mail, with another token purpose, after expiry, or for another origin", async () => {
    const unclaimed = await prepared("unclaimed");
    expect(await db.activateWaitlistAccount({ token: await issue(unclaimed.userId, unclaimed.email), passwordHash: HASH })).toBeNull();

    const reset = await prepared("reset");
    await db.claimWaitlistInvitation(reset.userId);
    expect(await db.activateWaitlistAccount({ token: await issue(reset.userId, reset.email, "password_reset"), passwordHash: HASH })).toBeNull();
    expect(await db.activateWaitlistAccount({ token: await issue(reset.userId, reset.email, "email_verification"), passwordHash: HASH })).toBeNull();
    expect(await db.consumeAuthToken({ token: await issue(reset.userId, reset.email), purpose: "password_reset" })).toBeNull();
    expect(await db.consumeAuthToken({ token: await issue(reset.userId, reset.email), purpose: "email_verification" })).toBeNull();

    const expired = await prepared("expired");
    await db.claimWaitlistInvitation(expired.userId);
    const expiredToken = await issue(expired.userId, expired.email);
    await sql`update bloom_auth_tokens set expires_at = now() - interval '1 minute' where user_id = ${expired.userId}`;
    expect(await db.activateWaitlistAccount({ token: expiredToken, passwordHash: HASH })).toBeNull();

    const own = await db.createPasswordUser({ email: address("own"), passwordHash: HASH });
    await sql`update bloom_users set email_verified_at = null where id = ${own.id}`;
    expect(await db.activateWaitlistAccount({ token: await issue(own.id, own.email), passwordHash: "pbkdf2-sha256$310000$x$x" })).toBeNull();
    expect((await db.findPasswordUserByEmail(own.email))).toMatchObject({ passwordHash: HASH, emailVerifiedAt: null });
    for (const user of [unclaimed, reset, expired]) {
      expect(await db.findPasswordUserByEmail(user.email)).toMatchObject({ passwordHash: null, emailVerifiedAt: null });
    }
  });

  test("a confirmed account is left alone, and a password set through the signup form is replaced by the link's owner", async () => {
    const confirmed = await prepared("confirmed");
    await db.claimWaitlistInvitation(confirmed.userId);
    const token = await issue(confirmed.userId, confirmed.email);
    await db.updatePasswordForEmail({ email: confirmed.email, passwordHash: HASH });
    await db.markEmailVerified(confirmed.userId);
    expect(await db.activateWaitlistAccount({ token, passwordHash: "pbkdf2-sha256$310000$y$y" })).toBeNull();
    expect((await db.findPasswordUserByEmail(confirmed.email))?.passwordHash).toBe(HASH);

    const hijacked = await prepared("hijacked");
    await db.claimWaitlistInvitation(hijacked.userId);
    const hijackedToken = await issue(hijacked.userId, hijacked.email);
    await db.updatePasswordForEmail({ email: hijacked.email, passwordHash: "pbkdf2-sha256$310000$attacker$attacker" });
    expect(await db.activateWaitlistAccount({ token: hijackedToken, passwordHash: HASH })).toMatchObject({ userId: hijacked.userId });
    expect((await db.findPasswordUserByEmail(hijacked.email))?.passwordHash).toBe(HASH);
  });

  test("prepared accounts nobody activated are purged after 90 days, everything else stays", async () => {
    const { purgeUnactivatedWaitlistAccounts } = await import("../../apps/app/src/lib/unconfirmed-accounts");
    const old = await prepared("purge-old");
    await db.claimWaitlistInvitation(old.userId);
    await issue(old.userId, old.email);
    const neverMailed = await prepared("purge-never-mailed");
    const recent = await prepared("purge-recent");
    await db.claimWaitlistInvitation(recent.userId);
    const activated = await prepared("purge-activated");
    await db.claimWaitlistInvitation(activated.userId);
    await db.activateWaitlistAccount({ token: await issue(activated.userId, activated.email), passwordHash: HASH });
    const signedUp = await prepared("purge-signed-up");
    await db.claimWaitlistInvitation(signedUp.userId);
    await db.updatePasswordForEmail({ email: signedUp.email, passwordHash: HASH });
    const ids = [old, neverMailed, recent, activated, signedUp].map((entry) => entry.userId);
    await sql`update bloom_waitlist_transfers set invited_at = now() - interval '100 days' where user_id in ${sql([old.userId, activated.userId, signedUp.userId])}`;
    await sql`update bloom_waitlist_transfers set created_at = now() - interval '100 days' where user_id = ${neverMailed.userId}`;
    await sql`update bloom_users set created_at = now() - interval '100 days' where id in ${sql(ids)}`;

    const dry = await purgeUnactivatedWaitlistAccounts(sql, { dryRun: true });
    expect(dry.accounts).toBeGreaterThanOrEqual(2);
    const remaining = async () => (await sql`select id from bloom_users where id in ${sql(ids)}`).map((row) => row.id as string);
    expect(await remaining()).toHaveLength(5);

    const applied = await purgeUnactivatedWaitlistAccounts(sql, { dryRun: false });
    expect(applied.accounts).toBe(dry.accounts);
    expect((await remaining()).sort()).toEqual([recent.userId, activated.userId, signedUp.userId].sort());
    expect(await sql`select 1 from bloom_waitlist_transfers where user_id in ${sql([old.userId, neverMailed.userId])}`).toHaveLength(0);
    expect(await sql`select 1 from bloom_auth_tokens where user_id = ${old.userId}`).toHaveLength(0);
  });

  test("the run prepares each confirmed address once, skips existing accounts and repeats a failed mail", async () => {
    const existing = await db.createPasswordUser({ email: address("existing"), passwordHash: HASH });
    const entries = [
      { email: address("run-a"), source: "landing" },
      { email: address("run-b"), source: "landing-en" },
      { email: existing.email, source: "landing" },
      { email: address("run-a").toUpperCase(), source: "landing" },
    ];
    const sent: Array<{ email: string; locale: string }> = [];
    let failFor: string | null = address("run-b");
    const deps = {
      find: db.findWaitlistTransferState,
      create: (email: string, locale: "de" | "en") => db.createPreparedWaitlistAccount({ email, locale }),
      claim: db.claimWaitlistInvitation,
      release: db.releaseWaitlistInvitation,
      budget: async () => undefined,
      send: async (user: { id: string; email: string }, locale: "de" | "en") => {
        if (user.email === failFor) return { sent: false };
        sent.push({ email: user.email, locale });
        return { sent: true };
      },
    };

    const dry = await transfer.runWaitlistTransfer(entries, { rows: 5 }, deps);
    expect(dry).toMatchObject({ dryRun: true, created: 2, alreadyRegistered: 1, duplicates: 1, mailSent: 0 });
    expect(await db.findWaitlistTransferState(address("run-a"))).toBeNull();

    const first = await transfer.runWaitlistTransfer(entries, { apply: true, rows: 5 }, deps);
    expect(first).toMatchObject({ dryRun: false, rows: 5, notConfirmed: 1, confirmed: 4, created: 2, alreadyRegistered: 1, duplicates: 1, mailSent: 1, mailFailed: 1 });
    expect(transfer.checkWaitlistTransferBalance(first, 4)).toEqual({ balanced: true, matchesExport: true });
    expect(sent).toEqual([{ email: address("run-a"), locale: "de" }]);

    failFor = null;
    const second = await transfer.runWaitlistTransfer(entries, { apply: true, rows: 5 }, deps);
    expect(second).toMatchObject({ created: 0, retried: 1, alreadyInvited: 1, alreadyRegistered: 1, mailSent: 1, mailFailed: 0 });
    expect(transfer.checkWaitlistTransferBalance(second, 4).balanced).toBe(true);
    expect(sent).toEqual([{ email: address("run-a"), locale: "de" }, { email: address("run-b"), locale: "en" }]);

    const third = await transfer.runWaitlistTransfer(entries, { apply: true, rows: 5 }, deps);
    expect(third).toMatchObject({ created: 0, retried: 0, alreadyInvited: 2, alreadyRegistered: 1, mailSent: 0 });
    expect(sent).toHaveLength(2);
    expect((await db.findPasswordUserByEmail(existing.email))?.passwordHash).toBe(HASH);
  });
});
