import { describe, expect, test } from "bun:test";
import { productionConfigErrors, productionConfigWarnings } from "./production-config";

function appEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://u:p@app-db:5432/bloommd?sslmode=require",
    BLOOMMD_AUTH_SECRET: "Uz8v-71mQp4R_yB6tK2sL9wX0c3D5e7F",
    BLOOMMD_REQUIRE_AUTH: "1",
    BLOOMMD_BETA_ACCESS: "1",
    BLOOMMD_BETA_ALLOWED_EMAILS: "tester@bloommd.local",
    BLOOMMD_BILLING_ENABLED: "0",
    BLOOMMD_FEEDBACK_ENABLED: "1",
    BLOOMMD_FEEDBACK_GITHUB_TOKEN: "github_pat_feedback_token_with_entropy_123456789",
    BLOOMMD_FEEDBACK_GITHUB_REPO: "moellenbeck-digital/BloomMD",
    BLOOMMD_FEEDBACK_S3_ENDPOINT: "https://s3.bloommd.app",
    BLOOMMD_FEEDBACK_S3_REGION: "eu-central-1",
    BLOOMMD_FEEDBACK_S3_BUCKET: "bloommd-feedback",
    BLOOMMD_FEEDBACK_S3_ACCESS_KEY_ID: "feedback-access",
    BLOOMMD_FEEDBACK_S3_SECRET_ACCESS_KEY: "fdbk-N8vQ4mR2zP7xL9cT6yA3wH5uJ1sK",
    RESEND_API_KEY: "re_app",
    RESEND_FROM_EMAIL: "BloomMD <app@bloommd.app>",
    SENTRY_DSN: "https://abc@example.ingest.sentry.io/1",
    NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/1",
    NEXT_PUBLIC_SITE_URL: "https://bloommd.app",
    NEXT_PUBLIC_APP_URL: "https://bloommd.app",
    NEXT_PUBLIC_MARKETING_URL: "https://bloommd.io",
    BLOOMMD_LEGAL_BUSINESS_NAME: "BloomMD",
    BLOOMMD_LEGAL_OWNER_NAME: "Dennis Moellenbeck",
    BLOOMMD_LEGAL_STREET: "Hauptweg 7",
    BLOOMMD_LEGAL_POSTAL_CITY: "48143 Muenster",
    BLOOMMD_LEGAL_EMAIL: "legal@bloommd.app",
    BLOOMMD_LEGAL_RESPONSIBLE_CONTENT: "Dennis Moellenbeck",
  } as unknown as NodeJS.ProcessEnv;
}

describe("product app production config", () => {
  test("accepts a complete private app configuration", () => {
    expect(productionConfigErrors(appEnv())).toEqual([]);
  });

  test("allows Sentry to be deferred for Demo M1 but validates real values when set", () => {
    const deferred = appEnv();
    deferred.SENTRY_DSN = "TODO_REPLACE_SENTRY_DSN";
    deferred.NEXT_PUBLIC_SENTRY_DSN = "TODO_REPLACE_PUBLIC_SENTRY_DSN";
    expect(productionConfigErrors(deferred)).toEqual([]);

    const invalid = appEnv();
    invalid.SENTRY_DSN = "not-a-url";
    invalid.NEXT_PUBLIC_SENTRY_DSN = "ftp://example.invalid/1";
    expect(productionConfigErrors(invalid)).toEqual(expect.arrayContaining([
      "SENTRY_DSN must be a valid HTTPS DSN when set.",
      "NEXT_PUBLIC_SENTRY_DSN must be a valid HTTPS DSN when set.",
    ]));
  });

  test("requires app database, auth secret and auth gate", () => {
    const env = appEnv();
    delete env.DATABASE_URL;
    delete env.BLOOMMD_AUTH_SECRET;
    env.BLOOMMD_REQUIRE_AUTH = "0";

    const errors = productionConfigErrors(env);
    expect(errors).toContain("DATABASE_URL is required.");
    expect(errors).toContain("BLOOMMD_AUTH_SECRET is required.");
    expect(errors).toContain("BLOOMMD_REQUIRE_AUTH must be 1.");
  });

  test("allows the beta gate to use database-backed invites", () => {
    const env = appEnv();
    delete env.BLOOMMD_BETA_ALLOWED_EMAILS;
    delete env.BLOOMMD_BETA_INVITE_CODES;
    env.BLOOMMD_INTERNAL_INVITE_SECRET = "Uz8v-71mQp4R_yB6tK2sL9wX0c3D5e7F-invite";

    expect(productionConfigErrors(env)).toEqual([]);
  });

  test("accepts a closed gate without any invitation list (open self-registration)", () => {
    for (const gate of ["0", undefined]) {
      const env = appEnv();
      if (gate === undefined) delete env.BLOOMMD_BETA_ACCESS;
      else env.BLOOMMD_BETA_ACCESS = gate;
      delete env.BLOOMMD_BETA_ALLOWED_EMAILS;
      delete env.BLOOMMD_BETA_INVITE_CODES;
      delete env.BLOOMMD_INTERNAL_INVITE_SECRET;

      expect(productionConfigErrors(env)).toEqual([]);
    }
  });

  test("still requires an invitation list when the gate is on", () => {
    const env = appEnv();
    delete env.BLOOMMD_BETA_ALLOWED_EMAILS;

    expect(productionConfigErrors(env).some((error) => error.includes("BLOOMMD_BETA_ACCESS is 1 but neither"))).toBe(true);
  });

  test("still requires the mail provider and a valid gate value with the gate off", () => {
    const env = appEnv();
    env.BLOOMMD_BETA_ACCESS = "0";
    delete env.RESEND_API_KEY;
    expect(productionConfigErrors(env)).toContain("RESEND_API_KEY is required.");

    const invalid = appEnv();
    invalid.BLOOMMD_BETA_ACCESS = "yes";
    expect(productionConfigErrors(invalid)).toContain("BLOOMMD_BETA_ACCESS must be exactly \"1\" or \"0\".");
  });

  test("rejects the E2E bypass and mail outbox in production, with the gate on or off", () => {
    for (const gate of ["1", "0"]) {
      for (const key of ["BLOOMMD_E2E_AUTH_BYPASS", "BLOOMMD_E2E_TEST_MODE", "BLOOMMD_E2E_MAIL_OUTBOX"] as const) {
        const env = appEnv();
        env.BLOOMMD_BETA_ACCESS = gate;
        env[key] = key === "BLOOMMD_E2E_MAIL_OUTBOX" ? "/tmp/outbox.jsonl" : "1";

        expect(productionConfigErrors(env)).toContain(`${key} must not be set in production.`);
      }
    }
  });

  test("checks the trusted proxy header name, and only warns when it is missing (#169)", () => {
    const env = appEnv();
    expect(productionConfigErrors(env)).toEqual([]);
    expect(productionConfigWarnings(env).join(" ")).toContain("BLOOMMD_TRUSTED_PROXY_HEADER is not set");

    env.BLOOMMD_TRUSTED_PROXY_HEADER = "cf-connecting-ip";
    expect(productionConfigErrors(env)).toEqual([]);
    expect(productionConfigWarnings(env)).toEqual([]);

    for (const invalid of ["x forwarded for", "x-real-ip: 1.2.3.4", "höhe"]) {
      env.BLOOMMD_TRUSTED_PROXY_HEADER = invalid;
      expect(productionConfigErrors(env)).toContain("BLOOMMD_TRUSTED_PROXY_HEADER must be a valid HTTP header name (letters, digits and hyphens).");
    }
  });

  test("checks the account mail limits (#169)", () => {
    const env = appEnv();
    env.BLOOMMD_MAIL_DAILY_LIMIT = "500";
    env.BLOOMMD_MAIL_HOURLY_LIMIT = "100";
    expect(productionConfigErrors(env)).toEqual([]);

    for (const invalid of ["0", "-5", "many", "1.5"]) {
      env.BLOOMMD_MAIL_DAILY_LIMIT = invalid;
      env.BLOOMMD_MAIL_HOURLY_LIMIT = invalid;
      expect(productionConfigErrors(env)).toContain("BLOOMMD_MAIL_DAILY_LIMIT must be a positive integer when set.");
      expect(productionConfigErrors(env)).toContain("BLOOMMD_MAIL_HOURLY_LIMIT must be a positive integer when set.");
    }
  });

  test("rejects a weak internal invite secret", () => {
    const env = appEnv();
    env.BLOOMMD_INTERNAL_INVITE_SECRET = "TODO";

    expect(productionConfigErrors(env)).toContain("BLOOMMD_INTERNAL_INVITE_SECRET must be a non-placeholder secret with at least 32 characters and sufficient variety.");
  });

  test("rejects the obsolete runtime deployment switch", () => {
    const env = appEnv();
    env.BLOOMMD_DEPLOYMENT = "app";
    expect(productionConfigErrors(env).some((error) => error.includes("BLOOMMD_DEPLOYMENT is obsolete"))).toBe(true);
  });

  test("requires distinct app and marketing origins", () => {
    const env = appEnv();
    env.NEXT_PUBLIC_MARKETING_URL = env.NEXT_PUBLIC_APP_URL;
    expect(productionConfigErrors(env).some((error) => error.includes("must differ"))).toBe(true);
  });

  test("keeps the marketing origin out of sync allowed origins", () => {
    const env = appEnv();
    env.NEXT_PUBLIC_SYNC_URL = "wss://sync.bloommd.app";
    env.BLOOMMD_SYNC_SECRET = "sync-secret-with-enough-variety-123456789";
    env.SYNC_ALLOWED_ORIGINS = "https://bloommd.app,https://bloommd.io";
    env.SYNC_MAX_ROOMS = "50";
    env.SYNC_MAX_CLIENTS_PER_ROOM = "10";
    env.SYNC_MAX_MESSAGE_BYTES = "100000";
    env.SYNC_REPLICA_COUNT = "1";

    expect(productionConfigErrors(env).some((error) => error.includes("must not include the marketing origin"))).toBe(true);
  });

  test("rejects placeholder legal identity values", () => {
    const env = appEnv();
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
