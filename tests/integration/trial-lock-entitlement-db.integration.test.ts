/**
 * Read-only mode after the trial and its exception for accounts with an active plan (#378) against a
 * real Postgres: `hasActiveEntitlement` (rows of `bloom_entitlements`: `active`, `expires_at`) and
 * `isTrialWriteLocked` on top of it, including the status changes `recordStripeSubscription` writes.
 * Runs only with BLOOMMD_TEST_DATABASE_URL (a throwaway database; it is migrated here), e.g.
 * `docker run -d -e POSTGRES_PASSWORD=qa -p 55434:5432 postgres:17-alpine`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { testDatabaseUrl } from "./db-test-url";

const url = testDatabaseUrl();

describe.skipIf(!url)("trial lock and active plan (Postgres)", () => {
  let db: typeof import("../../apps/app/src/lib/db");
  let lock: typeof import("../../apps/app/src/lib/trial-lock");
  let sql: import("../../apps/app/node_modules/postgres").Sql;
  const run = Date.now().toString(36);
  const address = (name: string) => `${name}-${run}@bloommd.test`;
  const HASH = "pbkdf2-sha256$310000$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g";
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date("2027-02-01T12:00:00.000Z");

  /** A confirmed account whose trial ended a day before NOW (or still runs, with `ended: false`). */
  async function account(name: string, { ended = true }: { ended?: boolean } = {}) {
    const user = await db.createPasswordUser({ email: address(name), passwordHash: HASH });
    const endsAt = new Date(NOW.getTime() + (ended ? -DAY : DAY));
    await sql`update bloom_users set trial_ends_at = ${endsAt.toISOString()} where id = ${user.id}`;
    return user.id;
  }

  async function entitlement(userId: string, feature: string, { active, expiresAt }: { active: boolean; expiresAt: Date | null }) {
    await sql`
      insert into bloom_entitlements (user_id, feature, source, active, expires_at)
      values (${userId}, ${feature}, ${`src-${run}`}, ${active}, ${expiresAt ? expiresAt.toISOString() : null})
    `;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = await import("../../apps/app/src/lib/db");
    lock = await import("../../apps/app/src/lib/trial-lock");
    const postgres = (await import("../../apps/app/node_modules/postgres")).default;
    sql = postgres(url!, { max: 1 });
    await db.migrateMarketSchema();
  });

  afterEach(() => {
    delete process.env.BLOOMMD_TRIAL_READONLY;
  });

  afterAll(async () => {
    await sql?.end();
  });

  test("hasActiveEntitlement: no row, inactive, expired, open-ended, in the future and exactly now", async () => {
    const none = await account("plan-none");
    expect(await db.hasActiveEntitlement(none, NOW)).toBe(false);

    const inactive = await account("plan-inactive");
    await entitlement(inactive, "cloud", { active: false, expiresAt: null });
    expect(await db.hasActiveEntitlement(inactive, NOW)).toBe(false);

    const inactiveFuture = await account("plan-inactive-future");
    await entitlement(inactiveFuture, "cloud", { active: false, expiresAt: new Date(NOW.getTime() + DAY) });
    expect(await db.hasActiveEntitlement(inactiveFuture, NOW)).toBe(false);

    const past = await account("plan-past");
    await entitlement(past, "cloud", { active: true, expiresAt: new Date(NOW.getTime() - DAY) });
    expect(await db.hasActiveEntitlement(past, NOW)).toBe(false);

    const exactlyNow = await account("plan-now");
    await entitlement(exactlyNow, "cloud", { active: true, expiresAt: NOW });
    expect(await db.hasActiveEntitlement(exactlyNow, NOW)).toBe(false);
    expect(await db.hasActiveEntitlement(exactlyNow, new Date(NOW.getTime() - 1))).toBe(true);

    const openEnded = await account("plan-null");
    await entitlement(openEnded, "cloud", { active: true, expiresAt: null });
    expect(await db.hasActiveEntitlement(openEnded, NOW)).toBe(true);

    const future = await account("plan-future");
    await entitlement(future, "cloud", { active: true, expiresAt: new Date(NOW.getTime() + DAY) });
    expect(await db.hasActiveEntitlement(future, NOW)).toBe(true);
  });

  test("one active row is enough, whatever the other rows and the feature are", async () => {
    const mixed = await account("plan-mixed");
    await entitlement(mixed, "old", { active: false, expiresAt: null });
    await entitlement(mixed, "expired", { active: true, expiresAt: new Date(NOW.getTime() - DAY) });
    expect(await db.hasActiveEntitlement(mixed, NOW)).toBe(false);
    await entitlement(mixed, "anything-else", { active: true, expiresAt: new Date(NOW.getTime() + DAY) });
    expect(await db.hasActiveEntitlement(mixed, NOW)).toBe(true);
  });

  test("an account only sees its own plan", async () => {
    const paying = await account("plan-own");
    const other = await account("plan-other");
    await entitlement(paying, "cloud", { active: true, expiresAt: null });
    expect(await db.hasActiveEntitlement(other, NOW)).toBe(false);
  });

  test("isTrialWriteLocked: an expired account is locked without a plan and free with one", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    const free = await account("lock-free");
    expect(await lock.isTrialWriteLocked(free, NOW)).toBe(true);

    const paying = await account("lock-paying");
    await entitlement(paying, "cloud", { active: true, expiresAt: new Date(NOW.getTime() + DAY) });
    expect(await lock.isTrialWriteLocked(paying, NOW)).toBe(false);

    const lapsed = await account("lock-lapsed");
    await entitlement(lapsed, "cloud", { active: true, expiresAt: NOW });
    expect(await lock.isTrialWriteLocked(lapsed, NOW)).toBe(true);
  });

  test("Cloud subscription (#379): the events Stripe sends give the account the feature cloud and take it away again", async () => {
    const userId = await account("cloud-lifecycle");
    const now = new Date();
    const periodEnd = Math.floor((now.getTime() + 30 * DAY) / 1000);
    const subscriptionId = `sub_cloud_${run}`;
    const cloudRows = async () => (await sql`select feature, active from bloom_entitlements where user_id = ${userId}`).map((row) => [row.feature, row.active]);
    const subscription = (status: string, extra: Partial<Parameters<typeof db.recordStripeSubscription>[0]> = {}) =>
      db.recordStripeSubscription({
        userId, tier: "cloud", status, mode: "subscription", stripeSubscriptionId: subscriptionId, stripeCustomerId: `cus_cloud_${run}`,
        currentPeriodEnd: periodEnd, raw: { id: subscriptionId, status }, ...extra,
      });

    expect(await db.hasActiveEntitlement(userId, now)).toBe(false);

    // checkout.session.completed (subscription mode, paid): active at once, no period end yet.
    await db.recordStripeSubscription({
      userId, tier: "cloud", status: "paid", mode: "subscription", stripeCustomerId: `cus_cloud_${run}`,
      stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId: `cs_cloud_${run}`, raw: { id: `cs_cloud_${run}` },
    });
    expect(await db.hasActiveEntitlement(userId, now)).toBe(true);
    expect(await cloudRows()).toEqual([["cloud", true]]);

    // customer.subscription.created / updated: the same row, now with the end of the period.
    await subscription("active");
    expect(await db.hasActiveEntitlement(userId, now)).toBe(true);
    expect(await cloudRows()).toEqual([["cloud", true]]);

    // Cancelled to the end of the period: active until then, over from the period end on.
    await subscription("active", { cancelAtPeriodEnd: true });
    expect(await db.hasActiveEntitlement(userId, now)).toBe(true);
    expect(await db.hasActiveEntitlement(userId, new Date(periodEnd * 1000))).toBe(false);

    // Payment failed, then paid again.
    await subscription("past_due");
    expect(await db.hasActiveEntitlement(userId, now)).toBe(false);
    await subscription("active");
    expect(await db.hasActiveEntitlement(userId, now)).toBe(true);

    // customer.subscription.deleted.
    await subscription("canceled");
    expect(await db.hasActiveEntitlement(userId, now)).toBe(false);
    expect(await cloudRows()).toEqual([["cloud", false]]);
    const stored = await sql`select tier, status, mode from bloom_subscriptions where stripe_subscription_id = ${subscriptionId}`;
    expect(stored.map((row) => [row.tier, row.status, row.mode])).toEqual([["cloud", "canceled", "subscription"]]);
  });

  test("isTrialWriteLocked: the switch off or a running trial never lock", async () => {
    const free = await account("lock-off");
    expect(await lock.isTrialWriteLocked(free, NOW)).toBe(false);
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    const running = await account("lock-running", { ended: false });
    expect(await lock.isTrialWriteLocked(running, NOW)).toBe(false);
  });

  test("recordStripeSubscription: active frees the account, a status change to canceled or past_due locks it again", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    const userId = await account("lock-stripe");
    const now = new Date();
    // The trial of this account ended long ago for the real clock as well.
    await sql`update bloom_users set trial_ends_at = ${new Date(now.getTime() - DAY).toISOString()} where id = ${userId}`;
    const periodEnd = Math.floor((now.getTime() + 30 * DAY) / 1000);
    const subscription = (status: string, extra: Partial<Parameters<typeof db.recordStripeSubscription>[0]> = {}) =>
      db.recordStripeSubscription({
        userId, tier: "cloud", status, mode: "subscription", stripeSubscriptionId: `sub_lock_${run}`, stripeCustomerId: `cus_lock_${run}`,
        currentPeriodEnd: periodEnd, raw: { id: `sub_lock_${run}`, status }, ...extra,
      });

    expect(await lock.isTrialWriteLocked(userId, now)).toBe(true);

    await subscription("active");
    expect(await lock.isTrialWriteLocked(userId, now)).toBe(false);

    await subscription("past_due");
    expect(await lock.isTrialWriteLocked(userId, now)).toBe(true);

    await subscription("active");
    expect(await lock.isTrialWriteLocked(userId, now)).toBe(false);

    // Cancelled at the end of the period: still active until then, locked from the period end on.
    await subscription("active", { cancelAtPeriodEnd: true });
    expect(await lock.isTrialWriteLocked(userId, now)).toBe(false);
    expect(await lock.isTrialWriteLocked(userId, new Date(periodEnd * 1000))).toBe(true);

    await subscription("canceled");
    expect(await lock.isTrialWriteLocked(userId, now)).toBe(true);
    expect((await sql`select active from bloom_entitlements where user_id = ${userId}`).map((row) => row.active)).toEqual([false]);
  });
});
