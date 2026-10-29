import { trustedProxyHeaderName } from "./trusted-proxy";

const requiredProductionValues = [
  "DATABASE_URL",
  "BLOOMMD_AUTH_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "BLOOMMD_LEGAL_BUSINESS_NAME",
  "BLOOMMD_LEGAL_OWNER_NAME",
  "BLOOMMD_LEGAL_STREET",
  "BLOOMMD_LEGAL_POSTAL_CITY",
  "BLOOMMD_LEGAL_EMAIL",
  "BLOOMMD_LEGAL_RESPONSIBLE_CONTENT",
] as const;

const requiredLegalProductionValues = new Set<string>([
  "BLOOMMD_LEGAL_BUSINESS_NAME",
  "BLOOMMD_LEGAL_OWNER_NAME",
  "BLOOMMD_LEGAL_STREET",
  "BLOOMMD_LEGAL_POSTAL_CITY",
  "BLOOMMD_LEGAL_EMAIL",
  "BLOOMMD_LEGAL_RESPONSIBLE_CONTENT",
]);

function secureOrigin(value: string | undefined, protocols: string[]) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function hasSecretEntropy(value: string | undefined) {
  return Boolean(value && value.length >= 32 && new Set(value).size >= 12 && !/(replace|change|example|placeholder|secret)/i.test(value));
}

function hasOptionalRealValue(value: string | undefined) {
  return Boolean(value?.trim() && !/(todo|replace|placeholder|dummy|tbd|noch einzutragen)/i.test(value));
}

/**
 * Any Postgres reachable over TLS is acceptable.
 *
 * This used to demand a `.neon.tech` hostname. The private beta runs on platform Postgres via
 * CloudNativePG, and a host-specific rule would have rejected a perfectly valid cluster URL. What
 * actually matters is that the connection is encrypted, so that is what is checked.
 *
 * `verify-ca` is deliberately not accepted. `postgres@3.4.9` has no such mode — it would be mapped
 * to `verify-full`, which additionally verifies the hostname. An operator asking for `verify-ca`
 * would silently get a stricter check than requested, and a certificate valid for the CA but issued
 * for another name would start failing at runtime while the release gate stayed green.
 */
function isTlsPostgresUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return false;
    if (!url.hostname) return false;
    return ["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "");
  } catch {
    return false;
  }
}

function legalPlaceholderError(key: string, value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (
    /\b(max|erika)\s+mustermann\b/i.test(value ?? "") ||
    /muster(strasse|straße|stadt|hausen|firma|anbieter)/i.test(value ?? "") ||
    /(example\.(com|org|net|test)|example@|@example\.)/i.test(value ?? "") ||
    /(placeholder|platzhalter|dummy|demo|testwert|todo|tbd|noch einzutragen)/i.test(value ?? "")
  ) {
    return `${key} must contain real legal information, not placeholder or demo data.`;
  }
  return null;
}

export function productionConfigErrors(env: NodeJS.ProcessEnv = process.env) {
  const errors: string[] = [];

  for (const key of requiredProductionValues) {
    if (!env[key]?.trim()) errors.push(`${key} is required.`);
    if (requiredLegalProductionValues.has(key)) {
      const placeholderError = legalPlaceholderError(key, env[key]);
      if (placeholderError) errors.push(placeholderError);
    }
  }

  if (env.BLOOMMD_REQUIRE_AUTH !== "1") errors.push("BLOOMMD_REQUIRE_AUTH must be 1.");
  if (env.BLOOMMD_AUTO_MIGRATE === "1") errors.push("BLOOMMD_AUTO_MIGRATE must not be 1 in production.");
  // The E2E bypass signs people in without a password or a confirmed address. With open
  // registration (#104) it would let anyone skip the email confirmation, so it must never ship.
  for (const key of ["BLOOMMD_E2E_AUTH_BYPASS", "BLOOMMD_E2E_TEST_MODE"] as const) {
    if (env[key]?.trim()) errors.push(`${key} must not be set in production.`);
  }
  if (env.BLOOMMD_E2E_MAIL_OUTBOX?.trim()) errors.push("BLOOMMD_E2E_MAIL_OUTBOX must not be set in production.");
  // Rate limits per client address believe exactly one header (#169); a malformed name would make
  // every request share one key.
  if (trustedProxyHeaderName(env) === undefined) {
    errors.push("BLOOMMD_TRUSTED_PROXY_HEADER must be a valid HTTP header name (letters, digits and hyphens).");
  }
  // Global cap for account mails (#169): an invalid value would silently fall back to the default.
  for (const key of ["BLOOMMD_MAIL_DAILY_LIMIT", "BLOOMMD_MAIL_HOURLY_LIMIT"] as const) {
    const value = env[key]?.trim();
    if (value && !(/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= 1)) {
      errors.push(`${key} must be a positive integer when set.`);
    }
  }
  const siteOrigin = secureOrigin(env.NEXT_PUBLIC_SITE_URL, ["https:"]);
  if (!siteOrigin) errors.push("NEXT_PUBLIC_SITE_URL must be a valid HTTPS URL.");
  if (!hasSecretEntropy(env.BLOOMMD_AUTH_SECRET)) errors.push("BLOOMMD_AUTH_SECRET must be a non-placeholder secret with at least 32 characters and sufficient variety.");
  if (!isTlsPostgresUrl(env.DATABASE_URL)) errors.push("DATABASE_URL must be a Postgres URL with sslmode=require or verify-full.");
  errors.push(...appSplitErrors(env, siteOrigin));
  if (!env.RESEND_API_KEY?.startsWith("re_")) errors.push("RESEND_API_KEY must use a Resend API key.");
  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(env.RESEND_FROM_EMAIL?.match(/<([^>]+)>/)?.[1] ?? env.RESEND_FROM_EMAIL ?? "")) {
    errors.push("RESEND_FROM_EMAIL must contain a valid sender address.");
  }
  // Stripe is only contractually relevant once paid plans are actually reachable. A free beta must
  // be able to pass this gate without live payment credentials, and enabling billing must not be
  // possible with half a configuration.
  if (env.BLOOMMD_BILLING_ENABLED === "1") {
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL", "STRIPE_PRICE_LIFETIME"] as const) {
      if (!env[key]?.trim()) errors.push(`${key} is required when BLOOMMD_BILLING_ENABLED is 1.`);
    }
    if (!env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) errors.push("STRIPE_SECRET_KEY must be a live Stripe secret for production.");
    if (!env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) errors.push("STRIPE_WEBHOOK_SECRET must use a Stripe webhook secret.");
    for (const key of ["STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PRO_ANNUAL", "STRIPE_PRICE_LIFETIME"] as const) {
      if (!env[key]?.startsWith("price_")) errors.push(`${key} must use a Stripe price id.`);
    }
  } else if (env.BLOOMMD_BILLING_ENABLED && env.BLOOMMD_BILLING_ENABLED !== "0") {
    errors.push("BLOOMMD_BILLING_ENABLED must be exactly \"1\" or \"0\".");
  }
  // Closed beta (#43): the gate must be usable, not merely switched on. A gate with neither an
  // allowlist nor a code is a signup form that rejects everyone, including the operator.
  // Gate off (#104) means open self-registration; it needs no invitation list, and the signup
  // limits and the mandatory email confirmation above and in the signup route still apply.
  if (env.BLOOMMD_BETA_ACCESS === "1") {
    const hasInvites = Boolean(env.BLOOMMD_BETA_ALLOWED_EMAILS?.trim() || env.BLOOMMD_BETA_INVITE_CODES?.trim() || env.BLOOMMD_INTERNAL_INVITE_SECRET?.trim());
    if (!hasInvites) errors.push("BLOOMMD_BETA_ACCESS is 1 but neither BLOOMMD_BETA_ALLOWED_EMAILS, BLOOMMD_BETA_INVITE_CODES nor BLOOMMD_INTERNAL_INVITE_SECRET is set.");
    if (env.BLOOMMD_INTERNAL_INVITE_SECRET && !hasSecretEntropy(env.BLOOMMD_INTERNAL_INVITE_SECRET)) {
      errors.push("BLOOMMD_INTERNAL_INVITE_SECRET must be a non-placeholder secret with at least 32 characters and sufficient variety.");
    }
    errors.push(...feedbackConfigErrors(env));
  } else if (env.BLOOMMD_BETA_ACCESS && env.BLOOMMD_BETA_ACCESS !== "0") {
    errors.push("BLOOMMD_BETA_ACCESS must be exactly \"1\" or \"0\".");
  }

  if (hasOptionalRealValue(env.SENTRY_DSN) && !secureOrigin(env.SENTRY_DSN, ["https:"])) errors.push("SENTRY_DSN must be a valid HTTPS DSN when set.");
  if (hasOptionalRealValue(env.NEXT_PUBLIC_SENTRY_DSN) && !secureOrigin(env.NEXT_PUBLIC_SENTRY_DSN, ["https:"])) errors.push("NEXT_PUBLIC_SENTRY_DSN must be a valid HTTPS DSN when set.");
  if (env.BLOOMMD_LEGAL_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BLOOMMD_LEGAL_EMAIL)) errors.push("BLOOMMD_LEGAL_EMAIL must be valid.");
  if (env.NEXT_PUBLIC_SYNC_URL) {
    if (!secureOrigin(env.NEXT_PUBLIC_SYNC_URL, ["https:", "wss:"])) errors.push("NEXT_PUBLIC_SYNC_URL must be a valid HTTPS or WSS URL.");
    if (!hasSecretEntropy(env.BLOOMMD_SYNC_SECRET)) errors.push("BLOOMMD_SYNC_SECRET must be a non-placeholder secret with at least 32 characters and sufficient variety when sync is enabled.");
    if (env.BLOOMMD_SYNC_SECRET === env.BLOOMMD_AUTH_SECRET) errors.push("BLOOMMD_SYNC_SECRET must differ from BLOOMMD_AUTH_SECRET.");
    if (!env.SYNC_DATABASE_URL && !env.DATABASE_URL) errors.push("SYNC_DATABASE_URL or DATABASE_URL is required when sync is enabled.");
    // The sync process prefers SYNC_DATABASE_URL over DATABASE_URL, so an unencrypted value here
    // would put the collaboration database in the clear while the gate reported green.
    if (env.SYNC_DATABASE_URL && !isTlsPostgresUrl(env.SYNC_DATABASE_URL)) {
      errors.push("SYNC_DATABASE_URL must be a Postgres URL with sslmode=require or verify-full.");
    }
    const allowedOrigins = env.SYNC_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
    if (allowedOrigins.length === 0) errors.push("SYNC_ALLOWED_ORIGINS is required when sync is enabled.");
    if (siteOrigin && !allowedOrigins.includes(siteOrigin)) errors.push("SYNC_ALLOWED_ORIGINS must include NEXT_PUBLIC_SITE_URL.");
    for (const key of ["SYNC_MAX_ROOMS", "SYNC_MAX_CLIENTS_PER_ROOM", "SYNC_MAX_MESSAGE_BYTES"] as const) {
      const value = Number(env[key]);
      if (!Number.isSafeInteger(value) || value < 1) errors.push(`${key} must be a positive integer when sync is enabled.`);
    }
    if (env.SYNC_REPLICA_COUNT !== "1") errors.push("SYNC_REPLICA_COUNT must be 1 until distributed room coordination is implemented.");
  }
  if (env.BLOOMMD_BILLING_ENABLED === "1" && env.STRIPE_PRICE_SYNC_MONTHLY && !env.NEXT_PUBLIC_SYNC_URL) {
    errors.push("STRIPE_PRICE_SYNC_MONTHLY must not be offered before sync is configured.");
  }
  if (env.NEXT_PUBLIC_POSTHOG_KEY && !env.NEXT_PUBLIC_POSTHOG_HOST) {
    errors.push("NEXT_PUBLIC_POSTHOG_HOST is required when PostHog is enabled.");
  }
  if (env.NEXT_PUBLIC_POSTHOG_HOST && !secureOrigin(env.NEXT_PUBLIC_POSTHOG_HOST, ["https:"])) {
    errors.push("NEXT_PUBLIC_POSTHOG_HOST must be HTTPS.");
  }
  return errors;
}

/**
 * Findings that do not block a release but should be seen: reported by `release:check` and in
 * `/api/health/ready`.
 */
export function productionConfigWarnings(env: NodeJS.ProcessEnv = process.env) {
  const warnings: string[] = [];
  if (!env.BLOOMMD_TRUSTED_PROXY_HEADER?.trim()) {
    warnings.push(
      "BLOOMMD_TRUSTED_PROXY_HEADER is not set: rate limits per client address use the last x-forwarded-for entry, which is only right behind exactly one proxy.",
    );
  }
  return warnings;
}

function feedbackConfigErrors(env: NodeJS.ProcessEnv): string[] {
  const errors: string[] = [];
  if (env.BLOOMMD_FEEDBACK_ENABLED !== "1") {
    errors.push("BLOOMMD_FEEDBACK_ENABLED must be 1 for the closed beta.");
  }
  for (const key of [
    "BLOOMMD_FEEDBACK_GITHUB_TOKEN",
    "BLOOMMD_FEEDBACK_GITHUB_REPO",
    "BLOOMMD_FEEDBACK_S3_ENDPOINT",
    "BLOOMMD_FEEDBACK_S3_REGION",
    "BLOOMMD_FEEDBACK_S3_BUCKET",
    "BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID",
    "BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY",
  ] as const) {
    if (!env[key]?.trim()) errors.push(`${key} is required for closed beta feedback.`);
  }
  if (env.BLOOMMD_FEEDBACK_GITHUB_REPO && !/^[^/\s]+\/[^/\s]+$/.test(env.BLOOMMD_FEEDBACK_GITHUB_REPO)) {
    errors.push("BLOOMMD_FEEDBACK_GITHUB_REPO must use owner/repo.");
  }
  if (env.BLOOMMD_FEEDBACK_GITHUB_TOKEN && !hasSecretEntropy(env.BLOOMMD_FEEDBACK_GITHUB_TOKEN)) {
    errors.push("BLOOMMD_FEEDBACK_GITHUB_TOKEN must be a non-placeholder secret.");
  }
  if (env.BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY && !hasSecretEntropy(env.BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY)) {
    errors.push("BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY must be a non-placeholder secret.");
  }
  if (env.BLOOMMD_FEEDBACK_S3_ENDPOINT && !secureOrigin(env.BLOOMMD_FEEDBACK_S3_ENDPOINT, ["https:"])) {
    errors.push("BLOOMMD_FEEDBACK_S3_ENDPOINT must be a valid HTTPS URL.");
  }
  const retentionDays = Number(env.BLOOMMD_FEEDBACK_ATTACHMENT_RETENTION_DAYS ?? 90);
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    errors.push("BLOOMMD_FEEDBACK_ATTACHMENT_RETENTION_DAYS must be an integer between 1 and 365.");
  }
  return errors;
}

/**
 * Rules for the private app side of the split between bloommd.app and bloommd.io.
 */
function appSplitErrors(env: NodeJS.ProcessEnv, siteOrigin: string | null): string[] {
  const errors: string[] = [];
  if (env.BLOOMMD_DEPLOYMENT) errors.push("BLOOMMD_DEPLOYMENT is obsolete after the app split. Deploy apps/app directly.");
  if (!secureOrigin(env.NEXT_PUBLIC_APP_URL, ["https:"])) errors.push("NEXT_PUBLIC_APP_URL must be a valid HTTPS URL.");
  if (!secureOrigin(env.NEXT_PUBLIC_MARKETING_URL, ["https:"])) errors.push("NEXT_PUBLIC_MARKETING_URL must be a valid HTTPS URL.");
  if (env.NEXT_PUBLIC_APP_URL && env.NEXT_PUBLIC_APP_URL === env.NEXT_PUBLIC_MARKETING_URL) {
    errors.push("NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_MARKETING_URL must differ.");
  }
  if (siteOrigin && env.NEXT_PUBLIC_APP_URL && siteOrigin !== env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")) {
    errors.push("NEXT_PUBLIC_SITE_URL must equal NEXT_PUBLIC_APP_URL for the product app.");
  }
  const allowed = env.SYNC_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (env.NEXT_PUBLIC_MARKETING_URL && allowed.includes(env.NEXT_PUBLIC_MARKETING_URL.replace(/\/$/, ""))) {
    errors.push("SYNC_ALLOWED_ORIGINS must not include the marketing origin.");
  }

  return errors;
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  const errors = productionConfigErrors(env);
  if (errors.length > 0) throw new Error(`BloomMD production configuration is incomplete:\n- ${errors.join("\n- ")}`);
}
