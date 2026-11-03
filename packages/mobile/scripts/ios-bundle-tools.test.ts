import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { macPlistProblems, macProjectProblems, parsePlist, pngInfo, privacyProblems, valueAt, type PlistValue } from "./ios-bundle-tools";

const packageDir = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(resolve(packageDir, path), "utf8");
const plist = (path: string) => parsePlist(read(path));

const APP_MANIFEST = "ios/App/App/PrivacyInfo.xcprivacy";
const FOLDER_MANIFEST = "../capacitor-folder/ios/Sources/BloomFolderPlugin/PrivacyInfo.xcprivacy";
const KEYCHAIN_MANIFEST = "../capacitor-keychain/ios/Sources/BloomKeychainPlugin/PrivacyInfo.xcprivacy";
const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";
const INFO_PLIST = "ios/App/App/Info.plist";

describe("parsePlist", () => {
  test("reads dictionaries, arrays, scalars and ignores comments", () => {
    const parsed = parsePlist(`<?xml version="1.0"?><!DOCTYPE plist PUBLIC "x" "y"><!-- note --><plist version="1.0"><dict>
      <key>a</key><string>x &amp; y</string><key>b</key><true/><key>c</key><false></false><key>d</key><integer>7</integer>
      <key>e</key><array><string>1</string><string/></array><key>f</key><array/><key>g</key><dict/><key>h</key><string></string>
    </dict></plist>`);
    expect(parsed).toEqual({ a: "x & y", b: true, c: false, d: 7, e: ["1", ""], f: [], g: {}, h: "" });
  });

  test("valueAt follows keys and array indexes", () => {
    const parsed = parsePlist("<plist><dict><key>a</key><array><dict><key>b</key><string>v</string></dict></array></dict></plist>");
    expect(valueAt(parsed, "a.0.b")).toBe("v");
    expect(valueAt(parsed, "a.1.b")).toBeUndefined();
    expect(valueAt(parsed, "x")).toBeUndefined();
  });

  test("rejects broken input", () => {
    expect(() => parsePlist("<plist><dict><key>a</key>")).toThrow();
    expect(() => parsePlist("<plist><wat/></plist>")).toThrow();
  });
});

describe("privacy manifests in the repository", () => {
  test("app target, BloomFolder and BloomKeychain match the declared App Privacy answers", () => {
    expect(privacyProblems(plist(APP_MANIFEST), "app")).toEqual([]);
    expect(privacyProblems(plist(FOLDER_MANIFEST), "folder")).toEqual([]);
    expect(privacyProblems(plist(KEYCHAIN_MANIFEST), "keychain")).toEqual([]);
  });

  test("store/PRIVACY-ANSWERS.md names the same data types and reasons", () => {
    const answers = read("store/PRIVACY-ANSWERS.md");
    for (const needle of ["E-Mail-Adresse", "Andere Nutzerinhalte", "FileTimestamp", "C617.1", "3B52.1", "UserDefaults", "CA92.1", "ITSAppUsesNonExemptEncryption"]) {
      expect(answers).toContain(needle);
    }
  });
});

describe("privacyProblems", () => {
  const app = () => structuredClone(plist(APP_MANIFEST)) as { [key: string]: PlistValue };

  test("flags tracking, tracking domains and missing or extra collected data", () => {
    const manifest = app();
    manifest.NSPrivacyTracking = true;
    manifest.NSPrivacyTrackingDomains = ["example.com"];
    manifest.NSPrivacyCollectedDataTypes = [{ NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeLocation" }];
    const problems = privacyProblems(manifest, "app").join("\n");
    expect(problems).toContain("NSPrivacyTracking must be false");
    expect(problems).toContain("NSPrivacyTrackingDomains");
    expect(problems).toContain("NSPrivacyCollectedDataTypeLocation is not in store/PRIVACY-ANSWERS.md");
    expect(problems).toContain("NSPrivacyCollectedDataTypeEmailAddress is missing");
  });

  test("flags collected data that is not linked, used for tracking or has another purpose", () => {
    const manifest = app();
    manifest.NSPrivacyCollectedDataTypes = (manifest.NSPrivacyCollectedDataTypes as { [key: string]: PlistValue }[]).map((type) => ({
      ...type,
      NSPrivacyCollectedDataTypeLinked: false,
      NSPrivacyCollectedDataTypeTracking: true,
      NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAnalytics"],
    }));
    const problems = privacyProblems(manifest, "app");
    expect(problems.filter((problem) => problem.includes("linked to the user"))).toHaveLength(2);
    expect(problems.filter((problem) => problem.includes("tracking"))).toHaveLength(2);
    expect(problems.filter((problem) => problem.includes("purposes"))).toHaveLength(2);
  });

  test("flags changed, missing and undeclared required-reason APIs", () => {
    const manifest = app();
    manifest.NSPrivacyAccessedAPITypes = [
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
      { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace", NSPrivacyAccessedAPITypeReasons: ["E174.1"] },
    ];
    const problems = privacyProblems(manifest, "app").join("\n");
    expect(problems).toContain("FileTimestamp reasons are C617.1, expected 3B52.1, C617.1");
    expect(problems).toContain("NSPrivacyAccessedAPICategoryDiskSpace is not declared");
    expect(problems).toContain("NSPrivacyAccessedAPICategoryUserDefaults is missing");
  });

  test("a plugin manifest must not collect data", () => {
    const manifest = structuredClone(plist(FOLDER_MANIFEST)) as { [key: string]: PlistValue };
    manifest.NSPrivacyCollectedDataTypes = [{ NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress" }];
    expect(privacyProblems(manifest, "folder").join("\n")).toContain("is not in store/PRIVACY-ANSWERS.md");
    expect(privacyProblems(manifest, "unknown")).toEqual(['unknown privacy profile "unknown"']);
  });
});

describe("Mac availability (Designed for iPad)", () => {
  test("the Xcode project and Info.plist in the repository keep the iPad app available on the Mac", () => {
    expect(macProjectProblems(read(PBXPROJ))).toEqual([]);
    expect(macPlistProblems(plist(INFO_PLIST), false)).toEqual([]);
  });

  test("the project must target the iPad", () => {
    expect(macProjectProblems("TARGETED_DEVICE_FAMILY = 1;")[0]).toContain("lacks the iPad");
    expect(macProjectProblems('TARGETED_DEVICE_FAMILY = "1,2";\nTARGETED_DEVICE_FAMILY = 1;')).toHaveLength(1);
    expect(macProjectProblems("SDKROOT = iphoneos;")[0]).toContain("TARGETED_DEVICE_FAMILY is not set");
  });

  test("the project must not opt out of the Mac or turn into Mac Catalyst", () => {
    const base = 'TARGETED_DEVICE_FAMILY = "1,2";\nSDKROOT = iphoneos;\n';
    expect(macProjectProblems(base + "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = YES;")).toEqual([]);
    expect(macProjectProblems(base + "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;")[0]).toContain("opts the app out of Macs");
    expect(macProjectProblems(base + 'SUPPORTS_MACCATALYST = "YES";')[0]).toContain("Mac Catalyst");
    expect(macProjectProblems('TARGETED_DEVICE_FAMILY = "1,2";\nSDKROOT = macosx;')[0]).toContain("SDKROOT");
  });

  test("Info.plist must not require hardware a Mac lacks or pin device models", () => {
    expect(macPlistProblems({ UIRequiredDeviceCapabilities: ["arm64"] }, false)).toEqual([]);
    expect(macPlistProblems({ UIRequiredDeviceCapabilities: ["arm64", "telephony"] }, false)[0]).toContain('"telephony"');
    expect(macPlistProblems({ UIRequiredDeviceCapabilities: { gyroscope: true, arm64: true, nfc: false } }, false)).toHaveLength(1);
    expect(macPlistProblems({ UISupportedDevices: ["iPad8,1"] }, false)[0]).toContain("UISupportedDevices");
  });

  test("the built Info.plist must list the iPad device family", () => {
    expect(macPlistProblems({ UIDeviceFamily: [1, 2] }, true)).toEqual([]);
    expect(macPlistProblems({ UIDeviceFamily: [1] }, true)[0]).toContain("UIDeviceFamily");
    expect(macPlistProblems({}, true)[0]).toContain("UIDeviceFamily");
    expect(macPlistProblems({}, false)).toEqual([]);
  });
});

describe("pngInfo", () => {
  const png = (colorType: number, extraChunk?: string) => {
    const chunk = (type: string, length: number) => {
      const bytes = new Uint8Array(12 + length);
      new DataView(bytes.buffer).setUint32(0, length);
      bytes.set(new TextEncoder().encode(type), 4);
      return bytes;
    };
    const header = chunk("IHDR", 13);
    const view = new DataView(header.buffer);
    view.setUint32(8, 1024);
    view.setUint32(12, 512);
    header[16] = 8;
    header[17] = colorType;
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), header, ...(extraChunk ? [chunk(extraChunk, 3)] : []), chunk("IDAT", 0)];
    return Uint8Array.from(parts.flatMap((part) => [...part]));
  };

  test("reads the size and detects alpha colour types and tRNS", () => {
    expect(pngInfo(png(2))).toEqual({ width: 1024, height: 512, alpha: false });
    expect(pngInfo(png(6)).alpha).toBe(true);
    expect(pngInfo(png(4)).alpha).toBe(true);
    expect(pngInfo(png(2, "tRNS")).alpha).toBe(true);
    expect(() => pngInfo(new Uint8Array(40))).toThrow("not a PNG");
  });

  test("app icon and splash images in the repository have the sizes the App Store needs", () => {
    const icon = pngInfo(readFileSync(resolve(packageDir, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")));
    expect(icon).toEqual({ width: 1024, height: 1024, alpha: false });
    for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
      const splash = pngInfo(readFileSync(resolve(packageDir, "ios/App/App/Assets.xcassets/Splash.imageset", name)));
      expect([splash.width, splash.height]).toEqual([2732, 2732]);
    }
  });
});
