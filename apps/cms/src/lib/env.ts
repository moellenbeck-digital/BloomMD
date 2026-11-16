/**
 * Runtime configuration of the admin app. Everything comes from the environment (1Password and
 * External Secrets in the cluster, ADR 2); nothing is committed. `runtimeConfigErrors` runs at server
 * start (`instrumentation.ts`) and fails closed in production; it does not run during `next build`.
 */
export type EnvLike = Record<string, string | undefined>;

const PLACEHOLDER = /(todo|replace|placeholder|dummy|tbd|changeme|change-me|not-real)/i;

export const MIN_SECRET_LENGTH = 32;

function realSecret(value: string | undefined): value is string {
  return Boolean(value && value.trim().length >= MIN_SECRET_LENGTH && !PLACEHOLDER.test(value));
}

/** Keys that verify the HMAC signature of `apps/app`; up to two are valid at the same time (rotation). */
export function appSigningKeys(env: EnvLike = process.env): string[] {
  const keys = [env.CMS_SVC_APP_KEY, env.CMS_SVC_APP_KEY_NEXT]
    .map((key) => key?.trim() ?? "")
    .filter((key) => key.length >= MIN_SECRET_LENGTH);
  return [...new Set(keys)];
}

/** Origin of the admin UI; the only origin accepted for CORS and CSRF (ADR 3, layer 4). */
export function adminOrigin(env: EnvLike = process.env): string {
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

/** The five variables of the S3 media storage; all set = S3, none set = local directory, anything else = error. */
export const S3_VARS = ["CMS_S3_BUCKET", "CMS_S3_ENDPOINT", "CMS_S3_REGION", "CMS_S3_ACCESS_KEY", "CMS_S3_SECRET_KEY"] as const;

export interface S3Settings {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export type MediaStorage =
  | { mode: "local" }
  | { mode: "s3"; s3: S3Settings }
  /** Some but not all variables are set; `missing` holds variable names only, never values. */
  | { mode: "partial"; missing: string[] };

/** Where the media collection keeps its files, decided only by which of the `CMS_S3_*` variables are set. */
export function mediaStorage(env: EnvLike = process.env): MediaStorage {
  const values = S3_VARS.map((name) => env[name]?.trim() ?? "");
  const missing = S3_VARS.filter((_, index) => !values[index]);
  if (missing.length === S3_VARS.length) return { mode: "local" };
  if (missing.length > 0) return { mode: "partial", missing };
  const [bucket = "", endpoint = "", region = "", accessKey = "", secretKey = ""] = values;
  return { mode: "s3", s3: { bucket, endpoint, region, accessKey, secretKey } };
}

/**
 * Client settings for the S3 API of Hetzner (and MinIO): the endpoint comes from the variable and the
 * bucket is addressed by path (`forcePathStyle`). Shared by the storage plugin, the readiness probe and the tests.
 */
export function s3ClientConfig(s3: S3Settings) {
  return {
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
  };
}

/** Errors of the media storage configuration; messages carry variable names only, never values. */
function mediaStorageErrors(env: EnvLike): string[] {
  const storage = mediaStorage(env);
  if (storage.mode === "partial") return [`CMS_S3_* is incomplete: ${storage.missing.join(", ")} missing (set all five variables for S3 or none for the local directory).`];
  if (storage.mode !== "s3") return [];
  const errors: string[] = [];
  try {
    new URL(storage.s3.endpoint);
  } catch {
    errors.push("CMS_S3_ENDPOINT must be a valid URL.");
  }
  if (PLACEHOLDER.test(storage.s3.accessKey) || PLACEHOLDER.test(storage.s3.secretKey)) errors.push("CMS_S3_ACCESS_KEY and CMS_S3_SECRET_KEY must be real credentials, not placeholders.");
  return errors;
}

/** Window and limits of the handler-level rate limits (shared counter in the CMS database). */
export const RATE_LIMITS = {
  loginPerAccount: { limit: 10, windowSeconds: 15 * 60 },
  passwordResetPerAccount: { limit: 3, windowSeconds: 60 * 60 },
  redeemPerToken: { limit: 10, windowSeconds: 15 * 60 },
  contentPerToken: { limit: 600, windowSeconds: 60 },
} as const;

export function runtimeConfigErrors(env: EnvLike = process.env): string[] {
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
  errors.push(...mediaStorageErrors(env));
  if (production) {
    const origin = adminOrigin(env);
    if (!origin || !origin.startsWith("https://")) errors.push("CMS_ADMIN_ORIGIN must be a valid HTTPS origin in production.");
  }
  return errors;
}

export function assertRuntimeConfig(env: EnvLike = process.env): void {
  const errors = runtimeConfigErrors(env);
  if (errors.length > 0) throw new Error(`BloomMD CMS configuration is incomplete:\n- ${errors.join("\n- ")}`);
}
