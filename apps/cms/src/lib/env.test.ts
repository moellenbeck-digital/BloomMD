import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminOrigin, appSigningKeys, mediaStorage, runtimeConfigErrors, S3_VARS, s3ClientConfig } from "./env";
import { getCmsBuildInfo } from "./build-info";

const good = {
  NODE_ENV: "production",
  PAYLOAD_SECRET: "k3j2h4g5f6d7s8a9p0o1i2u3y4t5r6e7w8q9",
  CMS_DATABASE_URL: "postgres://cms:pw@cms-db:5432/bloommd_cms?sslmode=require",
  CMS_SVC_APP_KEY: "Zx9wQ4rT7yU2iO5pA8sD1fG6hJ3kL0mN",
  CMS_ADMIN_ORIGIN: "https://admin.bloommd.example",
};

describe("runtime configuration fails closed", () => {
  test("a complete production configuration has no errors", () => {
    expect(runtimeConfigErrors(good)).toEqual([]);
  });

  test("missing or placeholder secrets are errors", () => {
    expect(runtimeConfigErrors({ ...good, PAYLOAD_SECRET: "" }).join()).toContain("PAYLOAD_SECRET");
    expect(runtimeConfigErrors({ ...good, PAYLOAD_SECRET: "replace-with-at-least-32-random-characters-0000" }).join()).toContain("PAYLOAD_SECRET");
    expect(runtimeConfigErrors({ ...good, CMS_SVC_APP_KEY: "" }).join()).toContain("CMS_SVC_APP_KEY");
    expect(runtimeConfigErrors({ ...good, CMS_SVC_APP_KEY: "short" }).join()).toContain("CMS_SVC_APP_KEY");
    expect(runtimeConfigErrors({ ...good, CMS_DATABASE_URL: "" }).join()).toContain("CMS_DATABASE_URL");
  });

  test("the CMS never gets the app database or app secrets", () => {
    expect(runtimeConfigErrors({ ...good, DATABASE_URL: "postgres://app" }).join()).toContain("DATABASE_URL");
    expect(runtimeConfigErrors({ ...good, DATABASE_URL: good.CMS_DATABASE_URL }).join()).toContain("must not be the app database");
    for (const key of ["BLOOMMD_AUTH_SECRET", "BLOOMMD_SYNC_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
      expect(runtimeConfigErrors({ ...good, [key]: "x" }).join()).toContain(key);
    }
  });

  test("two signing keys must differ and the admin origin must be HTTPS in production", () => {
    expect(runtimeConfigErrors({ ...good, CMS_SVC_APP_KEY_NEXT: good.CMS_SVC_APP_KEY }).join()).toContain("must differ");
    expect(runtimeConfigErrors({ ...good, CMS_SVC_APP_KEY_NEXT: "Qw8eR5tY2uI9oP4aS7dF0gH3jK6lZ1xC" })).toEqual([]);
    expect(runtimeConfigErrors({ ...good, CMS_ADMIN_ORIGIN: "http://admin.example" }).join()).toContain("CMS_ADMIN_ORIGIN");
    expect(runtimeConfigErrors({ ...good, CMS_ADMIN_ORIGIN: "" }).join()).toContain("CMS_ADMIN_ORIGIN");
  });

  test("the signing keys and the origin are read from the environment", () => {
    expect(appSigningKeys({ CMS_SVC_APP_KEY: "x".repeat(32), CMS_SVC_APP_KEY_NEXT: "y".repeat(32) })).toEqual(["x".repeat(32), "y".repeat(32)]);
    expect(appSigningKeys({ CMS_SVC_APP_KEY: "short" })).toEqual([]);
    expect(adminOrigin({ CMS_ADMIN_ORIGIN: "https://a.example/path" })).toBe("https://a.example");
    expect(adminOrigin({ NODE_ENV: "production" })).toBe("");
  });
});

describe("build info of the admin app", () => {
  test("the display version follows BloomMD <version> (<short-sha>)", () => {
    const info = getCmsBuildInfo({ BLOOMMD_RELEASE_VERSION: "1.2.3", BLOOMMD_BUILD_SHA: "0123456789abcdef", BLOOMMD_BUILD_TIME: "2026-11-11T08:00:00Z" });
    expect(info.displayVersion).toBe("BloomMD 1.2.3 (0123456)");
    expect(info).toMatchObject({ deployment: "cms", packageName: "@bloommd/cms", shortSha: "0123456", buildTime: "2026-11-11T08:00:00Z" });
  });

  test("without build metadata the SemVer of the package is used", () => {
    const info = getCmsBuildInfo({});
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.displayVersion).toBe(`BloomMD ${info.version}`);
  });
});

describe("media storage: S3 or local directory (#407)", () => {
  const s3 = {
    CMS_S3_BUCKET: "cms-media",
    CMS_S3_ENDPOINT: "https://s3.example.test",
    CMS_S3_REGION: "eu-central",
    CMS_S3_ACCESS_KEY: "AKIA-test-access-1234",
    CMS_S3_SECRET_KEY: "s3-test-secret-value-5678",
  };

  test("none of the CMS_S3_* variables set: local directory, no error", () => {
    expect(mediaStorage({}).mode).toBe("local");
    expect(mediaStorage({ CMS_S3_BUCKET: "  " }).mode).toBe("local");
    expect(runtimeConfigErrors(good)).toEqual([]);
  });

  test("all five set: S3, path style, endpoint from the variable", () => {
    const storage = mediaStorage(s3);
    expect(storage.mode).toBe("s3");
    if (storage.mode !== "s3") return;
    expect(s3ClientConfig(storage.s3)).toEqual({
      endpoint: "https://s3.example.test",
      region: "eu-central",
      forcePathStyle: true,
      credentials: { accessKeyId: s3.CMS_S3_ACCESS_KEY, secretAccessKey: s3.CMS_S3_SECRET_KEY },
    });
    expect(runtimeConfigErrors({ ...good, ...s3 })).toEqual([]);
  });

  test("some but not all set: startup error that names the missing variables and never a value", () => {
    for (const name of S3_VARS) {
      const partial: Record<string, string> = { ...s3 };
      delete partial[name];
      const errors = runtimeConfigErrors({ ...good, ...partial });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(name);
      for (const value of Object.values(s3)) expect(errors.join()).not.toContain(value);
      expect(mediaStorage(partial)).toEqual({ mode: "partial", missing: [name] });
    }
    const onlyKeys = runtimeConfigErrors({ ...good, CMS_S3_ACCESS_KEY: s3.CMS_S3_ACCESS_KEY, CMS_S3_SECRET_KEY: s3.CMS_S3_SECRET_KEY }).join();
    for (const name of ["CMS_S3_BUCKET", "CMS_S3_ENDPOINT", "CMS_S3_REGION"]) expect(onlyKeys).toContain(name);
    expect(onlyKeys).not.toContain("CMS_S3_ACCESS_KEY");
  });

  test("an invalid endpoint or placeholder credentials are errors without values", () => {
    const badEndpoint = runtimeConfigErrors({ ...good, ...s3, CMS_S3_ENDPOINT: "not a url" }).join();
    expect(badEndpoint).toContain("CMS_S3_ENDPOINT");
    expect(badEndpoint).not.toContain("not a url");
    const placeholder = runtimeConfigErrors({ ...good, ...s3, CMS_S3_SECRET_KEY: "replace-with-the-secret-key" }).join();
    expect(placeholder).toContain("CMS_S3_SECRET_KEY");
    expect(placeholder).not.toContain("replace-with-the-secret-key");
  });

  test(".env.example offers only placeholders that the start check rejects", () => {
    const example = readFileSync(join(import.meta.dir, "..", "..", ".env.example"), "utf8");
    const uncommented = Object.fromEntries(
      example.split("\n").flatMap((line) => {
        const match = /^#\s*(CMS_S3_[A-Z_]+)=(.*)$/.exec(line);
        return match ? [[match[1], match[2]]] : [];
      }),
    );
    expect(Object.keys(uncommented).sort()).toEqual([...S3_VARS].sort());
    const errors = runtimeConfigErrors({ ...good, ...uncommented }).join();
    expect(errors).toContain("placeholders");
    for (const value of Object.values(uncommented)) expect(errors).not.toContain(value);
  });
});
