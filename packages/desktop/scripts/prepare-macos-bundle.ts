import { chmodSync, cpSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { macOSReleaseEnabled } from "./macos-signing";

export type MacOSBundleVersion = {
  productVersion: string;
  shortVersion: string;
  buildVersion: string;
};

type ElectrobunScriptEnv = Record<string, string | undefined> & {
  ELECTROBUN_APP_NAME?: string;
  ELECTROBUN_APP_VERSION?: string;
  ELECTROBUN_ARCH?: string;
  ELECTROBUN_BUILD_DIR?: string;
  ELECTROBUN_BUILD_ENV?: string;
  ELECTROBUN_DEVELOPER_ID?: string;
  ELECTROBUN_OS?: string;
  ELECTROBUN_WRAPPER_BUNDLE_PATH?: string;
  BLOOMMD_MACOS_BUILD_NUMBER?: string;
  BLOOMMD_MACOS_RELEASE?: string;
};

const MACOS_BUILD_VERSION_PATTERN = /^[0-9]+(?:[.][0-9]+)*$/;
const PRODUCT_VERSION_PATTERN = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)(?:-([0-9A-Za-z.-]+))?(?:[+][0-9A-Za-z.-]+)?$/;
const AD_HOC_SIGNING_ATTEMPTS = 5;

export function parseMacOSBundleVersion(productVersion: string, buildNumberOverride?: string): MacOSBundleVersion {
  const match = PRODUCT_VERSION_PATTERN.exec(productVersion);
  if (!match) {
    throw new Error(`Invalid BloomMD product version: ${productVersion}`);
  }

  const [, major, minor, patch, prerelease] = match;
  const shortVersion = `${major}.${minor}.${patch}`;
  const buildVersion = buildNumberOverride ?? deriveBuildVersion(prerelease, shortVersion);

  if (!MACOS_BUILD_VERSION_PATTERN.test(buildVersion)) {
    throw new Error(`Invalid macOS build version: ${buildVersion}`);
  }

  return { productVersion, shortVersion, buildVersion };
}

export function createLauncherWrapperScript(originalExecutableName: string): string {
  return `#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
APP_BUNDLE="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

case "$APP_BUNDLE" in
  /Volumes/*)
    /usr/bin/osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
display dialog "Bitte ziehe BloomMD zuerst in den Programme-Ordner und starte die App danach erneut." buttons {"OK"} default button "OK" with title "BloomMD installieren"
APPLESCRIPT
    /usr/bin/open -R "$APP_BUNDLE" >/dev/null 2>&1 || true
    exit 64
    ;;
esac

exec "$SCRIPT_DIR/${originalExecutableName}" "$@"
`;
}

export function resolveMacOSBundlePath(env: ElectrobunScriptEnv): string | null {
  if (env.ELECTROBUN_OS !== "macos") return null;
  if (env.ELECTROBUN_WRAPPER_BUNDLE_PATH) return env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
  if (!env.ELECTROBUN_BUILD_DIR || !env.ELECTROBUN_APP_NAME) return null;
  return join(env.ELECTROBUN_BUILD_DIR, `${env.ELECTROBUN_APP_NAME}.app`);
}

export function resolveLinuxBundlePath(env: ElectrobunScriptEnv): string | null {
  if (env.ELECTROBUN_OS !== "linux") return null;
  if (!env.ELECTROBUN_BUILD_DIR || !env.ELECTROBUN_APP_NAME) return null;
  return join(env.ELECTROBUN_BUILD_DIR, env.ELECTROBUN_APP_NAME);
}

export function resolveLinuxPackageStagingPath(env: ElectrobunScriptEnv): string | null {
  if (env.ELECTROBUN_OS !== "linux" || !env.ELECTROBUN_BUILD_DIR) return null;
  return join(env.ELECTROBUN_BUILD_DIR, "package-app");
}

export function shouldStageLinuxBundle(env: ElectrobunScriptEnv): boolean {
  return env.ELECTROBUN_OS === "linux" && !env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
}

function deriveBuildVersion(prerelease: string | undefined, fallback: string): string {
  if (!prerelease) return fallback;
  const numericSegment = prerelease
    .split(/[.-]/)
    .toReversed()
    .find((segment) => /^[0-9]+$/.test(segment));
  return numericSegment ?? fallback;
}

function patchInfoPlist(bundlePath: string, versions: MacOSBundleVersion, env: ElectrobunScriptEnv): void {
  const plistPath = join(bundlePath, "Contents", "Info.plist");
  if (!existsSync(plistPath)) {
    throw new Error(`Missing Info.plist: ${plistPath}`);
  }

  setPlistValue(plistPath, "CFBundleShortVersionString", versions.shortVersion);
  setPlistValue(plistPath, "CFBundleVersion", versions.buildVersion);
  setPlistValue(plistPath, "BloomMDProductVersion", versions.productVersion);
  setPlistValue(plistPath, "BloomMDBuildChannel", env.ELECTROBUN_BUILD_ENV ?? "development");
  setPlistValue(
    plistPath,
    "BloomMDDeveloperIDStatus",
    env.BLOOMMD_MACOS_RELEASE === "1" ? "configured" : "ad-hoc",
  );
}

function setPlistValue(plistPath: string, key: string, value: string): void {
  const setResult = Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", `Set :${key} ${value}`, plistPath], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if (setResult.exitCode === 0) return;

  const addResult = Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", `Add :${key} string ${value}`, plistPath], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (addResult.exitCode !== 0) {
    throw new Error(`Could not set ${key} in ${plistPath}`);
  }
}

function installLauncherWrapper(bundlePath: string, signedRelease: boolean): void {
  const launcherPath = join(bundlePath, "Contents", "MacOS", "launcher");
  const originalLauncherName = "launcher-electrobun";
  const originalLauncherPath = join(dirname(launcherPath), originalLauncherName);

  if (!existsSync(launcherPath) && !existsSync(originalLauncherPath)) {
    throw new Error(`Missing launcher executable: ${launcherPath}`);
  }

  if (!existsSync(originalLauncherPath)) {
    renameSync(launcherPath, originalLauncherPath);
  }

  if (signedRelease) {
    const result = Bun.spawnSync([
      "xcrun", "clang", "-Wall", "-Wextra", "-Werror", "-O2", "-mmacosx-version-min=11.0",
      join(import.meta.dir, "macos-launcher.c"), "-o", launcherPath,
    ], { stdout: "inherit", stderr: "inherit" });
    if (result.exitCode !== 0) throw new Error("Could not build native macOS launcher guard.");
  } else {
    writeFileSync(launcherPath, createLauncherWrapperScript(originalLauncherName), { encoding: "utf8" });
  }
  chmodSync(launcherPath, 0o755);
  chmodSync(originalLauncherPath, 0o755);
}

function adHocSignBundle(bundlePath: string): void {
  console.log(`Ad-hoc signing macOS wrapper bundle: ${bundlePath}`);

  let lastExitCode = 0;
  for (let attempt = 1; attempt <= AD_HOC_SIGNING_ATTEMPTS; attempt += 1) {
    const stripped = Bun.spawnSync(["xattr", "-cr", bundlePath], { stdout: "inherit", stderr: "inherit" });
    if (stripped.exitCode !== 0) {
      throw new Error(`Could not clear extended attributes (exit ${stripped.exitCode}).`);
    }

    // Electrobun can leave the wrapper bundle with a prior resource envelope after it has
    // assembled the DMG. Replacing that signature in-place may retain the stale envelope,
    // which makes `codesign --verify --strict` reject the final app. Start each ad-hoc
    // signing attempt with an unsigned bundle so the resource manifest is recreated.
    const removed = Bun.spawnSync(["codesign", "--remove-signature", bundlePath], {
      stdout: "ignore",
      stderr: "ignore",
    });
    if (removed.exitCode !== 0) {
      throw new Error(`Could not remove the existing macOS signature (exit ${removed.exitCode}).`);
    }

    const result = Bun.spawnSync(["codesign", "--force", "--deep", "--sign", "-", bundlePath], {
      stdout: "inherit",
      stderr: attempt === AD_HOC_SIGNING_ATTEMPTS ? "inherit" : "ignore",
    });

    if (result.exitCode === 0) {
      if (attempt > 1) console.log(`Ad-hoc signing succeeded on attempt ${attempt}.`);
      lastExitCode = 0;
      break;
    }

    lastExitCode = result.exitCode ?? 1;
    if (attempt < AD_HOC_SIGNING_ATTEMPTS) console.log(`Ad-hoc signing attempt ${attempt} failed, retrying.`);
  }

  if (lastExitCode !== 0) {
    throw new Error(`Ad-hoc signing failed after ${AD_HOC_SIGNING_ATTEMPTS} attempts (exit ${lastExitCode}).`);
  }
}

function stageLinuxBundle(env: ElectrobunScriptEnv): void {
  const bundlePath = resolveLinuxBundlePath(env);
  const stagingPath = resolveLinuxPackageStagingPath(env);
  if (!bundlePath || !stagingPath) return;
  if (!existsSync(bundlePath)) {
    throw new Error(`Missing Linux bundle: ${bundlePath}`);
  }

  rmSync(stagingPath, { recursive: true, force: true });
  cpSync(bundlePath, stagingPath, { recursive: true, dereference: true });
  console.log(`Staged Linux bundle for Arch packaging: ${stagingPath}`);
}

export function prepareMacOSBundle(env: ElectrobunScriptEnv = process.env): void {
  if (env.ELECTROBUN_OS === "linux") {
    if (shouldStageLinuxBundle(env)) {
      stageLinuxBundle(env);
    } else {
      console.log("Skipping Linux package staging for the self-extracting wrapper.");
    }
    return;
  }

  const bundlePath = resolveMacOSBundlePath(env);
  if (!bundlePath) return;

  if (!existsSync(bundlePath)) {
    throw new Error(`Missing macOS bundle: ${bundlePath}`);
  }

  const productVersion = env.ELECTROBUN_APP_VERSION;
  if (!productVersion) {
    throw new Error("Missing ELECTROBUN_APP_VERSION.");
  }

  const versions = parseMacOSBundleVersion(productVersion, env.BLOOMMD_MACOS_BUILD_NUMBER);
  patchInfoPlist(bundlePath, versions, env);
  for (const file of ["LICENSE", "LICENSE-MIT-legacy"]) {
    cpSync(join(import.meta.dir, "../../..", file), join(bundlePath, "Contents/Resources", file));
  }

  if (env.ELECTROBUN_WRAPPER_BUNDLE_PATH) {
    const signedRelease = macOSReleaseEnabled(env);
    installLauncherWrapper(bundlePath, signedRelease);
    if (signedRelease) {
      console.log("Developer ID signing is configured; skipping ad-hoc fallback signing.");
    } else {
      adHocSignBundle(bundlePath);
    }
  }
}

if (import.meta.main) {
  try {
    prepareMacOSBundle();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
