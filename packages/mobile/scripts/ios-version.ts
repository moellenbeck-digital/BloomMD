/**
 * Single source for the iOS app version: `packages/mobile/package.json`.
 *
 * - MARKETING_VERSION (CFBundleShortVersionString) is the SemVer version without prerelease and
 *   build metadata, because App Store Connect only accepts up to three numeric components:
 *   `0.1.0-beta.10` -> `0.1.0`, `1.0.0` -> `1.0.0`.
 * - CURRENT_PROJECT_VERSION (CFBundleVersion) is the build number. CI passes the workflow run
 *   number, so every upload for the same marketing version gets a higher build number.
 *
 * Usage (from packages/mobile):
 *   bun scripts/ios-version.ts                 print MARKETING_VERSION=… and CURRENT_PROJECT_VERSION=…
 *   bun scripts/ios-version.ts --build 42      same, with build number 42
 *   bun scripts/ios-version.ts --check         fail when the Xcode project disagrees with package.json
 *   bun scripts/ios-version.ts --write [--build 42]
 *                                              write both values into the App target of the Xcode project
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Store marketing version for a package.json SemVer version (prerelease and metadata stripped). */
export function marketingVersion(semver: string): string {
  const match = SEMVER.exec(semver.trim());
  if (!match) throw new Error(`"${semver}" is not a SemVer version (X.Y.Z[-prerelease])`);
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/** Build number (CFBundleVersion): a positive integer, "1" when none is given. */
export function buildNumber(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "1";
  if (!/^[1-9]\d{0,8}$/.test(raw.trim())) throw new Error(`build number "${raw}" must be a positive integer`);
  return raw.trim();
}

/** MARKETING_VERSION values of all build configurations in a project.pbxproj. */
export function readMarketingVersions(pbxproj: string): string[] {
  return [...pbxproj.matchAll(/MARKETING_VERSION = "?([^";]+)"?;/g)].map((match) => match[1] ?? "");
}

/** project.pbxproj with MARKETING_VERSION and, if given, CURRENT_PROJECT_VERSION replaced everywhere. */
export function writeVersions(pbxproj: string, marketing: string, build?: string): string {
  if (readMarketingVersions(pbxproj).length === 0) throw new Error("no MARKETING_VERSION found in the Xcode project");
  let result = pbxproj.replace(/MARKETING_VERSION = "?[^";]+"?;/g, `MARKETING_VERSION = ${marketing};`);
  if (build !== undefined) result = result.replace(/CURRENT_PROJECT_VERSION = "?[^";]+"?;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  return result;
}

function argument(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args: string[]): number {
  const packageDir = resolve(import.meta.dirname, "..");
  const pbxprojPath = resolve(packageDir, "ios/App/App.xcodeproj/project.pbxproj");
  const { version } = JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8")) as { version: string };
  const marketing = marketingVersion(version);
  const build = buildNumber(argument(args, "--build"));

  if (args.includes("--check")) {
    const found = readMarketingVersions(readFileSync(pbxprojPath, "utf8"));
    const wrong = found.filter((value) => value !== marketing);
    if (found.length === 0 || wrong.length > 0) {
      console.error(`Xcode MARKETING_VERSION (${found.join(", ") || "none"}) does not match package.json ${version} -> ${marketing}. Run: bun scripts/ios-version.ts --write`);
      return 1;
    }
    console.log(`Xcode MARKETING_VERSION ${marketing} matches package.json ${version}`);
    return 0;
  }
  if (args.includes("--write")) {
    const pbxproj = readFileSync(pbxprojPath, "utf8");
    writeFileSync(pbxprojPath, writeVersions(pbxproj, marketing, args.includes("--build") ? build : undefined));
  }
  console.log(`MARKETING_VERSION=${marketing}`);
  console.log(`CURRENT_PROJECT_VERSION=${build}`);
  console.log(`BLOOMMD_VERSION=${version}`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
