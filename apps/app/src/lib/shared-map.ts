import { parseFile } from "@bloommd/core/browser";
import type { MindMapNodeMetadata } from "@bloommd/core/browser";

/**
 * What a read-only share link reveals: titles, visible text and task/decision facts. Frontmatter,
 * Markdown comments, embeds (ink drawings, attachments) and internal references stay on the server.
 */
export interface SharedMapNode {
  id: string;
  parentId: string | null;
  level: number;
  title: string;
  content: string;
  children: string[];
  metadata?: Pick<MindMapNodeMetadata, "kind" | "status" | "decision" | "due" | "assignee" | "url">;
}

export interface SharedMapView {
  title: string;
  rootId: string;
  nodes: SharedMapNode[];
}

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const EMBED = /!\[\[[^\]]*\]\]/g;

function visibleText(value: string): string {
  return value.replace(HTML_COMMENT, "").replace(EMBED, "").replace(/\n{3,}/g, "\n\n").trim();
}

function sharedMetadata(metadata: MindMapNodeMetadata | undefined): SharedMapNode["metadata"] {
  if (!metadata) return undefined;
  const { kind, status, decision, due, assignee, url } = metadata;
  return {
    kind,
    ...(status ? { status } : {}),
    ...(decision ? { decision } : {}),
    ...(due ? { due } : {}),
    ...(assignee ? { assignee } : {}),
    ...(kind === "web" && url ? { url } : {}),
  };
}

export function sharedMapView(filename: string, markdown: string): SharedMapView {
  const document = parseFile(filename, markdown);
  const nodes = [...document.nodes.values()].map((node): SharedMapNode => ({
    id: node.id,
    parentId: node.parentId,
    level: node.level,
    title: visibleText(node.title),
    content: visibleText(node.content),
    children: [...node.children],
    ...(node.metadata ? { metadata: sharedMetadata(node.metadata) } : {}),
  }));
  const rootTitle = document.nodes.get(document.rootId)?.title;
  return {
    title: visibleText(String(document.frontmatter.title || rootTitle || filename.replace(/\.md$/i, ""))),
    rootId: document.rootId,
    nodes,
  };
}
