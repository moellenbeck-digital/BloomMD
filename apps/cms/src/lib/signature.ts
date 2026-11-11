import { createHash, createHmac } from "node:crypto";
import { safeEqualStrings } from "./token";

/** Tolerance for the timestamp of a signed call (ADR 3): +-60 seconds. */
export const SIGNATURE_TOLERANCE_MS = 60_000;
/** A nonce must be remembered at least as long as a signature can still be accepted (twice the tolerance). */
export const NONCE_TTL_MS = 2 * SIGNATURE_TOLERANCE_MS;

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

export interface SignedCall {
  method: string;
  /** Path including the query string, exactly as sent (`/svc/v1/users?ids=a,b`). */
  pathAndQuery: string;
  body: string;
  /** Milliseconds since the epoch, as a decimal string. */
  timestamp: string;
  nonce: string;
}

/** Canonical string: version, method, path with query, SHA-256 of the body, timestamp, nonce. */
export function canonicalString(call: SignedCall): string {
  const bodyHash = createHash("sha256").update(call.body).digest("hex");
  return ["v1", call.method.toUpperCase(), call.pathAndQuery, bodyHash, call.timestamp, call.nonce].join("\n");
}

/** HMAC-SHA256 over the canonical string, lowercase hex. `apps/app` uses the same function. */
export function signCall(key: string, call: SignedCall): string {
  return createHmac("sha256", key).update(canonicalString(call)).digest("hex");
}

export type SignatureResult = { ok: true; nonce: string } | { ok: false; reason: "missing" | "malformed" | "stale" | "bad_signature" };

/**
 * Verifies the headers `X-Svc-Signature`, `X-Svc-Timestamp`, `X-Svc-Nonce` against up to two keys that
 * are valid at the same time. It does not touch the nonce store: the caller claims the nonce in the
 * shared store only after this check passed, so an unsigned caller cannot fill the table.
 */
export function verifySignature(input: {
  keys: string[];
  method: string;
  pathAndQuery: string;
  body: string;
  headers: Headers;
  now?: number;
}): SignatureResult {
  const signature = input.headers.get("x-svc-signature");
  const timestamp = input.headers.get("x-svc-timestamp");
  const nonce = input.headers.get("x-svc-nonce");
  if (!signature || !timestamp || !nonce) return { ok: false, reason: "missing" };
  if (!SIGNATURE_PATTERN.test(signature) || !NONCE_PATTERN.test(nonce) || !/^[0-9]{10,16}$/.test(timestamp)) return { ok: false, reason: "malformed" };
  if (Math.abs((input.now ?? Date.now()) - Number(timestamp)) > SIGNATURE_TOLERANCE_MS) return { ok: false, reason: "stale" };
  const call: SignedCall = { method: input.method, pathAndQuery: input.pathAndQuery, body: input.body, timestamp, nonce };
  // Every key is always tried, so the time does not tell which key is the current one.
  let matched = false;
  for (const key of input.keys) if (safeEqualStrings(signature, signCall(key, call))) matched = true;
  return matched ? { ok: true, nonce } : { ok: false, reason: "bad_signature" };
}
