import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The two HTML files the desktop app paints before any application code runs.
 *
 * Everything here was fixed once and lost again to a branch switch, which is exactly the kind of
 * change that vanishes quietly: nothing fails, the app simply looks wrong on the next build.
 */

const mainview = readFileSync(join(import.meta.dir, "index.html"), "utf8");
const splash = readFileSync(join(import.meta.dir, "..", "splash", "index.html"), "utf8");

describe("main window shell", () => {
  test("carries the product name", () => {
    // It said "Canopy" — an earlier name — in every window title.
    expect(mainview).toContain("<title>BloomMD</title>");
    expect(mainview).not.toContain("Canopy");
  });

  test("sets the theme before the first paint", () => {
    // `useTheme` applies the class in an effect, which runs after the renderer has painted. Without
    // a blocking script the light theme flashes on every launch for anyone who prefers dark.
    expect(mainview).toContain("bloommd-theme");
    expect(mainview).toContain("classList.toggle");
    // In <head>, so it runs before the body exists.
    expect(mainview.indexOf("bloommd-theme")).toBeLessThan(mainview.indexOf("<body"));
  });

  test("treats an unknown stored value as absent", () => {
    // Checking `!stored` instead would force light for any other value while the effect picks dark
    // from the same input — reintroducing the flash in the case nobody tests.
    expect(mainview).toContain('stored === "dark" || stored === "light"');
  });

  test("survives storage it cannot read", () => {
    expect(mainview).toContain("try {");
    expect(mainview).toContain("catch");
  });
});

describe("splash", () => {
  test("takes its version from the build metadata, never from a literal", () => {
    // It said `v0.3.0` for several releases. The version is a placeholder that the build fills in.
    expect(splash).toContain("{{DISPLAY_VERSION}}");
    expect(splash).not.toMatch(/v?\d+\.\d+\.\d+/);
  });

  test("follows the system colour scheme", () => {
    // The splash is the first frame of the app. Hardcoded light meant a white flash before a dark
    // window — the worst possible opening.
    expect(splash).toContain("prefers-color-scheme: dark");
  });

  test("uses variables rather than repeating literals", () => {
    expect(splash).toContain("var(--splash-bg)");
    expect(splash).not.toMatch(/background:\s*#FAFAFA/);
  });
});
