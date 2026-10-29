import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkStringify from "remark-stringify";
import type { Root, Heading, Content, PhrasingContent } from "mdast";
import { MAX_HEADING_LEVEL, type MindMapDocument, type MindMapNode, type MindMapNodeKind, type MindMapNodeMetadata, type MindMapNodeRelation } from "./types";
import { normalizeFrontmatter, parseFrontmatter, stringifyFrontmatter } from "./frontmatter";

const NODE_ID_COMMENT_RE = /^<!--\s*bloommd:id=([A-Za-z0-9_-]+)\s*-->$/;
const NODE_META_COMMENT_RE = /^<!--\s*bloommd:meta=(\{.*\})\s*-->$/;
const NODE_KINDS = new Set<MindMapNodeKind>(["topic", "workspace", "folder", "portal", "web", "file", "pdf", "source", "task", "decision"]);

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function extractInlineText(node: PhrasingContent): string {
  // HTML nodes carry the bloommd:id / bloommd:meta comments and must never reach the title.
  if (node.type === "html") return "";
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if (node.type === "image") return node.alt ?? "";
  if (node.type === "break") return " ";
  if ("children" in node) return node.children.map(extractInlineText).join("");
  return "";
}

function extractText(node: Heading): string {
  return node.children.map(extractInlineText).join("").trim();
}

const BLOOMMD_COMMENT_RE = /\s*<!--\s*bloommd:(?:id|meta)=[\s\S]*?-->\s*/gi;

/**
 * Returns the heading title as it is written in the file.
 *
 * Rendering the mdast inline nodes back to plain text would silently drop links, emphasis and
 * inline code from headings on the next save, so the raw source slice is authoritative and only
 * the syntax that BloomMD owns (heading markers and its own HTML comments) is removed.
 */
function extractRawTitle(node: Heading, sourceLines: string[]): string {
  const start = node.position?.start.line;
  const end = node.position?.end.line;
  if (!start || !end) return extractText(node);

  const raw = sourceLines.slice(start - 1, end);
  if (raw.length === 0) return extractText(node);

  // A Setext heading ends with its underline, which is not part of the title.
  const isSetext = raw.length > 1 && /^\s{0,3}(=+|-+)\s*$/.test(raw[raw.length - 1]!);
  const titleLines = isSetext ? raw.slice(0, -1) : raw;

  let title = titleLines.join(" ").trim();
  if (!isSetext) {
    title = title.replace(/^\s{0,3}#{1,6}(?:[\t ]+|$)/, "");
    const closed = /^(.*?)\s+#+\s*$/.exec(title);
    if (closed) title = closed[1]!;
    else if (/^#+$/.test(title)) title = "";
  }

  return title.replace(BLOOMMD_COMMENT_RE, " ").trim();
}

function extractPersistedNodeId(node: Heading): string | null {
  for (const child of node.children) {
    if (child.type !== "html") continue;
    const match = child.value.match(NODE_ID_COMMENT_RE);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Keeps only well-formed relations. Duplicated in both Markdown parsers on purpose: the Obsidian
 * mirror snapshots obsidian-markdown.ts standalone, and both must preserve the same fields or one
 * app would silently drop what the other wrote.
 */
function parseRelations(value: unknown): { relations: MindMapNodeRelation[] } | Record<string, never> {
  if (!Array.isArray(value)) return {};
  const relations = value.flatMap((entry): MindMapNodeRelation[] => {
    if (!entry || typeof entry !== "object") return [];
    const { target, label } = entry as Record<string, unknown>;
    if (typeof target !== "string" || !target.trim()) return [];
    return [{ target, ...(typeof label === "string" && label.trim() ? { label } : {}) }];
  });
  return relations.length > 0 ? { relations } : {};
}

/** `owner` is read as an alias of `assignee`; the stored field stays `assignee` (the explicit one wins). Duplicated in both Markdown parsers, see parseRelations. */
function parseAssignee(value: { assignee?: unknown; owner?: unknown }): { assignee: string } | Record<string, never> {
  for (const candidate of [value.assignee, value.owner]) {
    if (typeof candidate === "string" && candidate.trim()) return { assignee: candidate.trim().slice(0, 120) };
  }
  return {};
}

function extractNodeMetadata(node: Heading): MindMapNodeMetadata | undefined {
  for (const child of node.children) {
    if (child.type !== "html") continue;
    const match = child.value.match(NODE_META_COMMENT_RE);
    if (!match?.[1]) continue;
    try {
      const value = JSON.parse(match[1]) as Partial<MindMapNodeMetadata>;
      if (!value.kind || !NODE_KINDS.has(value.kind)) return undefined;
      return {
        kind: value.kind,
        ...(typeof value.url === "string" ? { url: value.url } : {}),
        ...(typeof value.previewTitle === "string" ? { previewTitle: value.previewTitle } : {}),
        ...(typeof value.previewDescription === "string" ? { previewDescription: value.previewDescription } : {}),
        ...(typeof value.previewImage === "string" ? { previewImage: value.previewImage } : {}),
        ...(typeof value.file === "string" ? { file: value.file } : {}),
        ...(typeof value.targetNodeId === "string" ? { targetNodeId: value.targetNodeId } : {}),
        ...(typeof value.citation === "string" ? { citation: value.citation } : {}),
        ...(value.status === "open" || value.status === "in_progress" || value.status === "done" ? { status: value.status } : {}),
        ...(value.decision === "proposed" || value.decision === "accepted" || value.decision === "rejected" ? { decision: value.decision } : {}),
        ...(typeof value.note === "string" && value.note.trim() ? { note: value.note } : {}),
        ...(typeof value.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.due) ? { due: value.due } : {}),
        ...parseAssignee(value),
        ...parseRelations(value.relations),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Serializer settings chosen so a save returns the file the user wrote.
 *
 * remark-stringify's defaults are correct CommonMark but rewrite text that was already fine, and
 * every rewrite shows up as a diff in someone's git history:
 *
 * - `bullet: "-"` — the default is `*`, which reflows every list in an Obsidian vault on first save.
 * - `fences: true` — indented code blocks become fenced ones otherwise.
 * - `rule: "-"` and `emphasis: "_"`/`strong: "*"` match what people actually type.
 *
 * The important one is the escaping. By default `[` is escaped whenever it could start a link,
 * which turns `[[Wiki Link]]` into `\[\[Wiki Link]]` and `- [ ] task` into `- \[ ] task`. Both are
 * ordinary text to CommonMark, so escaping them is not wrong — but Obsidian reads the result as
 * literal text, so a BloomMD save silently destroys every wiki link and checkbox in the vault. For
 * a tool whose whole claim is that the Markdown file stays yours, that is the worst possible bug.
 */
const STRINGIFY_OPTIONS = {
  bullet: "-",
  fences: true,
  rule: "-",
  emphasis: "_",
  strong: "*",
  // `[` is safe to leave alone: a bracket that does not form a link is literal text either way.
  handlers: {},
} as const;

/** Undoes escaping that remark adds to text which was already unambiguous. */
function unescapeObsidianSyntax(markdown: string): string {
  return markdown
    // `\[\[Page]]` → `[[Page]]`, including the embed form `!\[\[Page]]`.
    .replace(/\\\[\\\[/g, "[[")
    // `- \[ ] task` → `- [ ] task`, only at the start of a list item so prose is untouched.
    .replace(/^(\s*[-*+]\s+)\\\[( |x|X)\\?\]/gm, "$1[$2]")
    // `> \[!NOTE]` → `> [!NOTE]`, the Obsidian callout marker.
    .replace(/^(\s*>\s*)\\\[!/gm, "$1[!");
}

function serializeContent(nodes: Content[]): string {
  if (nodes.length === 0) return "";

  const tree: Root = { type: "root", children: nodes };
  const result = unified().use(remarkStringify, STRINGIFY_OPTIONS).stringify(tree);
  return unescapeObsidianSyntax(result).trim();
}

export function parseFile(filePath: string, raw: string): MindMapDocument {
  const { data, content } = parseFrontmatter(raw);
  const frontmatter = normalizeFrontmatter(data, filePath);

  const ast = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .parse(content) as Root;

  const sourceLines = content.split(/\r?\n/);
  const nodeMap = new Map<string, MindMapNode>();
  const seenNodeIds = new Set<string>();
  const parentStack: MindMapNode[] = [];
  let currentContent: Content[] = [];
  let currentNode: MindMapNode | null = null;
  let rootId = "";
  let preamble = "";

  function flushContent() {
    if (currentNode) {
      currentNode.content = serializeContent(currentContent);
    }
    currentContent = [];
  }

  for (const child of ast.children) {
    if (child.type === "heading") {
      if (currentNode) {
        flushContent();
      } else {
        preamble = serializeContent(currentContent);
        currentContent = [];
      }

      const level = child.depth;
      const title = extractRawTitle(child, sourceLines);
      const persistedId = extractPersistedNodeId(child);
      const metadata = extractNodeMetadata(child);
      const id = persistedId && !seenNodeIds.has(persistedId) ? persistedId : generateId();
      seenNodeIds.add(id);

      // Walk up the parent stack to find the correct parent for this level
      while (parentStack.length > 0) {
        const top = parentStack[parentStack.length - 1]!;
        if (top.level < level) break;
        parentStack.pop();
      }

      const parentId =
        parentStack.length > 0
          ? parentStack[parentStack.length - 1]!.id
          : null;

      const collapsed =
        frontmatter.layout?.collapsed?.includes(id) ?? false;

      const node: MindMapNode = {
        id,
        parentId,
        level,
        title,
        content: "",
        children: [],
        ...(collapsed ? { collapsed } : {}),
        ...(metadata ? { metadata } : {}),
      };

      nodeMap.set(id, node);

      if (parentId) {
        nodeMap.get(parentId)!.children.push(id);
      }

      if (!rootId) {
        rootId = id;
      }

      parentStack.push(node);
      currentNode = node;
    } else if (child.type !== "yaml") {
      currentContent.push(child);
    }
  }

  flushContent();

  // If there's no heading at all, create a synthetic root
  if (!rootId) {
    const id = generateId();
    const node: MindMapNode = {
      id,
      parentId: null,
      level: 1,
      title: frontmatter.title || "Untitled",
      content: serializeContent(
        ast.children.filter((c): c is Exclude<Content, { type: "yaml" }> => c.type !== "yaml")
      ),
      children: [],
    };
    nodeMap.set(id, node);
    seenNodeIds.add(id);
    rootId = id;
  }

  return {
    filePath,
    frontmatter,
    nodes: nodeMap,
    rootId,
    ...(preamble ? { preamble } : {}),
    rawMarkdown: raw,
  };
}

export function serializeToMarkdown(doc: MindMapDocument): string {
  const lines: string[] = [];

  if (doc.preamble) {
    lines.push(doc.preamble);
  }

  function writeNode(nodeId: string) {
    const node = doc.nodes.get(nodeId);
    if (!node) return;

    // Clamped defensively: a level beyond six would serialize to text instead of a heading and the
    // node would silently disappear on the next parse. Flattening is recoverable, deleting is not.
    const prefix = "#".repeat(Math.min(Math.max(node.level, 1), MAX_HEADING_LEVEL));
    const metadata = node.metadata
      ? ` <!-- bloommd:meta=${JSON.stringify(node.metadata).replace(/-->/g, "--\\u003e")} -->`
      : "";
    lines.push(`${prefix} ${node.title} <!-- bloommd:id=${node.id} -->${metadata}`);

    if (node.content) {
      lines.push("");
      lines.push(node.content);
    }

    for (const childId of node.children) {
      lines.push("");
      writeNode(childId);
    }
  }

  const topLevelIds = Array.from(doc.nodes.values())
    .filter((node) => node.parentId === null)
    .map((node) => node.id);

  for (const nodeId of topLevelIds) {
    if (lines.length > 0) lines.push("");
    writeNode(nodeId);
  }

  const body = lines.join("\n") + "\n";

  // Update the timestamp
  const frontmatter = {
    ...doc.frontmatter,
    updated: new Date().toISOString(),
  };

  return stringifyFrontmatter(body, frontmatter);
}
