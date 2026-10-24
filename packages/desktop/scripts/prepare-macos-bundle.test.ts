import { describe, expect, test } from "bun:test";

import {
  createLauncherWrapperScript,
  parseMacOSBundleVersion,
  resolveLinuxBundlePath,
  resolveLinuxPackageStagingPath,
  resolveMacOSBundlePath,
  shouldStageLinuxBundle,
} from "./prepare-macos-bundle";

describe("parseMacOSBundleVersion", () => {
  test("keeps the product SemVer and derives Apple-safe bundle fields", () => {
    expect(parseMacOSBundleVersion("0.1.0-beta.2")).toEqual({
      productVersion: "0.1.0-beta.2",
      shortVersion: "0.1.0",
      buildVersion: "2",
    });
  });

  test("uses the stable SemVer core as the build version when no prerelease number exists", () => {
    expect(parseMacOSBundleVersion("1.2.3")).toEqual({
      productVersion: "1.2.3",
      shortVersion: "1.2.3",
      buildVersion: "1.2.3",
    });
  });

  test("accepts an explicit numeric build override", () => {
    expect(parseMacOSBundleVersion("0.1.0-beta.2", "20260817.1")).toEqual({
      productVersion: "0.1.0-beta.2",
      shortVersion: "0.1.0",
      buildVersion: "20260817.1",
    });
  });

  test("rejects invalid macOS build overrides", () => {
    expect(() => parseMacOSBundleVersion("0.1.0-beta.2", "beta.2")).toThrow("Invalid macOS build version");
  });
});

describe("createLauncherWrapperScript", () => {
  test("blocks direct starts from mounted DMG volumes", () => {
    const script = createLauncherWrapperScript("launcher-electrobun");

    expect(script).toContain("/Volumes/*)");
    expect(script).toContain("Bitte ziehe BloomMD zuerst in den Programme-Ordner");
    expect(script).toContain('exec "$SCRIPT_DIR/launcher-electrobun" "$@"');
  });
});

describe("resolveMacOSBundlePath", () => {
  test("uses the wrapper path when Electrobun provides it", () => {
    expect(
      resolveMacOSBundlePath({
        ELECTROBUN_OS: "macos",
        ELECTROBUN_WRAPPER_BUNDLE_PATH: "/tmp/BloomMD.app",
      }),
    ).toBe("/tmp/BloomMD.app");
  });

  test("resolves the inner build bundle from Electrobun build env", () => {
    expect(
      resolveMacOSBundlePath({
        ELECTROBUN_APP_NAME: "BloomMD",
        ELECTROBUN_BUILD_DIR: "/tmp/build",
        ELECTROBUN_OS: "macos",
      }),
    ).toBe("/tmp/build/BloomMD.app");
  });

  test("ignores non-macOS builds", () => {
    expect(resolveMacOSBundlePath({ ELECTROBUN_OS: "linux" })).toBeNull();
  });
});

describe("resolveLinuxBundlePath", () => {
  test("resolves the native Electrobun Linux bundle", () => {
    expect(
      resolveLinuxBundlePath({
        ELECTROBUN_APP_NAME: "BloomMD",
        ELECTROBUN_BUILD_DIR: "/tmp/build/stable-linux-x64",
        ELECTROBUN_OS: "linux",
      }),
    ).toBe("/tmp/build/stable-linux-x64/BloomMD");
  });

  test("uses a stable package staging path", () => {
    expect(
      resolveLinuxPackageStagingPath({
        ELECTROBUN_BUILD_DIR: "/tmp/build/stable-linux-arm64",
        ELECTROBUN_OS: "linux",
      }),
    ).toBe("/tmp/build/stable-linux-arm64/package-app");
  });

  test("ignores non-Linux builds", () => {
    expect(resolveLinuxBundlePath({ ELECTROBUN_OS: "macos" })).toBeNull();
    expect(resolveLinuxPackageStagingPath({ ELECTROBUN_OS: "macos" })).toBeNull();
  });
});

describe("shouldStageLinuxBundle", () => {
  test("stages the native bundle during postBuild", () => {
    expect(
      shouldStageLinuxBundle({
        ELECTROBUN_BUILD_DIR: "/tmp/build/stable-linux-x64",
        ELECTROBUN_OS: "linux",
      }),
    ).toBe(true);
  });

  test("does not replace the native staging with the self-extracting postWrap bundle", () => {
    expect(
      shouldStageLinuxBundle({
        ELECTROBUN_BUILD_DIR: "/tmp/build/stable-linux-x64",
        ELECTROBUN_OS: "linux",
        ELECTROBUN_WRAPPER_BUNDLE_PATH: "/tmp/build/stable-linux-x64/BloomMD",
      }),
    ).toBe(false);
  });

  test("ignores non-Linux builds", () => {
    expect(shouldStageLinuxBundle({ ELECTROBUN_OS: "macos" })).toBe(false);
  });
});
