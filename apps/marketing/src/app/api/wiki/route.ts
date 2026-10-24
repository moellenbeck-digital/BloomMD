import { extractWikiResources, getWikiStatus, isWikiPageExpired, readWikiBundle } from "@bloommd/core/wiki";
import { buildKnowledgeGraph, knowledgeGraphHealth } from "@bloommd/core/wiki-search";
import { citationSummary, describePageResources, pageCitations } from "@bloommd/core/wiki-preview";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

function wikiEnabled(): boolean {
  return process.env.BLOOMMD_WIKI_PUBLIC === "1" && Boolean(process.env.BLOOMMD_WIKI_DIR);
}

export async function GET() {
  if (!wikiEnabled()) {
    return NextResponse.json({ enabled: false, message: "The public Wiki is not enabled." }, { status: 404 });
  }

  try {
    const rootDir = process.env.BLOOMMD_WIKI_DIR!;
    const sourceHashes = await readSourceHashes();
    const [bundle, status] = await Promise.all([readWikiBundle(rootDir), getWikiStatus(rootDir, sourceHashes)]);
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
      sourceVerification: Object.keys(sourceHashes).length > 0 ? "verified" : "unavailable",
      status: {
        okfVersion: status.okfVersion,
        pageCount: status.pageCount,
        sourceCount: status.sourceCount,
        staleSourceCount: status.staleSourceCount,
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
        citations: pageCitations(page, sourceHashes),
        citationSummary: citationSummary(pageCitations(page, sourceHashes)),
        tags: Array.isArray(page.frontmatter.tags) ? page.frontmatter.tags : [],
        issues: issueByPath.get(page.path) ?? [],
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ enabled: true, error: error instanceof Error ? error.message : "Unable to read Wiki bundle." }, { status: 500 });
  }
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
