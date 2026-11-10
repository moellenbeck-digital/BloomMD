import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../../../scripts/check-vite-bundle.mjs");
const made: string[] = [];

/** A `dist` with an entry chunk of 1000 bytes and, if asked, a NodeEditor chunk of 100 bytes. */
function dist(withLazy: boolean) {
  const dir = mkdtempSync(join(tmpdir(), "bundle-check-"));
  made.push(dir);
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
  writeFileSync(join(dir, "assets", "index-abc.js"), "x".repeat(1000));
  if (withLazy) writeFileSync(join(dir, "assets", "NodeEditor-abc.js"), "x".repeat(100));
  return dir;
}

function check(dir: string, ...rest: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, dir, "2000", "200", ...rest], { encoding: "utf8" });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-vite-bundle", () => {
  test("passes a build within both budgets, with and without --require-lazy", () => {
    const dir = dist(true);
    expect(check(dir).code).toBe(0);
    const required = check(dir, "--require-lazy");
    expect(required.code).toBe(0);
    expect(required.output).toContain("Lazy node editor: 100 / 200 bytes");
  });

  test("without the lazy chunk it skips the lazy check (desktop behaviour)", () => {
    expect(check(dist(false)).code).toBe(0);
  });

  test("--require-lazy fails when the lazy chunk is missing", () => {
    const result = check(dist(false), "--require-lazy");
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("--require-lazy");
  });

  test("the flag may stand anywhere and does not shift the budgets", () => {
    const dir = dist(true);
    const result = spawnSync(process.execPath, [SCRIPT, "--require-lazy", dir, "2000", "50"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("above the 50-byte release budget");
  });
});
