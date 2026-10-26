import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { localizeAuthError, SIGNUP_CONSENT_REQUIRED_ERROR, VERIFICATION_NOT_SENT_ERROR } from "../../../lib/auth-copy";
import { RateLimitError, SIGNUP_RATE_LIMIT, resetMemoryRateLimitsForTests } from "../../../lib/request-security";

/**
 * Open self-registration (#104) through the real route handlers, with the database and the mail
 * provider replaced by small in-memory fakes. The fakes keep the behaviour the routes rely on:
 * a new auth token invalidates the previous one of the same purpose, and tokens are single-use.
 */

interface FakeUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
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
const mails: Array<{ kind: "verification" | "reset"; to: string; token: string }> = [];
let mailDelivers = true;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const realDb = await import("../../../lib/db");
mock.module("../../../lib/db", () => ({
  ...realDb,
  consumeRateLimit: async () => null,
  hasActiveBetaInvite: async () => false,
  acceptBetaInvite: async () => false,
  findPasswordUserByEmail: async (email: string) => users.get(email.trim().toLowerCase()) ?? null,
  createPasswordUser: async (input: { email: string; name?: string | null; passwordHash: string }) => {
    const email = input.email.trim().toLowerCase();
    if (users.has(email)) throw new Error("Für diese E-Mail existiert bereits ein Account.");
    const user: FakeUser = { id: randomUUID(), email, name: input.name ?? null, passwordHash: input.passwordHash, emailVerifiedAt: null };
    users.set(email, user);
    return user;
  },
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
}));

const realEmail = await import("../../../lib/email");
mock.module("../../../lib/email", () => ({
  ...realEmail,
  sendVerificationEmail: async (to: string, token: string) => {
    if (!mailDelivers) return { sent: false as const, reason: "not-configured" as const };
    mails.push({ kind: "verification", to, token });
    return { sent: true as const };
  },
  sendPasswordResetEmail: async (to: string, token: string) => {
    mails.push({ kind: "reset", to, token });
    return { sent: true as const };
  },
}));

const { POST: signup } = await import("./signup/route");
const { POST: login } = await import("./login/route");
const { POST: requestPasswordReset } = await import("./request-password-reset/route");
const { POST: resetPassword } = await import("./reset-password/route");
const { GET: verifyEmail } = await import("./verify-email/route");

const mutableEnv = process.env as Record<string, string | undefined>;
const envKeys = [
  "BLOOMMD_BETA_ACCESS",
  "BLOOMMD_BETA_ALLOWED_EMAILS",
  "BLOOMMD_BETA_INVITE_CODES",
  "BLOOMMD_AUTH_SECRET",
  "BLOOMMD_E2E_AUTH_BYPASS",
  "BLOOMMD_E2E_TEST_MODE",
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NODE_ENV",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const ORIGIN = "https://bloommd.app";
const PASSWORD = "Testpass12345";
const NEW_PASSWORD = "AnotherPass67890";
let addressCounter = 0;

function freshAddress() {
  addressCounter += 1;
  return `203.0.113.${(addressCounter % 250) + 1}`;
}

function formRequest(path: string, form: Record<string, string>, address = freshAddress()) {
  return new Request(`https://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, "X-Forwarded-For": address },
    body: new URLSearchParams({ website: "", formStartedAt: String(Date.now() - 1_000), ...form }),
  });
}

function signupForm(email: string, extra: Record<string, string> = {}) {
  return { email, password: PASSWORD, acceptTerms: "1", next: "/app", ...extra };
}

function decodedLocation(response: Response) {
  return decodeURIComponent(response.headers.get("location") ?? "");
}

function lastMail(kind: "verification" | "reset", to: string) {
  return [...mails].reverse().find((mail) => mail.kind === kind && mail.to === to);
}

async function confirmEmail(token: string) {
  return verifyEmail(new Request(`https://localhost:3000/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
    headers: { "X-Forwarded-For": freshAddress() },
  }));
}

beforeEach(() => {
  users.clear();
  tokens = [];
  mails.length = 0;
  mailDelivers = true;
  mutableEnv.NODE_ENV = "production";
  mutableEnv.NEXT_PUBLIC_SITE_URL = ORIGIN;
  mutableEnv.NEXT_PUBLIC_APP_URL = ORIGIN;
  mutableEnv.BLOOMMD_AUTH_SECRET = "unit-test-auth-secret-that-is-long-and-random";
  delete mutableEnv.BLOOMMD_BETA_ACCESS;
  delete mutableEnv.BLOOMMD_BETA_ALLOWED_EMAILS;
  delete mutableEnv.BLOOMMD_BETA_INVITE_CODES;
  delete mutableEnv.BLOOMMD_E2E_AUTH_BYPASS;
  delete mutableEnv.BLOOMMD_E2E_TEST_MODE;
  delete mutableEnv.DATABASE_URL;
  resetMemoryRateLimitsForTests();
});

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value == null) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  resetMemoryRateLimitsForTests();
});

describe("signup with the closed-beta gate off", () => {
  test("registers without an invitation and sends the confirmation mail", async () => {
    const response = await signup(formRequest("/api/auth/signup", signupForm("new@example.test")));

    expect(response.status).toBe(303);
    const location = decodedLocation(response);
    expect(location.startsWith(`${ORIGIN}/login?`)).toBe(true);
    expect(location).toContain("verification=sent");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(users.get("new@example.test")?.emailVerifiedAt).toBeNull();
    expect(lastMail("verification", "new@example.test")).toBeDefined();
  });

  test("treats any value other than 1 as gate off", async () => {
    mutableEnv.BLOOMMD_BETA_ACCESS = "0";
    const response = await signup(formRequest("/api/auth/signup", signupForm("zero@example.test")));

    expect(decodedLocation(response)).toContain("verification=sent");
  });
});

describe("signup with the closed-beta gate on", () => {
  beforeEach(() => {
    mutableEnv.BLOOMMD_BETA_ACCESS = "1";
    mutableEnv.BLOOMMD_BETA_ALLOWED_EMAILS = "invited@example.test";
    mutableEnv.BLOOMMD_BETA_INVITE_CODES = "beta-code";
  });

  test("still rejects an uninvited address", async () => {
    const response = await signup(formRequest("/api/auth/signup", signupForm("stranger@example.test")));

    expect(response.status).toBe(303);
    expect(decodedLocation(response)).toContain(`${ORIGIN}/signup?`);
    expect(decodedLocation(response)).toContain("Diese E-Mail ist noch nicht für die Beta freigeschaltet.");
    expect(users.size).toBe(0);
    expect(mails).toHaveLength(0);
  });

  test("rejects a wrong invite code", async () => {
    const response = await signup(formRequest("/api/auth/signup", signupForm("stranger@example.test", { inviteCode: "nope" })));

    expect(decodedLocation(response)).toContain("Der Einladungscode ist ungültig.");
    expect(users.size).toBe(0);
  });

  test("accepts an invited address and a valid code", async () => {
    const invited = await signup(formRequest("/api/auth/signup", signupForm("invited@example.test")));
    const withCode = await signup(formRequest("/api/auth/signup", signupForm("guest@example.test", { inviteCode: "beta-code" })));

    expect(decodedLocation(invited)).toContain("verification=sent");
    expect(decodedLocation(withCode)).toContain("verification=sent");
    expect([...users.keys()].sort()).toEqual(["guest@example.test", "invited@example.test"]);
  });
});

describe("signup consent", () => {
  for (const gate of ["off", "on"] as const) {
    test(`is enforced on the server with the gate ${gate}`, async () => {
      if (gate === "on") {
        mutableEnv.BLOOMMD_BETA_ACCESS = "1";
        mutableEnv.BLOOMMD_BETA_ALLOWED_EMAILS = "invited@example.test";
      }
      const email = gate === "on" ? "invited@example.test" : "consent@example.test";
      const { acceptTerms: _omitted, ...withoutConsent } = signupForm(email);

      for (const form of [withoutConsent, { ...withoutConsent, acceptTerms: "" }, { ...withoutConsent, acceptTerms: "on" }]) {
        const response = await signup(formRequest("/api/auth/signup", form));
        expect(response.status).toBe(303);
        expect(decodedLocation(response)).toContain(`${ORIGIN}/signup?`);
        expect(decodedLocation(response)).toContain("Bitte stimme der Datenschutzerklärung und den AGB zu.");
      }
      expect(users.size).toBe(0);
      expect(mails).toHaveLength(0);
    });
  }

  test("does not count against the rate limit", async () => {
    const address = "198.51.100.77";
    for (let attempt = 0; attempt < SIGNUP_RATE_LIMIT.perSource + 5; attempt += 1) {
      await signup(formRequest("/api/auth/signup", { email: `nc${attempt}@example.test`, password: PASSWORD }, address));
    }
    const response = await signup(formRequest("/api/auth/signup", signupForm("fine@example.test"), address));

    expect(decodedLocation(response)).toContain("verification=sent");
  });
});

describe("signup rate limits", () => {
  test("stops repeated signups for one address from different sources", async () => {
    const email = "repeat@example.test";
    for (let attempt = 0; attempt < SIGNUP_RATE_LIMIT.perAccount; attempt += 1) {
      const response = await signup(formRequest("/api/auth/signup", signupForm(email)));
      expect(decodedLocation(response)).toContain("verification=sent");
    }

    const blocked = await signup(formRequest("/api/auth/signup", signupForm(email)));

    expect(blocked.status).toBe(303);
    expect(decodedLocation(blocked)).toContain(`${ORIGIN}/signup?`);
    expect(decodedLocation(blocked)).toContain("Zu viele Versuche");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("retry-after"))).toBeLessThanOrEqual(SIGNUP_RATE_LIMIT.windowMs / 1000);
  });

  test("stops mass registration with many addresses from one source", async () => {
    const address = "198.51.100.9";
    for (let attempt = 0; attempt < SIGNUP_RATE_LIMIT.perSource; attempt += 1) {
      const response = await signup(formRequest("/api/auth/signup", signupForm(`bulk${attempt}@example.test`), address));
      expect(decodedLocation(response)).toContain("verification=sent");
    }

    const blocked = await signup(formRequest("/api/auth/signup", signupForm("bulk-extra@example.test"), address));

    expect(blocked.status).toBe(303);
    expect(decodedLocation(blocked)).toContain("Zu viele Versuche");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(users.has("bulk-extra@example.test")).toBe(false);
    expect(users.size).toBe(SIGNUP_RATE_LIMIT.perSource);

    const otherSource = await signup(formRequest("/api/auth/signup", signupForm("bulk-other@example.test"), "198.51.100.10"));
    expect(decodedLocation(otherSource)).toContain("verification=sent");
  });

  test("allows more signups per source than per account", () => {
    expect(SIGNUP_RATE_LIMIT.perSource).toBeGreaterThan(SIGNUP_RATE_LIMIT.perAccount);
  });

  test("has English wording for the signup errors", () => {
    for (const message of [SIGNUP_CONSENT_REQUIRED_ERROR, VERIFICATION_NOT_SENT_ERROR, new RateLimitError(60).message]) {
      expect(localizeAuthError(message, "de")).toBe(message);
      expect(localizeAuthError(message, "en")).not.toBe(message);
    }
  });
});

describe("email confirmation stays mandatory", () => {
  test("register, confirm, sign in and reset the password without an invitation", async () => {
    const email = "chain@example.test";
    await signup(formRequest("/api/auth/signup", signupForm(email)));

    const early = await login(formRequest("/api/auth/login", { email, password: PASSWORD, next: "/app" }));
    expect(decodedLocation(early)).toContain(`${ORIGIN}/login?`);
    expect(decodedLocation(early)).toContain("Bitte bestätige zuerst deine E-Mail-Adresse.");
    expect(early.headers.get("set-cookie")).toBeNull();

    const verified = await confirmEmail(lastMail("verification", email)!.token);
    expect(decodedLocation(verified)).toContain("verified=1");

    const signedIn = await login(formRequest("/api/auth/login", { email, password: PASSWORD, next: "/app" }));
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get("location")).toBe(`${ORIGIN}/app`);
    expect(signedIn.headers.get("set-cookie")).toContain("bloommd_session=");

    const requested = await requestPasswordReset(formRequest("/api/auth/request-password-reset", { email }));
    expect(decodedLocation(requested)).toContain("reset=requested");
    const reset = await resetPassword(formRequest("/api/auth/reset-password", { token: lastMail("reset", email)!.token, password: NEW_PASSWORD }));
    expect(decodedLocation(reset)).toContain("reset=complete");

    const oldPassword = await login(formRequest("/api/auth/login", { email, password: PASSWORD, next: "/app" }));
    expect(decodedLocation(oldPassword)).toContain("E-Mail oder Passwort ist falsch.");
    const newPassword = await login(formRequest("/api/auth/login", { email, password: NEW_PASSWORD, next: "/app" }));
    expect(newPassword.headers.get("set-cookie")).toContain("bloommd_session=");
  });

  test("a confirmation link works only once", async () => {
    const email = "once@example.test";
    await signup(formRequest("/api/auth/signup", signupForm(email)));
    const { token } = lastMail("verification", email)!;

    expect(decodedLocation(await confirmEmail(token))).toContain("verified=1");
    expect(decodedLocation(await confirmEmail(token))).toContain("error=");
  });

  test("never hands out a session at signup, even when the mail cannot be sent", async () => {
    mailDelivers = false;
    const response = await signup(formRequest("/api/auth/signup", signupForm("nomail@example.test")));

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(decodedLocation(response)).toContain(`${ORIGIN}/signup?`);
    expect(decodedLocation(response)).toContain("Bestätigungs-E-Mail konnte nicht gesendet werden.");
    expect(decodedLocation(response)).not.toContain("verification=sent");
    expect(users.get("nomail@example.test")?.emailVerifiedAt).toBeNull();
  });

  test("ignores the E2E bypass flag in a production server without the test marker", async () => {
    mutableEnv.BLOOMMD_E2E_AUTH_BYPASS = "1";
    const response = await signup(formRequest("/api/auth/signup", signupForm("bypass@example.test")));

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(decodedLocation(response)).toContain("verification=sent");
    expect(users.get("bypass@example.test")?.emailVerifiedAt).toBeNull();

    const attempt = await login(formRequest("/api/auth/login", { email: "bypass@example.test", password: PASSWORD, next: "/app" }));
    expect(attempt.headers.get("set-cookie")).toBeNull();
  });
});

describe("registering an address someone else already registered", () => {
  test("the real owner's signup replaces a password set by an earlier, unconfirmed signup", async () => {
    const email = "victim@example.test";
    await signup(formRequest("/api/auth/signup", signupForm(email, { password: "AttackerPass1234" })));
    const attackerToken = lastMail("verification", email)!.token;

    await signup(formRequest("/api/auth/signup", signupForm(email, { password: PASSWORD })));
    const ownerToken = lastMail("verification", email)!.token;
    expect(ownerToken).not.toBe(attackerToken);

    expect(decodedLocation(await confirmEmail(attackerToken))).toContain("error=");
    expect(decodedLocation(await confirmEmail(ownerToken))).toContain("verified=1");

    const attacker = await login(formRequest("/api/auth/login", { email, password: "AttackerPass1234", next: "/app" }));
    expect(attacker.headers.get("set-cookie")).toBeNull();
    const owner = await login(formRequest("/api/auth/login", { email, password: PASSWORD, next: "/app" }));
    expect(owner.headers.get("set-cookie")).toContain("bloommd_session=");
  });

  test("does not touch a confirmed account and sends no mail", async () => {
    const email = "member@example.test";
    await signup(formRequest("/api/auth/signup", signupForm(email)));
    await confirmEmail(lastMail("verification", email)!.token);
    const mailsBefore = mails.length;
    const hashBefore = users.get(email)!.passwordHash;

    const response = await signup(formRequest("/api/auth/signup", signupForm(email, { password: "AttackerPass1234" })));

    expect(decodedLocation(response)).toContain("verification=sent");
    expect(mails).toHaveLength(mailsBefore);
    expect(users.get(email)!.passwordHash).toBe(hashBefore);
    const attacker = await login(formRequest("/api/auth/login", { email, password: "AttackerPass1234", next: "/app" }));
    expect(attacker.headers.get("set-cookie")).toBeNull();
  });
});
