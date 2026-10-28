import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashWikiContent, initWikiBundle, regenerateWikiIndex } from "@bloommd/core/wiki";
import { formatWatchLine, runWikiWatch } from "./watch";

const CLI = new URL("./cli.ts", import.meta.url).pathname;
const roots: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

/**
 * A bundle with two pages: `concepts/a.md` cites `docs/one.md` and `docs/two.md`, `concepts/b.md`
 * cites `docs/two.md` and a web source. The source folder holds the cited files.
 */
async function fixture(): Promise<{ bundle: string; sources: string; work: string }> {
  const bundle = await tempDir("bloommd-wiki-");
  const sources = await tempDir("bloommd-sources-");
  const work = await tempDir("bloommd-work-");
  await initWikiBundle(bundle, "Wiki");
  await mkdir(join(sources, "docs"));
  await writeFile(join(sources, "docs", "one.md"), "one");
  await writeFile(join(sources, "docs", "two.md"), "two");
  const cite = (resource: string, content: string) => `  - id: ${JSON.stringify(resource)}\n    resource: ${JSON.stringify(resource)}\n    contentHash: ${JSON.stringify(hashWikiContent(content))}`;
  await writeFile(join(bundle, "concepts", "a.md"), `---\ntype: concept\nsources:\n${cite("docs/one.md", "one")}\n${cite("docs/two.md", "two")}\n---\n# A\n`);
  await writeFile(join(bundle, "concepts", "b.md"), `---\ntype: concept\nsources:\n${cite("docs/two.md", "two")}\n${cite("https://example.com/x", "web")}\n---\n# B\n`);
  await regenerateWikiIndex(bundle);
  return { bundle, sources, work };
}

describe("status and lint with --sources", () => {
  test("a matching source folder is clean, a changed and a vanished source are told apart", async () => {
    const { bundle, sources } = await fixture();
    const clean = await run(["lint", bundle, "--sources", sources, "--format", "json"]);
    expect(JSON.parse(clean.stdout)).toEqual({ ok: true, issues: [] });
    expect(clean.code).toBe(0);

    await writeFile(join(sources, "docs", "one.md"), "one edited");
    await rm(join(sources, "docs", "two.md"));
    const result = await run(["status", bundle, "--sources", sources, "--format", "json"]);
    const { status } = JSON.parse(result.stdout) as { status: { staleSourceCount: number; missingSourceCount: number; missingSourceFileCount: number; unmonitoredSourceCount: number; issues: Array<{ code: string; path: string }> } };
    expect(status.staleSourceCount).toBe(1);
    expect(status.missingSourceFileCount).toBe(2);
    expect(status.missingSourceCount).toBe(0);
    expect(status.unmonitoredSourceCount).toBe(1);
    expect(status.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      "stale-source concepts/a.md",
      "missing-source concepts/a.md",
      "missing-source concepts/b.md",
    ]);
    expect(result.code).toBe(1);

    const text = await run(["status", bundle, "--sources", sources]);
    expect(text.stdout).toContain("Fehlende Quellen: 2 · Nicht überwacht (http/https): 1");
  });

  test("without --sources and without a hash file nothing is computed, as before", async () => {
    const { bundle } = await fixture();
    const result = await run(["status", bundle, "--format", "json"]);
    const { status } = JSON.parse(result.stdout) as { status: { missingSourceCount: number; missingSourceFileCount: number; issues: Array<{ code: string }> } };
    expect(status.missingSourceCount).toBe(4);
    expect(status.missingSourceFileCount).toBe(0);
    expect(new Set(status.issues.map((issue) => issue.code))).toEqual(new Set(["missing-source-hash"]));
    expect((await run(["status", bundle])).stdout).not.toContain("Fehlende Quellen");
  });

  test("the live hashes win over a hash file for the same source", async () => {
    const { bundle, sources, work } = await fixture();
    const file = join(work, "hashes.json");
    await writeFile(file, JSON.stringify({ "docs/one.md": hashWikiContent("something else"), "https://example.com/x": hashWikiContent("web") }));
    const result = await run(["lint", bundle, file, "--sources", sources, "--format", "json"]);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, issues: [] });
  });

  test("rejects a missing source folder and --sources on commands that do not read sources", async () => {
    const { bundle, work } = await fixture();
    const missing = await run(["status", bundle, "--sources", join(work, "nope")]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("Quellordner existiert nicht");
    const wrong = await run(["index", bundle, "--sources", work]);
    expect(wrong.code).toBe(2);
    expect(wrong.stderr).toContain("--sources gilt nur für status, lint, watch und mcp");
    expect((await run(["status", bundle, "--sources"])).code).toBe(2);
  });
});

describe("watch --once", () => {
  test("reports what changed since the saved state, with the affected pages only", async () => {
    const { bundle, sources, work } = await fixture();
    const state = join(work, "state.json");

    const first = await run(["watch", bundle, "--sources", sources, "--state", state, "--once", "--format", "json"]);
    expect(first.code).toBe(0);
    expect(first.stdout.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { event: "added", source: "docs/one.md", pages: ["concepts/a.md"] },
      { event: "added", source: "docs/two.md", pages: ["concepts/a.md", "concepts/b.md"] },
    ]);

    const quiet = await run(["watch", bundle, "--sources", sources, "--state", state, "--once", "--format", "json"]);
    expect(quiet.code).toBe(0);
    expect(quiet.stdout).toBe("");

    await writeFile(join(sources, "docs", "one.md"), "one edited");
    const changed = await run(["watch", bundle, "--sources", sources, "--state", state, "--once", "--format", "json"]);
    expect(changed.stdout.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { event: "changed", source: "docs/one.md", pages: ["concepts/a.md"] },
    ]);

    await rm(join(sources, "docs", "two.md"));
    const removed = await run(["watch", bundle, "--sources", sources, "--state", state, "--once"]);
    expect(removed.stdout).toBe("entfernt  docs/two.md → concepts/a.md, concepts/b.md\n");

    // The same input gives the same answer, and the state file holds no more than hash, size and mtime.
    const again = await run(["watch", bundle, "--sources", sources, "--state", state, "--once"]);
    expect(again.stdout).toBe("");
    expect(Object.keys(JSON.parse(await readFile(state, "utf8")).sources)).toEqual(["docs/one.md"]);
  });

  test("without a state file every run starts from scratch", async () => {
    const { bundle, sources } = await fixture();
    const a = await run(["watch", bundle, "--sources", sources, "--once"]);
    const b = await run(["watch", bundle, "--sources", sources, "--once"]);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toContain("neu       docs/two.md → concepts/a.md, concepts/b.md");
    // The web source is not watched: it never shows up.
    expect(a.stdout).not.toContain("example.com");
  });

  test("never rereads a file whose size and modification time did not change", async () => {
    const { bundle, sources, work } = await fixture();
    const state = join(work, "state.json");
    const file = join(sources, "docs", "one.md");
    const when = new Date("2026-01-01T00:00:00Z");
    await utimes(file, when, when);
    await run(["watch", bundle, "--sources", sources, "--state", state, "--once"]);
    await writeFile(file, "ONE"); // same size
    await utimes(file, when, when);
    expect((await run(["watch", bundle, "--sources", sources, "--state", state, "--once"])).stdout).toBe("");
  });

  test("refuses a state file inside the source folder or the bundle, and bad usage", async () => {
    const { bundle, sources, work } = await fixture();
    expect((await run(["watch", bundle, "--sources", sources, "--state", join(sources, "state.json"), "--once"])).code).toBe(2);
    expect((await run(["watch", bundle, "--sources", sources, "--state", join(bundle, "state.json"), "--once"])).code).toBe(2);
    expect((await run(["watch", bundle, "--once"])).stderr).toContain("watch braucht --sources");
    expect((await run(["watch", bundle, "--sources", sources, "--format", "github", "--once"])).code).toBe(2);
    expect((await run(["status", bundle, "--once"])).stderr).toContain("--state und --once gelten nur für watch");
    const broken = join(work, "broken.json");
    await writeFile(broken, "{}");
    const result = await run(["watch", bundle, "--sources", sources, "--state", broken, "--once"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Zustandsdatei");
  });

  test("a source outside the folder is never read", async () => {
    const { bundle, sources } = await fixture();
    const outside = await tempDir("bloommd-outside-");
    await writeFile(join(outside, "secret.md"), "secret");
    await writeFile(join(bundle, "concepts", "evil.md"), `---\ntype: concept\nsources:\n  - resource: ../${outside.split("/").pop()}/secret.md\n---\n# Evil\n`);
    const result = await run(["watch", bundle, "--sources", sources, "--once", "--format", "json"]);
    expect(result.stdout).not.toContain("secret");
    expect(result.code).toBe(0);
  });
});

describe("watch loop", () => {
  async function waitFor(predicate: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 8000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  test("merges quick successive writes into one line per source and reports the pages", async () => {
    const { bundle, sources } = await fixture();
    const lines: string[] = [];
    const stop = new AbortController();
    const done = runWikiWatch({ bundleDir: bundle, sourcesDir: sources, once: false, format: "json", debounceMs: 150, signal: stop.signal, write: (line) => lines.push(line) });

    await waitFor(() => lines.length === 2, "initial pass");
    lines.length = 0;

    for (const text of ["one v2", "one v22", "one v222", "one v2222"]) {
      await writeFile(join(sources, "docs", "one.md"), text);
      await new Promise((r) => setTimeout(r, 15));
    }
    await waitFor(() => lines.length >= 1, "change report");
    // Wait past another debounce window: a second report would mean the writes were not merged.
    await new Promise((r) => setTimeout(r, 500));
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ event: "changed", source: "docs/one.md", pages: ["concepts/a.md"] }]);

    await rm(join(sources, "docs", "two.md"));
    await waitFor(() => lines.length === 2, "removal report");
    expect(JSON.parse(lines[1]!)).toEqual({ event: "removed", source: "docs/two.md", pages: ["concepts/a.md", "concepts/b.md"] });

    stop.abort();
    expect(await done).toBe(0);
  });

  test("formats a line for text and json", () => {
    const line = { event: "changed" as const, source: "a.md", pages: ["x.md", "y.md"] };
    expect(formatWatchLine(line, "text")).toBe("geändert  a.md → x.md, y.md");
    expect(formatWatchLine({ ...line, pages: [] }, "text")).toBe("geändert  a.md → (keine Seite zitiert sie)");
    expect(JSON.parse(formatWatchLine(line, "json"))).toEqual(line);
  });
});

describe("mcp --sources", () => {
  test("knowledge_wiki_status computes live; the folder comes from the start command, not from an argument", async () => {
    const { bundle, sources } = await fixture();
    const other = await tempDir("bloommd-other-");
    await writeFile(join(sources, "docs", "one.md"), "one edited");
    const proc = Bun.spawn(["bun", "run", CLI, "mcp", bundle, "--sources", sources], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const send = (message: Record<string, unknown>) => proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    send({ id: 2, method: "tools/call", params: { name: "knowledge_wiki_status", arguments: { sourcesDir: other, sourceHashes: { "docs/one.md": hashWikiContent("one") } } } });
    proc.stdin.flush();

    const reader = proc.stdout.getReader();
    let buffer = "";
    type Answer = { result: { structuredContent: { staleSourceCount: number; sourceVerification: string } } };
    const found: { answer?: Answer } = {};
    const deadline = Date.now() + 15000;
    while (!found.answer && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      for (const line of buffer.split("\n")) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as { id?: number };
          if (message.id === 2) found.answer = message as unknown as Answer;
        } catch {
          /* partial line */
        }
      }
    }
    proc.kill();
    expect(found.answer?.result.structuredContent.staleSourceCount).toBe(1);
    expect(found.answer?.result.structuredContent.sourceVerification).toBe("live");
  });

  test("--allow-agent-approval is still accepted next to --sources", async () => {
    const { bundle, sources } = await fixture();
    const proc = Bun.spawn(["bun", "run", CLI, "mcp", bundle, "--sources", sources, "--allow-agent-approval"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
    proc.stdin.flush();
    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    proc.kill();
    const names = (JSON.parse(new TextDecoder().decode(value)) as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name);
    expect(names).toContain("knowledge_wiki_approve");
  });
});
