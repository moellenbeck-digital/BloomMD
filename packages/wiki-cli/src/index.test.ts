import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspace } from "./workspace";
import { formatFindings, formatGithub, plural } from "./report";
import { WIKI_VERSION, runWikiCli } from "./index";
import type { LintResult } from "@bloommd/core";

const CLI = new URL("./cli.ts", import.meta.url).pathname;

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "bloommd-cli-"));
  await mkdir(join(root, "notes"), { recursive: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
  await mkdir(join(root, ".obsidian"), { recursive: true });

  await writeFile(join(root, "index.md"), "# Index\n\n[[notes/one]] and [[nowhere]]\n");
  await writeFile(join(root, "notes", "one.md"), "# One\n\nBody.\n");
  await writeFile(join(root, "notes", "image.png"), "not markdown");
  // These must never be read: a linter that wanders into node_modules reports on files nobody wrote.
  await writeFile(join(root, "node_modules", "ignored.md"), "# Ignored\n\n[[also-nowhere]]\n");
  await writeFile(join(root, ".obsidian", "config.md"), "# Config\n\n[[also-nowhere]]\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs the CLI the way a user or CI would, and returns what they would see. */
async function run(
  args: string[],
  env: Record<string, string> = {},
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const workspaceCommands = new Set(["open", "lint", "check", "search", "backlinks"]);
  const effectiveArgs = workspaceCommands.has(args[0] ?? "")
    ? ["workspace", ...args]
    : args;
  const proc = Bun.spawn(["bun", "run", CLI, ...effectiveArgs], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
    ...(cwd ? { cwd } : {}),
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("reading a workspace", () => {
  test("exposes a side-effect-free library API separately from the binary entry point", () => {
    expect(WIKI_VERSION).toBe("0.4.4");
    expect(typeof runWikiCli).toBe("function");
  });

  test("finds Markdown recursively and ignores everything else", async () => {
    const workspace = await readWorkspace(root);
    expect(workspace.files.map((file) => file.path)).toEqual(["index.md", "notes/one.md"]);
  });

  test("skips node_modules and dot-directories", async () => {
    const workspace = await readWorkspace(root);
    expect(workspace.files.some((file) => file.path.includes("node_modules"))).toBe(false);
    expect(workspace.files.some((file) => file.path.includes(".obsidian"))).toBe(false);
  });

  test("accepts a single file", async () => {
    const workspace = await readWorkspace(join(root, "notes", "one.md"));
    expect(workspace.files).toHaveLength(1);
    expect(workspace.files[0]!.path).toBe("one.md");
  });

  test("refuses a non-Markdown file", async () => {
    await expect(readWorkspace(join(root, "notes", "image.png"))).rejects.toThrow(/Markdown/);
  });

  test("refuses a path that does not exist", async () => {
    await expect(readWorkspace(join(root, "nope"))).rejects.toThrow(/existiert nicht/);
  });

  test("does not follow a symlink pointing outside the workspace", async () => {
    // Otherwise `bloommd lint ./docs` can report on files from anywhere on the machine.
    const outside = await mkdtemp(join(tmpdir(), "bloommd-outside-"));
    await writeFile(join(outside, "secret.md"), "# Secret\n");
    await symlink(outside, join(root, "escape"));
    try {
      const workspace = await readWorkspace(root);
      expect(workspace.files.some((file) => file.path.includes("escape"))).toBe(false);
    } finally {
      await rm(join(root, "escape"), { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("exit codes", () => {
  test("a broken link exits 1", async () => {
    const result = await run(["lint", root]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[[nowhere]]");
  });

  test("a clean workspace exits 0", async () => {
    const result = await run(["lint", join(root, "notes")]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nichts gefunden");
  });

  test("an unknown command exits 2 and prints the usage", async () => {
    const result = await run(["nonsense"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unbekannter Befehl");
    expect(result.stderr).toContain("Befehle:");
  });

  test("an unknown option exits 2", async () => {
    expect((await run(["lint", root, "--nope"])).code).toBe(2);
  });

  test("an unknown format exits 2", async () => {
    expect((await run(["lint", root, "--format", "xml"])).code).toBe(2);
  });

  test("a missing path exits 2", async () => {
    expect((await run(["lint", join(root, "does-not-exist")])).code).toBe(2);
  });

  test("`wiki` without a subcommand explains what was meant", async () => {
    const result = await run(["wiki"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("bloommd-wiki status");
  });

  test("--strict turns warnings into a failure", async () => {
    const warningsOnly = await mkdtemp(join(tmpdir(), "bloommd-warn-"));
    await mkdir(join(warningsOnly, "a"), { recursive: true });
    await mkdir(join(warningsOnly, "b"), { recursive: true });
    await writeFile(join(warningsOnly, "start.md"), "# Start\n\n[[dup]]\n");
    await writeFile(join(warningsOnly, "a", "dup.md"), "# A\n");
    await writeFile(join(warningsOnly, "b", "dup.md"), "# B\n");
    try {
      expect((await run(["lint", warningsOnly])).code).toBe(0);
      expect((await run(["lint", warningsOnly, "--strict"])).code).toBe(1);
    } finally {
      await rm(warningsOnly, { recursive: true, force: true });
    }
  });

  test("help and version exit 0", async () => {
    expect((await run(["--help"])).code).toBe(0);
    expect((await run([])).code).toBe(0);
    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });
});

describe("desktop handoff", () => {
  test("open emits the desktop URL for a folder without launching during tests", async () => {
    const result = await run(["open", root], { BLOOMMD_OPEN_DRY_RUN: "1" });
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout) as { command: string; target: string; url: string };
    expect(body.command).toBe("open");
    expect(body.target).toBe(root);
    expect(body.url).toBe(`bloommd://open?path=${encodeURIComponent(root)}`);
  });

  test("open resolves dot against the user's current workspace directory", async () => {
    const result = await run(["open", "."], { BLOOMMD_OPEN_DRY_RUN: "1" }, root);
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout) as { command: string; target: string; url: string };
    const expectedTarget = await realpath(root);
    expect(body.command).toBe("open");
    expect(body.target).toBe(expectedTarget);
    expect(body.url).toBe(`bloommd://open?path=${encodeURIComponent(expectedTarget)}`);
  });

  test("open exposes the macOS app override for deterministic desktop QA", async () => {
    const result = await run(["open", root], {
      BLOOMMD_OPEN_DRY_RUN: "1",
      BLOOMMD_OPEN_APP: "/Applications/BloomMD.app",
    });
    expect(result.code).toBe(0);
    const body = JSON.parse(result.stdout) as { command: string; target: string; url: string; app?: string };
    expect(body.app).toBe(process.platform === "darwin" ? "/Applications/BloomMD.app" : undefined);
  });

  test("open accepts Markdown files and rejects other files", async () => {
    expect((await run(["open", join(root, "index.md")], { BLOOMMD_OPEN_DRY_RUN: "1" })).code).toBe(0);
    const rejected = await run(["open", join(root, "notes", "image.png")], { BLOOMMD_OPEN_DRY_RUN: "1" });
    expect(rejected.code).toBe(2);
    expect(rejected.stderr).toContain("Markdown-Dateien oder Ordner");
  });
});

describe("output formats", () => {
  test("json is parseable and carries the summary", async () => {
    const result = await run(["lint", root, "--format", "json"]);
    const parsed = JSON.parse(result.stdout) as LintResult;
    expect(parsed.summary.errors).toBe(1);
    expect(parsed.findings[0]!.code).toBe("broken-link");
  });

  test("github emits annotations a workflow can render", async () => {
    const result = await run(["lint", root, "--format", "github"]);
    expect(result.stdout).toMatch(/^::error file=index\.md,line=\d+::/m);
  });

  test("quiet prints only the summary", async () => {
    const result = await run(["lint", root, "--quiet"]);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stdout).toContain("Fehler");
  });

  test("check runs the round-trip inspection as well", async () => {
    const setext = await mkdtemp(join(tmpdir(), "bloommd-setext-"));
    await writeFile(join(setext, "one.md"), "Titel\n=====\n\nBody.\n");
    try {
      const lint = await run(["lint", setext, "--format", "json"]);
      const check = await run(["check", setext, "--format", "json"]);
      expect((JSON.parse(lint.stdout) as LintResult).findings).toHaveLength(0);
      expect((JSON.parse(check.stdout) as LintResult).findings[0]!.code).toBe("roundtrip-normalizes");
    } finally {
      await rm(setext, { recursive: true, force: true });
    }
  });
});

describe("search and backlinks", () => {
  test("search finds a file and prints where", async () => {
    const result = await run(["search", "Body", root]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("notes/one.md");
  });

  test("search finding nothing still exits 0", async () => {
    // Finding nothing is a valid answer to a question, not a failure.
    const result = await run(["search", "zzz-not-present", root]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 Treffer");
  });

  test("search can be restricted to a folder", async () => {
    const inside = await run(["search", "Body", root, "--in", "notes"]);
    const outside = await run(["search", "Body", root, "--in", "does-not-exist"]);
    expect(inside.stdout).toContain("notes/one.md");
    expect(outside.stdout).toContain("0 Treffer");
  });

  test("search without a term is a usage error", async () => {
    expect((await run(["search"])).code).toBe(2);
  });

  test("backlinks lists the linking file with its line", async () => {
    const result = await run(["backlinks", "notes/one.md", root]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/index\.md:\d+/);
  });

  test("backlinks emits json when asked", async () => {
    const result = await run(["backlinks", "notes/one.md", root, "--format", "json"]);
    const parsed = JSON.parse(result.stdout) as Array<{ path: string; raw: string }>;
    expect(parsed[0]!.path).toBe("index.md");
    expect(parsed[0]!.raw).toContain("[[notes/one]]");
  });
});

describe("wiki commands", () => {
  test("runs the local proposal lifecycle through the standalone Wiki CLI", async () => {
    const wiki = await mkdtemp(join(tmpdir(), "bloommd-wiki-cli-"));
    const changes = join(wiki, "changes.json");
    const proposal = join(wiki, "proposal.json");
    await writeFile(changes, JSON.stringify([{
      path: "concepts/cli.md",
      content: "---\ntype: concept\nsources: []\n---\n# CLI\n\nWorks through the product command.\n",
      reason: "test",
    }]));

    try {
      expect((await run(["init", wiki, "CLI Wiki"])).code).toBe(0);
      expect((await run(["status", wiki])).code).toBe(0);
      expect((await run(["propose", wiki, changes, proposal])).code).toBe(0);
      expect((await run(["approve", proposal, "max"])).code).toBe(0);
      const applied = await run(["apply", wiki, proposal]);
      expect(applied.code).toBe(0);
      expect(applied.stdout).toContain("Works through the product command.");
      expect(await readFile(join(wiki, "concepts", "cli.md"), "utf8")).toContain("# CLI");
    } finally {
      await rm(wiki, { recursive: true, force: true });
    }
  });
});

describe("report rendering", () => {
  const result: LintResult = {
    findings: [
      { code: "broken-link", severity: "error", path: "a.md", line: 3, message: "Verweis ohne Ziel: [[x]]", detail: null },
      { code: "duplicate-name", severity: "info", path: "b.md", line: null, message: "Doppelt", detail: "b.md, c.md" },
    ],
    summary: { errors: 1, warnings: 0, infos: 1, filesChecked: 2 },
  };

  test("groups findings under their file", () => {
    const text = formatFindings(result);
    expect(text).toContain("a.md");
    expect(text).toContain("Verweis ohne Ziel");
  });

  test("says so plainly when there is nothing to report", () => {
    const clean = formatFindings({ findings: [], summary: { errors: 0, warnings: 0, infos: 0, filesChecked: 5 } });
    expect(clean).toContain("5 Dateien");
    expect(clean).toContain("nichts gefunden");
  });

  test("escapes newlines in GitHub annotations", () => {
    const multiline: LintResult = {
      findings: [{ code: "roundtrip-unsafe", severity: "error", path: "a.md", line: 1, message: "Weg", detail: "vorher\nnachher" }],
      summary: { errors: 1, warnings: 0, infos: 0, filesChecked: 1 },
    };
    // A raw newline would end the annotation early and lose the rest of the message.
    expect(formatGithub(multiline)).not.toContain("vorher\nnachher");
    expect(formatGithub(multiline)).toContain("%0A");
  });

  test("uses the German singular for a count of one", () => {
    expect(plural(1, "Warnung", "Warnungen")).toBe("1 Warnung");
    expect(plural(2, "Warnung", "Warnungen")).toBe("2 Warnungen");
    expect(plural(0, "Warnung", "Warnungen")).toBe("0 Warnungen");
  });
});
