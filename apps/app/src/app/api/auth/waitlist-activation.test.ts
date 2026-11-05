import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { ACTIVATION_LINK_INVALID_ERROR, DUPLICATE_TRIAL_ERROR, localizeAuthError, SIGNUP_CONSENT_REQUIRED_ERROR } from "../../../lib/auth-copy";
import { resetMailBudgetForTests } from "../../../lib/mail-budget";
import { resetMemoryRateLimitsForTests } from "../../../lib/request-security";
import { WAITLIST_ACTIVATION_TTL_DAYS } from "../../../lib/waitlist-transfer-constants";

/**
 * Activation of a prepared waitlist account (#105) through the real route handlers, with the
 * database and the mail provider replaced by in-memory fakes that keep the rules the routes rely
 * on. The SQL behind `activateWaitlistAccount` itself runs against a real Postgres in
 * tests/integration/waitlist-transfer-db.integration.test.ts.
 */

interface FakeUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  /** Set for an account prepared by the waitlist transfer. */
  transfer: { invited: boolean; activated: boolean } | null;
}

interface FakeToken {
  hash: string;
  userId: string;
  email: string;
  purpose: string;
  consumed: boolean;
}

const users = new Map<string, FakeUser>();
let tokens: FakeToken[] = [];
const mails: Array<{ kind: string; to: string; token: string }> = [];

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const realDb = await import("../../../lib/db");
mock.module("../../../lib/db", () => ({
  ...realDb,
  consumeRateLimit: async () => null,
  hasActiveBetaInvite: async () => false,
  acceptBetaInvite: async () => false,
  findPasswordUserByEmail: async (email: string) => users.get(email.trim().toLowerCase()) ?? null,
  updatePasswordForEmail: async (input: { email: string; passwordHash: string }) => {
    const user = users.get(input.email.trim().toLowerCase());
    if (user) user.passwordHash = input.passwordHash;
    return Boolean(user);
  },
  markEmailVerified: async (userId: string) => {
    for (const user of users.values()) if (user.id === userId) user.emailVerifiedAt ??= new Date().toISOString();
  },
  createAuthToken: async (input: { userId: string; email: string; purpose: string }) => {
    const token = randomUUID() + randomUUID();
    for (const existing of tokens) if (existing.userId === input.userId && existing.purpose === input.purpose) existing.consumed = true;
    tokens.push({ hash: tokenHash(token), userId: input.userId, email: input.email, purpose: input.purpose, consumed: false });
    return { token, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  },
  consumeAuthToken: async (input: { token: string; purpose: string }) => {
    const match = tokens.find((entry) => entry.hash === tokenHash(input.token) && entry.purpose === input.purpose && !entry.consumed);
    if (!match) return null;
    match.consumed = true;
    return { userId: match.userId, email: match.email };
  },
  isPreparedWaitlistAccount: async (user: { id: string; passwordHash: string | null; emailVerifiedAt: string | null }) => {
    if (user.passwordHash || user.emailVerifiedAt) return false;
    return [...users.values()].some((entry) => entry.id === user.id && entry.transfer && !entry.transfer.activated);
  },
  activateWaitlistAccount: async (input: { token: string; passwordHash: string }) => {
    const match = tokens.find((entry) => entry.hash === tokenHash(input.token) && entry.purpose === "waitlist_activation" && !entry.consumed);
    if (!match) return null;
    match.consumed = true;
    const user = [...users.values()].find((entry) => entry.id === match.userId);
    if (!user || user.emailVerifiedAt || !user.transfer?.invited || user.transfer.activated) return null;
    // Stands for another confirmed account of the same mailbox (#277); the SQL runs in the integration test.
    if (user.email.startsWith("twin")) return { blocked: "duplicate-trial" as const };
    user.passwordHash = input.passwordHash;
    user.emailVerifiedAt = new Date().toISOString();
    user.transfer.activated = true;
    return { userId: user.id, email: user.email };
  },
  createPasswordUser: async (input: { email: string; name?: string | null; passwordHash: string }) => {
    const email = input.email.trim().toLowerCase();
    const user: FakeUser = { id: randomUUID(), email, name: input.name ?? null, passwordHash: input.passwordHash, emailVerifiedAt: null, transfer: null };
    users.set(email, user);
    return user;
  },
}));

const realEmail = await import("../../../lib/email");
mock.module("../../../lib/email", () => ({
  ...realEmail,
  sendVerificationEmail: async (to: string, token: string) => {
    mails.push({ kind: "verification", to, token });
    return { sent: true as const };
  },
  sendPasswordResetEmail: async (to: string, token: string) => {
    mails.push({ kind: "reset", to, token });
    return { sent: true as const };
  },
}));

const { POST: activate } = await import("./activate-account/route");
const { POST: login } = await import("./login/route");
const { POST: signup } = await import("./signup/route");
const { POST: requestPasswordReset } = await import("./request-password-reset/route");
const { POST: resendVerification } = await import("./resend-verification/route");
const { POST: resetPassword } = await import("./reset-password/route");
const { GET: verifyEmail } = await import("./verify-email/route");

const mutableEnv = process.env as Record<string, string | undefined>;
const envKeys = ["BLOOMMD_AUTH_SECRET", "BLOOMMD_BETA_ACCESS", "BLOOMMD_E2E_AUTH_BYPASS", "DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "NODE_ENV"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const ORIGIN = "https://bloommd.app";
const EMAIL = "prepared@example.test";
const PASSWORD = "Testpass12345";
let addressCounter = 0;

function freshAddress() {
  addressCounter += 1;
  return `203.0.113.${(addressCounter % 250) + 1}`;
}

function formRequest(path: string, form: Record<string, string>, options: { address?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": options.address ?? freshAddress() };
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  return new Request(`https://localhost:3000${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams({ website: "", formStartedAt: String(Date.now() - 1_000), ...form }),
  });
}

const location = (response: Response) => decodeURIComponent(response.headers.get("location") ?? "");

/** A prepared account the way the transfer leaves it: no password, address unconfirmed, mail claimed. */
function prepare(email = EMAIL, options: { invited?: boolean } = {}) {
  const user: FakeUser = { id: randomUUID(), email, name: null, passwordHash: null, emailVerifiedAt: null, transfer: { invited: options.invited ?? true, activated: false } };
  users.set(email, user);
  const token = randomUUID() + randomUUID();
  tokens.push({ hash: tokenHash(token), userId: user.id, email, purpose: "waitlist_activation", consumed: false });
  return { user, token };
}

const activation = (token: string, extra: Record<string, string> = {}) => ({ token, password: PASSWORD, acceptTerms: "1", lang: "de", ...extra });

beforeEach(() => {
  users.clear();
  tokens = [];
  mails.length = 0;
  mutableEnv.NODE_ENV = "production";
  mutableEnv.NEXT_PUBLIC_SITE_URL = ORIGIN;
  mutableEnv.NEXT_PUBLIC_APP_URL = ORIGIN;
  mutableEnv.BLOOMMD_AUTH_SECRET = "unit-test-auth-secret-that-is-long-and-random";
  delete mutableEnv.BLOOMMD_BETA_ACCESS;
  delete mutableEnv.BLOOMMD_E2E_AUTH_BYPASS;
  delete mutableEnv.DATABASE_URL;
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

describe("a prepared waitlist account before activation", () => {
  test("no login works, whatever password is tried, and the reason is not revealed", async () => {
    prepare();
    for (const password of [PASSWORD, "null", "undefined", "pbkdf2-sha256$310000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]) {
      const response = await login(formRequest("/api/auth/login", { email: EMAIL, password, next: "/app" }));
      expect(location(response)).toContain(`${ORIGIN}/login?`);
      expect(location(response)).toContain("E-Mail oder Passwort ist falsch.");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  test("a reset link cannot be requested: the activation link is the only way in", async () => {
    prepare();

    const response = await requestPasswordReset(formRequest("/api/auth/request-password-reset", { email: EMAIL }));

    // Same answer as for any other address, no mail.
    expect(location(response)).toContain("reset=requested");
    expect(mails).toHaveLength(0);
    expect(tokens.filter((token) => token.purpose === "password_reset")).toHaveLength(0);
  });

  test("a confirmation mail cannot be requested either, which would skip the consent", async () => {
    prepare();

    const response = await resendVerification(formRequest("/api/auth/resend-verification", { email: EMAIL }));

    expect(location(response)).toContain("verification=sent");
    expect(mails).toHaveLength(0);
  });

  test("a reset token cannot activate it, and the activation token cannot reset a password", async () => {
    const { user, token } = prepare();
    // A reset token issued by other means (e.g. before the account was prepared) is the wrong purpose.
    const resetToken = randomUUID() + randomUUID();
    tokens.push({ hash: tokenHash(resetToken), userId: user.id, email: EMAIL, purpose: "password_reset", consumed: false });

    const wrongPurpose = await activate(formRequest("/api/auth/activate-account", activation(resetToken)));
    expect(location(wrongPurpose)).toContain(`${ORIGIN}/activate?`);
    expect(location(wrongPurpose)).toContain(ACTIVATION_LINK_INVALID_ERROR);
    expect(user).toMatchObject({ passwordHash: null, emailVerifiedAt: null });

    const resetWithActivation = await resetPassword(formRequest("/api/auth/reset-password", { token, password: PASSWORD }));
    expect(location(resetWithActivation)).toContain(`${ORIGIN}/reset-password?`);
    expect(user).toMatchObject({ passwordHash: null, emailVerifiedAt: null });
  });

  test("a reset token alone sets a password but confirms nothing, so there is still no login", async () => {
    const { user } = prepare();
    const resetToken = randomUUID() + randomUUID();
    tokens.push({ hash: tokenHash(resetToken), userId: user.id, email: EMAIL, purpose: "password_reset", consumed: false });

    await resetPassword(formRequest("/api/auth/reset-password", { token: resetToken, password: PASSWORD }));
    const login1 = await login(formRequest("/api/auth/login", { email: EMAIL, password: PASSWORD, next: "/app" }));

    // The reset sets a password but confirms nothing: still no login.
    expect(location(login1)).toContain("Bitte bestätige zuerst deine E-Mail-Adresse.");
    expect(login1.headers.get("set-cookie")).toBeNull();
  });
});

describe("activation", () => {
  test("the form POST confirms the address, sets the password and allows the login", async () => {
    const { user, token } = prepare();

    const response = await activate(formRequest("/api/auth/activate-account", activation(token)));

    expect(response.status).toBe(303);
    expect(location(response)).toContain(`${ORIGIN}/login?`);
    expect(location(response)).toContain("verified=1");
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toStartWith("pbkdf2-sha256$");
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(response.headers.get("set-cookie")).toBeNull();

    const signedIn = await login(formRequest("/api/auth/login", { email: EMAIL, password: PASSWORD, next: "/app" }));
    expect(signedIn.headers.get("location")).toBe(`${ORIGIN}/app`);
    expect(signedIn.headers.get("set-cookie")).toContain("bloommd_session=");
  });

  test("the consent to privacy policy and terms is enforced on the server and keeps the link usable", async () => {
    const { user, token } = prepare();
    const { acceptTerms: _omitted, ...withoutConsent } = activation(token);

    for (const form of [withoutConsent, { ...withoutConsent, acceptTerms: "" }, { ...withoutConsent, acceptTerms: "on" }]) {
      const response = await activate(formRequest("/api/auth/activate-account", form));
      expect(location(response)).toContain(`${ORIGIN}/activate?`);
      expect(location(response)).toContain(SIGNUP_CONSENT_REQUIRED_ERROR);
      expect(location(response)).toContain(`token=${token}`);
    }
    expect(user).toMatchObject({ passwordHash: null, emailVerifiedAt: null });

    const retry = await activate(formRequest("/api/auth/activate-account", activation(token)));
    expect(location(retry)).toContain("verified=1");
  });

  test("a weak password is refused without using up the link", async () => {
    const { user, token } = prepare();

    for (const password of ["", "short1", "onlyletterslonger"]) {
      const response = await activate(formRequest("/api/auth/activate-account", activation(token, { password })));
      expect(location(response)).toContain(`${ORIGIN}/activate?`);
    }
    expect(user.emailVerifiedAt).toBeNull();

    const retry = await activate(formRequest("/api/auth/activate-account", activation(token)));
    expect(location(retry)).toContain("verified=1");
  });

  test("the link works once", async () => {
    const { user, token } = prepare();
    await activate(formRequest("/api/auth/activate-account", activation(token)));
    const hash = user.passwordHash;

    const replay = await activate(formRequest("/api/auth/activate-account", activation(token, { password: "AnotherPass67890" })));

    expect(location(replay)).toContain(ACTIVATION_LINK_INVALID_ERROR);
    expect(user.passwordHash).toBe(hash);
  });

  test("a second account of a mailbox is not activated and the person is told why (#277)", async () => {
    const { user, token } = prepare("twin+list@example.test");

    const response = await activate(formRequest("/api/auth/activate-account", activation(token)));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/activate");
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(DUPLICATE_TRIAL_ERROR);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toBeNull();
  });

  test("unknown and empty tokens are refused with the same message", async () => {
    prepare();
    for (const token of ["", "nope", randomUUID()]) {
      const response = await activate(formRequest("/api/auth/activate-account", activation(token)));
      expect(location(response)).toContain(ACTIVATION_LINK_INVALID_ERROR);
    }
  });

  test("a mail that was not claimed, an account of another origin and a confirmed account are not activated", async () => {
    const unclaimed = prepare("unclaimed@example.test", { invited: false });
    expect(location(await activate(formRequest("/api/auth/activate-account", activation(unclaimed.token))))).toContain(ACTIVATION_LINK_INVALID_ERROR);
    expect(unclaimed.user.passwordHash).toBeNull();

    // A token of the right purpose for an account that does not come from the waitlist.
    const foreign: FakeUser = { id: randomUUID(), email: "foreign@example.test", name: null, passwordHash: "pbkdf2-sha256$310000$a$b", emailVerifiedAt: null, transfer: null };
    users.set(foreign.email, foreign);
    const foreignToken = randomUUID() + randomUUID();
    tokens.push({ hash: tokenHash(foreignToken), userId: foreign.id, email: foreign.email, purpose: "waitlist_activation", consumed: false });
    expect(location(await activate(formRequest("/api/auth/activate-account", activation(foreignToken))))).toContain(ACTIVATION_LINK_INVALID_ERROR);
    expect(foreign).toMatchObject({ passwordHash: "pbkdf2-sha256$310000$a$b", emailVerifiedAt: null });

    const confirmed = prepare("confirmed@example.test");
    confirmed.user.emailVerifiedAt = "2026-10-01T10:00:00.000Z";
    confirmed.user.passwordHash = "pbkdf2-sha256$310000$c$d";
    expect(location(await activate(formRequest("/api/auth/activate-account", activation(confirmed.token))))).toContain(ACTIVATION_LINK_INVALID_ERROR);
    expect(confirmed.user.passwordHash).toBe("pbkdf2-sha256$310000$c$d");
  });

  test("a foreign or missing origin is refused before anything is read", async () => {
    const { user, token } = prepare();

    for (const origin of ["https://evil.example", null]) {
      const response = await activate(formRequest("/api/auth/activate-account", activation(token), { origin }));
      expect(response.status).toBe(403);
    }
    expect(user.emailVerifiedAt).toBeNull();
  });

  test("is rate limited per source", async () => {
    prepare();
    const address = "198.51.100.200";
    let blocked: Response | null = null;
    for (let attempt = 0; attempt < 12 && !blocked; attempt += 1) {
      const response = await activate(formRequest("/api/auth/activate-account", activation(`guess-${attempt}`), { address }));
      if (response.headers.get("retry-after")) blocked = response;
    }

    expect(blocked).not.toBeNull();
    expect(location(blocked!)).toContain("Zu viele Versuche");
    expect(Number(blocked!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("signing up on one's own instead", () => {
  test("a prepared address can still register through the signup form, with the consent and the confirmation mail", async () => {
    const { user } = prepare();

    const response = await signup(formRequest("/api/auth/signup", { email: EMAIL, password: PASSWORD, acceptTerms: "1", next: "/app" }));

    expect(location(response)).toContain("verification=sent");
    expect(user.passwordHash).toStartWith("pbkdf2-sha256$");
    expect(user.emailVerifiedAt).toBeNull();
    const mail = mails.find((entry) => entry.kind === "verification" && entry.to === EMAIL)!;
    expect(mail).toBeDefined();
    await verifyEmail(new Request(`https://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(mail.token)}`, { headers: { "X-Forwarded-For": freshAddress() } }));
    expect(user.emailVerifiedAt).not.toBeNull();
  });
});

describe("wording", () => {
  test("the new errors have English wording and the link outlives the batch of mails", () => {
    expect(localizeAuthError(ACTIVATION_LINK_INVALID_ERROR, "de")).toBe(ACTIVATION_LINK_INVALID_ERROR);
    expect(localizeAuthError(ACTIVATION_LINK_INVALID_ERROR, "en")).not.toBe(ACTIVATION_LINK_INVALID_ERROR);
    // 300 mails per day at most: the link has to be valid for longer than a day's batch.
    expect(WAITLIST_ACTIVATION_TTL_DAYS).toBeGreaterThanOrEqual(7);
  });
});
