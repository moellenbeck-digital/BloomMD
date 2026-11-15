import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { resetMailBudgetForTests } from "../../../lib/mail-budget";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";

/**
 * Self-service of the trial (#277): registration and confirmation, the only routes that touch an
 * account's trial, cannot be talked into changing the trial end, the mailbox rule or a per-account
 * override. The database is replaced by a recorder: what the routes hand to it is what counts.
 * The real writes are covered by tests/integration/trial-admin-db.integration.test.ts.
 */

const created: Array<Record<string, unknown>> = [];
const verified: unknown[][] = [];
let mails = 0;

const realDb = await import("../../../lib/db");
mock.module("../../../lib/db", () => ({
  ...realDb,
  consumeRateLimit: async () => null,
  hasActiveBetaInvite: async () => false,
  acceptBetaInvite: async () => false,
  findPasswordUserByEmail: async () => null,
  hasConfirmedMailboxTwin: async () => false,
  createPasswordUser: async (input: Record<string, unknown>) => {
    created.push(input);
    return { id: randomUUID(), email: String(input.email), name: null, passwordHash: "x", emailVerifiedAt: null };
  },
  createAuthToken: async () => ({ token: "t".repeat(40), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }),
  consumeAuthToken: async () => ({ userId: "11111111-1111-4111-8111-111111111111", email: "a@example.test" }),
  markEmailVerified: async (...args: unknown[]) => {
    verified.push(args);
    return "ok" as const;
  },
}));
const realEmail = await import("../../../lib/email");
mock.module("../../../lib/email", () => ({
  ...realEmail,
  sendVerificationEmail: async () => {
    mails += 1;
    return { sent: true as const };
  },
}));

const { POST: signup } = await import("./signup/route");
const { GET: verifyEmail } = await import("./verify-email/route");

const mutableEnv = process.env as Record<string, string | undefined>;
const envKeys = ["BLOOMMD_BETA_ACCESS", "BLOOMMD_AUTH_SECRET", "BLOOMMD_E2E_AUTH_BYPASS", "BLOOMMD_E2E_TEST_MODE", "BLOOMMD_LOCAL_DEPLOYMENT", "DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "NODE_ENV"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const ORIGIN = "https://bloommd.app";

beforeEach(() => {
  created.length = 0;
  verified.length = 0;
  mails = 0;
  mutableEnv.NODE_ENV = "production";
  mutableEnv.NEXT_PUBLIC_SITE_URL = ORIGIN;
  mutableEnv.NEXT_PUBLIC_APP_URL = ORIGIN;
  mutableEnv.BLOOMMD_AUTH_SECRET = "unit-test-auth-secret-that-is-long-and-random";
  for (const key of ["BLOOMMD_BETA_ACCESS", "BLOOMMD_E2E_AUTH_BYPASS", "BLOOMMD_E2E_TEST_MODE", "BLOOMMD_LOCAL_DEPLOYMENT", "DATABASE_URL"]) delete mutableEnv[key];
  resetMemoryRateLimitsForTests();
  resetMailBudgetForTests();
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value == null) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  resetMemoryRateLimitsForTests();
});

const TRIAL_FIELDS = {
  trialEndsAt: "2099-01-01T00:00:00Z",
  trial_ends_at: "2099-01-01T00:00:00Z",
  trialGuarded: "false",
  trial_guarded: "false",
  trialDaysOverride: "3650",
  trial_days_override: "3650",
  trialLegacy: "true",
  trial_legacy: "true",
  emailVerifiedAt: "2020-01-01T00:00:00Z",
};

describe("registration and confirmation cannot change the trial (#277)", () => {
  test("a sign-up with trial fields in the form hands only address, name, password hash and language to the database", async () => {
    const response = await signup(
      new Request("https://localhost:3000/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, "X-Forwarded-For": "203.0.113.7" },
        body: new URLSearchParams({ website: "", formStartedAt: String(Date.now() - 1_000), email: "new@example.test", password: "Testpass12345", acceptTerms: "1", next: "/app", ...TRIAL_FIELDS }),
      }),
    );

    expect(response.status).toBe(303);
    expect(mails).toBe(1);
    expect(created).toHaveLength(1);
    expect(Object.keys(created[0]!).sort()).toEqual(["email", "locale", "name", "passwordHash"]);
  });

  test("a confirmation link with trial fields in the query passes the account id on, nothing else", async () => {
    const query = new URLSearchParams({ token: "t".repeat(40), ...TRIAL_FIELDS });
    const response = await verifyEmail(new Request(`https://localhost:3000/api/auth/verify-email?${query}`, { headers: { "X-Forwarded-For": "203.0.113.8" } }));

    expect(response.status).toBe(303);
    expect(verified).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });
});
