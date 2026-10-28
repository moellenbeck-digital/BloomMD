import { extractWikiResources, getWikiStatus, isWikiPageExpired, readWikiBundle } from "@bloommd/core/wiki";
import { createWikiSourceCache, readLiveWikiSources, wikiSourceCheckOf, type WikiLiveSources } from "@bloommd/core/wiki-sources";
import { buildKnowledgeGraph, knowledgeGraphHealth } from "@bloommd/core/wiki-search";
import { citationSummary, describePageResources, pageCitations } from "@bloommd/core/wiki-preview";
import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";

export const dynamic = "force-dynamic";

/**
 * Last scan of `BLOOMMD_WIKI_SOURCES_DIR`, kept between requests: a source whose size and
 * modification time did not change is not read again, so a request costs a stat per cited source
 * and a hash only for what actually changed.
 */
const sourceCache = createWikiSourceCache();

function wikiEnabled(): boolean {
  return process.env.BLOOMMD_WIKI_PUBLIC === "1" && Boolean(process.env.BLOOMMD_WIKI_DIR);
}

export async function GET() {
  if (!wikiEnabled()) {
    return NextResponse.json({ enabled: false, message: "The public Wiki is not enabled." }, { status: 404 });
  }

  try {
    const rootDir = process.env.BLOOMMD_WIKI_DIR!;
    const bundle = await readWikiBundle(rootDir);
    // `BLOOMMD_WIKI_SOURCES_DIR` is an alternative to the hash file and wins when both are set.
    const live = await readLiveSources(bundle.pages);
    const sourceHashes = live ? live.sourceHashes : await readSourceHashes();
    const status = await getWikiStatus(rootDir, sourceHashes, live ? wikiSourceCheckOf(live) : {});
    const graph = buildKnowledgeGraph(bundle);
    // Classification only — nothing is fetched or read here beyond checking that local files exist.
    const previews = await Promise.all(bundle.pages.map((page) => describePageResources(rootDir, page)));
    const issueByPath = new Map<string, string[]>();
    for (const issue of status.issues) {
      const current = issueByPath.get(issue.path) ?? [];
      current.push(issue.code);
      issueByPath.set(issue.path, current);
    }
    return NextResponse.json({
      enabled: true,
      sourceVerification: live || Object.keys(sourceHashes).length > 0 ? "verified" : "unavailable",
      sourceMode: live ? "live" : Object.keys(sourceHashes).length > 0 ? "hash-file" : "none",
      status: {
        okfVersion: status.okfVersion,
        pageCount: status.pageCount,
        sourceCount: status.sourceCount,
        staleSourceCount: status.staleSourceCount,
        missingSourceFileCount: status.missingSourceFileCount,
        unmonitoredSourceCount: status.unmonitoredSourceCount,
        pendingPageCount: status.pendingPageCount,
        expiredPageCount: status.expiredPageCount,
        statusCounts: status.statusCounts,
        trustCounts: status.trustCounts,
        issueCount: status.issues.length,
      },
      index: bundle.index,
      log: bundle.log,
      // The Knowledge Map layer: concept nodes plus edges from links, tags and cited sources.
      graph,
      graphHealth: knowledgeGraphHealth(graph),
      pages: bundle.pages.map((page, index) => ({
        path: page.path,
        title: page.title,
        type: page.type ?? "concept",
        updated: page.frontmatter.updated ?? page.frontmatter.date ?? null,
        content: page.content,
        sources: page.sources,
        // OKF v0.2 trust signals: where it came from, who signed off, whether it is still current.
        lifecycle: page.status,
        trustTier: page.trustTier,
        generated: page.generated,
        verified: page.verified,
        staleAfter: page.staleAfter,
        expired: isWikiPageExpired(page),
        resources: extractWikiResources(page.content),
        // Availability per reference, so a broken or unsafe target is visible rather than dropped.
        previews: previews[index] ?? [],
        citations: pageCitations(page, sourceHashes, live ?? undefined),
        citationSummary: citationSummary(pageCitations(page, sourceHashes, live ?? undefined)),
        tags: Array.isArray(page.frontmatter.tags) ? page.frontmatter.tags : [],
        issues: issueByPath.get(page.path) ?? [],
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ enabled: true, error: error instanceof Error ? error.message : "Unable to read Wiki bundle." }, { status: 500 });
  }
}

/** Null when no source folder is configured, or when the configured one is not a folder (logged, never fatal). */
async function readLiveSources(pages: Parameters<typeof readLiveWikiSources>[1]): Promise<WikiLiveSources | null> {
  const dir = process.env.BLOOMMD_WIKI_SOURCES_DIR;
  if (!dir) return null;
  if (!(await stat(dir).catch(() => null))?.isDirectory()) {
    console.error("[BloomMD] BLOOMMD_WIKI_SOURCES_DIR is not a directory; source verification is unavailable.");
    return null;
  }
  return readLiveWikiSources(dir, pages, sourceCache);
}

async function readSourceHashes(): Promise<Record<string, string>> {
  const path = process.env.BLOOMMD_WIKI_SOURCE_HASHES;
  if (!path) return {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}
