import { afterEach, describe, expect, test } from "bun:test";
import { getBuildInfo } from "./build-info";

const originalEnv = {
  NEXT_PUBLIC_BLOOMMD_VERSION: process.env.NEXT_PUBLIC_BLOOMMD_VERSION,
  NEXT_PUBLIC_BLOOMMD_GIT_SHA: process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA,
  GITHUB_SHA: process.env.GITHUB_SHA,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
});

describe("marketing build info", () => {
  test("reports the marketing package and deployment", () => {
    process.env.NEXT_PUBLIC_BLOOMMD_VERSION = "0.1.0-beta.3";
    process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA = "de8aff39cb9c93c36d62036899735eaf4c72dfa8";

    const info = getBuildInfo("marketing");

    expect(info.packageName).toBe("@bloommd/marketing");
    expect(info.deployment).toBe("marketing");
    expect(info.displayVersion).toBe("BloomMD 0.1.0-beta.3 (de8aff3)");
  });

  test("can ignore server-only metadata for client-rendered labels", () => {
    process.env.NEXT_PUBLIC_BLOOMMD_VERSION = "0.1.0-beta.3";
    delete process.env.NEXT_PUBLIC_BLOOMMD_GIT_SHA;
    process.env.GITHUB_SHA = "feedfacecb9c93c36d62036899735eaf4c72dfa8";

    expect(getBuildInfo("marketing").shortSha).toBe("feedfac");
    expect(getBuildInfo("marketing", { publicOnly: true }).shortSha).toBeNull();
    expect(getBuildInfo("marketing", { publicOnly: true }).displayVersion).toBe("BloomMD 0.1.0-beta.3");
  });
});
