import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * The second factor of an operator session (ADR O9, ticket #206). A password login gives a normal Payload
 * session; it counts only after the operator proved the second factor, which sets the cookie
 * `<prefix>-mfa`. The cookie is signed with a key derived from `PAYLOAD_SECRET` and bound to the operator
 * and to the Payload session (`sid` of the session token), so it works for no other account and ends with
 * the session. Pure functions, no Payload import: `proxy.ts` (Next) and the access functions share them.
 */
export const MFA_COOKIE_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_PREFIX = "payload";

/** Key for one purpose, derived from the Payload secret (HKDF-SHA256), so no extra secret has to be managed. */
export function derivedKey(purpose: string, secret: string | undefined = process.env.PAYLOAD_SECRET): Buffer {
  if (!secret) throw new Error("PAYLOAD_SECRET is not set.");
  return Buffer.from(hkdfSync("sha256", secret, "bloommd-cms", purpose, 32));
}

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const unb64 = (value: string) => Buffer.from(value, "base64url").toString("utf8");

export function mfaCookieName(prefix: string = DEFAULT_PREFIX): string {
  return `${prefix}-mfa`;
}

export function readCookie(headers: Headers | undefined | null, name: string): string | undefined {
  const raw = headers?.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * Claims of the Payload session token (cookie or `Authorization: JWT`), read without checking the signature: they
 * are only compared with the signed second-factor cookie, and Payload itself decides whether the token is valid.
 */
export function tokenClaims(headers: Headers | undefined | null, prefix: string = DEFAULT_PREFIX): { id?: string; sid?: string } {
  const authorization = headers?.get("authorization");
  const token = authorization?.startsWith("JWT ") ? authorization.slice(4).trim() : readCookie(headers, `${prefix}-token`);
  const body = token?.split(".")[1];
  if (!body) return {};
  try {
    const claims = JSON.parse(unb64(body)) as { id?: unknown; sid?: unknown };
    return {
      id: typeof claims.id === "string" || typeof claims.id === "number" ? String(claims.id) : undefined,
      sid: typeof claims.sid === "string" && claims.sid ? claims.sid : undefined,
    };
  } catch {
    return {};
  }
}

/** `sid` of the Payload session token. */
export function sessionIdOf(headers: Headers | undefined | null, prefix: string = DEFAULT_PREFIX): string | undefined {
  return tokenClaims(headers, prefix).sid;
}

const sign = (body: string) => createHmac("sha256", derivedKey("operator-mfa-cookie")).update(body).digest("base64url");

export function signMfaCookie(userId: string, sessionId: string, now: number = Date.now(), ttlMs: number = MFA_COOKIE_TTL_MS): string {
  const body = b64(JSON.stringify({ u: userId, s: sessionId, e: now + ttlMs }));
  return `v1.${body}.${sign(body)}`;
}

export function verifyMfaCookie(value: string | undefined, userId: string, sessionId: string | undefined, now: number = Date.now()): boolean {
  if (!value || !sessionId) return false;
  const [version, body, signature, extra] = value.split(".");
  if (version !== "v1" || !body || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const claims = JSON.parse(unb64(body)) as { u?: unknown; s?: unknown; e?: unknown };
    return claims.u === userId && claims.s === sessionId && typeof claims.e === "number" && claims.e > now;
  } catch {
    return false;
  }
}

/** True when the request carries a valid second-factor cookie for this operator and this session. */
export function mfaVerified(headers: Headers | undefined | null, userId: string, prefix: string = DEFAULT_PREFIX): boolean {
  return verifyMfaCookie(readCookie(headers, mfaCookieName(prefix)), userId, sessionIdOf(headers, prefix));
}

/** Same check for callers that have no user yet (`proxy.ts`): the operator is the one named in the session token. */
export function mfaVerifiedForToken(headers: Headers | undefined | null, prefix: string = DEFAULT_PREFIX): boolean {
  const { id } = tokenClaims(headers, prefix);
  return id !== undefined && mfaVerified(headers, id, prefix);
}

/** `Set-Cookie` value of the second-factor cookie; same flags as the Payload session cookie of operators. */
export function mfaSetCookie(value: string, options: { prefix?: string; secure: boolean; maxAgeSeconds?: number }): string {
  const maxAge = options.maxAgeSeconds ?? Math.floor(MFA_COOKIE_TTL_MS / 1000);
  return `${mfaCookieName(options.prefix)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${options.secure ? "; Secure" : ""}`;
}

export function mfaClearCookie(options: { prefix?: string; secure: boolean }): string {
  return mfaSetCookie("", { ...options, maxAgeSeconds: 0 });
}
