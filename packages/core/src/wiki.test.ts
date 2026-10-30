import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendWikiLog,
  applyWikiProposal,
  approveWikiProposal,
  createWikiProposal,
  extractWikiResources,
  getWikiStatus,
  hashWikiContent,
  initWikiBundle,
  isSafeWikiResourceTarget,
  lintWikiBundle,
  regenerateWikiIndex,
  renderWikiDiff,
  isWikiPageExpired,
  readWikiBundle,
  SUPPORTED_OKF_VERSIONS,
  WIKI_BUNDLE_VERSION,
  type WikiChange,
} from "./wiki";

const roots: string[] = [];

async function makeBundle(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bloommd-wiki-"));
  roots.push(root);
  await initWikiBundle(root, "Test Wiki");
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Wiki bundle", () => {
  test("initializes and indexes an OKF-style Markdown bundle", async () => {
    const root = await makeBundle();
    const content = `---\ntype: concept\nid: parser\nokf_version: '0.1'\nsources:\n  - id: docs:parser\n    contentHash: ${hashWikiContent("source-v1")}\n---\n# Parser\n\nThe parser turns headings into nodes.\n`;
    await writeFile(join(root, "concepts/parser.md"), content, "utf8");
    await regenerateWikiIndex(root);
    await appendWikiLog(root, { message: "Added parser concept", actor: "test" });

    const issues = await lintWikiBundle(root, { "docs:parser": hashWikiContent("source-v1") });
    expect(issues).toEqual([]);
    expect(await readFile(join(root, "index.md"), "utf8")).toContain("concepts/parser.md");
    expect(await readFile(join(root, "log.md"), "utf8")).toContain("Added parser concept");
  });

  test("reports missing and stale provenance deterministically", async () => {
    const root = await makeBundle();
    await writeFile(join(root, "concepts/stale.md"), `---\ntype: concept\nid: stale\nsources:\n  - id: docs:stale\n    contentHash: sha256:old\n---\n# Stale\n`, "utf8");
    await regenerateWikiIndex(root);

    const status = await getWikiStatus(root, { "docs:stale": hashWikiContent("new") });
    expect(status.pageCount).toBe(1);
    expect(status.staleSourceCount).toBe(1);
    expect(status.missingSourceCount).toBe(0);
    expect(status.issues.some((issue) => issue.code === "stale-source")).toBe(true);
  });
});

test("classifies safe media, web and wiki references", () => {
  const resources = extractWikiResources(`
![Diagram](assets/diagram.png "Architecture")
[Documentation](https://example.com/docs)
[Recording](media/demo.mp4)
[[concepts/parser|Parser]]
<audio src="audio/intro.mp3"></audio>
  `);

  expect(resources).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "image", target: "assets/diagram.png", safe: true, alt: "Diagram" }),
    expect.objectContaining({ kind: "web", target: "https://example.com/docs", safe: true }),
    expect.objectContaining({ kind: "video", target: "media/demo.mp4", safe: true }),
    expect.objectContaining({ kind: "wiki", target: "concepts/parser", safe: true }),
    expect.objectContaining({ kind: "audio", target: "audio/intro.mp3", safe: true }),
  ]));
  expect(isSafeWikiResourceTarget("javascript:alert(1)")).toBe(false);
  expect(isSafeWikiResourceTarget("../../secret.txt")).toBe(false);
});

test("checks local media relative to the Wiki page", async () => {
  const root = await makeBundle();
  await mkdir(join(root, "concepts/assets"), { recursive: true });
  await writeFile(join(root, "concepts/assets/diagram.png"), "not a real image", "utf8");
  await writeFile(join(root, "concepts/media.md"), `---\ntype: concept\nid: media\n---\n# Media\n\n![Diagram](assets/diagram.png)\n`, "utf8");
  await writeFile(join(root, "concepts/broken.md"), `---\ntype: concept\nid: broken\n---\n# Broken\n\n![Missing](assets/missing.png)\n`, "utf8");
  await regenerateWikiIndex(root);

  const issues = await lintWikiBundle(root);
  expect(issues.some((issue) => issue.path === "concepts/media.md" && issue.code === "broken-link")).toBe(false);
  expect(issues.some((issue) => issue.path === "concepts/broken.md" && issue.code === "broken-link")).toBe(true);
});

test("does not flag safe external media as a missing local file", async () => {
  const root = await makeBundle();
  await writeFile(join(root, "concepts/external.md"), `---\ntype: concept\nid: external\n---\n# External\n\n![Diagram](https://cdn.example.com/diagram.png)\n`, "utf8");
  await regenerateWikiIndex(root);
  expect(await lintWikiBundle(root)).toEqual([]);
});

describe("Wiki proposals", () => {
  test("requires approval and applies atomically with audit output", async () => {
    const root = await makeBundle();
    const initial = `---\ntype: concept\nid: launch\n---\n# Launch\n\nInitial plan.\n`;
    await writeFile(join(root, "concepts/launch.md"), initial, "utf8");
    await regenerateWikiIndex(root);

    const changes: WikiChange[] = [{
      path: "concepts/launch.md",
      content: initial.replace("Initial plan.", "Approved plan."),
      reason: "Update the launch plan",
      sourceIds: ["docs:launch"],
    }];
    const proposal = await createWikiProposal(root, changes);
    await expect(applyWikiProposal(root, proposal)).rejects.toThrow("explicit approval");

    const approved = approveWikiProposal(proposal, "Martin");
    const diffs = await applyWikiProposal(root, approved);
    expect(renderWikiDiff(diffs)).toContain("Approved plan.");
    expect(await readFile(join(root, "concepts/launch.md"), "utf8")).toContain("Approved plan.");
    expect(await readFile(join(root, "log.md"), "utf8")).toContain("actor: Martin");
    expect(await readFile(join(root, "index.md"), "utf8")).toContain("concepts/launch.md");
  });

  test("rejects optimistic-concurrency conflicts", async () => {
    const root = await makeBundle();
    const initial = `---\ntype: concept\nid: conflict\n---\n# Conflict\n`;
    await writeFile(join(root, "concepts/conflict.md"), initial, "utf8");
    const proposal = await createWikiProposal(root, [{ path: "concepts/conflict.md", content: initial + "Proposed.\n", reason: "test" }]);
    await writeFile(join(root, "concepts/conflict.md"), initial + "Changed outside proposal.\n", "utf8");
    await expect(applyWikiProposal(root, approveWikiProposal(proposal, "test"))).rejects.toThrow("Source changed");
  });
});

describe("OKF v0.2 trust signals", () => {
  const bundleWith = async (page: string) => {
    const root = await mkdtemp(join(tmpdir(), "bloommd-okf-"));
    await initWikiBundle(root, "Trust Bundle");
    await writeFile(join(root, "concept.md"), page, "utf8");
    await regenerateWikiIndex(root);
    return root;
  };

  test("declares the current OKF version in the bundle index", async () => {
    const root = await mkdtemp(join(tmpdir(), "bloommd-okf-"));
    await initWikiBundle(root, "Versioned");
    expect(await readFile(join(root, "index.md"), "utf8")).toMatch(/okf_version: '?0\.2'?/);
    expect(WIKI_BUNDLE_VERSION).toBe("0.2");
    await rm(root, { recursive: true, force: true });
  });

  test("reads generated, verified, status and stale_after", async () => {
    const root = await bundleWith(`---
type: Concept
title: Retention
status: draft
generated:
  by: agent:distiller
  at: 2026-08-01T10:00:00Z
verified:
  - by: max
    at: 2026-08-02T09:00:00Z
stale_after: 2099-01-01
sources:
  - resource: https://example.com/report
    title: Quarterly report
---

Body.
`);
    const page = (await readWikiBundle(root)).pages[0]!;
    expect(page.type).toBe("Concept");
    expect(page.status).toBe("draft");
    expect(page.generated).toEqual({ by: "agent:distiller", at: "2026-08-01T10:00:00Z" });
    expect(page.verified).toHaveLength(1);
    expect(page.trustTier).toBe("verified");
    expect(page.sources[0]!.resource).toBe("https://example.com/report");
    expect(isWikiPageExpired(page)).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  test("derives the trust tier from generated when nothing is verified", async () => {
    const root = await bundleWith("---\ntype: Concept\ngenerated:\n  by: agent\n  at: 2026-08-01T10:00:00Z\n---\n\nBody.\n");
    expect((await readWikiBundle(root)).pages[0]!.trustTier).toBe("generated");
    await rm(root, { recursive: true, force: true });
  });

  test("treats a page without attribution as unattributed", async () => {
    const root = await bundleWith("---\ntype: Concept\n---\n\nBody.\n");
    expect((await readWikiBundle(root)).pages[0]!.trustTier).toBe("unattributed");
    await rm(root, { recursive: true, force: true });
  });

  test("reports an expired page and an unknown status without rejecting the bundle", async () => {
    const root = await bundleWith("---\ntype: Concept\nstatus: pending\nstale_after: 2020-01-01\n---\n\nBody.\n");
    const issues = await lintWikiBundle(root);
    expect(issues.some((issue) => issue.code === "expired-page")).toBe(true);
    expect(issues.some((issue) => issue.code === "invalid-status")).toBe(true);
    // Graceful degradation: an unrecognised status still resolves to stable.
    expect((await readWikiBundle(root)).pages[0]!.status).toBe("stable");
    await rm(root, { recursive: true, force: true });
  });

  test("accepts the learning status words on type learning and maps them to the OKF lifecycle", async () => {
    const lifecycle: Record<string, string> = { neu: "draft", "bestätigt": "stable", veraltet: "deprecated", ersetzt: "deprecated", "unbestätigt": "draft" };
    for (const [word, expected] of Object.entries(lifecycle)) {
      const root = await bundleWith(`---\ntype: learning\nstatus: ${word}\nstale_after: 2099-01-01\nscope: BloomMD, coder\n---\n\nBody.\n`);
      expect((await lintWikiBundle(root)).filter((issue) => issue.code !== "unindexed-page")).toEqual([]);
      expect(String((await readWikiBundle(root)).pages[0]!.status)).toBe(expected);
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a learning keeps its expired-page and rejects words that are not learning statuses", async () => {
    const expired = await bundleWith("---\ntype: learning\nstatus: neu\nstale_after: 2020-01-01\n---\n\nBody.\n");
    expect((await lintWikiBundle(expired)).map((issue) => issue.code)).toEqual(["expired-page"]);
    expect((await getWikiStatus(expired)).expiredPageCount).toBe(1);
    const foreign = await bundleWith("---\ntype: learning\nstatus: stable\n---\n\nBody.\n");
    const issues = await lintWikiBundle(foreign);
    expect(issues.map((issue) => issue.code)).toEqual(["invalid-status"]);
    expect(issues[0]!.message).toContain("neu, bestätigt, veraltet, ersetzt, unbestätigt");
    await rm(expired, { recursive: true, force: true });
    await rm(foreign, { recursive: true, force: true });
  });

  test("other page types still reject the learning status words", async () => {
    const root = await bundleWith("---\ntype: Concept\nstatus: neu\n---\n\nBody.\n");
    const issues = await lintWikiBundle(root);
    expect(issues.map((issue) => issue.code)).toEqual(["invalid-status"]);
    expect(issues[0]!.message).toBe('Unknown status "neu". OKF defines draft, stable, deprecated; the page is treated as stable.');
    await rm(root, { recursive: true, force: true });
  });

  test("the learnings example bundle in docs lints clean (apart from aging)", async () => {
    const issues = await lintWikiBundle(join(import.meta.dir, "../../../docs/learnings-beispiel"));
    expect(issues.filter((issue) => issue.code !== "expired-page")).toEqual([]);
    const bundle = await readWikiBundle(join(import.meta.dir, "../../../docs/learnings-beispiel"));
    expect(bundle.pages.map((page) => page.type)).toEqual(["learning", "learning", "learning"]);
  });

  test("keeps reading a v0.1 bundle whose sources only carry id and contentHash", async () => {
    const root = await bundleWith(`---
type: Concept
sources:
  - id: source-a
    contentHash: sha256:abc
---

Body.
`);
    const page = (await readWikiBundle(root)).pages[0]!;
    expect(page.sources[0]!.resource).toBe("source-a");
    expect(page.sources[0]!.contentHash).toBe("sha256:abc");
    expect(SUPPORTED_OKF_VERSIONS).toContain("0.1");
    await rm(root, { recursive: true, force: true });
  });

  test("does not demand a content hash for a plain OKF source", async () => {
    const root = await bundleWith("---\ntype: Concept\nsources:\n  - resource: https://example.com/a\n---\n\nBody.\n");
    const issues = await lintWikiBundle(root);
    expect(issues.some((issue) => issue.code === "missing-source-hash")).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  test("rolls status and trust up into the bundle status", async () => {
    const root = await bundleWith("---\ntype: Concept\nstatus: draft\ngenerated:\n  by: agent\n  at: 2026-08-01T10:00:00Z\n---\n\nBody.\n");
    const status = await getWikiStatus(root);
    expect(status.okfVersion).toBe(WIKI_BUNDLE_VERSION);
    expect(status.statusCounts.draft).toBe(1);
    expect(status.trustCounts.generated).toBe(1);
    await rm(root, { recursive: true, force: true });
  });
});
