import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dir, "..");
// The web adapter is the one place of the shared UI that may speak HTTP.
const ALLOWED = new Set([["platform", "web-adapter.ts"].join(sep)]);
const FORBIDDEN: Array<[string, RegExp]> = [
  ["global fetch", /(^|[^.\w])fetch\s*\(/],
  ["/api URL", /["'`]\/api\//],
  ["process.env", /process\.env/],
  ["import.meta.env", /import\.meta\.env/],
];

/** Comments may talk about `fetch(` and `/api/`; only code counts. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "vite-env.d.ts" ? [path] : [];
  });
}

describe("shared UI keeps host access behind the platform adapter", () => {
  test("@t79 only the web adapter calls fetch or names an /api URL; nothing reads the environment", () => {
    const offenders = sources(SRC).flatMap((path) => {
      const file = relative(SRC, path);
      if (ALLOWED.has(file)) return [];
      const text = withoutComments(readFileSync(path, "utf8"));
      return FORBIDDEN.filter(([, pattern]) => pattern.test(text)).map(([label]) => `${file}: ${label}`);
    });
    expect(offenders).toEqual([]);
  });
});
