import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Catches colours that only work in one theme.
 *
 * The failure this exists for: a button styled `bg-white text-[var(--color-ink)]`. The background is
 * a literal, the text follows the theme — so in dark mode it renders light-on-white and is
 * unreadable. It shipped, and it took a screenshot from a user to find it.
 *
 * axe did not catch it because axe only sees the state you put the page in, and that button lives
 * in the empty-workspace state which no automated run had reached.
 *
 * A lint-style test rather than a rendering test: the mistake is visible in the source, and
 * checking the source covers every state at once — including the ones nobody thought to open.
 */

const LIGHT_SURFACES = /bg-(white|\[#(?:FFF4EE|FFFFFF|FAFAFA|FCFBFA|F5F3F0|fff|ffffff|fafafa)\])/;
const THEME_TEXT = /text-\[var\(--color-ink[a-z-]*\)\]/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** Splits on `className="…"` so a background and text in *different* elements are not paired up. */
function classAttributes(source: string): Array<{ value: string; line: number }> {
  const attributes: Array<{ value: string; line: number }> = [];
  const pattern = /className="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    attributes.push({ value: match[1]!, line: source.slice(0, match.index).split("\n").length });
  }
  return attributes;
}

describe("theme-safe colours", () => {
  const files = sourceFiles(join(import.meta.dir));

  test("no element pairs a hardcoded light background with theme-aware text", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const source = readFileSync(file, "utf8");
      for (const { value, line } of classAttributes(source)) {
        if (LIGHT_SURFACES.test(value) && THEME_TEXT.test(value)) {
          offenders.push(`${file.split("/").pop()}:${line}`);
        }
      }
    }

    expect(
      offenders,
      `Heller Hintergrund fest verdrahtet, Text folgt dem Design — im Dunkelmodus unlesbar:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("the empty-workspace buttons use surface tokens", () => {
    // The exact place it went wrong, pinned so a future edit cannot quietly revert it.
    const source = readFileSync(join(import.meta.dir, "App.tsx"), "utf8");
    for (const testId of ["empty-import-file", "empty-change-folder"]) {
      const block = source.slice(source.indexOf(testId), source.indexOf(testId) + 400);
      expect(block, `${testId} darf keinen festen weißen Hintergrund haben`).not.toContain("bg-white");
      expect(block).toContain("--color-surface-raised");
    }
  });
});
