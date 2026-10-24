import { createHash, timingSafeEqual } from "node:crypto";

/**
 * App sign-in (BloomMD mobile app) — OAuth-style authorization code with PKCE (RFC 7636, S256),
 * without a client secret: the app proves with its code verifier that it started the sign-in.
 *
 * 1. The app opens `/auth/mobile?challenge=…&state=…&device=…` in the system browser.
 * 2. The signed-in user allows it; the server stores a one-time code (hashed, 5 minutes) bound to
 *    challenge, state and user, and sends the browser to `bloommd://auth?code=…&state=…`.
 * 3. The app posts code, verifier and state to `/api/mobile/token` and receives an access token.
 */

/** The only redirect target: the app's registered URL scheme. Never taken from the request. */
export const MOBILE_REDIRECT_URI = "bloommd://auth";
export const MOBILE_AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const MOBILE_TOKEN_DAYS = 365;
export const MOBILE_AUTH_CODE_PREFIX = "bloom_mac_";

/** S256 of 32+ random bytes in base64url: always exactly 43 characters. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636: 43–128 characters of the unreserved set. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const STATE = /^[A-Za-z0-9._~-]{16,128}$/;
const CODE = /^bloom_mac_[A-Za-z0-9_-]{43}$/;

export function isValidChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

export function isValidVerifier(value: unknown): value is string {
  return typeof value === "string" && VERIFIER.test(value);
}

export function isValidState(value: unknown): value is string {
  return typeof value === "string" && STATE.test(value);
}

export function isValidAuthCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value);
}

/**
 * A readable device name for the consent screen and the token list ("iPad", "Max' iPhone").
 * Control characters and markup-relevant characters are dropped; null when nothing usable is left.
 */
export function normalizeDeviceName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f<>"`\\]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return [...cleaned].slice(0, 60).join("");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether the verifier belongs to the challenge the code was issued for (constant time). */
export function verifyPkce(verifier: string, challenge: string) {
  return isValidVerifier(verifier) && constantTimeEqual(pkceChallenge(verifier), challenge);
}

/** Whether the state matches the stored hash (constant time). */
export function verifyStateHash(state: string, stateHash: string) {
  return isValidState(state) && constantTimeEqual(hashSecret(state), stateHash);
}

export function mobileRedirectUrl(params: { code: string; state: string } | { error: "access_denied"; state: string }) {
  const url = new URL(MOBILE_REDIRECT_URI);
  if ("code" in params) url.searchParams.set("code", params.code);
  else url.searchParams.set("error", params.error);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export function mobileTokenName(deviceName: string) {
  return `BloomMD App (${deviceName})`.slice(0, 80);
}
