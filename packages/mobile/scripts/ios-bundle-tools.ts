/**
 * Helpers for `scripts/check-ios-release.sh`: the checks that need to read property lists, the Xcode
 * project and PNG headers. They run on any OS (the shell script converts binary plists to XML with
 * `plutil` first, which only exists on macOS), so the unit tests cover them without a Mac.
 *
 * Usage (from packages/mobile), the check commands print one problem per line to stderr and exit 1:
 *   bun scripts/ios-bundle-tools.ts get <plist.xml> <key.path>          print one value (arrays/dicts as JSON)
 *   bun scripts/ios-bundle-tools.ts privacy <app|folder|keychain> <PrivacyInfo.xcprivacy.xml>
 *   bun scripts/ios-bundle-tools.ts mac-project <project.pbxproj>       "Designed for iPad" on the Mac: project
 *   bun scripts/ios-bundle-tools.ts mac-plist <Info.plist.xml> [--bundle]   same: Info.plist (--bundle: built one)
 *   bun scripts/ios-bundle-tools.ts png <file.png> <width> <height> [--no-alpha]
 */
import { readFileSync } from "node:fs";

export type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue };

// ---------------------------------------------------------------------------------------------
// XML property lists

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };

interface Token {
  kind: "open" | "close" | "empty" | "text";
  name: string;
}

function tokenize(xml: string): Token[] {
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/g, "");
  const tokens: Token[] = [];
  for (const match of cleaned.matchAll(/<(\/?)([A-Za-z]+)[^>]*?(\/?)>|([^<]+)/g)) {
    if (match[4] !== undefined) {
      if (match[4].trim() !== "") tokens.push({ kind: "text", name: match[4].replace(/&(?:lt|gt|quot|apos|amp);/g, (entity) => ENTITIES[entity] ?? entity) });
    } else if (match[1]) tokens.push({ kind: "close", name: match[2] ?? "" });
    else tokens.push({ kind: match[3] ? "empty" : "open", name: match[2] ?? "" });
  }
  return tokens;
}

/** Parses an XML property list (plutil -convert xml1 output, or a hand-written one) into plain values. */
export function parsePlist(xml: string): PlistValue {
  const tokens = tokenize(xml);
  let position = 0;

  const next = (): Token => {
    const token = tokens[position++];
    if (!token) throw new Error("unexpected end of property list");
    return token;
  };
  const peek = (): Token | undefined => tokens[position];
  const expectClose = (name: string) => {
    const token = next();
    if (token.kind !== "close" || token.name !== name) throw new Error(`expected </${name}>, found ${token.kind} ${token.name}`);
  };
  const scalarText = (name: string): string => {
    let text = "";
    if (peek()?.kind === "text") text = next().name;
    expectClose(name);
    return text;
  };

  const value = (): PlistValue => {
    const token = next();
    if (token.kind === "text" || token.kind === "close") throw new Error(`unexpected ${token.kind} ${token.name}`);
    switch (token.name) {
      case "true":
      case "false":
        if (token.kind === "open") expectClose(token.name);
        return token.name === "true";
      case "string":
      case "date":
      case "data":
        return token.kind === "empty" ? "" : scalarText(token.name);
      case "integer":
      case "real":
        return Number(scalarText(token.name));
      case "array": {
        const items: PlistValue[] = [];
        if (token.kind === "empty") return items;
        while (!(peek()?.kind === "close" && peek()?.name === "array")) items.push(value());
        expectClose("array");
        return items;
      }
      case "dict": {
        const entries: { [key: string]: PlistValue } = {};
        if (token.kind === "empty") return entries;
        while (!(peek()?.kind === "close" && peek()?.name === "dict")) {
          const key = next();
          if (key.kind !== "open" || key.name !== "key") throw new Error(`expected <key>, found ${key.kind} ${key.name}`);
          entries[scalarText("key")] = value();
        }
        expectClose("dict");
        return entries;
      }
      case "plist": {
        const inner = value();
        expectClose("plist");
        return inner;
      }
      default:
        throw new Error(`unsupported property list element <${token.name}>`);
    }
  };

  return value();
}

/** Value at `a.b.0.c` (dictionary keys and array indexes), `undefined` when the path does not exist. */
export function valueAt(root: PlistValue, path: string): PlistValue | undefined {
  let current: PlistValue | undefined = root;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (current !== null && typeof current === "object") current = current[part];
    else return undefined;
  }
  return current;
}

function asStrings(value: PlistValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

// ---------------------------------------------------------------------------------------------
// Privacy manifests: expected content = store/PRIVACY-ANSWERS.md ("Apple: App Privacy", "Privacy Manifest")

const FILE_TIMESTAMP = "NSPrivacyAccessedAPICategoryFileTimestamp";
const USER_DEFAULTS = "NSPrivacyAccessedAPICategoryUserDefaults";
const APP_FUNCTIONALITY = "NSPrivacyCollectedDataTypePurposeAppFunctionality";

interface ExpectedManifest {
  /** NSPrivacyCollectedDataType -> purposes; every entry must be linked to the user and not used for tracking. */
  collected: Record<string, string[]>;
  /** Required-reason API category -> reason codes. */
  accessed: Record<string, string[]>;
}

export const PRIVACY_PROFILES: Record<string, ExpectedManifest> = {
  // App target: signed-in BloomMD cloud account sends the email address and the maps the user edits.
  app: {
    collected: {
      NSPrivacyCollectedDataTypeEmailAddress: [APP_FUNCTIONALITY],
      NSPrivacyCollectedDataTypeOtherUserContent: [APP_FUNCTIONALITY],
    },
    accessed: { [FILE_TIMESTAMP]: ["3B52.1", "C617.1"], [USER_DEFAULTS]: ["CA92.1"] },
  },
  // BloomFolder plugin: file timestamps of the picked folder and the debug test folder, folder bookmark.
  folder: { collected: {}, accessed: { [FILE_TIMESTAMP]: ["3B52.1", "C617.1"], [USER_DEFAULTS]: ["CA92.1"] } },
  // BloomKeychain plugin: first-launch flag in UserDefaults.
  keychain: { collected: {}, accessed: { [USER_DEFAULTS]: ["CA92.1"] } },
};

function sameSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

/** Differences between a privacy manifest and what the App Store privacy answers declare. */
export function privacyProblems(manifest: PlistValue, profile: string): string[] {
  const expected = PRIVACY_PROFILES[profile];
  if (!expected) return [`unknown privacy profile "${profile}"`];
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return ["privacy manifest is not a dictionary"];
  const problems: string[] = [];

  if (manifest.NSPrivacyTracking !== false) problems.push("NSPrivacyTracking must be false");
  const domains = manifest.NSPrivacyTrackingDomains;
  if (!Array.isArray(domains) || domains.length > 0) problems.push("NSPrivacyTrackingDomains must be an empty array");

  const collected = Array.isArray(manifest.NSPrivacyCollectedDataTypes) ? manifest.NSPrivacyCollectedDataTypes : null;
  if (!collected) problems.push("NSPrivacyCollectedDataTypes is missing");
  else {
    const found = new Map<string, { [key: string]: PlistValue }>();
    for (const entry of collected) {
      const type = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : {};
      found.set(String(type.NSPrivacyCollectedDataType), type);
    }
    for (const name of found.keys()) if (!(name in expected.collected)) problems.push(`collected data type ${name} is not in store/PRIVACY-ANSWERS.md`);
    for (const [name, purposes] of Object.entries(expected.collected)) {
      const type = found.get(name);
      if (!type) problems.push(`collected data type ${name} is missing`);
      else {
        if (type.NSPrivacyCollectedDataTypeLinked !== true) problems.push(`${name} must be linked to the user`);
        if (type.NSPrivacyCollectedDataTypeTracking !== false) problems.push(`${name} must not be used for tracking`);
        if (!sameSet(asStrings(type.NSPrivacyCollectedDataTypePurposes), purposes)) problems.push(`${name} purposes must be ${purposes.join(", ")}`);
      }
    }
  }

  const accessed = Array.isArray(manifest.NSPrivacyAccessedAPITypes) ? manifest.NSPrivacyAccessedAPITypes : null;
  if (!accessed) problems.push("NSPrivacyAccessedAPITypes is missing");
  else {
    const found = new Map<string, string[]>();
    for (const entry of accessed) {
      const api = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry : {};
      found.set(String(api.NSPrivacyAccessedAPIType), asStrings(api.NSPrivacyAccessedAPITypeReasons));
    }
    for (const name of found.keys()) if (!(name in expected.accessed)) problems.push(`required-reason API ${name} is not declared in store/PRIVACY-ANSWERS.md`);
    for (const [name, reasons] of Object.entries(expected.accessed)) {
      const actual = found.get(name);
      if (!actual) problems.push(`required-reason API ${name} is missing`);
      else if (!sameSet(actual, reasons)) problems.push(`${name} reasons are ${actual.join(", ") || "none"}, expected ${reasons.join(", ")}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// "Designed for iPad" on Apple-silicon Macs (store/README.md: the iPad app is offered there)

/**
 * Hardware an iPhone/iPad app can require but a Mac does not have. Declared in
 * UIRequiredDeviceCapabilities it hides the app from Macs, so none of them may be required.
 * This is our conservative list, not Apple's complete one.
 */
export const CAPABILITIES_MISSING_ON_MAC = [
  "telephony", "sms", "gps", "location-services", "magnetometer", "gyroscope", "accelerometer",
  "still-camera", "front-facing-camera", "auto-focus-camera", "video-camera", "camera-flash",
  "nfc", "healthkit", "armv7", "armv7s",
];

/** Build settings in project.pbxproj that remove the iPad app from the Mac. */
export function macProjectProblems(pbxproj: string): string[] {
  const problems: string[] = [];
  const families = [...pbxproj.matchAll(/TARGETED_DEVICE_FAMILY = "?([^";]+)"?;/g)].map((match) => match[1] ?? "");
  if (families.length === 0) problems.push("TARGETED_DEVICE_FAMILY is not set: the app would not be an iPad app");
  for (const family of families) {
    if (!family.split(",").map((part) => part.trim()).includes("2")) problems.push(`TARGETED_DEVICE_FAMILY "${family}" lacks the iPad (2); "Designed for iPad" needs it`);
  }
  if (/SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = "?NO"?;/.test(pbxproj)) problems.push("SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO opts the app out of Macs");
  if (/SUPPORTS_MACCATALYST = "?YES"?;/.test(pbxproj)) problems.push("SUPPORTS_MACCATALYST = YES builds a Mac Catalyst app, which replaces the iPad app on the Mac (not planned)");
  if (/SDKROOT = (?!iphoneos;)/.test(pbxproj)) problems.push("SDKROOT is not iphoneos");
  return problems;
}

/** Info.plist (source or built) keys that keep the app off the Mac. `bundle`: also check what Xcode filled in. */
export function macPlistProblems(plist: PlistValue, bundle: boolean): string[] {
  const problems: string[] = [];
  if (plist === null || typeof plist !== "object" || Array.isArray(plist)) return ["Info.plist is not a dictionary"];

  const required = plist.UIRequiredDeviceCapabilities;
  const capabilities = Array.isArray(required)
    ? asStrings(required)
    : required && typeof required === "object" ? Object.entries(required).filter(([, needed]) => needed === true).map(([name]) => name) : [];
  for (const capability of capabilities) {
    if (CAPABILITIES_MISSING_ON_MAC.includes(capability)) problems.push(`UIRequiredDeviceCapabilities requires "${capability}", which a Mac does not have`);
  }
  if ("UISupportedDevices" in plist) problems.push("UISupportedDevices restricts the app to listed device models and hides it from Macs");

  if (bundle) {
    const family = plist.UIDeviceFamily;
    if (!Array.isArray(family) || !family.includes(2)) problems.push("UIDeviceFamily of the built app does not include the iPad (2)");
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// PNG

/** Width, height and whether the PNG can carry transparency (alpha colour type or a tRNS chunk). */
export function pngInfo(data: Uint8Array): { width: number; height: number; alpha: boolean } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.byteLength < 33 || magic.some((byte, index) => data[index] !== byte)) throw new Error("not a PNG file");
  const colorType = data[25] ?? 0;
  let alpha = colorType === 4 || colorType === 6;
  for (let offset = 8; offset + 8 <= data.byteLength; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (type === "tRNS") alpha = true;
    if (type === "IDAT") break;
    offset += 12 + length;
  }
  return { width: view.getUint32(16), height: view.getUint32(20), alpha };
}

// ---------------------------------------------------------------------------------------------
// Command line

function report(problems: string[]): number {
  for (const problem of problems) console.error(problem);
  return problems.length > 0 ? 1 : 0;
}

function main(args: string[]): number {
  const [command, first, second, third, fourth] = args;
  switch (command) {
    case "get": {
      if (!first || !second) throw new Error("usage: get <plist.xml> <key.path>");
      const found = valueAt(parsePlist(readFileSync(first, "utf8")), second);
      if (found === undefined) return 1;
      console.log(typeof found === "object" ? JSON.stringify(found) : String(found));
      return 0;
    }
    case "privacy":
      if (!first || !second) throw new Error("usage: privacy <app|folder|keychain> <PrivacyInfo.xcprivacy.xml>");
      return report(privacyProblems(parsePlist(readFileSync(second, "utf8")), first));
    case "mac-project":
      if (!first) throw new Error("usage: mac-project <project.pbxproj>");
      return report(macProjectProblems(readFileSync(first, "utf8")));
    case "mac-plist":
      if (!first) throw new Error("usage: mac-plist <Info.plist.xml> [--bundle]");
      return report(macPlistProblems(parsePlist(readFileSync(first, "utf8")), second === "--bundle"));
    case "png": {
      if (!first || !second || !third) throw new Error("usage: png <file.png> <width> <height> [--no-alpha]");
      const info = pngInfo(readFileSync(first));
      const problems: string[] = [];
      if (info.width !== Number(second) || info.height !== Number(third)) problems.push(`${info.width}x${info.height} px, expected ${second}x${third}`);
      if (fourth === "--no-alpha" && info.alpha) problems.push("has an alpha channel");
      return report(problems);
    }
    default:
      throw new Error("usage: ios-bundle-tools.ts <get|privacy|mac-project|mac-plist|png> …");
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
