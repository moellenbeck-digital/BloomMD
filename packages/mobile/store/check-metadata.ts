/**
 * Validates the store listing texts in this folder against the App Store Connect and Google Play
 * character limits, so `fastlane deliver` / `fastlane supply` never reject an upload for length.
 *
 *   bun run --cwd packages/mobile store:check
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const STORE_LOCALES = ["de-DE", "en-US"] as const;

/** App Store Connect limits (characters) per fastlane deliver file. */
export const IOS_LIMITS: Record<string, number> = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "promotional_text.txt": 170,
  "description.txt": 4000,
  "keywords.txt": 100,
  "release_notes.txt": 4000,
  "support_url.txt": 255,
  "marketing_url.txt": 255,
  "privacy_url.txt": 255,
};

/** Google Play limits (characters) per fastlane supply file. */
export const ANDROID_LIMITS: Record<string, number> = {
  "title.txt": 30,
  "short_description.txt": 80,
  "full_description.txt": 4000,
};

export const ANDROID_CHANGELOG_LIMIT = 500;

/** Store limits count characters, not bytes: "ä" or "–" is one character. */
export function characterCount(text: string): number {
  return [...text].length;
}

function read(path: string): string {
  // Trailing newlines from editors are not part of the listing; fastlane strips them too.
  return readFileSync(path, "utf8").replace(/\s+$/, "");
}

function checkUrl(file: string, value: string, issues: string[]): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") issues.push(`${file}: URL must use https (${value})`);
  } catch {
    issues.push(`${file}: not a valid URL (${value})`);
  }
}

export function checkStoreMetadata(storeDir: string): string[] {
  const issues: string[] = [];

  for (const locale of STORE_LOCALES) {
    const dir = join(storeDir, "ios", "metadata", locale);
    let appName = "";
    for (const [file, limit] of Object.entries(IOS_LIMITS)) {
      const path = join(dir, file);
      const label = `ios/${locale}/${file}`;
      if (!existsSync(path)) {
        issues.push(`${label}: missing`);
        continue;
      }
      const value = read(path);
      if (!value) issues.push(`${label}: empty`);
      if (characterCount(value) > limit) issues.push(`${label}: ${characterCount(value)} characters, limit ${limit}`);
      if (file === "name.txt") appName = value;
      if (file.endsWith("_url.txt")) checkUrl(label, value, issues);
      if (file === "keywords.txt") {
        const keywords = value.split(",");
        if (keywords.some((keyword) => keyword !== keyword.trim())) issues.push(`${label}: no spaces around commas (they count against the 100 characters)`);
        if (keywords.some((keyword) => !keyword.trim())) issues.push(`${label}: empty keyword`);
        const lower = keywords.map((keyword) => keyword.trim().toLowerCase());
        if (new Set(lower).size !== lower.length) issues.push(`${label}: duplicate keyword`);
        if (appName && lower.includes(appName.toLowerCase())) issues.push(`${label}: repeats the app name, which Apple already indexes`);
      }
    }
  }

  for (const file of ["copyright.txt", "primary_category.txt", "secondary_category.txt"]) {
    const path = join(storeDir, "ios", "metadata", file);
    if (!existsSync(path) || !read(path)) issues.push(`ios/${file}: missing or empty`);
  }

  for (const locale of STORE_LOCALES) {
    const dir = join(storeDir, "android", "metadata", locale);
    for (const [file, limit] of Object.entries(ANDROID_LIMITS)) {
      const path = join(dir, file);
      const label = `android/${locale}/${file}`;
      if (!existsSync(path)) {
        issues.push(`${label}: missing`);
        continue;
      }
      const value = read(path);
      if (!value) issues.push(`${label}: empty`);
      if (characterCount(value) > limit) issues.push(`${label}: ${characterCount(value)} characters, limit ${limit}`);
    }
    const changelogs = join(dir, "changelogs");
    const entries = existsSync(changelogs) ? readdirSync(changelogs).filter((name) => name.endsWith(".txt")) : [];
    if (entries.length === 0) issues.push(`android/${locale}/changelogs: no <versionCode>.txt`);
    for (const entry of entries) {
      const label = `android/${locale}/changelogs/${entry}`;
      if (!/^(\d+|default)\.txt$/.test(entry)) issues.push(`${label}: name must be <versionCode>.txt or default.txt`);
      const value = read(join(changelogs, entry));
      if (characterCount(value) > ANDROID_CHANGELOG_LIMIT) issues.push(`${label}: ${characterCount(value)} characters, limit ${ANDROID_CHANGELOG_LIMIT}`);
    }
  }

  return issues;
}

/** Characters used per file, for the summary printed by the CLI. */
export function usage(storeDir: string): string[] {
  const lines: string[] = [];
  for (const [platform, limits] of [["ios", IOS_LIMITS], ["android", ANDROID_LIMITS]] as const) {
    for (const locale of STORE_LOCALES) {
      for (const [file, limit] of Object.entries(limits)) {
        const path = join(storeDir, platform, "metadata", locale, file);
        if (existsSync(path)) lines.push(`${platform}/${locale}/${file}: ${characterCount(read(path))}/${limit}`);
      }
    }
  }
  return lines;
}

if (import.meta.main) {
  const storeDir = import.meta.dir;
  for (const line of usage(storeDir)) console.log(line);
  const issues = checkStoreMetadata(storeDir);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`FAIL ${issue}`);
    process.exit(1);
  }
  console.log("Store metadata OK");
}
