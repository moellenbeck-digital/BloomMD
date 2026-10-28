import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkArchitectureDocs } from "../check-architecture-docs";

const repoRoot = join(import.meta.dir, "../..");
const docPath = join(repoRoot, "docs/ARCHITECTURE.md");
const scriptPath = join(repoRoot, "scripts/check-architecture-docs.ts");
const original = readFileSync(docPath, "utf8");
const scratch = mkdtempSync(join(tmpdir(), "architecture-docs-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  expect(readFileSync(docPath, "utf8")).toBe(original);
});

/** Writes a modified copy of the doc to a temp dir; the repository files stay untouched. */
function docCopy(name: string, mutate: (doc: string) => string): string {
  const mutated = mutate(original);
  expect(mutated).not.toBe(original);
  const path = join(scratch, `${name}.md`);
  writeFileSync(path, mutated);
  return path;
}

function replaceOnce(doc: string, from: string, to: string): string {
  expect(doc).toContain(from);
  return doc.replace(from, to);
}

function problems(path: string): string[] {
  return checkArchitectureDocs({ root: repoRoot, docPath: path }).findings.map((f) => `[${f.section}] ${f.statement} — ${f.problem}`);
}

describe("architecture docs verification", () => {
  test("the real doc matches the repository", () => {
    expect(checkArchitectureDocs({ root: repoRoot }).findings).toEqual([]);
  });

  test("reports a package that is missing from the table", () => {
    const path = docCopy("missing-package", (doc) => doc.replace(/^\| `packages\/ink` \|.*\n/m, ""));
    expect(problems(path)).toEqual([expect.stringContaining("[Packages] packages/ink — Workspace @bloommd/ink fehlt")]);
  });

  test("reports a listed package that does not exist", () => {
    const path = docCopy("unknown-package", (doc) => replaceOnce(doc, "| `plugins/obsidian` |", "| `packages/not-a-package` | Ghost |\n| `plugins/obsidian` |"));
    expect(problems(path)).toContainEqual(expect.stringContaining("[Packages] packages/not-a-package — Pfad aus der Paket-Tabelle existiert nicht"));
  });

  test("reports a command whose script does not exist", () => {
    const path = docCopy("missing-script", (doc) => replaceOnce(doc, "bun run typecheck\n", "bun run typecheck\nbun run --cwd apps/app no-such-script\n"));
    expect(problems(path)).toEqual([expect.stringContaining("Skript „no-such-script“ fehlt in apps/app/package.json")]);
  });

  test("accepts bun builtins but rejects a missing --cwd package", () => {
    const path = docCopy("missing-cwd", (doc) => replaceOnce(doc, "bun audit\n", "bun audit\nbun run --cwd packages/nope build\n"));
    expect(problems(path)).toEqual([expect.stringContaining("Verzeichnis packages/nope hat keine package.json")]);
  });

  test("reports a Node major that differs from engines and .nvmrc", () => {
    const path = docCopy("node-major", (doc) => replaceOnce(doc, "# v22.x", "# v20.x"));
    expect(problems(path)).toEqual([
      expect.stringContaining("Node-Major 20 passt nicht zu engines.node"),
      expect.stringContaining("Node-Major 20 passt nicht zu .nvmrc (22)"),
    ]);
  });

  test("reports a named path that does not exist", () => {
    const path = docCopy("missing-path", (doc) => replaceOnce(doc, "`packages/ui` owns", "`packages/ui/src/gone` owns"));
    expect(problems(path)).toEqual(["[Shared UI] packages/ui/src/gone — genannter Pfad existiert nicht"]);
  });

  test("reports storage, table and ticket drift", () => {
    const path = docCopy("identifiers", (doc) => {
      let mutated = replaceOnce(doc, "`bloom_workspaces`", "`bloom_ghost_table`");
      mutated = replaceOnce(mutated, "permission, exp\n", "permission, expiresAt\n");
      mutated = replaceOnce(mutated, "VERSION_CONFLICT", "VERSION_CLASH");
      return mutated;
    });
    const found = problems(path);
    expect(found).toContainEqual(expect.stringContaining("[Postgres Cloud Storage] bloom_ghost_table — Tabelle wird in apps/app/db nicht angelegt"));
    expect(found).toContainEqual(expect.stringContaining("[Realtime Sync] ticket claim expiresAt"));
    expect(found).toContainEqual(expect.stringContaining("[Realtime Sync] VERSION_CONFLICT — Doku nennt „VERSION_CONFLICT“ nicht mehr"));
  });

  test("validates the stamp format and the commit", () => {
    const stamp = /^Verified against: .*$/m;
    const noStamp = docCopy("stamp-missing", (doc) => doc.replace(stamp, ""));
    expect(problems(noStamp)).toEqual([expect.stringContaining("Stand-Vermerk fehlt")]);

    const badFormat = docCopy("stamp-format", (doc) => doc.replace(stamp, "Verified against: yesterday"));
    expect(problems(badFormat)).toEqual([expect.stringContaining("nicht das Format")]);

    const badDate = docCopy("stamp-date", (doc) => doc.replace(stamp, "Verified against: 2026-13-45 · BloomMD 0.5.1 · c4f794f"));
    expect(problems(badDate)).toEqual([expect.stringContaining("kein gültiges ISO-Datum")]);

    const unknownSha = docCopy("stamp-sha", (doc) => doc.replace(stamp, "Verified against: 2026-10-28 · BloomMD 0.5.1 · deadbeef"));
    const result = checkArchitectureDocs({ root: repoRoot, docPath: unknownSha });
    // A shallow clone cannot resolve older commits; there the check only notes it.
    expect(result.findings.length + result.notes.length).toBe(1);
  });

  test("the CLI exits 0 on the real doc and 1 with one line per deviation", () => {
    const ok = Bun.spawnSync([process.execPath, scriptPath], { cwd: scratch });
    expect(ok.exitCode).toBe(0);

    const path = docCopy("cli", (doc) => replaceOnce(doc, "# v22.x", "# v20.x"));
    const red = Bun.spawnSync([process.execPath, scriptPath, "--doc", path], { cwd: scratch });
    const lines = red.stdout.toString().split("\n").filter((line) => line.startsWith("[Verification]"));
    expect(red.exitCode).toBe(1);
    expect(lines).toHaveLength(2);
  });
});
