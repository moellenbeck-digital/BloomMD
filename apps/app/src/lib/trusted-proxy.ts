const HEADER_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The configured trusted proxy header, lower-cased, or null when unset. `undefined` means invalid. */
export function trustedProxyHeaderName(env: Record<string, string | undefined> = process.env): string | null | undefined {
  const raw = env.BLOOMMD_TRUSTED_PROXY_HEADER?.trim().toLowerCase();
  if (!raw) return null;
  return HEADER_NAME.test(raw) ? raw : undefined;
}
