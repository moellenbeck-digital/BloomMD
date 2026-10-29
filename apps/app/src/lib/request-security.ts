import { createHash } from "node:crypto";
import { consumeRateLimit } from "./db";
import { type ApiRequestIdentity } from "./auth";
import { isE2EAuthBypassEnabled } from "./e2e-mode";
import { trustedProxyHeaderName } from "./trusted-proxy";

export { trustedProxyHeaderName };

interface RateLimitOptions {
  action: string;
  identifier?: string | null;
  /** Attempts allowed per identifier, and per client address unless `sourceLimit` is set. */
  limit: number;
  /** Attempts allowed per client address. A shared address (NAT, campus) needs more room than one account. */
  sourceLimit?: number;
  windowMs: number;
}

interface HumanFormSignalOptions {
  honeypotField?: string;
  startedAtField?: string;
  minAgeMs?: number;
  maxAgeMs?: number;
  now?: number;
}

interface MemoryBucket {
  attempts: number;
  expiresAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

/**
 * Signup limits for open registration (#104). Every attempt counts, successful or not.
 *
 * The per-account limit stops one address from being used to mail-bomb its owner; the per-source
 * limit slows mass registration with many different addresses from one client address. It is
 * deliberately higher than the per-account limit because a household, office or campus shares one
 * address. No captcha: that is an operator decision.
 */
export const SIGNUP_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  perAccount: 5,
  perSource: 20,
} as const;

/**
 * Limits for the two mail-sending steps after signup. Their per-source limit used to equal the
 * per-account one (3 and 5), which would lock out most of a shared address once registration is
 * open to everyone.
 */
export const ACCOUNT_MAIL_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  resendVerificationPerAccount: 3,
  passwordResetPerAccount: 5,
  perSource: 20,
} as const;

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Zu viele Versuche. Bitte warte kurz und versuche es erneut.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class RequestSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestSecurityError";
    this.status = status;
  }
}

export class FormSpamError extends Error {
  constructor() {
    super("Form submission rejected.");
    this.name = "FormSpamError";
  }
}

function allowedOrigins(request: Request) {
  const origins = new Set([new URL(request.url).origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      origins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    } catch {
      // Production configuration validation reports malformed site URLs.
    }
  }
  return origins;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(request).has(origin)) {
    throw new RequestSecurityError("Invalid request origin.", 403);
  }
}

export function assertSameOriginForIdentity(request: Request, identity: ApiRequestIdentity) {
  if (identity.authKind === "session") assertSameOrigin(request);
}

export function assertRequestSize(request: Request, maxBytes: number) {
  const rawLength = request.headers.get("content-length");
  const length = rawLength == null ? null : Number(rawLength);
  if (length != null && (!Number.isFinite(length) || length < 0)) {
    throw new RequestSecurityError("Invalid Content-Length header.", 400);
  }
  if (length != null && length > maxBytes) {
    throw new RequestSecurityError("Request body is too large.", 413);
  }
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const text = await readTextBody(request, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestSecurityError("Invalid JSON body.", 400);
  }
}

export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  assertRequestSize(request, maxBytes);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestSecurityError("Request body is too large.", 413);
  }
  return text;
}

export async function readUrlEncodedForm(request: Request, maxBytes = 16 * 1024) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new RequestSecurityError("Unsupported form encoding.", 415);
  }
  return new URLSearchParams(await readTextBody(request, maxBytes));
}

export function assertHumanFormSignal(form: URLSearchParams, options: HumanFormSignalOptions = {}) {
  if (isE2EAuthBypassEnabled()) return;

  const honeypotField = options.honeypotField ?? "website";
  const startedAtField = options.startedAtField ?? "formStartedAt";
  const minAgeMs = options.minAgeMs ?? 800;
  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1_000;
  const now = options.now ?? Date.now();

  if (String(form.get(honeypotField) || "").trim()) throw new FormSpamError();

  const startedAt = Number(String(form.get(startedAtField) || ""));
  if (!Number.isFinite(startedAt)) throw new FormSpamError();

  const ageMs = now - startedAt;
  if (ageMs < minAgeMs || ageMs > maxAgeMs) throw new FormSpamError();
}

/** Key for requests whose trusted source header is missing: all of them are counted together. */
export const UNATTRIBUTED_SOURCE = "unattributed";

/** The entry the nearest proxy appended: an attacker can prepend entries, but not add one after it. */
function lastEntry(value: string | null) {
  const entries = value?.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries?.[entries.length - 1] || null;
}

let warnedUnattributed = false;

/**
 * The address a request is counted under for rate limits (#169).
 *
 * Client-controlled headers must not choose the key, or the per-address limit is bypassable. So
 * only one header is believed: `BLOOMMD_TRUSTED_PROXY_HEADER` if configured (for example
 * `cf-connecting-ip` or `x-vercel-forwarded-for` when that proxy overwrites it), otherwise the last
 * entry of `x-forwarded-for`, which is what a single proxy in front of the app appended. If that
 * header is absent in a production build, every such request shares {@link UNATTRIBUTED_SOURCE}:
 * counting too strictly beats believing a header nobody vouches for.
 *
 * Outside production the other common headers are accepted so local development and tests can
 * tell clients apart without a proxy.
 */
export function clientAddress(request: Request) {
  const configured = trustedProxyHeaderName();
  const header = configured === undefined ? null : configured ?? "x-forwarded-for";
  const trusted = header ? lastEntry(request.headers.get(header)) : null;
  if (trusted) return trusted;

  if (process.env.NODE_ENV !== "production") {
    return (
      lastEntry(request.headers.get("x-forwarded-for")) ??
      lastEntry(request.headers.get("x-real-ip")) ??
      lastEntry(request.headers.get("x-vercel-forwarded-for")) ??
      lastEntry(request.headers.get("cf-connecting-ip")) ??
      "unknown"
    );
  }
  if (!warnedUnattributed) {
    warnedUnattributed = true;
    console.warn(
      `[request-security] No usable source address in ${header ?? "BLOOMMD_TRUSTED_PROXY_HEADER (invalid)"}; counting such requests under one shared rate-limit key. Check the proxy configuration.`,
    );
  }
  return UNATTRIBUTED_SOURCE;
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function memoryRateLimit(key: string, limit: number, expiresAt: number) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  const bucket = !existing || existing.expiresAt <= now
    ? { attempts: 1, expiresAt }
    : { attempts: existing.attempts + 1, expiresAt: existing.expiresAt };
  memoryBuckets.set(key, bucket);
  return bucket.attempts <= limit;
}

export async function assertRateLimit(request: Request, options: RateLimitOptions) {
  if (isE2EAuthBypassEnabled()) return;

  const now = Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const expiresAt = windowStart + options.windowMs;
  const buckets = [{ identifier: `ip:${clientAddress(request)}`, limit: options.sourceLimit ?? options.limit }];
  if (options.identifier) buckets.push({ identifier: `account:${options.identifier.trim().toLowerCase()}`, limit: options.limit });

  for (const bucket of buckets) {
    const keyHash = hashKey(bucket.identifier);
    const databaseResult = await consumeRateLimit({
      action: options.action,
      keyHash,
      windowStartedAt: new Date(windowStart).toISOString(),
      limit: bucket.limit,
    });
    const allowed = databaseResult?.allowed ?? memoryRateLimit(`${options.action}:${keyHash}:${windowStart}`, bucket.limit, expiresAt);
    if (!allowed) {
      throw new RateLimitError(Math.max(1, Math.ceil((expiresAt - now) / 1000)));
    }
  }
}

export function resetMemoryRateLimitsForTests() {
  memoryBuckets.clear();
}
