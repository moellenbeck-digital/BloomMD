import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The menu is what makes macOS deliver Cmd+C / Cmd+V to the webview at all (#4), so the roles that
 * carry the clipboard must not quietly disappear. Asserting against the source keeps the check
 * meaningful without booting a window, which no headless test can do.
 */
const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "menu.ts");

describe("application menu", () => {
  test("declares the standard edit roles that carry clipboard shortcuts", async () => {
    const source = await readFile(SOURCE, "utf8");
    for (const role of ["cut", "copy", "paste", "selectAll", "undo", "redo"]) {
      expect(source).toContain(`role: "${role}"`);
    }
  });

  test("binds the platform clipboard accelerators", async () => {
    const source = await readFile(SOURCE, "utf8");
    for (const accelerator of ["cmd+x", "cmd+c", "cmd+v", "cmd+a"]) {
      expect(source).toContain(`"${accelerator}"`);
    }
  });

  test("uses a custom action only for the in-app About dialog", async () => {
    const source = await readFile(SOURCE, "utf8");
    expect(source).toContain('action: "open-about"');
    expect(source).not.toContain('role: "about"');
  });

  test("contains independent German and English native-menu labels", async () => {
    const source = await readFile(SOURCE, "utf8");
    expect(source).toContain('export type ApplicationMenuLocale = "de" | "en"');
    expect(source).toContain("de: {");
    expect(source).toContain("en: {");
    expect(source).toContain("setApplicationMenuLocale");
    expect(source).toContain("getApplicationMenu");
  });
});
