/**
 * Browser-safe runtime surface embedded into the standalone public Obsidian release mirror.
 *
 * Keep this deliberately narrow: only the shared-document adapter needs these exports. The
 * generated bundle contains no filesystem access and is never used by the canonical monorepo
 * plugin build.
 */
export {
  createLocalSharedDocumentState,
  hashSharedDocumentMarkdown,
  transitionSharedDocumentState,
} from "../packages/core/src/shared-document-binding";
export { SharedDocumentMirror } from "../packages/core/src/shared-document-mirror";
export { WorkspaceSyncClient } from "../packages/core/src/workspace-sync-client";
export { documentToYDoc, yDocToDocument } from "../packages/core/src/yjs-bridge";
export { SyncProvider } from "../packages/ui/src/sync/SyncProvider";
import { parseHeadingTree, type MarkdownHeadingNode } from "../packages/core/src/obsidian-markdown";
import type { MindMapDocument, MindMapFrontmatter, MindMapNode, MindMapNodeMetadata } from "../packages/core/src/types";

/**
 * The public mirror deliberately avoids the remark parser bundle because one of its optional DOM
 * helpers executes at module load in non-browser test environments. This bridge uses the same
 * Obsidian heading parser that powers the plugin UI and maps it to the shared Yjs document shape.
 */
export function parseFile(filePath: string, rawMarkdown: string): MindMapDocument {
  const parsed = splitFrontmatter(rawMarkdown);
  const headings = parseHeadingTree(parsed.content);
  const nodes = new Map<string, MindMapNode>();
  let rootId = "";

  const append = (heading: MarkdownHeadingNode, parentId: string | null): void => {
    const node: MindMapNode = {
      id: heading.id,
      parentId,
      level: heading.level,
      title: heading.title,
      content: heading.content,
      children: heading.children.map((child) => child.id),
      ...(heading.metadata ? { metadata: heading.metadata as MindMapNodeMetadata } : {}),
    };
    nodes.set(node.id, node);
    if (!rootId) rootId = node.id;
    for (const child of heading.children) append(child, node.id);
  };
  for (const heading of headings) append(heading, null);

  const frontmatter = normalizeFrontmatter(parsed.data, filePath, headings[0]?.title ?? "Untitled");
  if (!rootId) {
    rootId = "root";
    nodes.set(rootId, {
      id: rootId,
      parentId: null,
      level: 1,
      title: frontmatter.title,
      content: parsed.content.trim(),
      children: [],
    });
  }

  return { filePath, frontmatter, nodes, rootId, rawMarkdown };
}

export function serializeToMarkdown(document: MindMapDocument): string {
  const lines: string[] = [];
  for (const node of document.nodes.values()) {
    if (node.parentId !== null) continue;
    appendMarkdownNode(lines, document, node);
  }
  const body = `${lines.join("\n\n").trim()}\n`;
  const frontmatter = { ...document.frontmatter, updated: new Date().toISOString() };
  return `---\n${Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${body}`;
}

function splitFrontmatter(rawMarkdown: string): { data: Record<string, unknown>; content: string } {
  const lines = rawMarkdown.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return { data: {}, content: rawMarkdown };
  const end = lines.findIndex((line, index) => index > 0 && (line.trim() === "---" || line.trim() === "..."));
  if (end < 0) return { data: {}, content: rawMarkdown };
  const data: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    try {
      data[key] = JSON.parse(value);
    } catch {
      data[key] = value.replace(/^['"]|['"]$/gu, "");
    }
  }
  return { data, content: lines.slice(end + 1).join("\n") };
}

function normalizeFrontmatter(value: Record<string, unknown>, filePath: string, fallbackTitle: string): MindMapFrontmatter {
  const now = new Date().toISOString();
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title : fallbackTitle,
    id: typeof value.id === "string" && value.id.trim() ? value.id : `shared-${hashSharedDocumentMarkdown(filePath).slice(-12)}`,
    created: typeof value.created === "string" && value.created.trim() ? value.created : now,
    updated: typeof value.updated === "string" && value.updated.trim() ? value.updated : now,
    ...(Array.isArray(value.tags) && value.tags.every((entry) => typeof entry === "string") ? { tags: value.tags } : {}),
  };
}

function appendMarkdownNode(lines: string[], document: MindMapDocument, node: MindMapNode): void {
  const metadata = node.metadata
    ? ` <!-- bloommd:meta=${JSON.stringify(node.metadata).replace(/-->/gu, "--\\u003e")} -->`
    : "";
  lines.push(`${"#".repeat(Math.min(Math.max(node.level, 1), 6))} ${node.title} <!-- bloommd:id=${node.id} -->${metadata}`);
  if (node.content) lines.push(node.content);
  for (const childId of node.children) {
    const child = document.nodes.get(childId);
    if (child) appendMarkdownNode(lines, document, child);
  }
}
