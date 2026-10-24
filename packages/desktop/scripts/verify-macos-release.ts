import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import packageJson from "../package.json";

function run(args: string[], input?: Uint8Array): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe", stdin: input });
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

function signature(path: string): string {
  const result = Bun.spawnSync(["codesign", "-dv", "--verbose=4", path], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`Missing signature: ${path}`);
  return result.stderr.toString();
}

export function assertReleaseSignature(details: string, team: string, hardened: boolean): void {
  if (!details.split("\n").includes(`TeamIdentifier=${team}`) ||
      !details.includes("Authority=Developer ID Application:") || !/^Timestamp=.+/m.test(details)) {
    throw new Error("Expected timestamped Developer ID Application signature for the release team.");
  }
  if (hardened && !/^CodeDirectory .*flags=.*\bruntime\b/m.test(details)) {
    throw new Error("Hardened Runtime is missing.");
  }
}

function verifyCode(path: string, team: string, hardened = true): void {
  run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", path]);
  assertReleaseSignature(signature(path), team, hardened);
  if (!hardened) return;
  const xml = run(["codesign", "-d", "--entitlements", ":-", path]);
  if (xml.trim()) {
    const entitlements: Record<string, unknown> = JSON.parse(run([
      "plutil", "-convert", "json", "-o", "-", "-",
    ], Buffer.from(xml)));
    if (entitlements["com.apple.security.get-task-allow"] === true) {
      throw new Error(`Development entitlement in ${path}`);
    }
  }
}

function verifyBinaries(directory: string, team: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) verifyBinaries(path, team);
    else if (entry.isFile() && run(["file", "-b", path]).includes("Mach-O")) verifyCode(path, team);
  }
}

function verifyApp(path: string, team: string, wrapper: boolean): void {
  verifyCode(path, team);
  for (const file of ["LICENSE", "LICENSE-MIT-legacy"]) {
    const bundled = readFileSync(join(path, "Contents/Resources", file));
    const source = readFileSync(join(import.meta.dir, "../../..", file));
    if (!bundled.equals(source)) throw new Error(`Release bundle ${file} does not match source.`);
  }
  if (!wrapper) {
    for (const file of ["LICENSE", "LICENSE-MIT-legacy"]) {
      const bundled = readFileSync(join(path, "Contents/Resources/app", file));
      const source = readFileSync(join(import.meta.dir, "../../..", file));
      if (!bundled.equals(source)) throw new Error(`Release app ${file} does not match source.`);
    }
  }
  const details = signature(path);
  if (!details.split("\n").includes("Identifier=app.bloommd")) throw new Error("Unexpected bundle signing identifier.");
  const plist: Record<string, unknown> = JSON.parse(run(["plutil", "-convert", "json", "-o", "-", join(path, "Contents/Info.plist")]));
  if (plist.CFBundleIdentifier !== "app.bloommd" || plist.BloomMDProductVersion !== packageJson.version ||
      plist.BloomMDDeveloperIDStatus !== "configured") throw new Error("Release bundle metadata mismatch.");
  if (wrapper && !run(["file", "-b", join(path, "Contents/MacOS/launcher")]).includes("Mach-O")) {
    throw new Error("Signed installer must use a native launcher guard.");
  }
  verifyBinaries(join(path, "Contents"), team);
  run(["xcrun", "stapler", "validate", path]);
  run(["spctl", "--assess", "--type", "execute", "--verbose=2", path]);
}

export function verifyMacOSRelease(): void {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) throw new Error("Missing APPLE_TEAM_ID.");
  const artifacts = resolve("artifacts");
  const dmg = join(artifacts, "stable-macos-arm64-BloomMD.dmg");
  const archive = join(artifacts, "stable-macos-arm64-BloomMD.app.tar.zst");
  const temporary = mkdtempSync(join(tmpdir(), "bloommd-release-check-"));
  const mount = join(temporary, "mount");
  let mounted = false;
  try {
    verifyCode(dmg, team, false);
    run(["hdiutil", "verify", dmg]);
    run(["xcrun", "stapler", "validate", dmg]);
    run(["spctl", "--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", dmg]);
    run(["hdiutil", "attach", dmg, "-mountpoint", mount, "-nobrowse", "-readonly", "-quiet"]);
    mounted = true;
    verifyApp(join(mount, "BloomMD.app"), team, true);
    run(["tar", "-xf", archive, "-C", temporary]);
    verifyApp(join(temporary, "BloomMD.app"), team, false);
    const hashes = Object.fromEntries(readdirSync(artifacts).filter((name) => name !== "macos-signing-evidence.json").map((name) => [
      name, createHash("sha256").update(readFileSync(join(artifacts, name))).digest("hex"),
    ]));
    const report = { version: packageJson.version, gitSha: process.env.BLOOMMD_BUILD_SHA ?? run(["git", "rev-parse", "HEAD"]).trim(),
      workingTreeDirty: run(["git", "status", "--porcelain"]).trim().length > 0,
      teamId: team, signature: "Developer ID Application", notarization: "stapled and validated", hashes };
    writeFileSync(join(artifacts, "macos-signing-evidence.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (mounted) run(["hdiutil", "detach", mount, "-quiet"]);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try { verifyMacOSRelease(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
