/**
 * Runtime configuration of the admin app. Everything comes from the environment (1Password and
 * External Secrets in the cluster, ADR 2); nothing is committed. `runtimeConfigErrors` runs at server
 * start (`instrumentation.ts`) and fails closed in production; it does not run during `next build`.
 */
const PLACEHOLDER = /(todo|replace|placeholder|dummy|tbd|changeme|change-me|not-real)/i;

export const MIN_SECRET_LENGTH = 32;

function realSecret(value: string | undefined): value is string {
  return Boolean(value && value.trim().length >= MIN_SECRET_LENGTH && !PLACEHOLDER.test(value));
}

/** Keys that verify the HMAC signature of `apps/app`; up to two are valid at the same time (rotation). */
export function appSigningKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const keys = [env.CMS_SVC_APP_KEY, env.CMS_SVC_APP_KEY_NEXT]
    .map((key) => key?.trim() ?? "")
    .filter((key) => key.length >= MIN_SECRET_LENGTH);
  return [...new Set(keys)];
}

/** Origin of the admin UI; the only origin accepted for CORS and CSRF (ADR 3, layer 4). */
export function adminOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.CMS_ADMIN_ORIGIN?.trim();
  if (value) {
    try {
      return new URL(value).origin;
    } catch {
      return "";
    }
  }
  return env.NODE_ENV === "production" ? "" : "http://localhost:3300";
}

/** Window and limits of the handler-level rate limits (shared counter in the CMS database). */
export const RATE_LIMITS = {
  loginPerAccount: { limit: 10, windowSeconds: 15 * 60 },
  passwordResetPerAccount: { limit: 3, windowSeconds: 60 * 60 },
  redeemPerToken: { limit: 10, windowSeconds: 15 * 60 },
  contentPerToken: { limit: 600, windowSeconds: 60 },
} as const;

export function runtimeConfigErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  if (!realSecret(env.PAYLOAD_SECRET)) errors.push(`PAYLOAD_SECRET must be a real secret of at least ${MIN_SECRET_LENGTH} characters.`);
  if (!env.CMS_DATABASE_URL?.trim()) errors.push("CMS_DATABASE_URL is required.");
  else if (env.DATABASE_URL && env.DATABASE_URL === env.CMS_DATABASE_URL) errors.push("CMS_DATABASE_URL must not be the app database URL.");
  if (env.DATABASE_URL?.trim()) errors.push("DATABASE_URL (app database) must not be set for the CMS.");
  for (const key of ["BLOOMMD_AUTH_SECRET", "BLOOMMD_SYNC_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
    if (env[key]?.trim()) errors.push(`${key} must not be set for the CMS.`);
  }
  const keys = [env.CMS_SVC_APP_KEY, env.CMS_SVC_APP_KEY_NEXT].filter((key): key is string => Boolean(key?.trim()));
  if (keys.length === 0) errors.push("CMS_SVC_APP_KEY is required (HMAC key of apps/app for /svc/v1).");
  for (const key of keys) if (!realSecret(key)) errors.push(`CMS_SVC_APP_KEY(_NEXT) must be a real secret of at least ${MIN_SECRET_LENGTH} characters.`);
  if (keys.length === 2 && keys[0]?.trim() === keys[1]?.trim()) errors.push("CMS_SVC_APP_KEY and CMS_SVC_APP_KEY_NEXT must differ.");
  if (production) {
    const origin = adminOrigin(env);
    if (!origin || !origin.startsWith("https://")) errors.push("CMS_ADMIN_ORIGIN must be a valid HTTPS origin in production.");
  }
  return errors;
}

export function assertRuntimeConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = runtimeConfigErrors(env);
  if (errors.length > 0) throw new Error(`BloomMD CMS configuration is incomplete:\n- ${errors.join("\n- ")}`);
}
