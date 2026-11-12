import { afterEach, describe, expect, mock, test } from "bun:test";

/**
 * The write lock of expired trial accounts (#274) and its exception for accounts with an active plan
 * (#378). Only the database lookups are replaced; the boundaries of the plan itself (`active`,
 * `expires_at`) are SQL and covered against Postgres in tests/integration/trial-lock-entitlement-db.integration.test.ts.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2027-02-01T12:00:00.000Z");
let endsAt: string | null = null;
let hasPlan = false;
let planFails = false;
const planAsked: Array<{ userId: string; now: Date | undefined }> = [];

const realDb = await import("./db");
mock.module("./db", () => ({
  ...realDb,
  getTrialEndsAt: async () => endsAt,
  hasActiveEntitlement: async (userId: string, now?: Date) => {
    planAsked.push({ userId, now });
    if (planFails) throw new Error("db down");
    return hasPlan;
  },
}));
const { isTrialExpired, isTrialWriteLocked } = await import("./trial-lock");

describe("isTrialWriteLocked (#274, #378)", () => {
  afterEach(() => {
    delete process.env.BLOOMMD_TRIAL_READONLY;
    endsAt = null;
    hasPlan = false;
    planFails = false;
    planAsked.length = 0;
  });

  test("never locks with the switch off, and does not ask for the plan", async () => {
    endsAt = new Date(NOW.getTime() - DAY).toISOString();
    expect(await isTrialWriteLocked(USER, NOW)).toBe(false);
    expect(planAsked).toHaveLength(0);
  });

  test("locks an expired account without a plan", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(NOW.getTime() - DAY).toISOString();
    expect(await isTrialWriteLocked(USER, NOW)).toBe(true);
    expect(planAsked).toEqual([{ userId: USER, now: NOW }]);
  });

  test("an expired account with an active plan stays writable", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(NOW.getTime() - DAY).toISOString();
    hasPlan = true;
    expect(await isTrialWriteLocked(USER, NOW)).toBe(false);
  });

  test("the trial end exactly now counts as over", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = NOW.toISOString();
    expect(await isTrialExpired(USER, NOW)).toBe(true);
    expect(await isTrialWriteLocked(USER, NOW)).toBe(true);
    hasPlan = true;
    expect(await isTrialWriteLocked(USER, NOW)).toBe(false);
  });

  test("while the trial runs, there is no trial end or no account, the plan is not asked", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(NOW.getTime() + DAY).toISOString();
    expect(await isTrialWriteLocked(USER, NOW)).toBe(false);
    endsAt = null;
    expect(await isTrialWriteLocked(USER, NOW)).toBe(false);
    endsAt = new Date(NOW.getTime() - DAY).toISOString();
    expect(await isTrialWriteLocked(undefined, NOW)).toBe(false);
    expect(await isTrialWriteLocked("not-a-uuid", NOW)).toBe(false);
    expect(planAsked).toHaveLength(0);
  });

  test("a failing plan lookup is thrown to the caller, which decides (the guard does not block)", async () => {
    process.env.BLOOMMD_TRIAL_READONLY = "1";
    endsAt = new Date(NOW.getTime() - DAY).toISOString();
    planFails = true;
    await expect(isTrialWriteLocked(USER, NOW)).rejects.toThrow("db down");
  });
});
