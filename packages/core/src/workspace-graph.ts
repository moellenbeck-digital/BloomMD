/**
 * The graph over a whole workspace, as opposed to the heading tree inside one document.
 *
 * Two different things are worth seeing in a set of Markdown files, and conflating them produces the
 * unreadable hairball that graph views are notorious for:
 *
 * - **Structure** — folders and files. This is the order someone deliberately chose.
 * - **References** — `[[wiki links]]` and Markdown links. These are the connections that actually
 *   exist, and they cut across the chosen order.
 *
 * Both are modelled as separate edge kinds so the UI can show either alone or both together
 * (see the layer controls). Nothing here writes to Markdown: the graph is derived on read, which is
 * what keeps a BloomMD workspace an ordinary folder of Markdown files that Obsidian or git can open.
 *
 * Everything in this module is pure. It takes file paths and their text, and returns a graph — no
 * filesystem, no network, no database — so the same extraction runs in the browser, on the desktop,
 * offline, and on the server.
 */

import { normalizeFolderPath, normalizeMarkdownPath } from "./path-rules";

export type WorkspaceNodeKind = "folder" | "file";

/** Why a reference could not be turned into an edge to exactly one file. */
export type LinkResolution = "resolved" | "broken" | "ambiguous";

export interface WorkspaceNode {
  id: string;
  kind: WorkspaceNodeKind;
  /** Workspace-relative path. Folders never carry a trailing slash. */
  path: string;
  /** Last path segment, without the `.md` extension for files. */
  label: string;
  /** Parent folder id, or null at the workspace root. */
  parentId: string | null;
}

export interface StructureEdge {
  kind: "structure";
  id: string;
  /** The containing folder. */
  source: string;
  /** The contained folder or file. */
  target: string;
}

export interface ReferenceEdge {
  kind: "reference";
  id: string;
  /** Node id of the file the link was written in. */
  source: string;
  /** Node id of the link target; null when broken or ambiguous. */
  target: string | null;
  /** Exactly as written in the Markdown, for showing the user what failed to resolve. */
  raw: string;
  /** Heading anchor if the link had one (`[[Page#Section]]`). */
  anchor: string | null;
  resolution: LinkResolution;
  /** 1-based line in the source file, so the UI can jump to the link. */
  line: number;
  /** Candidate paths when `resolution` is "ambiguous". */
  candidates?: string[];
}

export type WorkspaceEdge = StructureEdge | ReferenceEdge;

export interface WorkspaceGraph {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  /** Node id → ids of files that link to it. Derived, never stored in Markdown. */
  backlinks: Map<string, string[]>;
}

export interface WorkspaceFileInput {
  /** Workspace-relative path, e.g. `notes/ideas.md`. */
  path: string;
  markdown: string;
}

/** A link as found in the text, before it is resolved against the workspace. */
interface RawLink {
  target: string;
  anchor: string | null;
  raw: string;
  line: number;
}

/** Per-reader content cache; file-set changes invalidate target resolution, not link extraction. */
export class WorkspaceGraphCache {
  readonly files = new Map<string, {
    markdown: string;
    links: RawLink[];
    indexSignature: string;
    references: ReferenceEdge[];
  }>();
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Strips content that looks like a link but is not one.
 *
 * Fenced code blocks and inline code are the two places where `[[...]]` shows up as an example
 * rather than a reference — documentation about wiki links being the obvious case. Replacing with
 * spaces rather than deleting keeps every line number and column intact, which is what lets the
 * reported line actually point at the link.
 */
function maskCode(lines: string[]): string[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      // A closing fence must be at least as long as the one that opened the block.
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!) && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
      return " ".repeat(line.length);
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      return " ".repeat(line.length);
    }
    // Inline code spans, masked in place.
    return line.replace(/`+[^`]*`+/g, (span) => " ".repeat(span.length));
  });
}

/** True for targets that point outside the workspace, which are deliberately not crawled. */
function isExternalTarget(target: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith("//");
}

function splitAnchor(target: string): { path: string; anchor: string | null } {
  const hash = target.indexOf("#");
  if (hash === -1) return { path: target, anchor: null };
  const anchor = target.slice(hash + 1).trim();
  return { path: target.slice(0, hash).trim(), anchor: anchor === "" ? null : anchor };
}

/**
 * Finds every internal link in a document.
 *
 * Handles `[[Page]]`, `[[Page#Heading]]`, `[[Page|Label]]` and `[Text](./page.md)`. The alias after
 * `|` is display text and is dropped — only the target decides what the edge points at.
 */
export function extractLinks(markdown: string): RawLink[] {
  const lines = maskCode(markdown.replace(/\r\n/g, "\n").split("\n"));
  const links: RawLink[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    WIKILINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_RE.exec(line)) !== null) {
      const inner = match[1]!;
      const withoutAlias = inner.split("|")[0]!.trim();
      if (!withoutAlias) continue;
      const { path, anchor } = splitAnchor(withoutAlias);
      if (!path) continue;
      links.push({ target: path, anchor, raw: match[0]!, line: lineNumber });
    }

    MARKDOWN_LINK_RE.lastIndex = 0;
    while ((match = MARKDOWN_LINK_RE.exec(line)) !== null) {
      const rawTarget = match[1]!;
      if (isExternalTarget(rawTarget)) continue;
      const decoded = safeDecode(rawTarget);
      const { path, anchor } = splitAnchor(decoded);
      // A bare `#anchor` is a link within the same document, not a cross-file reference.
      if (!path) continue;
      links.push({ target: path, anchor, raw: match[0]!, line: lineNumber });
    }
  });

  return links;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * True for a target that names a file which is not a Markdown page.
 *
 * Only an explicit non-Markdown extension counts. A bare `[[Page]]` or a `./notes/page` without an
 * extension stays a page link, because that is what those forms mean in a vault.
 */
export function isAssetTarget(target: string): boolean {
  const withoutFragment = target.split(/[?#]/, 1)[0] ?? "";
  const name = withoutFragment.slice(withoutFragment.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const extension = name.slice(dot + 1).toLowerCase();
  return extension !== "md" && extension !== "markdown";
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function fileLabel(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.(md|markdown)$/i, "");
}

/**
 * Resolves a link target against the set of files in the workspace.
 *
 * Two forms have to work, because both are in wide use and users will mix them in one vault:
 *
 * - A path relative to the linking file, which is what a Markdown link means.
 * - A bare page name, which is what a wiki link means. Obsidian resolves those workspace-wide by
 *   filename, and a vault opened in BloomMD has to behave the same way or half the links break.
 *
 * Returns every candidate rather than picking one, so an ambiguous name is reported as ambiguous
 * instead of silently resolving to whichever file happened to sort first.
 */
function resolveTarget(target: string, fromPath: string, byPath: Map<string, string>, byName: Map<string, string[]>): string[] {
  const cleaned = target.trim().replace(/^\.\//, "");
  if (!cleaned) return [];

  const withExtension = /\.(md|markdown)$/i.test(cleaned) ? cleaned : `${cleaned}.md`;

  // Relative to the linking file first: an explicit path should win over a same-named page
  // elsewhere in the workspace.
  const base = folderOf(fromPath);
  const relative = normalizePathSegments(base ? `${base}/${withExtension}` : withExtension);
  if (relative && byPath.has(relative)) return [relative];

  // Workspace-root-relative, for links written as `notes/page.md` from a nested file.
  const fromRoot = normalizePathSegments(withExtension);
  if (fromRoot && byPath.has(fromRoot)) return [fromRoot];

  // Bare page name, resolved workspace-wide — but only when the author actually wrote a bare name.
  // A target containing a separator is a path, and a path that did not resolve must stay broken:
  // falling back to name matching would quietly point `../../secrets.md` at some unrelated file
  // that happens to share the name.
  if (cleaned.includes("/")) return [];
  const name = fileLabel(cleaned).toLowerCase();
  return byName.get(name) ?? [];
}

/**
 * Applies `.` and `..` without touching the filesystem.
 *
 * Returns null when the path climbs above the workspace root — that is a link pointing outside the
 * workspace, which is reported as broken rather than resolved against an unrelated file.
 */
function normalizePathSegments(path: string): string | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join("/");
}

export const FOLDER_NODE_PREFIX = "folder:";
export const FILE_NODE_PREFIX = "file:";

export function folderNodeId(path: string): string {
  return `${FOLDER_NODE_PREFIX}${path}`;
}

export function fileNodeId(path: string): string {
  return `${FILE_NODE_PREFIX}${path}`;
}

/**
 * Builds the workspace graph from a flat list of Markdown files.
 *
 * Folders are derived from the paths rather than passed in, so a workspace listing that only knows
 * about files still produces the containing structure. Empty folders therefore do not appear — they
 * hold nothing to show, and inventing nodes for them would make the map noisier than the folder
 * tree it is meant to clarify.
 */
export function buildWorkspaceGraph(files: WorkspaceFileInput[], cache?: WorkspaceGraphCache): WorkspaceGraph {
  const normalized: WorkspaceFileInput[] = [];
  for (const file of files) {
    // Reuses the same guard the file store applies, so a path that could escape the workspace
    // cannot enter the graph either.
    const path = normalizeMarkdownPath(file.path);
    normalized.push({ path, markdown: file.markdown });
  }
  normalized.sort((a, b) => a.path.localeCompare(b.path));

  const nodes = new Map<string, WorkspaceNode>();
  const edges: WorkspaceEdge[] = [];

  const ensureFolder = (path: string): string | null => {
    if (!path) return null;
    const folderPath = normalizeFolderPath(path);
    const id = folderNodeId(folderPath);
    if (nodes.has(id)) return id;
    const parentId = ensureFolder(folderOf(folderPath));
    nodes.set(id, {
      id,
      kind: "folder",
      path: folderPath,
      label: folderPath.slice(folderPath.lastIndexOf("/") + 1),
      parentId,
    });
    if (parentId) {
      edges.push({ kind: "structure", id: `structure:${parentId}->${id}`, source: parentId, target: id });
    }
    return id;
  };

  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();

  for (const file of normalized) {
    const id = fileNodeId(file.path);
    const parentId = ensureFolder(folderOf(file.path));
    nodes.set(id, { id, kind: "file", path: file.path, label: fileLabel(file.path), parentId });
    if (parentId) {
      edges.push({ kind: "structure", id: `structure:${parentId}->${id}`, source: parentId, target: id });
    }
    byPath.set(file.path, id);
    const name = fileLabel(file.path).toLowerCase();
    const bucket = byName.get(name);
    if (bucket) bucket.push(file.path);
    else byName.set(name, [file.path]);
  }

  const indexSignature = JSON.stringify(normalized.map((file) => file.path));
  if (cache) {
    const paths = new Set(normalized.map((file) => file.path));
    for (const path of cache.files.keys()) if (!paths.has(path)) cache.files.delete(path);
  }
  const backlinks = new Map<string, string[]>();
  const seenReference = new Set<string>();

  for (const file of normalized) {
    const sourceId = fileNodeId(file.path);
    const cached = cache?.files.get(file.path);
    const links = cached?.markdown === file.markdown ? cached.links : extractLinks(file.markdown);
    const reusable = cached?.markdown === file.markdown && cached.indexSignature === indexSignature;
    const references: ReferenceEdge[] = reusable ? structuredClone(cached.references) : [];
    for (const link of reusable ? [] : links) {
      // An image or attachment is not a page. Reporting `![x](diagram.svg)` as a broken page link
      // would send someone hunting for a problem that does not exist — the file is right there, it
      // simply is not part of a graph whose nodes are Markdown documents. Media references belong
      // to the preview layer instead.
      if (isAssetTarget(link.target)) continue;

      const candidates = resolveTarget(link.target, file.path, byPath, byName);

      let resolution: LinkResolution;
      let targetId: string | null = null;
      if (candidates.length === 1) {
        resolution = "resolved";
        targetId = fileNodeId(candidates[0]!);
      } else if (candidates.length === 0) {
        resolution = "broken";
      } else {
        resolution = "ambiguous";
      }

      // Repeated links in the same source section are still one visible relation. Links on another
      // line may belong to another heading/topic in the derived workspace view, so the line is part
      // of the key.
      const dedupeKey = `${sourceId}|${targetId ?? link.target}|${link.anchor ?? ""}|${resolution}|${link.line}`;
      if (seenReference.has(dedupeKey)) continue;
      seenReference.add(dedupeKey);

      const edge: ReferenceEdge = {
        kind: "reference",
        id: `reference:${dedupeKey}`,
        source: sourceId,
        target: targetId,
        raw: link.raw,
        anchor: link.anchor,
        resolution,
        line: link.line,
      };
      if (resolution === "ambiguous") edge.candidates = candidates;
      references.push(edge);
    }
    cache?.files.set(file.path, { markdown: file.markdown, links, indexSignature, references: structuredClone(references) });
    edges.push(...references);
    for (const edge of references) {
      const targetId = edge.target;
      if (targetId && targetId !== sourceId) {
        const existing = backlinks.get(targetId);
        if (existing) {
          if (!existing.includes(sourceId)) existing.push(sourceId);
        } else {
          backlinks.set(targetId, [sourceId]);
        }
      }
    }
  }

  return { nodes: [...nodes.values()], edges, backlinks };
}

/**
 * Which perspectives are currently visible.
 *
 * Kept as independent flags rather than a single mode because the useful combinations are not a
 * line: someone reading a book outline wants structure plus backlinks for the chapter they have
 * selected, but not the full reference web. Presets exist on top of these flags, not instead.
 */
export interface GraphLayers {
  /** Folder nodes and the structure edges between them. */
  folders: boolean;
  /** Resolved cross-links between files. */
  references: boolean;
  /** Incoming links. Restricted to the selection when one exists, otherwise global. */
  backlinks: boolean;
  /** Links that could not be resolved to exactly one file. */
  brokenLinks: boolean;
}

export type GraphPreset = "structure" | "reference" | "knowledge";

export const GRAPH_PRESETS: Record<GraphPreset, GraphLayers> = {
  // The deliberate order: what someone arranged on purpose.
  structure: { folders: true, references: false, backlinks: false, brokenLinks: false },
  // The actual relationships, with the folder scaffolding out of the way.
  reference: { folders: false, references: true, backlinks: true, brokenLinks: true },
  // Both at once.
  knowledge: { folders: true, references: true, backlinks: true, brokenLinks: true },
};

export const DEFAULT_GRAPH_LAYERS: GraphLayers = GRAPH_PRESETS.structure;

/** The preset matching these layers exactly, or null for a custom combination. */
export function matchPreset(layers: GraphLayers): GraphPreset | null {
  for (const [name, preset] of Object.entries(GRAPH_PRESETS) as Array<[GraphPreset, GraphLayers]>) {
    if (
      preset.folders === layers.folders
      && preset.references === layers.references
      && preset.backlinks === layers.backlinks
      && preset.brokenLinks === layers.brokenLinks
    ) {
      return name;
    }
  }
  return null;
}

/**
 * Reduces the graph to what the active layers should show.
 *
 * Files are always kept: they are the subject of the map, and a view with no files is not a
 * perspective, it is an empty screen. Folders disappear with their layer, and any file that was
 * only reachable through a folder simply stands on its own.
 *
 * When something is selected, backlinks narrow to that node. Showing every incoming link in a
 * workspace at once is the fastest way to make the reference view unreadable, and the issue asks
 * for backlinks to be targetable at a selection.
 */
export function filterWorkspaceGraph(
  graph: WorkspaceGraph,
  layers: GraphLayers,
  selectedNodeId?: string | null,
): { nodes: WorkspaceNode[]; edges: WorkspaceEdge[] } {
  const nodes = graph.nodes.filter((node) => node.kind === "file" || layers.folders);
  const visible = new Set(nodes.map((node) => node.id));

  const backlinkSources = new Set<string>();
  if (layers.backlinks) {
    if (selectedNodeId) {
      for (const source of graph.backlinks.get(selectedNodeId) ?? []) backlinkSources.add(source);
    }
  }

  const edges = graph.edges.filter((edge) => {
    if (edge.kind === "structure") {
      return layers.folders && visible.has(edge.source) && visible.has(edge.target);
    }

    if (edge.resolution !== "resolved") {
      return layers.brokenLinks && visible.has(edge.source);
    }

    if (!edge.target || !visible.has(edge.target) || !visible.has(edge.source)) return false;

    // An edge pointing at the selection is a backlink; it stays visible when either the reference
    // layer is on or backlinks are being shown for that selection.
    const isBacklinkOfSelection = selectedNodeId != null && edge.target === selectedNodeId && backlinkSources.has(edge.source);
    return layers.references || isBacklinkOfSelection;
  });

  return { nodes, edges };
}

export interface GraphCounts {
  folders: number;
  files: number;
  structureEdges: number;
  resolvedReferences: number;
  brokenReferences: number;
  ambiguousReferences: number;
}

/** Summary for the layer legend, so counts do not have to be recomputed in the UI. */
export function graphCounts(graph: WorkspaceGraph): GraphCounts {
  const counts: GraphCounts = {
    folders: 0,
    files: 0,
    structureEdges: 0,
    resolvedReferences: 0,
    brokenReferences: 0,
    ambiguousReferences: 0,
  };
  for (const node of graph.nodes) {
    if (node.kind === "folder") counts.folders += 1;
    else counts.files += 1;
  }
  for (const edge of graph.edges) {
    if (edge.kind === "structure") counts.structureEdges += 1;
    else if (edge.resolution === "resolved") counts.resolvedReferences += 1;
    else if (edge.resolution === "broken") counts.brokenReferences += 1;
    else counts.ambiguousReferences += 1;
  }
  return counts;
}
