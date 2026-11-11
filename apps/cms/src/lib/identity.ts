import { createHash } from "node:crypto";
import type { Payload } from "payload";
import type { User } from "../payload-types";
import { RATE_LIMITS } from "./env";
import { canonicalEmail } from "./email-canonical";
import { passwordRuleError } from "./password-rule";
import { hitRateLimit, poolOf } from "./shared-store";
import { SvcError } from "./svc-error";
import { generateToken, hashToken } from "./token";

/**
 * Domain functions of `/svc/v1` for accounts: registration, sign-in, tokens, access state, export and
 * deletion. They take the Local API (`payload`) and always run with `overrideAccess`: the collections
 * deny everything over REST, this layer is the only caller. Never returns a password hash.
 */
export type TokenPurpose = "email_verification" | "password_reset" | "waitlist_activation";

export const DEFAULT_TTL_MINUTES: Record<TokenPurpose, number> = {
  email_verification: 24 * 60,
  password_reset: 60,
  waitlist_activation: 14 * 24 * 60,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && EMAIL.test(value.trim());

function bad(fields: Record<string, string>): never {
  throw new SvcError(400, "invalid_request", { fields });
}

function ttlOf(value: unknown, purpose: TokenPurpose): number {
  if (value === undefined) return DEFAULT_TTL_MINUTES[purpose];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 5 || value > 60 * 24 * 30) bad({ ttlMinutes: "integer between 5 and 43200" });
  return value;
}

/** Isolates a hit counter per account without storing the address: the bucket holds a hash. */
const accountBucket = (kind: string, email: string) => `${kind}:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

async function enforce(payload: Payload, bucket: string, limit: { limit: number; windowSeconds: number }): Promise<void> {
  const result = await hitRateLimit(poolOf(payload), bucket, limit.limit, limit.windowSeconds);
  if (!result.allowed) throw new SvcError(429, "rate_limited", {}, { "retry-after": String(result.retryAfterSeconds) });
}

export async function findUser(payload: Payload, id: string): Promise<User | null> {
  const user = await payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true, disableErrors: true });
  return user ?? null;
}

async function findUserByEmail(payload: Payload, email: string): Promise<User | null> {
  const found = await payload.find({ collection: "users", where: { email: { equals: email.trim().toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true });
  return found.docs[0] ?? null;
}

// ---------------------------------------------------------------- access state

export interface AccessState {
  userId: string;
  status: User["status"];
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  cloudAccess: boolean;
  entitlements: { feature: string; source: string; active: boolean; expiresAt: string | null }[];
  trial: { endsAt: string | null; legacy: boolean; daysOverride: number | null };
  platformRole: User["platformRole"];
  locale: User["locale"];
  sessionsValidAfter: string | null;
}

/** Rights state of an account (`GET /svc/v1/users/{id}/access`), the same shape in the login answer. */
export async function accessState(payload: Payload, user: User): Promise<AccessState> {
  const entitlements = await payload.find({ collection: "entitlements", where: { user: { equals: user.id } }, limit: 200, depth: 0, pagination: false, overrideAccess: true });
  return {
    userId: user.id,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    cloudAccess: user.status === "active" && user.cloudAccess !== false,
    entitlements: entitlements.docs.map((entitlement) => ({
      feature: entitlement.feature,
      source: entitlement.source,
      active: entitlement.active !== false,
      expiresAt: entitlement.expiresAt ?? null,
    })),
    trial: { endsAt: user.trialEndsAt ?? null, legacy: Boolean(user.trialLegacy), daysOverride: user.trialDaysOverride ?? null },
    platformRole: user.platformRole,
    locale: user.locale,
    sessionsValidAfter: user.sessionsValidAfter ?? null,
  };
}

export function etagOf(state: AccessState): string {
  return `"${createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 32)}"`;
}

// ---------------------------------------------------------------- tokens

/** Issues a one-time token for an account. Earlier unused tokens of the same purpose are revoked, like the app does. */
export async function issueToken(payload: Payload, userId: string, purpose: TokenPurpose, ttlMinutes: number) {
  const now = new Date();
  await payload.update({
    collection: "auth-tokens",
    where: { and: [{ user: { equals: userId } }, { purpose: { equals: purpose } }, { usedAt: { exists: false } }] },
    data: { usedAt: now.toISOString() },
    overrideAccess: true,
  });
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  await payload.create({ collection: "auth-tokens", data: { user: userId, purpose, tokenHash: hashToken(token), expiresAt }, overrideAccess: true });
  return { token, expiresAt };
}

// ---------------------------------------------------------------- registration

export interface RegisterInput {
  id: string;
  email: string;
  password?: string;
  locale: "de" | "en";
  origin: "registration" | "waitlist";
  name?: string;
  ttlMinutes?: number;
}

export function parseRegister(body: Record<string, unknown>): RegisterInput {
  const fields: Record<string, string> = {};
  if (!isUuid(body.id)) fields.id = "uuid";
  if (!isEmail(body.email)) fields.email = "valid e-mail address";
  const origin = body.origin === undefined ? "registration" : body.origin;
  if (origin !== "registration" && origin !== "waitlist") fields.origin = "registration | waitlist";
  const locale = body.locale === undefined ? "de" : body.locale;
  if (locale !== "de" && locale !== "en") fields.locale = "de | en";
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 200)) fields.name = "string, at most 200 characters";
  if (origin === "waitlist") {
    if (body.password !== undefined) fields.password = "a waitlist account has no password";
  } else if (typeof body.password !== "string") fields.password = "required";
  else {
    const error = passwordRuleError(body.password);
    if (error) fields.password = error;
  }
  if (Object.keys(fields).length > 0) bad(fields);
  return {
    id: body.id as string,
    email: (body.email as string).trim().toLowerCase(),
    password: body.password as string | undefined,
    locale: locale as "de" | "en",
    origin: origin as "registration" | "waitlist",
    name: body.name as string | undefined,
    ttlMinutes: body.ttlMinutes as number | undefined,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message} ${JSON.stringify((error as { data?: unknown }).data ?? "")}` : "";
  return /unique|duplicate|already registered|value must be unique/i.test(text);
}

/** `POST /svc/v1/users`: creates the account and returns the one-time token to confirm it. */
export async function registerUser(payload: Payload, input: RegisterInput) {
  if (await findUserByEmail(payload, input.email)) throw new SvcError(409, "email_taken");
  if (await findUser(payload, input.id)) throw new SvcError(409, "id_taken");
  try {
    if (input.origin === "waitlist") {
      // A waitlist account has no password and therefore no hash: Payload's `create` refuses that, so the
      // row is written through the database adapter, which also means that every derived field is set here.
      await payload.db.create({
        collection: "users",
        data: {
          id: input.id,
          email: input.email,
          emailCanonical: canonicalEmail(input.email),
          name: input.name ?? null,
          locale: input.locale,
          status: "active",
          origin: "waitlist",
          platformRole: "user",
          cloudAccess: true,
          trialLegacy: false,
          trialGuarded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      await payload.create({
        collection: "users",
        data: { id: input.id, email: input.email, password: input.password as string, name: input.name, locale: input.locale, origin: "registration", status: "active", platformRole: "user" },
        overrideAccess: true,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) throw new SvcError(409, "email_taken");
    throw error;
  }
  const purpose: TokenPurpose = input.origin === "waitlist" ? "waitlist_activation" : "email_verification";
  const token = await issueToken(payload, input.id, purpose, ttlOf(input.ttlMinutes, purpose));
  return { userId: input.id, status: "active" as const, token: token.token, tokenPurpose: purpose, tokenExpiresAt: token.expiresAt };
}

// ---------------------------------------------------------------- sign-in

/**
 * `POST /svc/v1/auth/login`. A wrong password, a locked account (Payload's lock tells it apart in its
 * message), an unknown address, an account without a password and an account in deletion are one and the
 * same 401 (spike deviation 5). Only after a correct password does the answer say that the address is not
 * confirmed yet, which reveals nothing to someone who does not know the password.
 */
export async function loginUser(payload: Payload, body: Record<string, unknown>) {
  if (!isEmail(body.email) || typeof body.password !== "string" || body.password.length === 0 || body.password.length > 1024) bad({ credentials: "email and password" });
  const email = (body.email as string).trim().toLowerCase();
  await enforce(payload, accountBucket("login", email), RATE_LIMITS.loginPerAccount);
  let user: User;
  try {
    const result = await payload.login({ collection: "users", data: { email, password: body.password as string }, overrideAccess: true });
    user = result.user as User;
  } catch {
    throw new SvcError(401, "invalid_credentials");
  }
  if (user.status !== "active") throw new SvcError(401, "invalid_credentials");
  if (!user.emailVerifiedAt) throw new SvcError(403, "email_not_verified");
  return { userId: user.id, status: user.status, access: await accessState(payload, user) };
}

// ---------------------------------------------------------------- tokens: redeem and request

async function defaultTrialDays(payload: Payload, user: User): Promise<number> {
  if (user.trialDaysOverride) return user.trialDaysOverride;
  const settings = await payload.findGlobal({ slug: "platform-settings", depth: 0, overrideAccess: true });
  return settings.defaultTrialDays ?? 30;
}

/**
 * `POST /svc/v1/tokens/redeem`. A token is redeemed once: the claim is an atomic update of `usedAt`
 * (`where usedAt is null`), so two simultaneous redemptions cannot both succeed. The password rule is
 * checked before the claim, so a weak password leaves the token valid. Unknown, used and expired tokens
 * are the same 400. Confirming an address sets the trial end once; when another confirmed account
 * already holds the mailbox (partial unique index), the claim is released and the answer is 409.
 */
export async function redeemToken(payload: Payload, body: Record<string, unknown>) {
  if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 200) throw new SvcError(400, "invalid_token");
  const password = body.password;
  if (password !== undefined && typeof password !== "string") bad({ password: "string" });
  const tokenHash = hashToken(body.token);
  await enforce(payload, `redeem:${tokenHash.slice(0, 32)}`, RATE_LIMITS.redeemPerToken);

  const found = await payload.find({ collection: "auth-tokens", where: { tokenHash: { equals: tokenHash } }, limit: 1, depth: 0, overrideAccess: true });
  const record = found.docs[0];
  const now = new Date();
  if (!record || record.usedAt || new Date(record.expiresAt) <= now) throw new SvcError(400, "invalid_token");
  const purpose = record.purpose as TokenPurpose;
  const needsPassword = purpose !== "email_verification";
  if (needsPassword) {
    if (typeof password !== "string") bad({ password: "required" });
    const error = passwordRuleError(password as string);
    if (error) bad({ password: error });
  }
  const userId = typeof record.user === "string" ? record.user : (record.user as { id: string }).id;
  const user = await findUser(payload, userId);
  if (!user || user.status !== "active") throw new SvcError(400, "invalid_token");

  const claimed = await payload.update({
    collection: "auth-tokens",
    where: { and: [{ id: { equals: record.id } }, { usedAt: { exists: false } }] },
    data: { usedAt: now.toISOString() },
    overrideAccess: true,
  });
  if (claimed.docs.length !== 1) throw new SvcError(400, "invalid_token");

  const data: Record<string, unknown> = {};
  if (needsPassword) {
    data.password = password;
    data.sessionsValidAfter = now.toISOString();
    // A successful set or reset lifts the lock of the account (Payload's own reset does the same).
    data.loginAttempts = 0;
    data.lockUntil = null;
  }
  if (purpose !== "password_reset" && !user.emailVerifiedAt) {
    data.emailVerifiedAt = now.toISOString();
    if (!user.trialEndsAt && !user.trialLegacy) data.trialEndsAt = new Date(now.getTime() + (await defaultTrialDays(payload, user)) * DAY_MS).toISOString();
  }
  try {
    const updated = Object.keys(data).length > 0 ? await payload.update({ collection: "users", id: userId, data, overrideAccess: true }) : user;
    return { purpose, userId, status: updated.status, access: await accessState(payload, (await findUser(payload, userId)) ?? user) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      await payload.update({ collection: "auth-tokens", id: record.id, data: { usedAt: null }, overrideAccess: true });
      throw new SvcError(409, "mailbox_taken");
    }
    throw error;
  }
}

/**
 * `POST /svc/v1/password-resets`: always the same answer, 200 with `accepted: true`. For an unknown or
 * unusable account `token` is `null`; only the app, which sends the mail, sees the difference, and it never
 * passes it on. The rate limit counts the address whether or not the account exists.
 */
export async function requestPasswordReset(payload: Payload, body: Record<string, unknown>) {
  if (!isEmail(body.email)) bad({ email: "valid e-mail address" });
  const email = (body.email as string).trim().toLowerCase();
  const ttl = ttlOf(body.ttlMinutes, "password_reset");
  await enforce(payload, accountBucket("reset", email), RATE_LIMITS.passwordResetPerAccount);
  const user = await findUserByEmail(payload, email);
  if (!user || user.status !== "active") return { accepted: true, token: null, expiresAt: null };
  const token = await issueToken(payload, user.id, "password_reset", ttl);
  return { accepted: true, token: token.token, expiresAt: token.expiresAt };
}

// ---------------------------------------------------------------- lookups

export async function usersByIds(payload: Payload, idsParam: string | null) {
  const ids = (idsParam ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 100) bad({ ids: "1 to 100 comma-separated UUIDs" });
  if (!ids.every(isUuid)) bad({ ids: "UUIDs" });
  const found = await payload.find({ collection: "users", where: { id: { in: ids } }, limit: 100, depth: 0, pagination: false, overrideAccess: true });
  return { users: found.docs.map((user) => ({ id: user.id, email: user.email, name: user.name ?? null })) };
}

/** Right of access (Auskunft): everything the CMS holds about the account. Token hashes and the password hash are never part of it. */
export async function exportUser(payload: Payload, user: User) {
  const [entitlements, reminders, tokens] = await Promise.all([
    payload.find({ collection: "entitlements", where: { user: { equals: user.id } }, limit: 500, depth: 0, pagination: false, overrideAccess: true }),
    payload.find({ collection: "trial-reminders", where: { user: { equals: user.id } }, limit: 50, depth: 0, pagination: false, overrideAccess: true }),
    payload.find({ collection: "auth-tokens", where: { user: { equals: user.id } }, limit: 500, depth: 0, pagination: false, overrideAccess: true }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      locale: user.locale,
      origin: user.origin,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt ?? null,
      passwordSetAt: user.passwordSetAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      platformRole: user.platformRole,
      cloudAccess: user.cloudAccess !== false,
      waitlistMailSentAt: user.waitlistMailSentAt ?? null,
      deletionRequestedAt: user.deletionRequestedAt ?? null,
      trial: { endsAt: user.trialEndsAt ?? null, legacy: Boolean(user.trialLegacy), daysOverride: user.trialDaysOverride ?? null },
    },
    entitlements: entitlements.docs.map((e) => ({ feature: e.feature, source: e.source, active: e.active !== false, expiresAt: e.expiresAt ?? null, createdAt: e.createdAt })),
    trialReminders: reminders.docs.map((r) => ({ kind: r.kind, claimedAt: r.claimedAt, sentAt: r.sentAt ?? null })),
    tokens: tokens.docs.map((t) => ({ purpose: t.purpose, createdAt: t.createdAt, expiresAt: t.expiresAt, usedAt: t.usedAt ?? null })),
  };
}

// ---------------------------------------------------------------- deletion

/**
 * `POST /svc/v1/users/{id}/deletion`, idempotent through the key. Phase `request` locks the account (no
 * sign-in, no mails) before anything disappears; phase `complete` deletes the account with its access,
 * tokens and reminders and may be repeated: a missing account is a completed deletion (ADR 13).
 */
export async function deleteUser(payload: Payload, id: string, key: string, phase: "request" | "complete") {
  const user = await findUser(payload, id);
  if (phase === "request") {
    if (!user) throw new SvcError(404, "not_found");
    if (user.status === "deletion_requested") return { status: "deletion_requested" as const, repeated: true };
    await payload.update({
      collection: "users",
      id,
      data: { status: "deletion_requested", deletionRequestedAt: new Date().toISOString(), deletionKey: key, sessionsValidAfter: new Date().toISOString() },
      overrideAccess: true,
    });
    return { status: "deletion_requested" as const, repeated: false };
  }
  if (!user) return { status: "deleted" as const, repeated: true };
  if (user.status !== "deletion_requested" || user.deletionKey !== key) throw new SvcError(409, "deletion_not_requested");
  for (const collection of ["auth-tokens", "trial-reminders", "entitlements"] as const) {
    await payload.delete({ collection, where: { user: { equals: id } }, overrideAccess: true });
  }
  await payload.delete({ collection: "users", id, overrideAccess: true });
  return { status: "deleted" as const, repeated: false };
}

