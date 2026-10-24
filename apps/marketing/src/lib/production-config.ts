const requiredProductionValues = [
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

function plausibleConfigErrors(env: NodeJS.ProcessEnv) {
  const keys = [
    "NEXT_PUBLIC_PLAUSIBLE_DOMAIN",
    "NEXT_PUBLIC_PLAUSIBLE_SRC",
    "NEXT_PUBLIC_PLAUSIBLE_API_HOST",
  ] as const;
  const configured = keys.some((key) => Boolean(env[key]?.trim()));
  if (!configured) return [];

  const errors: string[] = [];
  for (const key of keys) {
    if (!env[key]?.trim()) errors.push(`${key} is required when Plausible is enabled.`);
  }
  if (env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN !== "bloommd.io") {
    errors.push("NEXT_PUBLIC_PLAUSIBLE_DOMAIN must be bloommd.io.");
  }
  if (env.NEXT_PUBLIC_PLAUSIBLE_SRC !== "https://plausible.moellenbeck-digital.io/js/script.js") {
    errors.push("NEXT_PUBLIC_PLAUSIBLE_SRC must be https://plausible.moellenbeck-digital.io/js/script.js.");
  }
  if (env.NEXT_PUBLIC_PLAUSIBLE_API_HOST !== "https://plausible.moellenbeck-digital.io") {
    errors.push("NEXT_PUBLIC_PLAUSIBLE_API_HOST must be https://plausible.moellenbeck-digital.io.");
  }
  return errors;
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

  if (env.BLOOMMD_AUTO_MIGRATE === "1") errors.push("BLOOMMD_AUTO_MIGRATE must not be 1 in production.");
  const siteOrigin = secureOrigin(env.NEXT_PUBLIC_SITE_URL, ["https:"]);
  if (!siteOrigin) errors.push("NEXT_PUBLIC_SITE_URL must be a valid HTTPS URL.");
  errors.push(...marketingSplitErrors(env, siteOrigin));
  if (!env.RESEND_API_KEY?.startsWith("re_")) errors.push("RESEND_API_KEY must use a Resend API key.");
  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(env.RESEND_FROM_EMAIL?.match(/<([^>]+)>/)?.[1] ?? env.RESEND_FROM_EMAIL ?? "")) {
    errors.push("RESEND_FROM_EMAIL must contain a valid sender address.");
  }
  // Closed beta (#43): the gate must be usable, not merely switched on. A gate with neither an
  // allowlist nor a code is a signup form that rejects everyone, including the operator.
  if (env.BLOOMMD_BETA_ACCESS === "1") {
    const hasInvites = Boolean(env.BLOOMMD_BETA_ALLOWED_EMAILS?.trim() || env.BLOOMMD_BETA_INVITE_CODES?.trim());
    if (!hasInvites) errors.push("BLOOMMD_BETA_ACCESS is 1 but neither BLOOMMD_BETA_ALLOWED_EMAILS nor BLOOMMD_BETA_INVITE_CODES is set.");
  } else if (env.BLOOMMD_BETA_ACCESS && env.BLOOMMD_BETA_ACCESS !== "0") {
    errors.push("BLOOMMD_BETA_ACCESS must be exactly \"1\" or \"0\".");
  }

  if (hasOptionalRealValue(env.SENTRY_DSN) && !secureOrigin(env.SENTRY_DSN, ["https:"])) errors.push("SENTRY_DSN must be a valid HTTPS DSN when set.");
  if (hasOptionalRealValue(env.NEXT_PUBLIC_SENTRY_DSN) && !secureOrigin(env.NEXT_PUBLIC_SENTRY_DSN, ["https:"])) errors.push("NEXT_PUBLIC_SENTRY_DSN must be a valid HTTPS DSN when set.");
  if (env.BLOOMMD_LEGAL_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BLOOMMD_LEGAL_EMAIL)) errors.push("BLOOMMD_LEGAL_EMAIL must be valid.");
  if (env.NEXT_PUBLIC_POSTHOG_KEY && !env.NEXT_PUBLIC_POSTHOG_HOST) {
    errors.push("NEXT_PUBLIC_POSTHOG_HOST is required when PostHog is enabled.");
  }
  if (env.NEXT_PUBLIC_POSTHOG_HOST && !secureOrigin(env.NEXT_PUBLIC_POSTHOG_HOST, ["https:"])) {
    errors.push("NEXT_PUBLIC_POSTHOG_HOST must be HTTPS.");
  }
  errors.push(...plausibleConfigErrors(env));

  return errors;
}

/**
 * Rules for the public marketing side of the split between bloommd.io and bloommd.app.
 */
function marketingSplitErrors(env: NodeJS.ProcessEnv, siteOrigin: string | null): string[] {
  const errors: string[] = [];
  if (env.BLOOMMD_DEPLOYMENT) errors.push("BLOOMMD_DEPLOYMENT is obsolete after the app split. Deploy apps/marketing directly.");
  if (!secureOrigin(env.NEXT_PUBLIC_APP_URL, ["https:"])) errors.push("NEXT_PUBLIC_APP_URL must be a valid HTTPS URL.");
  if (!secureOrigin(env.NEXT_PUBLIC_MARKETING_URL, ["https:"])) errors.push("NEXT_PUBLIC_MARKETING_URL must be a valid HTTPS URL.");
  if (env.NEXT_PUBLIC_APP_URL && env.NEXT_PUBLIC_APP_URL === env.NEXT_PUBLIC_MARKETING_URL) {
    errors.push("NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_MARKETING_URL must differ.");
  }
  if (siteOrigin && env.NEXT_PUBLIC_MARKETING_URL && siteOrigin !== env.NEXT_PUBLIC_MARKETING_URL.replace(/\/$/, "")) {
    errors.push("NEXT_PUBLIC_SITE_URL must equal NEXT_PUBLIC_MARKETING_URL for the marketing app.");
  }
  for (const key of ["DATABASE_URL", "BLOOMMD_AUTH_SECRET", "BLOOMMD_SYNC_SECRET", "NEXT_PUBLIC_SYNC_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
    if (env[key]) errors.push(`${key} must not be set for the marketing app.`);
  }
  if (env.BLOOMMD_BILLING_ENABLED && env.BLOOMMD_BILLING_ENABLED !== "0") {
    errors.push("BLOOMMD_BILLING_ENABLED must be unset or 0 for the marketing app.");
  }
  if (env.BLOOMMD_WAITLIST_DATABASE_URL && !isTlsPostgresUrl(env.BLOOMMD_WAITLIST_DATABASE_URL)) {
    errors.push("BLOOMMD_WAITLIST_DATABASE_URL must be a Postgres URL with sslmode=require or verify-full.");
  }
  if (env.BLOOMMD_INTERNAL_INVITE_SECRET && !env.BLOOMMD_APP_INTERNAL_URL?.trim()) {
    errors.push("BLOOMMD_APP_INTERNAL_URL is required when BLOOMMD_INTERNAL_INVITE_SECRET is set.");
  }
  if (env.BLOOMMD_APP_INTERNAL_URL && !secureOrigin(env.BLOOMMD_APP_INTERNAL_URL, ["https:"])) {
    errors.push("BLOOMMD_APP_INTERNAL_URL must be a valid HTTPS URL.");
  }
  if (!secureOrigin(env.NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL, ["https:"])) {
    errors.push("NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL must be a valid HTTPS URL.");
  }

  return errors;
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  const errors = productionConfigErrors(env);
  if (errors.length > 0) throw new Error(`BloomMD production configuration is incomplete:\n- ${errors.join("\n- ")}`);
}
