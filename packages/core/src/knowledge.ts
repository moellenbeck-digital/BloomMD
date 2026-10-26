/**
 * Node-level knowledge operations for agents: read a map as an outline and create or update single
 * nodes by id, so an agent can file notes into BloomMD without rewriting whole documents.
 *
 * Works on Markdown strings only; storage (vault folder, BloomMD cloud) lives with the caller.
 */
import {
  addChildHeading,
  ensureHeadingIds,
  findHeading,
  flattenHeadings,
  parseHeadingTree,
  renameHeading,
  updateHeadingContent,
  updateHeadingMetadata,
  type MarkdownHeadingNode,
  type MarkdownNodeKind,
  type MarkdownNodeMetadata,
} from "./obsidian-markdown";
import type { AgentAccess } from "./agent-ledger";

/** What an agent may do in an area: read only, write proposals for review, or write directly. */
export type KnowledgeAccess = AgentAccess;

export interface KnowledgeNodeInput {
  /** Existing node to update. */
  id?: string;
  /** Agent-chosen handle for a node created in this call, so later inputs can refer to it. */
  ref?: string;
  /** Parent of a new node: an existing id or a `ref` from this call. Defaults to the root. */
  parent?: string;
  title?: string;
  content?: string;
  /** `append` adds below existing content (default for updates), `replace` overwrites it. */
  contentMode?: "append" | "replace";
  kind?: MarkdownNodeKind;
  status?: "open" | "in_progress" | "done";
  decision?: "proposed" | "accepted" | "rejected";
  due?: string;
  assignee?: string;
  note?: string;
  citation?: string;
  url?: string;
  /** Concept-map connections to other nodes of the same map (ids or refs). */
  relations?: Array<{ target: string; label?: string }>;
}

export interface KnowledgeNodeView {
  id: string;
  parentId: string | null;
  level: number;
  title: string;
  content: string;
  metadata?: MarkdownNodeMetadata;
}

export interface KnowledgeOutline {
  title: string;
  rootId: string | null;
  nodes: KnowledgeNodeView[];
}

export interface KnowledgeChange {
  markdown: string;
  /** Every `ref` and `id` of the input mapped to the node id it ended up as. */
  ids: Record<string, string>;
  created: string[];
  updated: string[];
}

export const KNOWLEDGE_MAX_NODES_PER_CALL = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Agent input that is invalid on its own or against the document (HTTP 400, not a server error). */
export class KnowledgeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeInputError";
  }
}

// Errors the Markdown helpers raise for bad input; they predate `KnowledgeInputError`.
const INPUT_ERROR_MESSAGE = /does not exist|Unknown node|needs a title|YYYY-MM-DD|used twice|six heading levels|either an id|At most|one non-empty line/;

export function isKnowledgeInputError(error: unknown): error is Error {
  return error instanceof KnowledgeInputError || (error instanceof Error && INPUT_ERROR_MESSAGE.test(error.message));
}

const BLOOM_COMMENT_RE = /<!--\s*bloommd:/i;

/** A node or map title: one line, without BloomMD's own id/metadata comments. */
export function assertKnowledgeTitle(title: string): void {
  if (/[\r\n]/.test(title)) throw new KnowledgeInputError("A title must be a single line.");
  if (BLOOM_COMMENT_RE.test(title)) throw new KnowledgeInputError("A title must not contain BloomMD comments (<!-- bloommd: … -->).");
}

/**
 * Node content must stay inside its node: no heading lines (they would become nodes of their
 * own), no code fence or HTML block left open (it would swallow the following nodes) and no
 * BloomMD comments. Checked with the real heading parser between two sentinel headings.
 */
export function assertKnowledgeContent(content: string): void {
  if (BLOOM_COMMENT_RE.test(content)) throw new KnowledgeInputError("Content must not contain BloomMD comments (<!-- bloommd: … -->).");
  const headings = parseHeadingTree(`# Before\n\n${content.replace(/\r\n?/g, "\n")}\n\n# After\n`);
  if (headings.length === 2 && headings[0]!.children.length === 0 && headings[1]!.title === "After") return;
  if (headings[headings.length - 1]?.title !== "After") {
    throw new KnowledgeInputError("Content leaves a code fence (``` or ~~~), an HTML comment or an HTML block open; close it.");
  }
  throw new KnowledgeInputError("Content must not contain heading lines (\"# …\" or text underlined with === / ---); create child nodes instead.");
}

/** Checks the parts of an input that do not depend on the document. */
export function assertKnowledgeNodeInput(input: KnowledgeNodeInput): void {
  if (input.title !== undefined) assertKnowledgeTitle(input.title);
  if (input.content !== undefined) assertKnowledgeContent(input.content);
}

const NODE_KINDS = new Set<string>(["topic", "task", "decision", "source", "web", "file", "pdf", "portal"]);
const NODE_ENUMS: Partial<Record<keyof KnowledgeNodeInput, Set<string>>> = {
  kind: NODE_KINDS,
  status: new Set(["open", "in_progress", "done"]),
  decision: new Set(["proposed", "accepted", "rejected"]),
  contentMode: new Set(["append", "replace"]),
};
const NODE_STRING_FIELDS = ["id", "ref", "parent", "title", "content", "contentMode", "kind", "status", "decision", "due", "assignee", "note", "citation", "url"] as const;
const NODE_FIELDS = new Set<string>([...NODE_STRING_FIELDS, "relations"]);

/**
 * The one strict parser for node operations from outside (MCP tool calls, REST, sync server):
 * known fields only, strings with length limits, enum values, dates, relations, and the content
 * rules of `assertKnowledgeNodeInput`. Throws `KnowledgeInputError`.
 */
export function parseKnowledgeNodeInputs(value: unknown, options: { minItems?: number } = {}): KnowledgeNodeInput[] {
  const minItems = options.minItems ?? 1;
  if (!Array.isArray(value) || value.length < minItems || value.length > KNOWLEDGE_MAX_NODES_PER_CALL) {
    throw new KnowledgeInputError(`nodes must be an array of ${minItems} to ${KNOWLEDGE_MAX_NODES_PER_CALL} node operations.`);
  }
  return value.map((entry, index) => {
    const where = `nodes[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new KnowledgeInputError(`${where} must be an object.`);
    const record = entry as Record<string, unknown>;
    const unknown = Object.keys(record).find((key) => !NODE_FIELDS.has(key));
    if (unknown) throw new KnowledgeInputError(`${where} has an unknown field "${unknown}".`);
    const node: Record<string, unknown> = {};
    for (const field of NODE_STRING_FIELDS) {
      const fieldValue = record[field];
      if (fieldValue === undefined) continue;
      if (typeof fieldValue !== "string") throw new KnowledgeInputError(`${where}.${field} must be a string.`);
      if (fieldValue.length > (field === "content" ? 64 * 1024 : 500)) throw new KnowledgeInputError(`${where}.${field} is too long.`);
      const allowed = NODE_ENUMS[field];
      if (allowed && !allowed.has(fieldValue)) throw new KnowledgeInputError(`${where}.${field} must be one of ${[...allowed].join(", ")}.`);
      node[field] = fieldValue;
    }
    if (typeof node.due === "string" && node.due !== "" && !DATE_RE.test(node.due)) throw new KnowledgeInputError(`Due date must be YYYY-MM-DD, got "${node.due}".`);
    if (record.relations !== undefined) {
      if (!Array.isArray(record.relations) || record.relations.length > 50) throw new KnowledgeInputError(`${where}.relations must be an array of at most 50 relations.`);
      node.relations = record.relations.map((relation: unknown) => {
        const { target, label, ...rest } = (relation && typeof relation === "object" && !Array.isArray(relation) ? relation : { target: undefined }) as Record<string, unknown>;
        if (typeof target !== "string" || !target || target.length > 500 || (label !== undefined && typeof label !== "string") || Object.keys(rest).length > 0) {
          throw new KnowledgeInputError(`${where}.relations entries need a string target and an optional string label.`);
        }
        return { target, ...(typeof label === "string" ? { label: label.slice(0, 120) } : {}) };
      });
    }
    const input = node as KnowledgeNodeInput;
    assertKnowledgeNodeInput(input);
    return input;
  });
}

/** Stable short fingerprint of a document, used as an optimistic version (shared with the agent ledger). */
export { knowledgeVersion } from "./agent-ledger";

export function outlineMarkdown(markdown: string): KnowledgeOutline {
  const roots = parseHeadingTree(markdown);
  const nodes: KnowledgeNodeView[] = [];
  const walk = (list: MarkdownHeadingNode[], parentId: string | null) => {
    for (const node of list) {
      nodes.push({
        id: node.id,
        parentId,
        level: node.level,
        title: node.title,
        content: node.content.trim(),
        ...(node.metadata ? { metadata: node.metadata } : {}),
      });
      walk(node.children, node.id);
    }
  };
  walk(roots, null);
  return { title: roots[0]?.title ?? "", rootId: roots[0]?.id ?? null, nodes };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

const RESERVED_FRONTMATTER = new Set(["title", "created", "area", "tags", "source"]);

/**
 * A new, empty map: frontmatter plus the root heading. `frontmatter` adds string fields from a
 * template (e.g. `type`, `status`, `stale_after`); it cannot replace the fields written here.
 */
export function newKnowledgeMap(options: { title: string; area?: string; tags?: string[]; source?: string; date?: string; frontmatter?: Record<string, string> }): string {
  assertKnowledgeTitle(options.title);
  const title = options.title.trim();
  if (!title) throw new KnowledgeInputError("A map needs a title.");
  const tags = [...new Set([...(options.area ? [`bereich/${slugTag(options.area)}`] : []), ...(options.tags ?? []).map(slugTag)].filter(Boolean))];
  const lines = ["---", `title: ${yamlString(title)}`];
  if (options.date) lines.push(`created: ${options.date}`);
  if (options.area) lines.push(`area: ${yamlString(options.area)}`);
  if (tags.length > 0) lines.push(`tags: [${tags.map(yamlString).join(", ")}]`);
  if (options.source) lines.push(`source: ${yamlString(options.source.replace(/[\r\n]+/g, " ").slice(0, 300))}`);
  for (const [key, value] of Object.entries(options.frontmatter ?? {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || RESERVED_FRONTMATTER.has(key)) throw new KnowledgeInputError(`Frontmatter field "${key}" is not allowed.`);
    lines.push(`${key}: ${yamlString(value)}`);
  }
  lines.push("---", "", `# ${title}`, "");
  return ensureHeadingIds(lines.join("\n")).markdown;
}

function slugTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}/_-]/gu, "");
}

/** The node metadata after applying an input's metadata fields to the current metadata. */
export function knowledgeMetadata(input: KnowledgeNodeInput, current: MarkdownNodeMetadata | undefined, resolve: (handle: string) => string): MarkdownNodeMetadata | undefined {
  const touched = input.kind ?? input.status ?? input.decision ?? input.due ?? input.assignee ?? input.note ?? input.citation ?? input.url ?? input.relations;
  if (touched === undefined) return current;
  if (input.due !== undefined && input.due !== "" && !DATE_RE.test(input.due)) throw new Error(`Due date must be YYYY-MM-DD, got "${input.due}".`);
  const inferredKind: MarkdownNodeKind = input.kind
    ?? (input.decision ? "decision" : input.status || input.due || input.assignee ? "task" : current?.kind ?? "topic");
  const relations = input.relations
    ? [
        ...(current?.relations ?? []).filter((existing) => !input.relations!.some((next) => resolve(next.target) === existing.target)),
        ...input.relations.map((relation) => ({ target: resolve(relation.target), ...(relation.label?.trim() ? { label: relation.label.trim() } : {}) })),
      ]
    : current?.relations;
  const merged: MarkdownNodeMetadata = {
    ...current,
    kind: inferredKind,
    ...(input.status ? { status: input.status } : {}),
    ...(input.decision ? { decision: input.decision } : {}),
    ...(input.due ? { due: input.due } : {}),
    ...(input.assignee?.trim() ? { assignee: input.assignee.trim().slice(0, 120) } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.citation?.trim() ? { citation: input.citation.trim() } : {}),
    ...(input.url?.trim() ? { url: input.url.trim() } : {}),
    ...(relations?.length ? { relations } : {}),
  };
  if (!relations?.length) delete merged.relations;
  return merged;
}

/**
 * Creates and updates nodes in order. New nodes are appended as the last child of their parent;
 * existing nodes are updated in place. Throws without changing anything when an input is invalid.
 */
export function applyKnowledgeNodes(markdown: string, inputs: KnowledgeNodeInput[]): KnowledgeChange {
  if (inputs.length > KNOWLEDGE_MAX_NODES_PER_CALL) throw new KnowledgeInputError(`At most ${KNOWLEDGE_MAX_NODES_PER_CALL} nodes per call.`);
  // Validate everything first, so bad content never lands half-applied.
  inputs.forEach(assertKnowledgeNodeInput);
  let next = ensureHeadingIds(markdown).markdown;
  const ids: Record<string, string> = {};
  // A note without stored ids is outlined with `heading-<line>` ids; they turn into stored ids now,
  // so an agent can use ids from bloommd_get_map on any note.
  const stored = new Map(flattenHeadings(parseHeadingTree(next)).map((node) => [node.startLine, node.id]));
  for (const node of flattenHeadings(parseHeadingTree(markdown))) {
    const persisted = stored.get(node.startLine);
    if (persisted && persisted !== node.id) ids[node.id] = persisted;
  }
  const created: string[] = [];
  const updated: string[] = [];
  const inputIds: string[] = [];
  const resolve = (handle: string): string => {
    if (ids[handle]) return ids[handle];
    if (findHeading(parseHeadingTree(next), handle)) return handle;
    throw new Error(`Unknown node "${handle}": use an existing id or a ref created earlier in this call.`);
  };

  for (const input of inputs) {
    if (input.id && input.ref) throw new Error("A node input has either an id (update) or a ref (create), not both.");
    let id: string;
    if (input.id) {
      id = ids[input.id] ?? input.id;
      if (!findHeading(parseHeadingTree(next), id)) throw new Error(`Node "${input.id}" does not exist in this map.`);
      if (input.title?.trim()) next = renameHeading(next, id, input.title);
      updated.push(id);
    } else {
      const title = input.title?.trim();
      if (!title) throw new KnowledgeInputError("A new node needs a title.");
      const roots = parseHeadingTree(next);
      const parentId = input.parent ? resolve(input.parent) : roots[0]?.id;
      if (!parentId) throw new Error("The map has no root heading to add nodes to.");
      next = addChildHeading(next, parentId, title);
      const parent = findHeading(parseHeadingTree(next), parentId);
      const child = parent?.children[parent.children.length - 1];
      if (!child) throw new Error("The new node could not be created.");
      id = child.id;
      created.push(id);
      if (input.ref) {
        if (ids[input.ref]) throw new Error(`The ref "${input.ref}" is used twice.`);
        ids[input.ref] = id;
      }
    }
    if (input.id) ids[input.id] = id;
    inputIds.push(id);

    if (input.content !== undefined) {
      const current = findHeading(parseHeadingTree(next), id)?.content.trim() ?? "";
      const mode = input.contentMode ?? (input.id ? "append" : "replace");
      const content = mode === "append" && current ? `${current}\n\n${input.content.trim()}` : input.content.trim();
      next = updateHeadingContent(next, id, content);
    }
  }

  // Metadata last, so relations can point at nodes created later in the same call.
  inputs.forEach((input, index) => {
    const id = inputIds[index]!;
    const current = findHeading(parseHeadingTree(next), id)?.metadata;
    const metadata = knowledgeMetadata(input, current, resolve);
    if (JSON.stringify(metadata ?? null) !== JSON.stringify(current ?? null)) next = updateHeadingMetadata(next, id, metadata);
  });

  return { markdown: next, ids, created, updated };
}

export interface KnowledgeTask {
  nodeId: string;
  title: string;
  status: "open" | "in_progress" | "done";
  due?: string;
  assignee?: string;
  /** Titles from the root down to the parent, for context. */
  context: string[];
}

/** Open tasks (status not done) of a map, soonest due first. */
export function knowledgeTasks(markdown: string, includeDone = false): KnowledgeTask[] {
  const roots = parseHeadingTree(markdown);
  const tasks: KnowledgeTask[] = [];
  const walk = (list: MarkdownHeadingNode[], trail: string[]) => {
    for (const node of list) {
      const meta = node.metadata;
      if (meta?.kind === "task" && (includeDone || meta.status !== "done")) {
        tasks.push({
          nodeId: node.id,
          title: node.title,
          status: meta.status ?? "open",
          ...(meta.due ? { due: meta.due } : {}),
          ...(meta.assignee ? { assignee: meta.assignee } : {}),
          context: trail,
        });
      }
      walk(node.children, [...trail, node.title]);
    }
  };
  walk(roots, []);
  return tasks.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export interface KnowledgeDecision {
  nodeId: string;
  title: string;
  decision: "proposed" | "accepted" | "rejected";
  assignee?: string;
  context: string[];
}

export function knowledgeDecisions(markdown: string): KnowledgeDecision[] {
  return flattenWithTrail(parseHeadingTree(markdown)).flatMap(({ node, trail }) => node.metadata?.kind === "decision"
    ? [{ nodeId: node.id, title: node.title, decision: node.metadata.decision ?? "proposed", ...(node.metadata.assignee ? { assignee: node.metadata.assignee } : {}), context: trail }]
    : []);
}

function flattenWithTrail(list: MarkdownHeadingNode[], trail: string[] = []): Array<{ node: MarkdownHeadingNode; trail: string[] }> {
  return list.flatMap((node) => [{ node, trail }, ...flattenWithTrail(node.children, [...trail, node.title])]);
}

/** Case-insensitive search over titles and content; returns matching node ids with a snippet. */
export function searchKnowledge(markdown: string, query: string, limit = 20): Array<{ nodeId: string; title: string; snippet: string }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: Array<{ nodeId: string; title: string; snippet: string }> = [];
  for (const node of flattenHeadings(parseHeadingTree(markdown))) {
    const haystack = `${node.title}\n${node.content}`;
    const index = haystack.toLowerCase().indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 60);
    hits.push({ nodeId: node.id, title: node.title, snippet: haystack.slice(start, index + needle.length + 60).replace(/\s+/g, " ").trim() });
    if (hits.length >= limit) break;
  }
  return hits;
}
