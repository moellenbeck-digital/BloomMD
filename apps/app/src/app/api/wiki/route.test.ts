import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashWikiContent, initWikiBundle, regenerateWikiIndex } from "@bloommd/core/wiki";
import { GET } from "./route";

const ENV_KEYS = ["BLOOMMD_WIKI_DIR", "BLOOMMD_WIKI_PUBLIC", "BLOOMMD_WIKI_SOURCES_DIR", "BLOOMMD_WIKI_SOURCE_HASHES"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
let bundle = "";
let sources = "";

interface Citation { resource: string; drifted: boolean; unknown: boolean; sourceState?: string }
interface Body {
  sourceVerification: string;
  sourceMode: string;
  status: { staleSourceCount: number; missingSourceFileCount: number; unmonitoredSourceCount: number; issueCount: number };
  pages: Array<{ path: string; issues: string[]; citations: Citation[]; citationSummary: { changed?: number; missing?: number } }>;
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

const cite = (resource: string, content: string) => `  - id: ${JSON.stringify(`id:${resource}`)}\n    resource: ${JSON.stringify(resource)}\n    contentHash: ${JSON.stringify(hashWikiContent(content))}`;

beforeEach(async () => {
  bundle = await tempDir("bloommd-wiki-");
  sources = await tempDir("bloommd-sources-");
  await initWikiBundle(bundle, "Wiki");
  await writeFile(join(sources, "same.md"), "same");
  await writeFile(join(sources, "edited.md"), "edited now");
  await writeFile(join(bundle, "concepts", "p.md"), `---\ntype: concept\nsources:\n${cite("same.md", "same")}\n${cite("edited.md", "edited")}\n${cite("gone.md", "gone")}\n${cite("https://example.com/x", "web")}\n---\n# P\n`);
  await writeFile(join(bundle, "concepts", "q.md"), `---\ntype: concept\nsources:\n${cite("same.md", "same")}\n---\n# Q\n`);
  await regenerateWikiIndex(bundle);
  process.env.BLOOMMD_WIKI_DIR = bundle;
  process.env.BLOOMMD_WIKI_PUBLIC = "1";
  delete process.env.BLOOMMD_WIKI_SOURCES_DIR;
  delete process.env.BLOOMMD_WIKI_SOURCE_HASHES;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const read = async (): Promise<Body> => (await GET()).json() as Promise<Body>;

describe("BLOOMMD_WIKI_SOURCES_DIR", () => {
  test("shows changed and missing sources per page and citation, and leaves untouched pages alone", async () => {
    process.env.BLOOMMD_WIKI_SOURCES_DIR = sources;
    const body = await read();
    expect(body.sourceMode).toBe("live");
    expect(body.sourceVerification).toBe("verified");
    expect(body.status).toMatchObject({ staleSourceCount: 1, missingSourceFileCount: 1, unmonitoredSourceCount: 1 });

    const p = body.pages.find((page) => page.path === "concepts/p.md")!;
    expect(p.citations.map((citation) => [citation.resource, citation.sourceState])).toEqual([
      ["same.md", "ok"],
      ["edited.md", "changed"],
      ["gone.md", "missing"],
      ["https://example.com/x", "unmonitored"],
    ]);
    expect(p.citationSummary).toMatchObject({ changed: 1, missing: 1 });
    expect(p.issues).toEqual(["stale-source", "missing-source"]);

    const q = body.pages.find((page) => page.path === "concepts/q.md")!;
    expect(q.issues).toEqual([]);
    expect(q.citationSummary).toMatchObject({ changed: 0, missing: 0 });
  });

  test("picks up a change on the next request and does not reread an unchanged file", async () => {
    process.env.BLOOMMD_WIKI_SOURCES_DIR = sources;
    expect((await read()).status.staleSourceCount).toBe(1);

    // Same size and modification time: the cached hash stands, which proves the file was not read again.
    const file = join(sources, "same.md");
    const before = new Date("2026-01-01T00:00:00Z");
    await utimes(file, before, before);
    await read();
    await writeFile(file, "SAME");
    await utimes(file, before, before);
    expect((await read()).status.staleSourceCount).toBe(1);

    await writeFile(file, "same but longer");
    // `same.md` is cited by two pages, so its drift counts once per page.
    expect((await read()).status.staleSourceCount).toBe(3);

    await writeFile(join(sources, "gone.md"), "gone");
    expect((await read()).status.missingSourceFileCount).toBe(0);
  });

  test("wins over the hash file when both are set", async () => {
    const hashFile = join(await tempDir("bloommd-hashes-"), "hashes.json");
    await writeFile(hashFile, JSON.stringify({ "id:edited.md": hashWikiContent("edited"), "id:gone.md": hashWikiContent("gone") }));
    process.env.BLOOMMD_WIKI_SOURCE_HASHES = hashFile;
    process.env.BLOOMMD_WIKI_SOURCES_DIR = sources;
    const body = await read();
    expect(body.sourceMode).toBe("live");
    expect(body.status.staleSourceCount).toBe(1);
  });

  test("a configured path that is not a folder falls back to 'unavailable' instead of reporting every source missing", async () => {
    process.env.BLOOMMD_WIKI_SOURCES_DIR = join(sources, "nope");
    const body = await read();
    expect(body.sourceMode).toBe("none");
    expect(body.sourceVerification).toBe("unavailable");
    expect(body.status.missingSourceFileCount).toBe(0);
  });
});

describe("without BLOOMMD_WIKI_SOURCES_DIR", () => {
  test("the hash file works as before and no citation carries a live state", async () => {
    const hashFile = join(await tempDir("bloommd-hashes-"), "hashes.json");
    await writeFile(hashFile, JSON.stringify({ "id:edited.md": hashWikiContent("edited now") }));
    process.env.BLOOMMD_WIKI_SOURCE_HASHES = hashFile;
    const body = await read();
    expect(body.sourceMode).toBe("hash-file");
    expect(body.status.missingSourceFileCount).toBe(0);
    expect(body.pages.flatMap((page) => page.citations).every((citation) => citation.sourceState === undefined)).toBe(true);
    expect(body.pages.find((page) => page.path === "concepts/p.md")!.citations.find((citation) => citation.resource === "edited.md")!.drifted).toBe(true);
  });

  test("no configuration reports no verification, as today", async () => {
    const body = await read();
    expect(body.sourceMode).toBe("none");
    expect(body.sourceVerification).toBe("unavailable");
  });
});

test("stays off unless the public Wiki is enabled", async () => {
  delete process.env.BLOOMMD_WIKI_PUBLIC;
  process.env.BLOOMMD_WIKI_SOURCES_DIR = sources;
  expect((await GET()).status).toBe(404);
});
