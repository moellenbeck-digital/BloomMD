import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { marketingVersion } from "./ios-version";

const packageDir = resolve(import.meta.dir, "..");
const script = resolve(import.meta.dir, "check-ios-release.sh");
const hasBash = Boolean(Bun.which("bash"));
// On a Mac `plutil` would try to convert the XML fixtures, which works too; the fixtures are plain XML.

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const version = marketingVersion((JSON.parse(readFileSync(resolve(packageDir, "package.json"), "utf8")) as { version: string }).version);

/** A Release App.app as Xcode would leave it, built from the sources in the repository. */
function fakeApp(): string {
  const root = mkdtempSync(join(tmpdir(), "check-ios-release-"));
  directories.push(root);
  const app = join(root, "App.app");
  const copy = (from: string, to: string) => {
    mkdirSync(dirname(join(app, to)), { recursive: true });
    cpSync(resolve(packageDir, from), join(app, to));
  };
  copy("ios/App/App/PrivacyInfo.xcprivacy", "PrivacyInfo.xcprivacy");
  copy("../capacitor-folder/ios/Sources/BloomFolderPlugin/PrivacyInfo.xcprivacy", "Frameworks/BloommdCapacitorFolder.framework/BloommdCapacitorFolder_Privacy.bundle/PrivacyInfo.xcprivacy");
  copy("../capacitor-keychain/ios/Sources/BloomKeychainPlugin/PrivacyInfo.xcprivacy", "Frameworks/BloommdCapacitorKeychain.framework/BloommdCapacitorKeychain_Privacy.bundle/PrivacyInfo.xcprivacy");
  const info = readFileSync(resolve(packageDir, "ios/App/App/Info.plist"), "utf8")
    .replace("$(PRODUCT_BUNDLE_IDENTIFIER)", "app.bloommd.mobile")
    .replace("$(MARKETING_VERSION)", version)
    .replace("$(CURRENT_PROJECT_VERSION)", "42")
    .replace("</dict>\n</plist>", "\t<key>UIDeviceFamily</key>\n\t<array>\n\t\t<integer>1</integer>\n\t\t<integer>2</integer>\n\t</array>\n</dict>\n</plist>");
  writeFileSync(join(app, "Info.plist"), info);
  mkdirSync(join(app, "public/assets"), { recursive: true });
  writeFileSync(join(app, "public/assets/index-abc.js"), "console.log('BloomMD')");
  return app;
}

function run(app: string, ...args: string[]) {
  const result = Bun.spawnSync(["bash", script, app, ...args], { env: { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`, HOME: process.env.HOME ?? "" } });
  return { status: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

function edit(app: string, file: string, change: (text: string) => string) {
  writeFileSync(join(app, file), change(readFileSync(join(app, file), "utf8")));
}

const FOLDER_MANIFEST = "Frameworks/BloommdCapacitorFolder.framework/BloommdCapacitorFolder_Privacy.bundle/PrivacyInfo.xcprivacy";
const KEYCHAIN_MANIFEST = "Frameworks/BloommdCapacitorKeychain.framework/BloommdCapacitorKeychain_Privacy.bundle/PrivacyInfo.xcprivacy";

describe.skipIf(!hasBash)("check-ios-release.sh", () => {
  test("passes for a bundle built from the repository sources", () => {
    const { status, out, err } = run(fakeApp(), "42");
    expect(err).toBe("");
    expect(status).toBe(0);
    expect(out).toContain("ok:   privacy manifest PrivacyInfo.xcprivacy matches store/PRIVACY-ANSWERS.md");
    expect(out).toContain("ok:   Xcode project keeps the iPad app available on the Mac");
    expect(out).toContain("ok:   built Info.plist has no Mac blockers (iPad device family)");
    expect(out).toContain("ok:   app icon 1024 px, no alpha");
    expect(out).toContain(`Release bundle checks passed (${version} (42))`);
  });

  test("accepts an .xcarchive", () => {
    const app = fakeApp();
    const archive = join(dirname(app), "BloomMD.xcarchive");
    mkdirSync(join(archive, "Products/Applications"), { recursive: true });
    cpSync(app, join(archive, "Products/Applications/App.app"), { recursive: true });
    expect(run(archive).status).toBe(0);
  });

  test("fails when ITSAppUsesNonExemptEncryption is not false", () => {
    const app = fakeApp();
    edit(app, "Info.plist", (text) => text.replace(/(ITSAppUsesNonExemptEncryption<\/key>\s*)<false\/>/, "$1<true/>"));
    const { status, err } = run(app);
    expect(status).toBe(1);
    expect(err).toContain("ITSAppUsesNonExemptEncryption must be false");
  });

  test("fails when the key is missing", () => {
    const app = fakeApp();
    edit(app, "Info.plist", (text) => text.replace(/\t<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>\n/, ""));
    expect(run(app).err).toContain("ITSAppUsesNonExemptEncryption must be false");
  });

  test("fails when the marketing version or the CI build number differ", () => {
    const app = fakeApp();
    edit(app, "Info.plist", (text) => text.replace(`<string>${version}</string>`, "<string>9.9.9</string>"));
    expect(run(app).err).toContain(`CFBundleShortVersionString 9.9.9, expected ${version}`);
    expect(run(fakeApp(), "43").err).toContain("CFBundleVersion 42, expected 43");
  });

  test("fails when a privacy manifest is missing or deviates from the privacy answers", () => {
    const missing = fakeApp();
    rmSync(join(missing, KEYCHAIN_MANIFEST));
    expect(run(missing).err).toContain("missing Frameworks/BloommdCapacitorKeychain.framework/BloommdCapacitorKeychain_Privacy.bundle");

    const tracking = fakeApp();
    edit(tracking, "PrivacyInfo.xcprivacy", (text) => text.replace(/(NSPrivacyTracking<\/key>\s*)<false\/>/, "$1<true/>"));
    expect(run(tracking).err).toContain("NSPrivacyTracking must be false");

    const reasons = fakeApp();
    edit(reasons, FOLDER_MANIFEST, (text) => text.replace("<string>3B52.1</string>", ""));
    expect(run(reasons).err).toContain("FileTimestamp reasons are C617.1, expected 3B52.1, C617.1");

    const broken = fakeApp();
    writeFileSync(join(broken, "PrivacyInfo.xcprivacy"), "<plist><dict>");
    expect(run(broken).status).toBe(1);
  });

  test("fails when self-test code is in the web bundle", () => {
    const strings = fakeApp();
    writeFileSync(join(strings, "public/assets/index-abc.js"), 'createFolderStore(BloomFolder,"selftest-vault")');
    expect(run(strings).err).toContain("self-test code found in public/");

    const chunk = fakeApp();
    writeFileSync(join(chunk, "public/assets/selftest-1a2b.js"), "export {}");
    expect(run(chunk).err).toContain("self-test code found in public/");
  });

  test("fails when the built app drops the iPad device family or requires hardware a Mac lacks", () => {
    const family = fakeApp();
    edit(family, "Info.plist", (text) => text.replace("<integer>2</integer>", ""));
    expect(run(family).err).toContain("built Info.plist blocks the Mac: UIDeviceFamily of the built app does not include the iPad (2)");

    const capability = fakeApp();
    edit(capability, "Info.plist", (text) => text.replace("<string>arm64</string>", "<string>arm64</string><string>telephony</string>"));
    const { status, err } = run(capability);
    expect(status).toBe(1);
    expect(err).toContain('requires "telephony", which a Mac does not have');

    const devices = fakeApp();
    edit(devices, "Info.plist", (text) => text.replace("</dict>\n</plist>", "<key>UISupportedDevices</key><array><string>iPad8,1</string></array></dict>\n</plist>"));
    expect(run(devices).err).toContain("UISupportedDevices");
  });

  test("fails for a path that is not an app", () => {
    expect(run(join(tmpdir(), "does-not-exist.app")).status).toBe(1);
  });
});
