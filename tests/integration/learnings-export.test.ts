/**
 * `scripts/learnings-export.sh`: the daily export of the learnings vault (#112). Runs the real CLI
 * on a throwaway vault and checks that the export appears, is replaced on the next run, and that
 * a target folder holding something else is left alone.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "..", "..");
const script = join(repository, "scripts", "learnings-export.sh");
const cli = join(repository, "packages", "wiki-cli", "src", "cli.ts");

let base = "";
let vault = "";
let out = "";

function runScript(env: Record<string, string> = {}): { code: number; stderr: string } {
  const proc = Bun.spawnSync(["sh", script], {
    env: { ...process.env, LEARNINGS_VAULT: vault, LEARNINGS_EXPORT_DIR: out, BLOOMMD_WIKI_BIN: `bun run ${cli}`, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, stderr: proc.stderr.toString() };
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "bloommd-learnings-export-"));
  vault = join(base, "learnings");
  out = join(base, "learnings-export");
  mkdirSync(join(vault, "Learnings", "coder"), { recursive: true });
  mkdirSync(join(vault, ".bloommd"));
  writeFileSync(join(vault, "Learnings", "coder", "Erstes.md"), "# Erstes\n\n## Regel\n\nErstes Learning.\n");
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("learnings export script", () => {
  test("exports the vault and replaces the export on the next run", () => {
    expect(runScript().code).toBe(0);
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("<html");
    expect(readFileSync(join(out, "wiki.json"), "utf8")).toContain("Erstes Learning.");

    writeFileSync(join(vault, "Learnings", "coder", "Zweites.md"), "# Zweites\n\n## Regel\n\nZweites Learning.\n");
    expect(runScript().code).toBe(0);
    expect(readFileSync(join(out, "wiki.json"), "utf8")).toContain("Zweites Learning.");
  });

  test("refuses a target folder that holds something else, and one inside the vault", () => {
    const foreign = join(base, "foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, "notiz.txt"), "gehört nicht zum Export");
    expect(runScript({ LEARNINGS_EXPORT_DIR: foreign }).code).not.toBe(0);
    expect(readFileSync(join(foreign, "notiz.txt"), "utf8")).toBe("gehört nicht zum Export");
    expect(runScript({ LEARNINGS_EXPORT_DIR: join(vault, "export") }).code).not.toBe(0);
  });
});
