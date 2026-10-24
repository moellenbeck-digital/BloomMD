/**
 * Search and the Knowledge Map over a Wiki Bundle.
 *
 * The Document Map shows the heading tree of one file. The Workspace Map shows folders and files.
 * The Knowledge Map is the third and different thing: its nodes are *concepts* — pages carrying an
 * OKF type — and its edges come from wiki links, Markdown links, tags and cited sources.
 *
 * Keeping them distinct matters. Merged into one view, the folder a page happens to live in looks
 * like a claim about meaning, and the relationships that actually carry meaning disappear into the
 * noise. They answer different questions and are therefore separate view modes.
 *
 * Everything here is derived from the bundle on read. Nothing is written back, and no index file is
 * maintained — a Wiki Bundle stays a folder of Markdown that Obsidian or git can open.
 */

import { extractLinks, isAssetTarget } from "./workspace-graph";
import type { WikiBundle, WikiPage, WikiPageStatus, WikiTrustTier } from "./wiki";

export interface WikiSearchQuery {
  /** Matched against title, path and description. Case-insensitive substring. */
  text?: string;
  tags?: string[];
  /** OKF `type`, e.g. "concept" or "decision". */
  types?: string[];
  statuses?: WikiPageStatus[];
  trustTiers?: WikiTrustTier[];
  /** Matches pages citing any of these source ids or resources. */
  sources?: string[];
  /** Only pages whose sources drifted or that have no citations at all. */
  onlyProblems?: boolean;
}

export interface WikiSearchHit {
  page: WikiPage;
  /** Which fields matched, so the UI can show why a result is in the list. */
  matchedOn: string[];
  score: number;
}

function pageTags(page: WikiPage): string[] {
  const raw = page.frontmatter.tags;
  if (Array.isArray(raw)) return raw.filter((tag): tag is string => typeof tag === "string");
  if (typeof raw === "string") return [raw];
  return [];
}

function includesFold(haystack: string | null | undefined, needle: string): boolean {
  return Boolean(haystack && haystack.toLowerCase().includes(needle));
}

/**
 * Filters and ranks bundle pages.
 *
 * Ranking is deliberately simple and explainable: a title match beats a path match beats a body
 * match. A relevance score nobody can predict is worse than an obvious one, because the reader
 * cannot tell whether something is missing or merely ranked low.
 */
export function searchWikiBundle(bundle: WikiBundle, query: WikiSearchQuery): WikiSearchHit[] {
  const text = query.text?.trim().toLowerCase() ?? "";
  const hits: WikiSearchHit[] = [];

  for (const page of bundle.pages) {
    const matchedOn: string[] = [];
    let score = 0;

    if (text) {
      if (includesFold(page.title, text)) {
        matchedOn.push("title");
        score += 100;
      }
      if (includesFold(page.path, text)) {
        matchedOn.push("path");
        score += 40;
      }
      if (includesFold(page.description, text)) {
        matchedOn.push("description");
        score += 30;
      }
      if (includesFold(page.content, text)) {
        matchedOn.push("content");
        score += 10;
      }
      if (matchedOn.length === 0) continue;
    }

    const tags = pageTags(page);
    if (query.tags?.length) {
      const wanted = query.tags.map((tag) => tag.toLowerCase());
      if (!tags.some((tag) => wanted.includes(tag.toLowerCase()))) continue;
      matchedOn.push("tags");
      score += 50;
    }

    if (query.types?.length) {
      if (!page.type || !query.types.some((type) => type.toLowerCase() === page.type!.toLowerCase())) continue;
      matchedOn.push("type");
      score += 20;
    }

    if (query.statuses?.length && !query.statuses.includes(page.status)) continue;
    if (query.trustTiers?.length && !query.trustTiers.includes(page.trustTier)) continue;

    if (query.sources?.length) {
      const wanted = query.sources.map((source) => source.toLowerCase());
      const cited = page.sources.some(
        (source) => wanted.includes(source.id.toLowerCase()) || wanted.includes(source.resource.toLowerCase()),
      );
      if (!cited) continue;
      matchedOn.push("source");
      score += 60;
    }

    if (query.onlyProblems) {
      const problem = page.sources.length === 0 || page.trustTier === "unattributed";
      if (!problem) continue;
      matchedOn.push("problem");
    }

    hits.push({ page, matchedOn, score });
  }

  // Stable ordering: score, then path, so repeated searches do not reshuffle equal results.
  return hits.sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));
}

export type KnowledgeNodeKind = "concept" | "page";

export interface KnowledgeNode {
  id: string;
  path: string;
  title: string;
  kind: KnowledgeNodeKind;
  type: string | null;
  status: WikiPageStatus;
  trustTier: WikiTrustTier;
  tags: string[];
  citationCount: number;
  /** True when the page has no sources at all, which the map shows rather than hides. */
  missingProvenance: boolean;
}

export type KnowledgeEdgeKind = "link" | "tag" | "source";

export interface KnowledgeEdge {
  id: string;
  kind: KnowledgeEdgeKind;
  source: string;
  /** Null for a link whose target does not exist in the bundle. */
  target: string | null;
  label: string;
  /** Set for links that could not be resolved, so the map can show them as broken. */
  broken: boolean;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

function pageNodeId(path: string): string {
  return `wiki:${path}`;
}

function pageNameKey(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.md$/i, "").toLowerCase();
}

/**
 * Builds the concept graph.
 *
 * Link resolution matches the workspace graph's rules — bare name workspace-wide, written path
 * relative — because a vault should not behave differently depending on which map is open.
 *
 * Broken links become edges with no target instead of being dropped. A wiki whose dead references
 * are invisible looks healthier than it is, and the whole reason to have provenance is to be able
 * to see where it has failed.
 */
export function buildKnowledgeGraph(bundle: WikiBundle): KnowledgeGraph {
  const nodes: KnowledgeNode[] = [];
  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();

  for (const page of bundle.pages) {
    const id = pageNodeId(page.path);
    nodes.push({
      id,
      path: page.path,
      title: page.title,
      // A page carrying an OKF type is a concept; one without is just a page.
      kind: page.type ? "concept" : "page",
      type: page.type,
      status: page.status,
      trustTier: page.trustTier,
      tags: pageTags(page),
      citationCount: page.sources.length,
      missingProvenance: page.sources.length === 0,
    });
    byPath.set(page.path, id);
    const key = pageNameKey(page.path);
    const bucket = byName.get(key);
    if (bucket) bucket.push(page.path);
    else byName.set(key, [page.path]);
  }

  const edges: KnowledgeEdge[] = [];
  const seen = new Set<string>();

  const addEdge = (edge: KnowledgeEdge) => {
    if (seen.has(edge.id)) return;
    seen.add(edge.id);
    edges.push(edge);
  };

  for (const page of bundle.pages) {
    const sourceId = pageNodeId(page.path);

    for (const link of extractLinks(page.content)) {
      // Images and attachments are not pages. Counting a present image as a broken page link would
      // report a problem that does not exist; media belongs to the preview layer.
      if (isAssetTarget(link.target)) continue;
      const cleaned = link.target.trim().replace(/^\.\//, "");
      if (!cleaned) continue;
      const withExtension = /\.md$/i.test(cleaned) ? cleaned : `${cleaned}.md`;

      const folder = page.path.includes("/") ? page.path.slice(0, page.path.lastIndexOf("/")) : "";
      const relative = folder ? `${folder}/${withExtension}` : withExtension;
      let targetPath = byPath.has(relative) ? relative : byPath.has(withExtension) ? withExtension : null;

      if (!targetPath && !cleaned.includes("/")) {
        const candidates = byName.get(pageNameKey(cleaned)) ?? [];
        // Ambiguous names stay unresolved: guessing which page was meant is worse than saying so.
        if (candidates.length === 1) targetPath = candidates[0]!;
      }

      const targetId = targetPath ? pageNodeId(targetPath) : null;
      if (targetId === sourceId) continue;

      addEdge({
        id: `link:${sourceId}->${targetId ?? link.target}`,
        kind: "link",
        source: sourceId,
        target: targetId,
        label: link.target,
        broken: targetId === null,
      });
    }

    for (const tag of pageTags(page)) {
      addEdge({
        id: `tag:${sourceId}->${tag.toLowerCase()}`,
        kind: "tag",
        source: sourceId,
        target: `tag:${tag.toLowerCase()}`,
        label: tag,
        broken: false,
      });
    }

    for (const source of page.sources) {
      addEdge({
        id: `source:${sourceId}->${source.id}`,
        kind: "source",
        source: sourceId,
        target: `source:${source.id}`,
        label: source.title ?? source.resource,
        broken: false,
      });
    }
  }

  return { nodes, edges };
}

export interface KnowledgeGraphHealth {
  pages: number;
  concepts: number;
  brokenLinks: number;
  pagesWithoutProvenance: number;
  unattributedPages: number;
  deprecatedPages: number;
}

/** What the map should be able to say about a bundle without opening every page. */
export function knowledgeGraphHealth(graph: KnowledgeGraph): KnowledgeGraphHealth {
  return {
    pages: graph.nodes.length,
    concepts: graph.nodes.filter((node) => node.kind === "concept").length,
    brokenLinks: graph.edges.filter((edge) => edge.kind === "link" && edge.broken).length,
    pagesWithoutProvenance: graph.nodes.filter((node) => node.missingProvenance).length,
    unattributedPages: graph.nodes.filter((node) => node.trustTier === "unattributed").length,
    deprecatedPages: graph.nodes.filter((node) => node.status === "deprecated").length,
  };
}
