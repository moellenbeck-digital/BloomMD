import { parseFile } from "./parser";
import { MAX_HEADING_LEVEL, type MindMapDocument, type MindMapNode, type MindMapReference } from "./types";
import {
  FILE_NODE_PREFIX,
  buildWorkspaceGraph,
  fileNodeId,
  type ReferenceEdge,
  type WorkspaceFileInput,
  WorkspaceGraphCache,
} from "./workspace-graph";
import { normalizeMarkdownPath } from "./path-rules";

export const WORKSPACE_ROOT_NODE_ID = "workspace:root";
export const HEADING_NODE_PREFIX = "heading:";

export interface WorkspaceMindMapOptions {
  title?: string;
  source?: string;
  /** Parsed documents matching inputFiles; lets filesystem readers reuse validated snapshots. */
  parsedDocuments?: ReadonlyMap<string, MindMapDocument>;
  cache?: WorkspaceDocumentCache;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fileTitle(path: string, doc: MindMapDocument): string {
  const title = doc.frontmatter.title?.trim();
  if (title) return title;
  const root = doc.nodes.get(doc.rootId);
  if (root?.title.trim()) return root.title.trim();
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/i, "");
}

function stableSegment(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_").replace(/[()]/g, "_");
}

export function headingNodeId(path: string, ordinal: number, title: string): string {
  const label = title
    .toLowerCase()
    .replace(/<!--\s*bloommd:[\s\S]*?-->/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${HEADING_NODE_PREFIX}${stableSegment(path)}:${ordinal}${label ? `-${label}` : ""}`;
}

function anchorKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/<!--\s*bloommd:[\s\S]*?-->/gi, "")
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function levelBelow(parent: MindMapNode): number {
  return Math.min(MAX_HEADING_LEVEL, parent.level + 1);
}

function filePathFromNodeId(nodeId: string): string | null {
  return nodeId.startsWith(FILE_NODE_PREFIX) ? nodeId.slice(FILE_NODE_PREFIX.length) : null;
}

interface HeadingSection {
  id: string;
  line: number;
}

interface WorkspaceTopicIndex {
  rootTopicId: string | null;
  byAnchor: Map<string, string>;
  byTitle: Map<string, string[]>;
  sections: HeadingSection[];
}

/** Owned by one workspace reader; snapshots never escape through returned documents. */
export class WorkspaceDocumentCache {
  readonly graph = new WorkspaceGraphCache();
  readonly files = new Map<string, {
    parsed: MindMapDocument;
    level: number;
    nodes: MindMapNode[];
    children: string[];
    topicIndex: WorkspaceTopicIndex;
  }>();
}

function stripHeadingTitle(value: string): string {
  let title = value.trim().replace(/^\s{0,3}#{1,6}(?:[\t ]+|$)/, "");
  const closed = /^(.*?)\s+#+\s*$/.exec(title);
  if (closed) title = closed[1]!;
  return title.replace(/<!--\s*bloommd:[\s\S]*?-->/gi, " ").trim();
}

function headingSections(markdown: string): Array<{ title: string; line: number }> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ title: string; line: number }> = [];
  let fence: string | null = null;
  let inFrontmatter = lines[0]?.trim() === "---";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    if (inFrontmatter) {
      if (index > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }

    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!) && fenceMatch[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      continue;
    }

    const atx = /^\s{0,3}#{1,6}(?:[\t ]+|$)/.exec(line);
    if (atx) {
      const title = stripHeadingTitle(line);
      if (title) sections.push({ title, line: lineNumber });
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine && /^\s{0,3}(=+|-+)\s*$/.test(nextLine) && line.trim()) {
      const title = stripHeadingTitle(line);
      if (title) sections.push({ title, line: lineNumber });
      index += 1;
    }
  }

  return sections;
}

function topicForLine(index: WorkspaceTopicIndex | undefined, line: number): string | null {
  if (!index) return null;
  let candidate: string | null = null;
  for (const section of index.sections) {
    if (section.line > line) break;
    candidate = section.id;
  }
  return candidate;
}

function topicForBareFileReference(
  index: WorkspaceTopicIndex | undefined,
  targetPath: string,
): string | null {
  if (!index) return null;
  if (index.rootTopicId) return index.rootTopicId;

  const fallbackTitle = targetPath.slice(targetPath.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/i, "");
  const matches = index.byTitle.get(fallbackTitle.trim().toLowerCase()) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Builds a normal MindMapDocument from a whole Markdown workspace.
 *
 * The returned document is derived and read-only. Folder/file/heading hierarchy is encoded as
 * normal MindMap nodes so the existing canvas, outline and relation controls can render it, while
 * `references` keeps cross-file links out of Markdown serialization.
 */
export function buildWorkspaceMindMap(
  inputFiles: WorkspaceFileInput[],
  options: WorkspaceMindMapOptions = {},
): MindMapDocument {
  const files = inputFiles
    .map((file) => ({ path: normalizeMarkdownPath(file.path), markdown: file.markdown }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const parsedByPath = new Map(files.map((file) => [file.path, options.parsedDocuments?.get(file.path) ?? parseFile(file.path, file.markdown)]));
  const graph = buildWorkspaceGraph(files, options.cache?.graph);
  if (options.cache) {
    const paths = new Set(files.map((file) => file.path));
    for (const path of options.cache.files.keys()) if (!paths.has(path)) options.cache.files.delete(path);
  }
  const nodes = new Map<string, MindMapNode>();
  const headingAnchors = new Map<string, string>();
  const topicIndexByPath = new Map<string, WorkspaceTopicIndex>();

  const timestamp = nowIso();
  const root: MindMapNode = {
    id: WORKSPACE_ROOT_NODE_ID,
    parentId: null,
    level: 1,
    title: options.title ?? "Workspace",
    content: "",
    children: [],
    metadata: { kind: "workspace", file: options.source },
  };
  nodes.set(root.id, root);

  const ensureParent = (nodeId: string | null): string => {
    if (!nodeId) return root.id;
    return nodes.has(nodeId) ? nodeId : root.id;
  };

  const appendChild = (parentId: string, childId: string) => {
    const parent = nodes.get(parentId);
    if (parent && !parent.children.includes(childId)) parent.children.push(childId);
  };

  for (const graphNode of graph.nodes) {
    const parentId = ensureParent(graphNode.parentId);
    const parent = nodes.get(parentId) ?? root;
    if (graphNode.kind === "folder") {
      const folderNode: MindMapNode = {
        id: graphNode.id,
        parentId,
        level: levelBelow(parent),
        title: graphNode.label,
        content: graphNode.path,
        children: [],
        metadata: { kind: "folder", file: graphNode.path },
      };
      nodes.set(folderNode.id, folderNode);
      appendChild(parentId, folderNode.id);
      continue;
    }

    const sourcePath = graphNode.path;
    const parsed = parsedByPath.get(sourcePath);
    const fileNode: MindMapNode = {
      id: graphNode.id,
      parentId,
      level: levelBelow(parent),
      title: parsed ? fileTitle(sourcePath, parsed) : graphNode.label,
      content: sourcePath,
      children: [],
      metadata: { kind: "file", file: sourcePath },
    };
    nodes.set(fileNode.id, fileNode);
    appendChild(parentId, fileNode.id);
  }

  for (const file of files) {
    const parsed = parsedByPath.get(file.path);
    const fileNode = nodes.get(fileNodeId(file.path));
    if (!parsed || !fileNode) continue;

    const cached = options.cache?.files.get(file.path);
    if (cached?.parsed === parsed && cached.level === fileNode.level) {
      for (const node of structuredClone(cached.nodes)) nodes.set(node.id, node);
      fileNode.children = [...cached.children];
      topicIndexByPath.set(file.path, cached.topicIndex);
      for (const [anchor, id] of cached.topicIndex.byAnchor) headingAnchors.set(`${file.path}#${anchor}`, id);
      continue;
    }
    const fileHeadingNodes: MindMapNode[] = [];
    const idMap = new Map<string, string>();
    const sourceHeadingSections = headingSections(file.markdown);
    const topicIndex: WorkspaceTopicIndex = {
      rootTopicId: null,
      byAnchor: new Map(),
      byTitle: new Map(),
      sections: [],
    };
    let ordinal = 0;

    const copyNode = (sourceId: string, parentId: string) => {
      const source = parsed.nodes.get(sourceId);
      const parent = nodes.get(parentId);
      if (!source || !parent) return;

      const newId = headingNodeId(file.path, ordinal, source.title);
      const section = sourceHeadingSections[ordinal];
      ordinal += 1;
      idMap.set(source.id, newId);

      const node: MindMapNode = {
        id: newId,
        parentId,
        level: levelBelow(parent),
        title: source.title,
        content: source.content,
        children: [],
        ...(source.collapsed ? { collapsed: source.collapsed } : {}),
        ...(source.metadata ? { metadata: structuredClone(source.metadata) } : {}),
      };
      nodes.set(newId, node);
      fileHeadingNodes.push(node);
      appendChild(parentId, newId);
      const anchor = anchorKey(source.title);
      headingAnchors.set(`${file.path}#${anchor}`, newId);
      topicIndex.byAnchor.set(anchor, newId);
      const titleKey = source.title.trim().toLowerCase();
      const titleMatches = topicIndex.byTitle.get(titleKey);
      if (titleMatches) titleMatches.push(newId);
      else topicIndex.byTitle.set(titleKey, [newId]);
      if (source.parentId === null && !topicIndex.rootTopicId) topicIndex.rootTopicId = newId;
      topicIndex.sections.push({
        id: newId,
        line: section?.line ?? ordinal,
      });

      for (const childId of source.children) copyNode(childId, newId);
    };

    for (const source of parsed.nodes.values()) {
      if (source.parentId === null) copyNode(source.id, fileNode.id);
    }

    for (const node of fileHeadingNodes) {
      if (!node.metadata?.targetNodeId) continue;
      const mapped = idMap.get(node.metadata.targetNodeId);
      if (mapped) node.metadata = { ...node.metadata, targetNodeId: mapped };
    }
    topicIndex.sections.sort((a, b) => a.line - b.line);
    topicIndexByPath.set(file.path, topicIndex);
    options.cache?.files.set(file.path, {
      parsed, level: fileNode.level, nodes: structuredClone(fileHeadingNodes),
      children: [...fileNode.children], topicIndex,
    });
  }

  const references: MindMapReference[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "reference" || edge.resolution !== "resolved" || !edge.target) continue;
    const sourcePath = filePathFromNodeId(edge.source);
    const targetPath = filePathFromNodeId(edge.target);
    const targetIndex = targetPath ? topicIndexByPath.get(targetPath) : undefined;
    const targetId = targetPath && edge.anchor
      ? targetIndex?.byAnchor.get(anchorKey(edge.anchor)) ?? headingAnchors.get(`${targetPath}#${anchorKey(edge.anchor)}`) ?? edge.target
      : targetPath
        ? topicForBareFileReference(targetIndex, targetPath) ?? edge.target
        : edge.target;
    const referenceEdge = edge as ReferenceEdge;
    const sourceId = sourcePath
      ? topicForLine(topicIndexByPath.get(sourcePath), referenceEdge.line) ?? referenceEdge.source
      : referenceEdge.source;
    references.push({
      id: `workspace-reference:${references.length}:${sourceId}->${targetId}`,
      sourceId,
      targetId,
      kind: "reference",
      raw: referenceEdge.raw,
      ...(sourcePath ? { sourceFile: sourcePath, sourceFileId: referenceEdge.source } : {}),
      ...(targetPath ? { targetFile: targetPath, targetFileId: edge.target } : {}),
      ...(referenceEdge.anchor ? { targetAnchor: referenceEdge.anchor } : {}),
      line: referenceEdge.line,
    });
  }

  // A file with a single matching H1 represents one topic. Fold the duplicate only in
  // the derived snapshot, after building indexes/cache, so source Markdown stays untouched.
  const foldedHeadings = new Map<string, string>();
  const relevelChildren = (parent: MindMapNode) => {
    for (const childId of parent.children) {
      const child = nodes.get(childId);
      if (!child) continue;
      child.parentId = parent.id;
      child.level = levelBelow(parent);
      relevelChildren(child);
    }
  };
  for (const [path, parsed] of parsedByPath) {
    const file = nodes.get(fileNodeId(path));
    const roots = [...parsed.nodes.values()].filter((node) => node.parentId === null);
    const sourceRoot = roots[0];
    if (!file || roots.length !== 1 || !sourceRoot || sourceRoot.level !== 1 || sourceRoot.metadata) continue;
    if (file.title.trim().normalize("NFC") !== sourceRoot.title.trim().normalize("NFC")) continue;
    const heading = nodes.get(file.children[0] ?? "");
    if (file.children.length !== 1 || !heading) continue;
    file.content = [parsed.preamble, heading.content].filter(Boolean).join("\n\n");
    file.children = [...heading.children];
    if (heading.collapsed) file.collapsed = true;
    foldedHeadings.set(heading.id, file.id);
    nodes.delete(heading.id);
    relevelChildren(file);
  }
  for (const node of nodes.values()) {
    const targetId = node.metadata?.targetNodeId;
    const replacement = targetId ? foldedHeadings.get(targetId) : undefined;
    if (replacement && node.metadata) node.metadata = { ...node.metadata, targetNodeId: replacement };
  }
  for (const [index, reference] of references.entries()) {
    reference.sourceId = foldedHeadings.get(reference.sourceId) ?? reference.sourceId;
    reference.targetId = foldedHeadings.get(reference.targetId) ?? reference.targetId;
    reference.id = `workspace-reference:${index}:${reference.sourceId}->${reference.targetId}`;
  }

  return {
    filePath: options.source ?? "workspace://local",
    frontmatter: {
      title: options.title ?? "Workspace",
      id: "workspace",
      created: timestamp,
      updated: timestamp,
      layout: { direction: "LR" },
    },
    nodes,
    rootId: WORKSPACE_ROOT_NODE_ID,
    references,
    derived: { kind: "workspace", writable: false, source: options.source },
    rawMarkdown: "",
  };
}

export function isWorkspaceMindMap(doc: MindMapDocument | null | undefined): boolean {
  return doc?.derived?.kind === "workspace";
}
