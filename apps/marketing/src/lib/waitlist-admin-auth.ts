export type WaitlistAdminAuthEnv = Record<string, string | undefined>;

export function waitlistAdminHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export function isWaitlistAdminAuthConfigured(env: WaitlistAdminAuthEnv = process.env) {
  return Boolean(env.BLOOMMD_WAITLIST_ADMIN_TOKEN?.trim() || (env.BLOOMMD_WAITLIST_ADMIN_USER?.trim() && env.BLOOMMD_WAITLIST_ADMIN_PASSWORD?.trim()));
}

function constantTimeEqual(left: string, right: string) {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function decodeBase64(value: string) {
  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
}

function isBasicAuthorizationValid(header: string, env: WaitlistAdminAuthEnv) {
  const user = env.BLOOMMD_WAITLIST_ADMIN_USER?.trim();
  const password = env.BLOOMMD_WAITLIST_ADMIN_PASSWORD?.trim();
  if (!user || !password || !header.toLowerCase().startsWith("basic ")) return false;

  const decoded = decodeBase64(header.slice(6).trim());
  if (!decoded) return false;
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;

  return constantTimeEqual(decoded.slice(0, separator), user) && constantTimeEqual(decoded.slice(separator + 1), password);
}

function isBearerAuthorizationValid(header: string, env: WaitlistAdminAuthEnv) {
  const token = env.BLOOMMD_WAITLIST_ADMIN_TOKEN?.trim();
  if (!token || !header.toLowerCase().startsWith("bearer ")) return false;
  return constantTimeEqual(header.slice(7).trim(), token);
}

export function isWaitlistAdminAuthorized(authorizationHeader: string | null, env: WaitlistAdminAuthEnv = process.env) {
  if (!authorizationHeader || !isWaitlistAdminAuthConfigured(env)) return false;
  return isBearerAuthorizationValid(authorizationHeader, env) || isBasicAuthorizationValid(authorizationHeader, env);
}
