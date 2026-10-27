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
import { parseFrontmatter } from "./frontmatter";

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

/** An input names a node id that is not in the map (404 on the node route, 400 on the batch route). */
export class KnowledgeNodeNotFoundError extends KnowledgeInputError {
  constructor(readonly nodeId: string) {
    super(`Node "${nodeId}" does not exist in this map.`);
    this.name = "KnowledgeNodeNotFoundError";
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

/** Fields a partial node change may set; `id`, `ref` and `parent` belong to the batch operations. */
export const KNOWLEDGE_NODE_PATCH_FIELDS: readonly string[] = [...NODE_STRING_FIELDS.filter((field) => field !== "id" && field !== "ref" && field !== "parent"), "relations", "children"];
const NODE_PATCH_FIELDS = new Set<string>(KNOWLEDGE_NODE_PATCH_FIELDS);

/**
 * A partial change of one existing node as node operations: the node itself (`id` = `nodeId`, only
 * the fields given) followed by new children. `applyKnowledgeNodes` appends them at the end of the
 * node, unless a child names another `parent` (a `ref` of an earlier child). Everything goes through
 * `parseKnowledgeNodeInputs`, so the rules are those of the batch route. Throws `KnowledgeInputError`.
 */
export function parseKnowledgeNodePatch(value: unknown, nodeId: string): KnowledgeNodeInput[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new KnowledgeInputError("The node change must be an object.");
  const { children, ...fields } = value as Record<string, unknown>;
  const unknown = Object.keys(fields).find((key) => !NODE_PATCH_FIELDS.has(key));
  if (unknown) throw new KnowledgeInputError(`The node change has an unknown field "${unknown}".`);
  if (children !== undefined && !Array.isArray(children)) throw new KnowledgeInputError("children must be an array of new nodes.");
  const newChildren: unknown[] = children ?? [];
  newChildren.forEach((child, index) => {
    if (child && typeof child === "object" && !Array.isArray(child) && "id" in child) throw new KnowledgeInputError(`children[${index}] must be a new node without an id.`);
  });
  if (Object.keys(fields).length === 0 && newChildren.length === 0) throw new KnowledgeInputError("Give at least one field to change or children to add.");
  const [self, ...created] = parseKnowledgeNodeInputs([{ ...fields, id: nodeId }, ...newChildren]);
  return [self!, ...created.map((child) => ({ ...child, parent: child.parent ?? nodeId }))];
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

/** One node of a map with its place in the tree: parent, child ids and relations. */
export interface KnowledgeNodeDetail extends KnowledgeNodeView {
  parentTitle: string | null;
  childIds: string[];
  relations: NonNullable<MarkdownNodeMetadata["relations"]>;
}

/** A single node by id; an unknown id is a `KnowledgeNodeNotFoundError`. */
export function knowledgeNodeDetail(markdown: string, nodeId: string): KnowledgeNodeDetail {
  const { nodes } = outlineMarkdown(markdown);
  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new KnowledgeNodeNotFoundError(nodeId);
  return {
    ...node,
    parentTitle: nodes.find((entry) => entry.id === node.parentId)?.title ?? null,
    childIds: nodes.filter((entry) => entry.parentId === node.id).map((entry) => entry.id),
    relations: node.metadata?.relations ?? [],
  };
}

/** The node a 1-based line of the file belongs to (the last heading above it); null in the frontmatter or above the first heading. */
export function knowledgeNodeAtLine(markdown: string, line: number): { id: string; title: string } | null {
  let owner: MarkdownHeadingNode | null = null;
  for (const node of flattenHeadings(parseHeadingTree(markdown))) {
    if (node.startLine <= line - 1 && (!owner || node.startLine > owner.startLine)) owner = node;
  }
  return owner ? { id: owner.id, title: owner.title } : null;
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
      if (!findHeading(parseHeadingTree(next), id)) throw new KnowledgeNodeNotFoundError(input.id);
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

/** Lifecycle of a learning (`docs/LEARNINGS.md`); the frontmatter field `status`. */
export const KNOWLEDGE_STATUSES = ["neu", "bestätigt", "veraltet", "ersetzt"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/** Maps with one of these statuses are left out of the default search. */
const RETIRED_STATUSES = new Set<string>(["veraltet", "ersetzt"]);

const MAX_SCOPE_LENGTH = 300;
const MAX_REPLACED_BY_LENGTH = 300;
const MAX_VERIFIED_BY_LENGTH = 120;

/** Trust and lifecycle fields an agent may write into a map's frontmatter. */
export interface KnowledgeFrontmatterInput {
  status?: KnowledgeStatus;
  /** Date `YYYY-MM-DD` from which the map is to be checked again. */
  stale_after?: string;
  /** One sign-off; appended to the existing `verified` list, never replacing it. */
  verified?: { by: string; at: string };
  scope?: string;
  /** Path of the successor; only together with `status: ersetzt`. */
  replaced_by?: string;
}

/** A real calendar day: `2026-02-30` has the right shape but does not exist. */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Line breaks become spaces, so a value stays on its one frontmatter line. */
function frontmatterText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new KnowledgeInputError(`${field} must be a string.`);
  const text = value.replace(/[\r\n\u0085\u2028\u2029]+/g, " ").trim();
  if (!text) throw new KnowledgeInputError(`${field} must not be empty.`);
  if (text.length > max) throw new KnowledgeInputError(`${field} is too long (at most ${max} characters).`);
  return text;
}

function frontmatterDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !isRealDate(value)) throw new KnowledgeInputError(`${field} must be a real date YYYY-MM-DD.`);
  return value;
}

/**
 * Validates the optional trust fields of a tool call (`status`, `stale_after`, `verified`, `scope`,
 * `replaced_by`). Returns undefined when none is given. Throws `KnowledgeInputError`.
 */
export function parseKnowledgeFrontmatterInput(args: Record<string, unknown>): KnowledgeFrontmatterInput | undefined {
  const input: KnowledgeFrontmatterInput = {};
  if (args.status !== undefined) {
    if (typeof args.status !== "string" || !(KNOWLEDGE_STATUSES as readonly string[]).includes(args.status)) {
      throw new KnowledgeInputError(`status must be one of ${KNOWLEDGE_STATUSES.join(", ")}.`);
    }
    input.status = args.status as KnowledgeStatus;
  }
  if (args.stale_after !== undefined) input.stale_after = frontmatterDate(args.stale_after, "stale_after");
  if (args.verified !== undefined) {
    const verified = args.verified;
    if (!verified || typeof verified !== "object" || Array.isArray(verified)) throw new KnowledgeInputError("verified must be an object {by, at}.");
    const record = verified as Record<string, unknown>;
    const unknown = Object.keys(record).find((key) => key !== "by" && key !== "at");
    if (unknown) throw new KnowledgeInputError(`verified has an unknown field "${unknown}"; use by and at.`);
    input.verified = { by: frontmatterText(record.by, "verified.by", MAX_VERIFIED_BY_LENGTH), at: frontmatterDate(record.at, "verified.at") };
  }
  if (args.scope !== undefined) input.scope = frontmatterText(args.scope, "scope", MAX_SCOPE_LENGTH);
  if (args.replaced_by !== undefined) {
    if (input.status !== "ersetzt") throw new KnowledgeInputError("replaced_by is only allowed together with status ersetzt.");
    input.replaced_by = frontmatterText(args.replaced_by, "replaced_by", MAX_REPLACED_BY_LENGTH);
  }
  return Object.keys(input).length > 0 ? input : undefined;
}

const FRONTMATTER_BLOCK_RE = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$))/;
const FRONTMATTER_KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:(?:[ \t]|$)/;

/** The `verified` entries already in the map, as they are; anything that is not a list of objects is refused. */
function existingVerified(markdown: string): Array<Record<string, unknown>> {
  let value: unknown;
  try {
    value = parseFrontmatter(markdown).data.verified;
  } catch {
    throw new KnowledgeInputError("The frontmatter of this map is not valid YAML; fix it before adding a verification.");
  }
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new KnowledgeInputError("The existing verified field is not a list of {by, at} entries; fix it before adding one.");
    }
    return entry as Record<string, unknown>;
  });
}

function verifiedLines(entries: Array<Record<string, unknown>>): string[] {
  const lines = ["verified:"];
  for (const entry of entries) {
    const keys = Object.keys(entry);
    if (keys.length === 0) lines.push("  - {}");
    keys.forEach((key, index) => lines.push(`${index === 0 ? "  - " : "    "}${/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : yamlString(key)}: ${JSON.stringify(entry[key])}`));
  }
  return lines;
}

/**
 * Sets trust fields in the frontmatter and leaves every other line as it is: a field that exists
 * is replaced in place (with its continuation lines), a new one is added at the end of the block,
 * and a map without frontmatter gets one. Values are written through `yamlString`, so they cannot
 * add YAML of their own. `verified` keeps the existing entries and appends the new one.
 * Returns the changed field names in the order written.
 */
export function applyKnowledgeFrontmatter(markdown: string, input: KnowledgeFrontmatterInput): { markdown: string; fields: string[] } {
  const edits: Array<{ key: string; lines: string[] }> = [];
  if (input.status !== undefined) edits.push({ key: "status", lines: [`status: ${yamlString(input.status)}`] });
  if (input.stale_after !== undefined) edits.push({ key: "stale_after", lines: [`stale_after: ${yamlString(input.stale_after)}`] });
  if (input.scope !== undefined) edits.push({ key: "scope", lines: [`scope: ${yamlString(input.scope)}`] });
  if (input.replaced_by !== undefined) edits.push({ key: "replaced_by", lines: [`replaced_by: ${yamlString(input.replaced_by)}`] });
  if (input.verified !== undefined) {
    edits.push({ key: "verified", lines: verifiedLines([...existingVerified(markdown), { by: input.verified.by, at: input.verified.at }]) });
  }
  if (edits.length === 0) return { markdown, fields: [] };

  const match = FRONTMATTER_BLOCK_RE.exec(markdown);
  const eol = match ? (/\r\n/.test(match[1]!) ? "\r\n" : "\n") : "\n";
  const lines = match ? match[2]!.split(/\r?\n/) : [];
  for (const { key, lines: replacement } of edits) {
    const start = lines.findIndex((line) => FRONTMATTER_KEY_RE.exec(line)?.[1] === key);
    if (start < 0) {
      let end = lines.length;
      while (end > 0 && lines[end - 1]!.trim() === "") end -= 1;
      lines.splice(end, 0, ...replacement);
      continue;
    }
    // The key's own value continues on indented lines, list items and blank lines.
    let end = start + 1;
    while (end < lines.length && (lines[end]!.trim() === "" || /^[ \t]/.test(lines[end]!) || /^-(?:[ \t]|$)/.test(lines[end]!))) end += 1;
    while (end > start + 1 && lines[end - 1]!.trim() === "") end -= 1;
    lines.splice(start, end - start, ...replacement);
  }
  const fields = edits.map((edit) => edit.key);
  if (!match) return { markdown: `---${eol}${lines.join(eol)}${eol}---${eol}${markdown}`, fields };
  return { markdown: `${match[1]}${lines.join(eol)}${match[3]}${markdown.slice(match[0].length)}`, fields };
}

/** What the frontmatter says about a map's trust; everything optional is left out when missing. */
export interface KnowledgeFrontmatter {
  title?: string;
  status?: string;
  scope?: string;
  source?: string;
  stale_after?: string;
  replaced_by?: string;
  created?: string;
  tags: string[];
  verified: Array<{ by: string; at: string }>;
}

function frontmatterString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Reads the frontmatter leniently: invalid YAML or odd types give a map without these fields, never an error. */
export function readKnowledgeFrontmatter(markdown: string): KnowledgeFrontmatter {
  let data: Record<string, unknown> = {};
  try {
    data = parseFrontmatter(markdown).data;
  } catch {
    // A map with broken frontmatter is still searchable by its nodes.
  }
  const rawTags = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? data.tags.split(/[,\s]+/) : [];
  const tags = rawTags.flatMap((tag) => (typeof tag === "string" && tag.trim().replace(/^#/, "") ? [tag.trim().replace(/^#/, "")] : []));
  const rawVerified = Array.isArray(data.verified) ? data.verified : data.verified ? [data.verified] : [];
  const verified = rawVerified.flatMap((entry) => {
    const record = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
    const by = frontmatterString(record.by);
    const at = frontmatterString(record.at);
    return by && at ? [{ by, at }] : [];
  });
  const field = <K extends keyof KnowledgeFrontmatter>(key: K, value: unknown): Partial<KnowledgeFrontmatter> => {
    const text = frontmatterString(value);
    return text ? ({ [key]: text } as Partial<KnowledgeFrontmatter>) : {};
  };
  return {
    ...field("title", data.title),
    ...field("status", data.status),
    ...field("scope", data.scope),
    ...field("source", data.source),
    ...field("stale_after", data.stale_after),
    ...field("replaced_by", data.replaced_by),
    ...field("created", data.created),
    tags,
    verified,
  };
}

/** Where a query matches in the frontmatter (tags, scope, source, status, title), or null. */
export function searchKnowledgeFrontmatter(frontmatter: KnowledgeFrontmatter, query: string): { field: "tags" | "scope" | "source" | "status" | "title"; snippet: string } | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const tag = frontmatter.tags.find((entry) => entry.toLowerCase().includes(needle));
  if (tag) return { field: "tags", snippet: `tags: ${tag}` };
  for (const field of ["scope", "source", "status", "title"] as const) {
    const value = frontmatter[field];
    if (value?.toLowerCase().includes(needle)) return { field, snippet: `${field}: ${value}`.slice(0, 160) };
  }
  return null;
}

export interface KnowledgeFilter {
  /** Exact status, case-insensitive. */
  status?: string;
  /** Exact tag, case-insensitive, with or without a leading `#`. */
  tag?: string;
  /** Substring of `scope`, case-insensitive. */
  scope?: string;
}

export function matchesKnowledgeFilter(frontmatter: KnowledgeFrontmatter, filter: KnowledgeFilter): boolean {
  if (filter.status !== undefined && frontmatter.status?.toLowerCase() !== filter.status.trim().toLowerCase()) return false;
  if (filter.tag !== undefined) {
    const tag = filter.tag.trim().replace(/^#/, "").toLowerCase();
    if (!frontmatter.tags.some((entry) => entry.toLowerCase() === tag)) return false;
  }
  if (filter.scope !== undefined && !frontmatter.scope?.toLowerCase().includes(filter.scope.trim().toLowerCase())) return false;
  return true;
}

export interface KnowledgeLifecycle {
  status?: string;
  stale_after?: string;
  /** `stale_after` lies before today (like the wiki lint's `expired-page`); only with `stale_after`. */
  expired?: boolean;
  /** Days since `created`, else since the latest `verified.at`; only when one of them is a date. */
  ageDays?: number;
}

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function knowledgeDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Status, expiry and age of a map as of `today` (`YYYY-MM-DD`). */
export function knowledgeLifecycle(frontmatter: KnowledgeFrontmatter, today: string): KnowledgeLifecycle {
  const staleAfter = frontmatter.stale_after?.match(DATE_PREFIX_RE)?.[0];
  const verifiedAt = frontmatter.verified.flatMap((entry) => entry.at.match(DATE_PREFIX_RE)?.[0] ?? []).sort().pop();
  const since = frontmatter.created?.match(DATE_PREFIX_RE)?.[0] ?? verifiedAt;
  return {
    ...(frontmatter.status ? { status: frontmatter.status } : {}),
    ...(staleAfter ? { stale_after: staleAfter, expired: staleAfter < today } : {}),
    ...(since ? { ageDays: Math.max(0, knowledgeDaysBetween(since, today)) } : {}),
  };
}

/** Default search leaves out maps that are expired or marked `veraltet`/`ersetzt`. */
export function isKnowledgeRetired(lifecycle: KnowledgeLifecycle): boolean {
  return lifecycle.expired === true || (lifecycle.status !== undefined && RETIRED_STATUSES.has(lifecycle.status.toLowerCase()));
}
