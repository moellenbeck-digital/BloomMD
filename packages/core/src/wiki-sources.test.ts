import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callWikiAgentTool } from "./wiki-agent";
import { getWikiStatus, hashWikiBytes, hashWikiContent, initWikiBundle, lintWikiBundle, parseWikiPage, readWikiBundle, regenerateWikiIndex } from "./wiki";
import { citationSummary, pageCitations } from "./wiki-preview";
import {
  affectedWikiPages,
  buildWikiSourcePageIndex,
  collectWikiSourceResources,
  compareWikiSources,
  createWikiSourceCache,
  liveWikiSourcesFrom,
  parseWikiSourceSnapshot,
  readLiveWikiSources,
  scanWikiSources,
  serializeWikiSourceSnapshot,
  wikiSourceCheckOf,
} from "./wiki-sources";

const roots: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const page = (path: string, resources: string[]) =>
  parseWikiPage(path, `---\ntype: concept\nsources:\n${resources.map((r) => `  - id: ${JSON.stringify(r)}\n    resource: ${JSON.stringify(r)}\n    contentHash: ${JSON.stringify(hashWikiContent(r))}`).join("\n")}\n---\n# ${path}\n`);

describe("source hashes", () => {
  test("equal what contentHash records for text, and use raw bytes for binary files", async () => {
    const dir = await tempDir("bloommd-src-");
    const text = "Grüße — ünïcode\r\nzweite Zeile\n";
    const binary = Uint8Array.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x01]);
    await writeFile(join(dir, "note.md"), text, "utf8");
    await writeFile(join(dir, "blob.bin"), binary);

    const snapshot = await scanWikiSources(dir, ["note.md", "blob.bin"]);
    expect(snapshot.sources["note.md"]?.hash).toBe(hashWikiContent(text));
    expect(snapshot.sources["blob.bin"]?.hash).toBe(hashWikiBytes(binary));
    // Decoding invalid UTF-8 would alter the bytes, so the string hash must differ from the byte hash.
    expect(hashWikiContent(Buffer.from(binary).toString("utf8"))).not.toBe(hashWikiBytes(binary));
  });

  test("a source below a subfolder is found, a vanished one is missing", async () => {
    const dir = await tempDir("bloommd-src-");
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "docs", "a.md"), "a");
    const snapshot = await scanWikiSources(dir, ["docs/a.md", "docs/gone.md", "nope/none.md"]);
    expect(snapshot.sources["docs/a.md"]?.state).toBe("present");
    expect(snapshot.sources["docs/gone.md"]).toEqual({ state: "missing" });
    expect(snapshot.sources["nope/none.md"]).toEqual({ state: "missing" });
  });

  test("http(s) sources are not watched and are not an error", async () => {
    const dir = await tempDir("bloommd-src-");
    const snapshot = await scanWikiSources(dir, ["https://example.com/a", "HTTP://example.com/b"]);
    expect(snapshot.sources["https://example.com/a"]).toEqual({ state: "unmonitored" });
    expect(snapshot.sources["HTTP://example.com/b"]).toEqual({ state: "unmonitored" });
  });

  test("refuses traversal, absolute paths, other schemes and symlinks leading out of the folder", async () => {
    const outside = await tempDir("bloommd-outside-");
    await writeFile(join(outside, "secret.md"), "secret");
    const dir = await tempDir("bloommd-src-");
    await symlink(outside, join(dir, "link"));
    await symlink(join(outside, "secret.md"), join(dir, "file-link.md"));

    const resources = ["../secret.md", "a/../../secret.md", join(outside, "secret.md"), "file:///etc/passwd", "arxiv:1234", "link/secret.md", "file-link.md", "."];
    const snapshot = await scanWikiSources(dir, resources);
    for (const resource of resources) expect(snapshot.sources[resource]).toEqual({ state: "unsafe" });
    expect(JSON.stringify(snapshot)).not.toContain(hashWikiContent("secret"));
  });

  test("keeps the previous hash for a file with the same size and modification time", async () => {
    const dir = await tempDir("bloommd-src-");
    const file = join(dir, "a.md");
    await writeFile(file, "one");
    const when = new Date("2026-01-01T00:00:00Z");
    await utimes(file, when, when);
    const first = await scanWikiSources(dir, ["a.md"]);

    // Same size, same mtime, different bytes: only a skipped read can return the old hash.
    await writeFile(file, "two");
    await utimes(file, when, when);
    const cached = await scanWikiSources(dir, ["a.md"], first);
    expect(cached.sources["a.md"]?.hash).toBe(hashWikiContent("one"));

    // A different modification time forces a read again.
    await utimes(file, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));
    expect((await scanWikiSources(dir, ["a.md"], first)).sources["a.md"]?.hash).toBe(hashWikiContent("two"));
  });
});

describe("incremental comparison", () => {
  test("lists changed, added, removed and unchanged sources in stable order", async () => {
    const dir = await tempDir("bloommd-src-");
    for (const name of ["d.md", "c.md", "b.md", "a.md"]) await writeFile(join(dir, name), name);
    const before = await scanWikiSources(dir, ["d.md", "c.md", "b.md", "a.md"]);

    await writeFile(join(dir, "b.md"), "b changed");
    await rm(join(dir, "c.md"));
    await writeFile(join(dir, "e.md"), "new");
    const after = await scanWikiSources(dir, ["e.md", "d.md", "c.md", "b.md", "a.md"], before);

    const diff = compareWikiSources(before, after);
    expect(diff).toEqual({ changed: ["b.md"], added: ["e.md"], removed: ["c.md"], unchanged: ["a.md", "d.md"] });
    // The same input always yields the same output, and the result carries no timestamps.
    expect(compareWikiSources(before, after)).toEqual(diff);
    expect(JSON.stringify(diff)).not.toMatch(/mtime|\d{4}-\d{2}-\d{2}T/);
  });

  test("without a previous snapshot every present source is new; unmonitored ones never appear", async () => {
    const dir = await tempDir("bloommd-src-");
    await writeFile(join(dir, "a.md"), "a");
    const now = await scanWikiSources(dir, ["a.md", "https://example.com/x"]);
    expect(compareWikiSources(null, now)).toEqual({ changed: [], added: ["a.md"], removed: [], unchanged: [] });
  });

  test("a source that no page cites any more counts as removed", () => {
    const entry = { state: "present" as const, hash: "sha256:x", size: 1, mtimeMs: 1 };
    const diff = compareWikiSources({ version: 1, sources: { "gone.md": entry } }, { version: 1, sources: {} });
    expect(diff.removed).toEqual(["gone.md"]);
  });

  test("affects only pages that cite a changed source", () => {
    const pages = [page("c.md", ["shared.md", "only-c.md"]), page("a.md", ["shared.md"]), page("b.md", ["untouched.md"])];
    expect([...buildWikiSourcePageIndex(pages).entries()]).toEqual([
      ["only-c.md", ["c.md"]],
      ["shared.md", ["a.md", "c.md"]],
      ["untouched.md", ["b.md"]],
    ]);
    const impact = affectedWikiPages(pages, { changed: ["shared.md"], added: [], removed: ["only-c.md"], unchanged: ["untouched.md"] });
    expect(impact.pages).toEqual(["a.md", "c.md"]);
    expect(impact.sources).toEqual([
      { resource: "only-c.md", change: "removed", pages: ["c.md"] },
      { resource: "shared.md", change: "changed", pages: ["a.md", "c.md"] },
    ]);
    expect(collectWikiSourceResources(pages)).toEqual(["only-c.md", "shared.md", "untouched.md"]);
  });

  test("a snapshot survives the state file round trip and rejects foreign content", async () => {
    const dir = await tempDir("bloommd-src-");
    await writeFile(join(dir, "a.md"), "a");
    const snapshot = await scanWikiSources(dir, ["a.md", "gone.md", "https://example.com"]);
    const text = serializeWikiSourceSnapshot(snapshot);
    expect(parseWikiSourceSnapshot(text)).toEqual({ version: 1, sources: { "a.md": snapshot.sources["a.md"]! } });
    expect(serializeWikiSourceSnapshot(snapshot)).toBe(text);
    expect(() => parseWikiSourceSnapshot("not json")).toThrow(/Zustandsdatei/);
    expect(() => parseWikiSourceSnapshot('{"version":2,"sources":{}}')).toThrow(/Zustandsdatei/);
    expect(() => parseWikiSourceSnapshot('{"version":1,"sources":{"a":{"state":"present"}}}')).toThrow(/Zustandsdatei/);
  });
});

describe("missing-source", () => {
  async function bundleCiting(resources: string[], sourceHashes: Record<string, string>): Promise<string> {
    const root = await tempDir("bloommd-wiki-");
    await initWikiBundle(root, "Wiki");
    const sources = resources.map((r) => `  - id: ${JSON.stringify(r)}\n    resource: ${JSON.stringify(r)}\n    contentHash: ${JSON.stringify(sourceHashes[r] ?? hashWikiContent("old"))}`).join("\n");
    await writeFile(join(root, "concepts/p.md"), `---\ntype: concept\nid: p\nsources:\n${sources}\n---\n# P\n`);
    await regenerateWikiIndex(root);
    return root;
  }

  test("is its own finding, distinct from missing-source-hash, and counted separately", async () => {
    const root = await bundleCiting(["gone.md", "seen.md"], { "seen.md": hashWikiContent("seen") });
    const dir = await tempDir("bloommd-src-");
    await writeFile(join(dir, "seen.md"), "seen");
    const live = await readLiveWikiSources(dir, (await readWikiBundle(root)).pages);

    const status = await getWikiStatus(root, live.sourceHashes, wikiSourceCheckOf(live));
    expect(status.issues.map((issue) => issue.code)).toEqual(["missing-source"]);
    expect(status.missingSourceFileCount).toBe(1);
    expect(status.missingSourceCount).toBe(0);
    expect(status.staleSourceCount).toBe(0);

    // Without a live check the same bundle reports "no hash" as before; nothing changes for old callers.
    const plain = await getWikiStatus(root, {});
    expect(plain.issues.map((issue) => issue.code)).toEqual(["missing-source-hash", "missing-source-hash"]);
    expect(plain.missingSourceCount).toBe(2);
    expect(plain.missingSourceFileCount).toBe(0);
    expect(plain.unmonitoredSourceCount).toBe(0);
  });

  test("a changed source is stale, an unmonitored one is counted but raises no finding", async () => {
    const root = await bundleCiting(["a.md", "https://example.com/x"], {});
    const dir = await tempDir("bloommd-src-");
    await writeFile(join(dir, "a.md"), "now");
    const live = await readLiveWikiSources(dir, (await readWikiBundle(root)).pages);
    const issues = await lintWikiBundle(root, live.sourceHashes, wikiSourceCheckOf(live));
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([["stale-source", "concepts/p.md"]]);
    expect((await getWikiStatus(root, live.sourceHashes, wikiSourceCheckOf(live))).unmonitoredSourceCount).toBe(1);
  });

  test("a vanished source without a contentHash is missing too", async () => {
    const root = await tempDir("bloommd-wiki-");
    await initWikiBundle(root, "Wiki");
    await writeFile(join(root, "concepts/p.md"), "---\ntype: concept\nsources:\n  - resource: plain.md\n---\n# P\n");
    await regenerateWikiIndex(root);
    const dir = await tempDir("bloommd-src-");
    const live = await readLiveWikiSources(dir, (await readWikiBundle(root)).pages);
    expect((await lintWikiBundle(root, live.sourceHashes, wikiSourceCheckOf(live))).map((issue) => issue.code)).toEqual(["missing-source"]);
  });
});

describe("live consumers", () => {
  test("citations show 'changed' and 'missing' per source, and the summary counts them", async () => {
    const dir = await tempDir("bloommd-src-");
    await writeFile(join(dir, "same.md"), "same");
    await writeFile(join(dir, "edited.md"), "edited now");
    const cited = parseWikiPage("p.md", `---\ntype: concept\nsources:\n  - resource: same.md\n    contentHash: ${hashWikiContent("same")}\n  - resource: edited.md\n    contentHash: ${hashWikiContent("edited")}\n  - resource: gone.md\n    contentHash: ${hashWikiContent("gone")}\n  - resource: https://example.com\n    contentHash: ${hashWikiContent("web")}\n---\n# P\n`);
    const live = await readLiveWikiSources(dir, [cited]);
    const citations = pageCitations(cited, {}, live);
    expect(citations.map((citation) => citation.sourceState)).toEqual(["ok", "changed", "missing", "unmonitored"]);
    expect(citations.map((citation) => citation.drifted)).toEqual([false, true, false, false]);
    expect(citationSummary(citations)).toMatchObject({ changed: 1, missing: 1 });
    // Without a live check the shape stays what it was.
    expect(Object.keys(citationSummary(pageCitations(cited)))).toEqual(["total", "drifted", "unknown", "withoutHash"]);
  });

  test("MCP status computes live from the folder the server was started with and ignores argument hashes and folders", async () => {
    const root = await tempDir("bloommd-wiki-");
    await initWikiBundle(root, "Wiki");
    await writeFile(join(root, "concepts/p.md"), `---\ntype: concept\nsources:\n  - resource: a.md\n    contentHash: ${hashWikiContent("a")}\n---\n# P\n`);
    await regenerateWikiIndex(root);
    const dir = await tempDir("bloommd-src-");
    const other = await tempDir("bloommd-other-");
    await writeFile(join(dir, "a.md"), "a changed");
    await writeFile(join(other, "a.md"), "a");
    const options = { sourcesDir: dir, sourceCache: createWikiSourceCache() };

    // The agent tries to claim the source is unchanged and to point the server at another folder.
    const result = await callWikiAgentTool(root, "knowledge_wiki_status", { sourceHashes: { "a.md": hashWikiContent("a") }, sourcesDir: other }, options);
    const value = result.value as { staleSourceCount: number; sourceVerification: string };
    expect(value.staleSourceCount).toBe(1);
    expect(value.sourceVerification).toBe("live");
    expect(options.sourceCache.snapshot?.sources["a.md"]?.state).toBe("present");

    await rm(join(dir, "a.md"));
    const gone = (await callWikiAgentTool(root, "knowledge_wiki_status", {}, options)).value as { missingSourceFileCount: number };
    expect(gone.missingSourceFileCount).toBe(1);

    // Without the option the tool behaves as before, including the supplied hashes.
    const plain = (await callWikiAgentTool(root, "knowledge_wiki_status", { sourceHashes: { "a.md": hashWikiContent("a") } })).value as { staleSourceCount: number; sourceVerification?: string };
    expect(plain.staleSourceCount).toBe(0);
    expect(plain.sourceVerification).toBeUndefined();
  });

  test("liveWikiSourcesFrom sorts a snapshot into hashes, missing, unmonitored and unsafe", () => {
    const live = liveWikiSourcesFrom({
      version: 1,
      sources: {
        "a.md": { state: "present", hash: "sha256:a", size: 1, mtimeMs: 1 },
        "b.md": { state: "missing" },
        "https://x": { state: "unmonitored" },
        "../y": { state: "unsafe" },
      },
    });
    expect(live).toMatchObject({ sourceHashes: { "a.md": "sha256:a" }, missing: ["b.md"], unmonitored: ["https://x"], unsafe: ["../y"] });
  });
});

describe("source cache", () => {
  test("never reuses a snapshot that was read from another folder", async () => {
    const first = await tempDir("bloommd-src-");
    const second = await tempDir("bloommd-src-");
    const when = new Date("2026-01-01T00:00:00Z");
    for (const [dir, text] of [[first, "one"], [second, "two"]] as const) {
      await writeFile(join(dir, "a.md"), text);
      await utimes(join(dir, "a.md"), when, when);
    }
    const cache = createWikiSourceCache();
    const cited = [page("p.md", ["a.md"])];
    expect((await readLiveWikiSources(first, cited, cache)).sourceHashes["a.md"]).toBe(hashWikiContent("one"));
    // Same name, size and modification time in another folder: reusing the cache would report "one".
    expect((await readLiveWikiSources(second, cited, cache)).sourceHashes["a.md"]).toBe(hashWikiContent("two"));
  });
});
