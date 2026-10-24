import { afterEach, describe, expect, test } from "bun:test";
import packageJson from "../../package.json";
import { getBuildInfo } from "./build-info";

const originalEnv = {
  NEXT_PUBLIC_BLOOMMD_VERSION: process.env.NEXT_PUBLIC_BLOOMMD_VERSION,
  NEXT_PUBLIC_BLOOMMD_GIT_SHA: process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA,
  NEXT_PUBLIC_BLOOMMD_GIT_TAG: process.env.NEXT_PUBLIC_BLOOMMD_GIT_TAG,
  NEXT_PUBLIC_BLOOMMD_BUILD_TIME: process.env.NEXT_PUBLIC_BLOOMMD_BUILD_TIME,
  GITHUB_SHA: process.env.GITHUB_SHA,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

describe("app build info", () => {
  test("uses public build metadata for visible version labels", () => {
    process.env.NEXT_PUBLIC_BLOOMMD_VERSION = "0.1.0-beta.3";
    process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA = "de8aff39cb9c93c36d62036899735eaf4c72dfa8";
    process.env.NEXT_PUBLIC_BLOOMMD_GIT_TAG = "v0.1.0-beta.3";
    process.env.NEXT_PUBLIC_BLOOMMD_BUILD_TIME = "2026-08-16T09:00:00.000Z";

    expect(getBuildInfo("app")).toEqual({
      product: "BloomMD",
      packageName: "@bloommd/web-app",
      deployment: "app",
      version: "0.1.0-beta.3",
      gitSha: "de8aff39cb9c93c36d62036899735eaf4c72dfa8",
      shortSha: "de8aff3",
      gitTag: "v0.1.0-beta.3",
      buildTime: "2026-08-16T09:00:00.000Z",
      displayVersion: "BloomMD 0.1.0-beta.3 (de8aff3)",
    });
  });

  test("can ignore server-only metadata for client-rendered labels", () => {
    delete process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA;
    process.env.GITHUB_SHA = "feedfacecb9c93c36d62036899735eaf4c72dfa8";

    expect(getBuildInfo("app").shortSha).toBe("feedfac");
    expect(getBuildInfo("app", { publicOnly: true }).shortSha).toBeNull();
    expect(getBuildInfo("app", { publicOnly: true }).displayVersion).toBe(`BloomMD ${packageJson.version}`);
  });
});
