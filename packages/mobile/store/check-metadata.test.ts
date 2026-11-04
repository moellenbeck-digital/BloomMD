import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { characterCount, checkStoreMetadata } from "./check-metadata";

describe("store metadata", () => {
  test("counts characters, not bytes", () => {
    expect(characterCount("Ä–ß")).toBe(3);
  });

  test("all listing texts exist and fit the App Store and Google Play limits", () => {
    expect(checkStoreMetadata(import.meta.dir)).toEqual([]);
  });

  test("the support URLs point at the iPad help page, which exists in German and English", () => {
    const text = (path: string) => readFileSync(join(import.meta.dir, path), "utf8").trim();
    expect(text("ios/metadata/de-DE/support_url.txt")).toBe("https://bloommd.io/docs/ipad");
    expect(text("ios/metadata/en-US/support_url.txt")).toBe("https://bloommd.io/docs/ipad?lang=en");
    const docs = join(import.meta.dir, "../../../apps/marketing/content/docs");
    for (const file of ["ipad.md", "ipad-en.md"]) expect(existsSync(join(docs, file))).toBe(true);
  });

  test("the documents the README names exist, and the review notes carry placeholders, not credentials", () => {
    for (const file of ["REVIEW-NOTES.md", "OWNER-CHECKLIST.md", "PRIVACY-ANSWERS.md", "PRIVACY-POLICY-APP-SECTION.md"]) {
      expect(existsSync(join(import.meta.dir, file))).toBe(true);
    }
    const notes = readFileSync(join(import.meta.dir, "REVIEW-NOTES.md"), "utf8");
    expect(notes).toContain("<DEMO-ACCOUNT-EMAIL>");
    expect(notes).toContain("<DEMO-ACCOUNT-PASSWORD>");
    expect(notes).not.toMatch(/bloom_pat_[A-Za-z0-9]/);
  });

  test("the pasteable review notes fit the review fields", () => {
    const notes = readFileSync(join(import.meta.dir, "REVIEW-NOTES.md"), "utf8");
    const block = (name: string) => notes.split(`<!-- ${name}:start -->`)[1]?.split(`<!-- ${name}:end -->`)[0]?.trim() ?? "";
    // App Store Connect "Notes": 4000 bytes; the Play Console field is short, stay well below 500.
    expect(Buffer.byteLength(block("paste"))).toBeGreaterThan(0);
    expect(Buffer.byteLength(block("paste"))).toBeLessThanOrEqual(4000);
    expect(characterCount(block("paste-short"))).toBeGreaterThan(0);
    expect(characterCount(block("paste-short"))).toBeLessThanOrEqual(500);
  });
});
