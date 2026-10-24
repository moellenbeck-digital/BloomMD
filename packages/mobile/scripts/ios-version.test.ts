import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildNumber, marketingVersion, readMarketingVersions, writeVersions } from "./ios-version";

describe("marketingVersion", () => {
  test("strips prerelease and build metadata", () => {
    expect(marketingVersion("0.1.0-beta.10")).toBe("0.1.0");
    expect(marketingVersion("1.0.0")).toBe("1.0.0");
    expect(marketingVersion("1.2.3-rc.1+sha.abc")).toBe("1.2.3");
  });

  test("rejects anything that is not SemVer", () => {
    expect(() => marketingVersion("1.0")).toThrow();
    expect(() => marketingVersion("v1.0.0")).toThrow();
    expect(() => marketingVersion("01.0.0")).toThrow();
  });
});

describe("buildNumber", () => {
  test("defaults to 1 and accepts positive integers", () => {
    expect(buildNumber(undefined)).toBe("1");
    expect(buildNumber("")).toBe("1");
    expect(buildNumber("42")).toBe("42");
  });

  test("rejects zero, decimals and text", () => {
    expect(() => buildNumber("0")).toThrow();
    expect(() => buildNumber("1.2")).toThrow();
    expect(() => buildNumber("abc")).toThrow();
  });
});

describe("Xcode project", () => {
  const pbxproj = `MARKETING_VERSION = 1.0;\nCURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = "1.0";\nCURRENT_PROJECT_VERSION = 1;\n`;

  test("writes the marketing version everywhere and the build number only when given", () => {
    const written = writeVersions(pbxproj, "0.1.0");
    expect(readMarketingVersions(written)).toEqual(["0.1.0", "0.1.0"]);
    expect(written).toContain("CURRENT_PROJECT_VERSION = 1;");
    expect(writeVersions(pbxproj, "0.1.0", "17").match(/CURRENT_PROJECT_VERSION = 17;/g)).toHaveLength(2);
  });

  test("the committed project matches package.json", () => {
    const root = resolve(import.meta.dirname, "..");
    const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
    const project = readFileSync(resolve(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    expect(new Set(readMarketingVersions(project))).toEqual(new Set([marketingVersion(version)]));
  });
});
