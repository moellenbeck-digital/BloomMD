/**
 * An index over a whole workspace: documents and headings as separate kinds of node, the places
 * that link to each of them, and the findings that follow from those links.
 *
 * Nothing here resolves links or matches anchors on its own. `buildWorkspaceGraph` decides what a
 * link points at, `anchorKey`/`headingNodeId` (workspace-document) decide what a heading is called,
 * and `knowledge` decides what "veraltet" means. This module only joins the three, which is what
 * keeps the index, the lint and the mind map from disagreeing about the same link.
 *
 * Pure like the rest of the workspace modules: files in, index out, no filesystem. Findings use the
 * shape of `LintFinding` but live in their own result, so `lintWorkspace` (and a CI run with
 * `--strict` on top of it) does not start reporting new codes.
 */

import { isKnowledgeRetired, knowledgeLifecycle, localIsoDay, readKnowledgeFrontmatter } from "./knowledge";
import { parseFile } from "./parser";
import { normalizeMarkdownPath } from "./path-rules";
import type { LintSeverity } from "./workspace-lint";
import { anchorKey, headingNodeId, headingSections } from "./workspace-document";
import { buildWorkspaceGraph, fileNodeId, type ReferenceEdge, type WorkspaceFileInput } from "./workspace-graph";

export type WorkspaceIndexFindingCode =
  /** A link points at no file (same decision as `broken-link` in the lint). */
  | "broken-link"
  /** A bare name matches several files (same decision as `ambiguous-link` in the lint). */
  | "ambiguous-link"
  /** The link finds its file, but no heading of that file carries the anchor. */
  | "stale-anchor"
  /** The link finds its file, but the frontmatter marks that file as veraltet/ersetzt or past `stale_after`. */
  | "stale-document"
  /** The same `bloommd:id` appears more than once, in one file or across files. */
  | "duplicate-node-id";

export interface WorkspaceIndexFinding {
  code: WorkspaceIndexFindingCode;
  severity: LintSeverity;
  /** Workspace-relative path of the file the finding belongs to. */
  path: string;
  /** 1-based line, when the finding has one. */
  line: number | null;
  message: string;
  /** Extra context: candidate paths, the successor, all places of a duplicate id. */
  detail: string | null;
  /** Every place involved, for findings that are about more than one (duplicate ids). */
  locations?: Array<{ path: string; line: number }>;
}

/** One place that links to a document or heading. */
export interface IndexBacklink {
  sourcePath: string;
  sourceTitle: string;
  /** The heading the link stands under; null above the first heading of the source file. */
  sourceHeadingId: string | null;
  sourceHeadingTitle: string | null;
  line: number;
  /** The link exactly as written. */
  raw: string;
  /** The anchor part of the link, as written; null for a link to the whole document. */
  anchor: string | null;
  /**
   * False for a link whose anchor names no heading: it then counts for the document, because the
   * file is what it reaches. Also false for block references (`#^id`), which cannot be checked here.
   */
  anchorMatched: boolean;
}

export interface IndexBacklinks {
  /** Number of links. */
  count: number;
  /** Number of distinct source documents. */
  sources: number;
  entries: IndexBacklink[];
}

export interface IndexDocumentNode {
  kind: "document";
  /** Same id as the file node of the workspace graph (`file:<path>`). */
  id: string;
  path: string;
  title: string;
  /** Frontmatter `status`, if any. */
  status: string | null;
  staleAfter: string | null;
  replacedBy: string | null;
  headingIds: string[];
  /** Links without an anchor, plus links whose anchor matched no heading. */
  backlinks: IndexBacklinks;
}

export interface IndexHeadingNode {
  kind: "heading";
  /** Same id as the heading node of the workspace mind map (`headingNodeId`). */
  id: string;
  documentId: string;
  path: string;
  level: number;
  title: string;
  /** 1-based line of the heading in its file. */
  line: number;
  /** Anchor key under which links find this heading. */
  anchor: string;
  /** The `bloommd:id` written after the heading, read from the raw Markdown; null when there is none. */
  bloommdId: string | null;
  parentId: string | null;
  /** Links that name this heading as their anchor. */
  backlinks: IndexBacklinks;
}

export interface WorkspaceIndexSummary {
  documents: number;
  headings: number;
  /** Links that resolve to exactly one file. */
  links: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface WorkspaceIndex {
  documents: IndexDocumentNode[];
  headings: IndexHeadingNode[];
  findings: WorkspaceIndexFinding[];
  summary: WorkspaceIndexSummary;
  /** The day the "stale" checks were made for (`YYYY-MM-DD`). */
  today: string;
}

export interface WorkspaceIndexOptions {
  /** `YYYY-MM-DD`; defaults to the local day. Injected so `stale_after` can be tested. */
  today?: string;
}

const ID_COMMENT_RE = /<!--\s*bloommd:id=([A-Za-z0-9_-]+)\s*-->/;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** How many headings a stale-anchor finding lists, so a long document does not flood the report. */
const LISTED_HEADINGS = 10;

function emptyBacklinks(): IndexBacklinks {
  return { count: 0, sources: 0, entries: [] };
}

function finishBacklinks(list: IndexBacklinks): void {
  list.entries.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line);
  list.count = list.entries.length;
  list.sources = new Set(list.entries.map((entry) => entry.sourcePath)).size;
}

/**
 * What a link's anchor asks for. Obsidian writes `[[Page#Heading#Sub]]` for a nested heading (the
 * last one is the target) and `[[Page#^block]]` for a block, which has no heading to match.
 */
function anchorRequest(anchor: string): { kind: "heading"; key: string } | { kind: "block" } {
  if (anchor.startsWith("^")) return { kind: "block" };
  const segments = anchor.split("#");
  return { kind: "heading", key: anchorKey(segments[segments.length - 1] ?? anchor) };
}

/** Builds the index. `files` are workspace-relative paths with their Markdown text. */
export function buildWorkspaceIndex(files: WorkspaceFileInput[], options: WorkspaceIndexOptions = {}): WorkspaceIndex {
  const today = options.today ?? localIsoDay();
  if (!ISO_DAY_RE.test(today)) throw new Error(`today must be YYYY-MM-DD, got "${today}"`);

  const inputs = files
    .map((file) => ({ path: normalizeMarkdownPath(file.path), markdown: file.markdown }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const graph = buildWorkspaceGraph(inputs);
  const pathById = new Map(graph.nodes.map((node) => [node.id, node.path]));

  const documents: IndexDocumentNode[] = [];
  const headings: IndexHeadingNode[] = [];
  const documentByPath = new Map<string, IndexDocumentNode>();
  const headingsByPath = new Map<string, IndexHeadingNode[]>();
  const anchorsByPath = new Map<string, Map<string, IndexHeadingNode>>();
  const idPlaces = new Map<string, Array<{ path: string; line: number }>>();
  const lifecycleByPath = new Map<string, ReturnType<typeof knowledgeLifecycle>>();
  const titleByPath = new Map<string, string>();

  for (const file of inputs) {
    const parsed = parseFile(file.path, file.markdown);
    const frontmatter = readKnowledgeFrontmatter(file.markdown);
    const lifecycle = knowledgeLifecycle(frontmatter, today);
    lifecycleByPath.set(file.path, lifecycle);

    const documentId = fileNodeId(file.path);
    const document: IndexDocumentNode = {
      kind: "document",
      id: documentId,
      path: file.path,
      title: frontmatter.title ?? "",
      status: frontmatter.status ?? null,
      staleAfter: frontmatter.stale_after ?? null,
      replacedBy: frontmatter.replaced_by ?? null,
      headingIds: [],
      backlinks: emptyBacklinks(),
    };
    documents.push(document);
    documentByPath.set(file.path, document);

    // Same walk as `buildWorkspaceMindMap`: the ordinal of a heading is its position in document
    // order, and the line comes from the same section list, so ids and lines agree with the map.
    const sections = headingSections(file.markdown);
    const lines = file.markdown.replace(/\r\n/g, "\n").split("\n");
    const own: IndexHeadingNode[] = [];
    const anchors = new Map<string, IndexHeadingNode>();
    let ordinal = 0;

    const visit = (nodeId: string, parentId: string | null) => {
      const source = parsed.nodes.get(nodeId);
      if (!source) return;
      const section = sections[ordinal];
      const id = headingNodeId(file.path, ordinal, source.title);
      // Raw read: the parser reassigns a repeated id, so the parsed node cannot show it.
      const rawLine = section ? lines[section.line - 1] ?? "" : "";
      const bloommdId = ID_COMMENT_RE.exec(rawLine)?.[1] ?? null;
      ordinal += 1;

      const heading: IndexHeadingNode = {
        kind: "heading",
        id,
        documentId,
        path: file.path,
        level: source.level,
        title: source.title,
        line: section?.line ?? ordinal,
        anchor: anchorKey(source.title),
        bloommdId,
        parentId,
        backlinks: emptyBacklinks(),
      };
      own.push(heading);
      // The first heading wins a shared anchor, which is what GitHub and Obsidian do.
      if (heading.anchor && !anchors.has(heading.anchor)) anchors.set(heading.anchor, heading);
      if (bloommdId) {
        const places = idPlaces.get(bloommdId);
        const place = { path: file.path, line: heading.line };
        if (places) places.push(place);
        else idPlaces.set(bloommdId, [place]);
      }
      for (const childId of source.children) visit(childId, id);
    };

    // A file without any heading gets a synthetic root from the parser; that is not a heading.
    if (sections.length > 0) {
      for (const node of parsed.nodes.values()) if (node.parentId === null) visit(node.id, null);
    }
    // Frontmatter title, else the first heading, else the file name: what a reader would call it.
    document.title ||= own[0]?.title ?? file.path.slice(file.path.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/i, "");
    titleByPath.set(file.path, document.title);
    document.headingIds = own.map((heading) => heading.id);
    headings.push(...own);
    headingsByPath.set(file.path, own);
    anchorsByPath.set(file.path, anchors);
  }

  const findings: WorkspaceIndexFinding[] = [];

  for (const edge of graph.edges) {
    if (edge.kind !== "reference") continue;
    const reference: ReferenceEdge = edge;
    const sourcePath = pathById.get(reference.source) ?? reference.source;

    if (reference.resolution === "broken") {
      findings.push({
        code: "broken-link",
        severity: "error",
        path: sourcePath,
        line: reference.line,
        message: `Verweis ohne Ziel: ${reference.raw}`,
        detail: null,
      });
      continue;
    }
    if (reference.resolution === "ambiguous") {
      findings.push({
        code: "ambiguous-link",
        severity: "warning",
        path: sourcePath,
        line: reference.line,
        message: `Mehrdeutiger Verweis: ${reference.raw}`,
        detail: reference.candidates ? `Mögliche Ziele: ${reference.candidates.join(", ")}` : null,
      });
      continue;
    }

    const targetPath = reference.target ? pathById.get(reference.target) : undefined;
    const target = targetPath ? documentByPath.get(targetPath) : undefined;
    if (!targetPath || !target) continue;

    const sourceHeadings = headingsByPath.get(sourcePath) ?? [];
    let under: IndexHeadingNode | null = null;
    for (const heading of sourceHeadings) {
      if (heading.line > reference.line) break;
      under = heading;
    }

    const request = reference.anchor ? anchorRequest(reference.anchor) : null;
    const matched = request?.kind === "heading" && request.key ? anchorsByPath.get(targetPath)?.get(request.key) : undefined;
    const backlink: IndexBacklink = {
      sourcePath,
      sourceTitle: titleByPath.get(sourcePath) ?? sourcePath,
      sourceHeadingId: under?.id ?? null,
      sourceHeadingTitle: under?.title ?? null,
      line: reference.line,
      raw: reference.raw,
      anchor: reference.anchor,
      anchorMatched: request === null || matched !== undefined,
    };
    (matched ?? target).backlinks.entries.push(backlink);

    if (request?.kind === "heading" && !matched) {
      const known = (headingsByPath.get(targetPath) ?? []).map((heading) => heading.title);
      const listed = known.slice(0, LISTED_HEADINGS).join(", ");
      findings.push({
        code: "stale-anchor",
        severity: "warning",
        path: sourcePath,
        line: reference.line,
        message: `Anker „#${reference.anchor}" gibt es in ${targetPath} nicht: ${reference.raw}`,
        detail: known.length === 0
          ? "Die Datei hat keine Überschriften."
          : `Überschriften: ${listed}${known.length > LISTED_HEADINGS ? ", …" : ""}`,
      });
    }

    const lifecycle = lifecycleByPath.get(targetPath);
    if (lifecycle && isKnowledgeRetired(lifecycle)) {
      const reasons: string[] = [];
      if (isKnowledgeRetired({ status: lifecycle.status })) reasons.push(`Status „${lifecycle.status}"`);
      if (lifecycle.expired) reasons.push(`stale_after ${lifecycle.stale_after} überschritten`);
      findings.push({
        code: "stale-document",
        severity: "warning",
        path: sourcePath,
        line: reference.line,
        message: `Verweis auf veraltetes Ziel (${reasons.join(", ")}): ${reference.raw}`,
        detail: [`Ziel: ${targetPath}`, target.replacedBy ? `Nachfolger: ${target.replacedBy}` : null].filter(Boolean).join("; "),
      });
    }
  }

  for (const [id, places] of idPlaces) {
    if (places.length < 2) continue;
    places.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    const fileCount = new Set(places.map((place) => place.path)).size;
    const first = places[0]!;
    findings.push({
      code: "duplicate-node-id",
      severity: "warning",
      path: first.path,
      line: first.line,
      message: fileCount === 1
        ? `Die Knoten-ID „${id}" kommt ${places.length}× in dieser Datei vor.`
        : `Die Knoten-ID „${id}" kommt ${places.length}× in ${fileCount} Dateien vor.`,
      detail: places.map((place) => `${place.path}:${place.line}`).join(", "),
      locations: places,
    });
  }

  for (const document of documents) finishBacklinks(document.backlinks);
  for (const heading of headings) finishBacklinks(heading.backlinks);

  const order: Record<LintSeverity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code),
  );

  return {
    documents,
    headings,
    findings,
    today,
    summary: {
      documents: documents.length,
      headings: headings.length,
      links: graph.edges.filter((edge) => edge.kind === "reference" && edge.resolution === "resolved").length,
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
      infos: findings.filter((finding) => finding.severity === "info").length,
    },
  };
}
