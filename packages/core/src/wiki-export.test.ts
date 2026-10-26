import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportWikiBundle, type WikiExportData, type WikiExportPage } from "./wiki-export";

const NOW = new Date("2026-03-01T12:00:00Z");

let sandbox = "";
let bundle = "";
let outside = "";

const ALPHA = `---
type: concept
title: Alpha
tags: [core, demo]
status: stable
generated:
  by: agent-1
  at: "2026-01-01"
verified:
  by: alice
  at: "2026-01-02"
stale_after: "2026-02-01"
sources:
  - resource: https://example.com/doc
    id: src-1
    title: Doc
    contentHash: "sha256:aaa"
---
# Alpha

See [[Beta]], [the beta page](beta.md) and [[Missing page]].

![diagram](assets/diagram.png)
![logo](shared/logo.png)
![gone](assets/gone.png)
[external](https://example.com/x)
[script](javascript:alert(1))
[traversal](../../secret.png)
[encoded](%2e%2e/%2e%2e/secret.png)
[absolute](/etc/passwd)
[leak](leak.png)
[vector](vector.svg)
[document](notes.html)
[hidden](.hidden/x.png)
[bigfile](assets/big.pdf)
`;

const BETA = `---
type: concept
title: Beta
status: draft
---
# Beta

Back to [[Alpha]].
`;

async function writeBundle(): Promise<void> {
  await mkdir(join(bundle, "concepts/assets"), { recursive: true });
  await mkdir(join(bundle, "shared"), { recursive: true });
  await mkdir(join(bundle, "concepts/.hidden"), { recursive: true });
  await writeFile(join(bundle, "index.md"), `---\ntype: index\ntitle: Test Wiki\nokf_version: "0.2"\n---\n# Test Wiki\n\n- [Alpha](./concepts/alpha.md)\n- [Beta](./concepts/beta.md)\n`);
  await writeFile(join(bundle, "log.md"), `---\ntype: log\nokf_version: "0.2"\n---\n# Wiki log\n\n## 2026-01-01\n- created\n`);
  await writeFile(join(bundle, "concepts/alpha.md"), ALPHA);
  await writeFile(join(bundle, "concepts/beta.md"), BETA);
  await writeFile(join(bundle, "concepts/assets/diagram.png"), "png-bytes");
  await writeFile(join(bundle, "concepts/assets/big.pdf"), "x".repeat(2048));
  await writeFile(join(bundle, "shared/logo.png"), "logo-bytes");
  await writeFile(join(bundle, "concepts/vector.svg"), "<svg onload=alert(1)></svg>");
  await writeFile(join(bundle, "concepts/notes.html"), "<script>alert(1)</script>");
  await writeFile(join(bundle, "concepts/.hidden/x.png"), "hidden");
  await writeFile(join(outside, "secret.png"), "top-secret");
  await symlink(join(outside, "secret.png"), join(bundle, "concepts/leak.png"));
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(full.slice(base.length + 1));
  }
  return out.sort();
}

async function readExport(dir: string): Promise<WikiExportData> {
  return JSON.parse(await readFile(join(dir, "wiki.json"), "utf8")) as WikiExportData;
}

function pageOf(data: WikiExportData, path: string): WikiExportPage {
  const page = data.pages.find((candidate) => candidate.path === path);
  if (!page) throw new Error(`page missing from export: ${path}`);
  return page;
}

function previewFor(page: WikiExportPage, target: string) {
  const preview = page.previews.find((candidate) => candidate.reference.target === target);
  if (!preview) throw new Error(`no preview for ${target}`);
  return preview;
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "bloommd-wiki-export-"));
  bundle = join(sandbox, "bundle");
  outside = join(sandbox, "outside");
  await mkdir(outside, { recursive: true });
  await writeBundle();
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("export shape", () => {
  test("writes an OKF copy, wiki.json and index.html", async () => {
    const out = join(sandbox, "out");
    const result = await exportWikiBundle(bundle, out, { now: NOW });
    const files = await listFiles(out);

    expect(files).toEqual(expect.arrayContaining(["index.md", "log.md", "concepts/alpha.md", "concepts/beta.md", "wiki.json", "index.html"]));
    expect(result.pageCount).toBe(2);
    expect(result.files).toEqual(files);
    // Pages keep their original paths and bytes.
    for (const path of ["index.md", "log.md", "concepts/alpha.md", "concepts/beta.md"]) {
      expect(await readFile(join(out, path), "utf8")).toBe(await readFile(join(bundle, path), "utf8"));
    }
  });

  test("wiki.json carries what /api/wiki serves: trust, lifecycle, sources, resources, counts", async () => {
    const out = join(sandbox, "out");
    await exportWikiBundle(bundle, out, { now: NOW, sourceHashes: { "src-1": "sha256:bbb" } });
    const data = await readExport(out);

    expect(data.format).toBe("bloommd-wiki-export");
    expect(data.title).toBe("Test Wiki");
    expect(data.pages.map((page) => page.path)).toEqual(["concepts/alpha.md", "concepts/beta.md"]);
    expect(data.index).toContain("# Test Wiki");
    expect(data.log).toContain("## 2026-01-01");

    const alpha = pageOf(data, "concepts/alpha.md");
    expect(alpha).toMatchObject({
      title: "Alpha",
      type: "concept",
      lifecycle: "stable",
      trustTier: "verified",
      generated: { by: "agent-1", at: "2026-01-01" },
      verified: [{ by: "alice", at: "2026-01-02" }],
      staleAfter: "2026-02-01",
      expired: true,
      tags: ["core", "demo"],
    });
    expect(alpha.sources).toHaveLength(1);
    expect(alpha.citations[0]).toMatchObject({ id: "src-1", drifted: true });
    expect(alpha.citationSummary).toMatchObject({ total: 1, drifted: 1 });
    expect(alpha.resources.every((resource) => typeof resource.safe === "boolean")).toBe(true);
    expect(alpha.resources.find((resource) => resource.target === "javascript:alert(1")?.safe).toBe(false);

    const beta = pageOf(data, "concepts/beta.md");
    expect(beta).toMatchObject({ lifecycle: "draft", trustTier: "unattributed", expired: false });
    expect(beta.citationSummary.total).toBe(0);

    expect(data.sourceVerification).toBe("verified");
    expect(data.status).toMatchObject({ pageCount: 2, expiredPageCount: 1, okfVersion: "0.2" });
    expect(data.status.trustCounts).toEqual({ verified: 1, generated: 0, unattributed: 1 });
    expect(data.status.statusCounts).toEqual({ draft: 1, stable: 1, deprecated: 0 });
    expect(data.graphHealth.brokenLinks).toBeGreaterThan(0);
  });

  test("a bundle without index.md and log.md still exports", async () => {
    await rm(join(bundle, "index.md"));
    await rm(join(bundle, "log.md"));
    const out = join(sandbox, "out");
    await exportWikiBundle(bundle, out, { now: NOW });
    const data = await readExport(out);
    expect(data.index).toBeNull();
    expect(data.log).toBeNull();
    expect(await listFiles(out)).not.toContain("index.md");
  });

  test("is deterministic: two runs are byte-identical and carry no timestamp", async () => {
    const first = join(sandbox, "run-1");
    const second = join(sandbox, "run-2");
    await exportWikiBundle(bundle, first, { now: NOW });
    await exportWikiBundle(bundle, second, { now: NOW });

    const files = await listFiles(first);
    expect(await listFiles(second)).toEqual(files);
    for (const file of files) {
      expect((await readFile(join(second, file))).equals(await readFile(join(first, file)))).toBe(true);
    }
    const json = await readFile(join(first, "wiki.json"), "utf8");
    expect(json).not.toMatch(/exportedAt|generatedAt|"timestamp"/);
  });
});

describe("output directory", () => {
  test("is created when missing and accepted when empty", async () => {
    const missing = join(sandbox, "a/b/c");
    await exportWikiBundle(bundle, missing, { now: NOW });
    expect(await listFiles(missing)).toContain("wiki.json");

    const empty = join(sandbox, "empty");
    await mkdir(empty);
    await exportWikiBundle(bundle, empty, { now: NOW });
    expect(await listFiles(empty)).toContain("index.html");
  });

  test("must not be inside the bundle, and nothing is written", async () => {
    const inside = join(bundle, "public");
    await expect(exportWikiBundle(bundle, inside, { now: NOW })).rejects.toThrow(/inside the bundle/);
    await expect(stat(inside)).rejects.toThrow();
    await expect(exportWikiBundle(bundle, bundle, { now: NOW, overwrite: true })).rejects.toThrow(/inside the bundle/);
  });

  test("must not contain the bundle", async () => {
    await expect(exportWikiBundle(bundle, sandbox, { now: NOW, overwrite: true })).rejects.toThrow(/contain the bundle/);
    expect(await readFile(join(bundle, "concepts/alpha.md"), "utf8")).toBe(ALPHA);
  });

  test("a symlink into the bundle does not smuggle the output inside it", async () => {
    await symlink(bundle, join(sandbox, "alias"));
    await expect(exportWikiBundle(bundle, join(sandbox, "alias/out"), { now: NOW })).rejects.toThrow(/inside the bundle/);
  });

  test("a non-empty directory is not overwritten, with or without the option", async () => {
    const out = join(sandbox, "precious");
    await mkdir(out);
    await writeFile(join(out, "keep.txt"), "mine");

    await expect(exportWikiBundle(bundle, out, { now: NOW })).rejects.toThrow(/not empty/);
    // The option only replaces a previous export; it is not a license to wipe a folder.
    await expect(exportWikiBundle(bundle, out, { now: NOW, overwrite: true })).rejects.toThrow(/Refusing to overwrite/);
    expect(await listFiles(out)).toEqual(["keep.txt"]);
  });

  test("overwrite replaces a previous export, drops its stale files and leaves foreign files alone", async () => {
    const out = join(sandbox, "site");
    await exportWikiBundle(bundle, out, { now: NOW });
    await writeFile(join(out, "CNAME"), "wiki.example.com");

    await rm(join(bundle, "concepts/beta.md"));
    await rm(join(bundle, "shared"), { recursive: true });
    await exportWikiBundle(bundle, out, { now: NOW, overwrite: true });

    const files = await listFiles(out);
    expect(files).toContain("CNAME");
    expect(files).not.toContain("concepts/beta.md");
    expect(files).not.toContain("shared/logo.png");
    expect((await readExport(out)).pages.map((page) => page.path)).toEqual(["concepts/alpha.md"]);
  });

  test("a forged manifest cannot make overwrite delete outside the output directory", async () => {
    const out = join(sandbox, "forged");
    await mkdir(out);
    const victim = join(sandbox, "victim.txt");
    await writeFile(victim, "do not delete");
    await writeFile(join(out, "wiki.json"), JSON.stringify({ format: "bloommd-wiki-export", files: ["../victim.txt", "/etc/hostname"] }));

    await exportWikiBundle(bundle, out, { now: NOW, overwrite: true });
    expect(await readFile(victim, "utf8")).toBe("do not delete");
  });

  test("a missing bundle is an error", async () => {
    await expect(exportWikiBundle(join(sandbox, "nope"), join(sandbox, "out"))).rejects.toThrow(/not found/);
  });
});

describe("local resources", () => {
  let data: WikiExportData;
  let alpha: WikiExportPage;
  let out = "";

  beforeEach(async () => {
    out = join(sandbox, "out");
    await exportWikiBundle(bundle, out, { now: NOW, maxResourceBytes: 1024 });
    data = await readExport(out);
    alpha = pageOf(data, "concepts/alpha.md");
  });

  test("a safe file inside the bundle is copied under its original path", async () => {
    expect(previewFor(alpha, "assets/diagram.png")).toMatchObject({ availability: "available", resolvedPath: "concepts/assets/diagram.png", byteSize: 9 });
    expect(await readFile(join(out, "concepts/assets/diagram.png"), "utf8")).toBe("png-bytes");
  });

  test("a bundle-root path is accepted when the page-relative one does not exist", async () => {
    expect(previewFor(alpha, "shared/logo.png")).toMatchObject({ availability: "available", resolvedPath: "shared/logo.png" });
    expect(await readFile(join(out, "shared/logo.png"), "utf8")).toBe("logo-bytes");
  });

  test("a missing file stays listed as missing", async () => {
    expect(previewFor(alpha, "assets/gone.png")).toMatchObject({ availability: "missing", reasonCode: "not-found" });
  });

  test.each([
    ["javascript:alert(1", "scheme"],
    ["../../secret.png", "outside-bundle"],
    ["%2e%2e/%2e%2e/secret.png", "outside-bundle"],
    ["/etc/passwd", "outside-bundle"],
  ])("%s is refused and listed (%s)", (target, reasonCode) => {
    expect(previewFor(alpha, target)).toMatchObject({ availability: "unsafe", reasonCode, resolvedPath: null });
  });

  test("a symlink that leads out of the bundle is refused and not copied", async () => {
    expect(previewFor(alpha, "leak.png")).toMatchObject({ availability: "unsafe", reasonCode: "outside-bundle" });
    const files = await listFiles(out);
    expect(files).not.toContain("concepts/leak.png");
    for (const file of files) expect(await readFile(join(out, file), "utf8")).not.toContain("top-secret");
  });

  test("types that can carry script, hidden paths and oversized files are listed but not shipped", async () => {
    expect(previewFor(alpha, "vector.svg")).toMatchObject({ availability: "unsafe", reasonCode: "type-not-allowed" });
    expect(previewFor(alpha, "notes.html")).toMatchObject({ availability: "unsafe", reasonCode: "type-not-allowed" });
    expect(previewFor(alpha, ".hidden/x.png")).toMatchObject({ availability: "unsafe", reasonCode: "hidden" });
    expect(previewFor(alpha, "assets/big.pdf")).toMatchObject({ availability: "unsafe", reasonCode: "too-large" });
    const files = await listFiles(out);
    for (const refused of ["concepts/vector.svg", "concepts/notes.html", "concepts/.hidden/x.png", "concepts/assets/big.pdf"]) {
      expect(files).not.toContain(refused);
    }
  });

  test("an external address is classified, never fetched or copied", () => {
    expect(previewFor(alpha, "https://example.com/x")).toMatchObject({ availability: "needs-consent", reasonCode: "external", resolvedPath: null });
  });

  test("wiki links resolve to pages; unresolved ones stay visible as missing", () => {
    expect(previewFor(alpha, "Beta")).toMatchObject({ availability: "available", resolvedPath: "concepts/beta.md" });
    expect(previewFor(alpha, "beta.md")).toMatchObject({ availability: "available", resolvedPath: "concepts/beta.md" });
    expect(previewFor(alpha, "Missing page")).toMatchObject({ availability: "missing", reasonCode: "page-not-found" });
  });

  test("the result counts what could not be shipped", async () => {
    const result = await exportWikiBundle(bundle, join(sandbox, "again"), { now: NOW, maxResourceBytes: 1024 });
    expect(result.resourceCount).toBe(2);
    expect(result.unavailableCount).toBeGreaterThan(8);
  });

  test("a resource may not take the place of wiki.json or index.html", async () => {
    await writeFile(join(bundle, "wiki.json"), "{}");
    await writeFile(join(bundle, "notes.md"), `---\ntype: concept\n---\n[data](wiki.json)\n`);
    const reserved = join(sandbox, "reserved");
    await exportWikiBundle(bundle, reserved, { now: NOW });
    const notes = pageOf(await readExport(reserved), "notes.md");
    expect(previewFor(notes, "wiki.json")).toMatchObject({ availability: "unsafe", reasonCode: "reserved-name" });
    expect((await readExport(reserved)).format).toBe("bloommd-wiki-export");
  });
});

describe("index.html", () => {
  test("embeds the same wiki.json, survives hostile page content and declares no external loads", async () => {
    await writeFile(join(bundle, "concepts/evil.md"), `---\ntype: concept\ntitle: "</script><script>alert(1)</script>"\n---\n</script><!-- <script>alert(2)</script>\n`);
    const out = join(sandbox, "out");
    await exportWikiBundle(bundle, out, { now: NOW });
    const html = await readFile(join(out, "index.html"), "utf8");
    const json = await readFile(join(out, "wiki.json"), "utf8");

    // Exactly the data block and the app script close; the hostile content never ends either early.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const embedded = /<script id="wiki-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(JSON.parse(embedded)).toEqual(JSON.parse(json));
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toMatch(/connect-src 'self'/);
    // The document itself — everything but the wiki's own data — names no other host and loads nothing.
    const shell = html.replace(/<script id="wiki-data"[\s\S]*?<\/script>/, "");
    // Asserted as booleans: a failed `toMatch` would print the whole document.
    expect(/<link\b|<script[^>]+\bsrc=|@import|(?<![A-Za-z])url\(|<iframe|<form|<img\b/i.test(shell)).toBe(false);
    expect(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(shell)).toBe(false);
  });
});
