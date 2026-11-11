import { describe, expect, test } from "bun:test";
import { adminOrigin, appSigningKeys, runtimeConfigErrors } from "./env";
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
