import { createHash } from "node:crypto";
import { consumeRateLimit } from "./db";
import { type ApiRequestIdentity } from "./auth";
import { isE2EAuthBypassEnabled } from "./e2e-mode";

interface RateLimitOptions {
  action: string;
  identifier?: string | null;
  limit: number;
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

export function clientAddress(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
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
  const identifiers = [`ip:${clientAddress(request)}`];
  if (options.identifier) identifiers.push(`account:${options.identifier.trim().toLowerCase()}`);

  for (const identifier of identifiers) {
    const keyHash = hashKey(identifier);
    const databaseResult = await consumeRateLimit({
      action: options.action,
      keyHash,
      windowStartedAt: new Date(windowStart).toISOString(),
      limit: options.limit,
    });
    const allowed = databaseResult?.allowed ?? memoryRateLimit(`${options.action}:${keyHash}:${windowStart}`, options.limit, expiresAt);
    if (!allowed) {
      throw new RateLimitError(Math.max(1, Math.ceil((expiresAt - now) / 1000)));
    }
  }
}

export function resetMemoryRateLimitsForTests() {
  memoryBuckets.clear();
}
