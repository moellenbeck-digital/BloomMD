import { describe, expect, test } from "bun:test";
import { productionConfigErrors } from "./production-config";

function marketingEnv(): NodeJS.ProcessEnv {
  return {
    BLOOMMD_BILLING_ENABLED: "0",
    BLOOMMD_WAITLIST_DATABASE_URL: "postgresql://u:p@waitlist-db:5432/waitlist?sslmode=require",
    RESEND_API_KEY: "re_marketing",
    RESEND_FROM_EMAIL: "BloomMD <hello@bloommd.io>",
    SENTRY_DSN: "https://abc@example.ingest.sentry.io/1",
    NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/1",
    NEXT_PUBLIC_SITE_URL: "https://bloommd.io",
    NEXT_PUBLIC_APP_URL: "https://bloommd.app",
    NEXT_PUBLIC_MARKETING_URL: "https://bloommd.io",
    NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL: "https://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg",
    BLOOMMD_LEGAL_BUSINESS_NAME: "BloomMD",
    BLOOMMD_LEGAL_OWNER_NAME: "Dennis Moellenbeck",
    BLOOMMD_LEGAL_STREET: "Hauptweg 7",
    BLOOMMD_LEGAL_POSTAL_CITY: "48143 Muenster",
    BLOOMMD_LEGAL_EMAIL: "legal@bloommd.io",
    BLOOMMD_LEGAL_RESPONSIBLE_CONTENT: "Dennis Moellenbeck",
  } as unknown as NodeJS.ProcessEnv;
}

describe("marketing app production config", () => {
  test("accepts a complete public marketing configuration without app secrets", () => {
    expect(productionConfigErrors(marketingEnv())).toEqual([]);
  });

  test("allows Sentry to be deferred for Demo M1 but validates real values when set", () => {
    const deferred = marketingEnv();
    deferred.SENTRY_DSN = "TODO_REPLACE_SENTRY_DSN";
    deferred.NEXT_PUBLIC_SENTRY_DSN = "TODO_REPLACE_PUBLIC_SENTRY_DSN";
    expect(productionConfigErrors(deferred)).toEqual([]);

    const invalid = marketingEnv();
    invalid.SENTRY_DSN = "not-a-url";
    invalid.NEXT_PUBLIC_SENTRY_DSN = "ftp://example.invalid/1";
    expect(productionConfigErrors(invalid)).toEqual(expect.arrayContaining([
      "SENTRY_DSN must be a valid HTTPS DSN when set.",
      "NEXT_PUBLIC_SENTRY_DSN must be a valid HTTPS DSN when set.",
    ]));
  });

  test("rejects app database, auth, sync and billing secrets", () => {
    const env = marketingEnv();
    env.DATABASE_URL = "postgresql://u:p@app-db:5432/bloommd?sslmode=require";
    env.BLOOMMD_AUTH_SECRET = "app-secret-with-enough-variety-123456789";
    env.BLOOMMD_SYNC_SECRET = "sync-secret-with-enough-variety-123456789";
    env.NEXT_PUBLIC_SYNC_URL = "wss://sync.bloommd.app";
    env.STRIPE_SECRET_KEY = "sk_live_test";

    const errors = productionConfigErrors(env);
    expect(errors).toContain("DATABASE_URL must not be set for the marketing app.");
    expect(errors).toContain("BLOOMMD_AUTH_SECRET must not be set for the marketing app.");
    expect(errors).toContain("BLOOMMD_SYNC_SECRET must not be set for the marketing app.");
    expect(errors).toContain("NEXT_PUBLIC_SYNC_URL must not be set for the marketing app.");
    expect(errors).toContain("STRIPE_SECRET_KEY must not be set for the marketing app.");
  });

  test("rejects the obsolete runtime deployment switch", () => {
    const env = marketingEnv();
    env.BLOOMMD_DEPLOYMENT = "marketing";
    expect(productionConfigErrors(env).some((error) => error.includes("BLOOMMD_DEPLOYMENT is obsolete"))).toBe(true);
  });

  test("requires distinct app and marketing origins", () => {
    const env = marketingEnv();
    env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_MARKETING_URL;
    expect(productionConfigErrors(env).some((error) => error.includes("must differ"))).toBe(true);
  });

  test("requires a public HTTPS macOS desktop download URL", () => {
    const missing = marketingEnv();
    delete missing.NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL;
    expect(productionConfigErrors(missing)).toContain("NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL must be a valid HTTPS URL.");

    const insecure = marketingEnv();
    insecure.NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL = "http://bloommd.io/_desktop-updates/stable-macos-arm64-BloomMD.dmg";
    expect(productionConfigErrors(insecure)).toContain("NEXT_PUBLIC_DESKTOP_MACOS_ARM64_DOWNLOAD_URL must be a valid HTTPS URL.");
  });

  test("requires a TLS waitlist database when persistence is enabled", () => {
    const env = marketingEnv();
    env.BLOOMMD_WAITLIST_DATABASE_URL = "postgresql://u:p@waitlist-db:5432/waitlist";
    expect(productionConfigErrors(env).some((error) => error.includes("BLOOMMD_WAITLIST_DATABASE_URL"))).toBe(true);
  });

  test("requires an internal app URL when beta invite forwarding is enabled", () => {
    const env = marketingEnv();
    env.BLOOMMD_INTERNAL_INVITE_SECRET = "internal-invite-secret-with-enough-variety-123";

    expect(productionConfigErrors(env)).toContain("BLOOMMD_APP_INTERNAL_URL is required when BLOOMMD_INTERNAL_INVITE_SECRET is set.");

    env.BLOOMMD_APP_INTERNAL_URL = "https://bloommd.app";
    expect(productionConfigErrors(env)).toEqual([]);
  });

  test("accepts analytics disabled for M1 and validates PostHog only when enabled", () => {
    const disabled = marketingEnv();
    delete disabled.NEXT_PUBLIC_POSTHOG_KEY;
    delete disabled.NEXT_PUBLIC_POSTHOG_HOST;
    expect(productionConfigErrors(disabled)).toEqual([]);

    const missingHost = marketingEnv();
    missingHost.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    delete missingHost.NEXT_PUBLIC_POSTHOG_HOST;
    expect(productionConfigErrors(missingHost)).toContain("NEXT_PUBLIC_POSTHOG_HOST is required when PostHog is enabled.");

    const insecureHost = marketingEnv();
    insecureHost.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    insecureHost.NEXT_PUBLIC_POSTHOG_HOST = "http://posthog.example";
    expect(productionConfigErrors(insecureHost)).toContain("NEXT_PUBLIC_POSTHOG_HOST must be HTTPS.");
  });

  test("validates the direct Plausible configuration when enabled", () => {
    const valid = {
      ...marketingEnv(),
      NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "bloommd.io",
      NEXT_PUBLIC_PLAUSIBLE_SRC: "https://plausible.moellenbeck-digital.io/js/script.js",
      NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.moellenbeck-digital.io",
    };
    expect(productionConfigErrors(valid)).toEqual([]);

    const incomplete: NodeJS.ProcessEnv = { ...valid };
    delete incomplete.NEXT_PUBLIC_PLAUSIBLE_API_HOST;
    expect(productionConfigErrors(incomplete)).toContain("NEXT_PUBLIC_PLAUSIBLE_API_HOST is required when Plausible is enabled.");

    const wrongDomain = { ...valid, NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "example.com" };
    expect(productionConfigErrors(wrongDomain)).toContain("NEXT_PUBLIC_PLAUSIBLE_DOMAIN must be bloommd.io.");

    const wrongHost = { ...valid, NEXT_PUBLIC_PLAUSIBLE_API_HOST: "https://plausible.example" };
    expect(productionConfigErrors(wrongHost)).toContain("NEXT_PUBLIC_PLAUSIBLE_API_HOST must be https://plausible.moellenbeck-digital.io.");
  });

  test("rejects placeholder legal identity values", () => {
    const env = marketingEnv();
    env.BLOOMMD_LEGAL_OWNER_NAME = "Max Mustermann";
    env.BLOOMMD_LEGAL_STREET = "Musterstrasse 1";
    env.BLOOMMD_LEGAL_POSTAL_CITY = "12345 Musterstadt";

    expect(productionConfigErrors(env)).toEqual(expect.arrayContaining([
      "BLOOMMD_LEGAL_OWNER_NAME must contain real legal information, not placeholder or demo data.",
      "BLOOMMD_LEGAL_STREET must contain real legal information, not placeholder or demo data.",
      "BLOOMMD_LEGAL_POSTAL_CITY must contain real legal information, not placeholder or demo data.",
    ]));
  });
});
