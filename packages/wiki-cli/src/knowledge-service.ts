/**
 * The agent-facing knowledge operations on top of a store: access rules per area, a change log,
 * undo, and proposals that only a person can apply (never the agent itself).
 */
import { AgentLedger, areaCovers, cloudAreaOf, vaultAreaPath, type AgentDocuments, type AgentProposal, type AgentRequest } from "@bloommd/core/agent-ledger";
import {
  applyKnowledgeFrontmatter,
  applyKnowledgeNodes,
  isKnowledgeRetired,
  KnowledgeInputError,
  knowledgeDaysBetween,
  knowledgeDecisions,
  knowledgeLifecycle,
  knowledgeNodeAtLine,
  knowledgeNodeDetail,
  knowledgeTasks,
  knowledgeVersion,
  matchesKnowledgeFilter,
  newKnowledgeMap,
  outlineMarkdown,
  parseKnowledgeNodeInputs,
  parseKnowledgeNodePatch,
  readKnowledgeFrontmatter,
  searchKnowledge,
  searchKnowledgeFrontmatter,
  type KnowledgeAccess,
  type KnowledgeFilter,
  type KnowledgeFrontmatterInput,
  type KnowledgeNodeInput,
} from "@bloommd/core/knowledge";
import { KNOWLEDGE_TEMPLATES, knowledgeTemplate, templateFrontmatter } from "@bloommd/core/knowledge-templates";
import { backlinksFor } from "@bloommd/core/workspace-search";
import { accessFor, CloudKnowledgeStore, foldName, nodeStateFiles, safeSegment, safeVaultPath, type KnowledgeStore, VaultKnowledgeStore } from "./knowledge-store";
import type { CloudChange } from "./cloud-agent";

export interface ChangeMeta {
  reason?: string;
  source?: string;
}

export interface CommitResult {
  path: string;
  mode: "written" | "proposed";
  changeId?: string;
  proposalId?: string;
  version?: string;
  created: string[];
  updated: string[];
  ids: Record<string, string>;
  /** Frontmatter fields this change set (status, stale_after, …). */
  frontmatter?: string[];
}

export interface SearchOptions extends KnowledgeFilter {
  area?: string;
  /** Also return expired maps and maps marked veraltet/ersetzt. */
  includeStale?: boolean;
  /** More tags, all of which a map must carry (in addition to `tag`); like a role plus a topic. */
  tags?: string[];
  limit?: number;
  now?: Date;
}

export interface StaleOptions {
  area?: string;
  tag?: string;
  scope?: string;
  /** Maps that expire within this many days are listed too (default 0: only expired ones). */
  days?: number;
  now?: Date;
}

export interface SearchHit {
  path: string;
  /** Empty for hits outside a node (`kind` frontmatter or map). */
  nodeId: string;
  /** `node`: text of a node; `frontmatter`: tags/scope/source/status/title; `map`: a filter matched the whole map (empty query). */
  kind: "node" | "frontmatter" | "map";
  title: string;
  snippet: string;
  field?: string;
  status?: string;
  stale_after?: string;
  expired?: boolean;
  ageDays?: number;
}

/** `ingest` takes the original text up to this many characters (Unicode code points). */
export const INGEST_MAX_TEXT_CHARS = 200_000;
/** `ingest` takes at most this many section nodes (without the template skeleton and the source node). */
export const INGEST_MAX_NODES = 150;
/** The templates `ingest` files into; `learning` has its own commands (`agent create|append`). */
export const INGEST_TEMPLATE_IDS: readonly string[] = KNOWLEDGE_TEMPLATES.filter((template) => template.id !== "learning").map((template) => template.id);
/** Ref of the source node `ingest` adds; section nodes must not use it. */
const INGEST_SOURCE_REF = "originaltext";
const INGEST_PARENT_REF = "quellen";
const SOURCE_REF_MAX = 300;
const BLOOM_COMMENT_RE = /<!--\s*bloommd:/i;

/** A title as compared for duplicates: case, punctuation and spacing do not matter. */
export const normalizeKnowledgeTitle = (title: string): string => title.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A map with the same title already exists in the target area; `path` is that map. */
export class IngestDuplicateError extends Error {
  constructor(readonly path: string, readonly title: string, readonly area: string) {
    super(`A map titled "${title}" already exists in "${area}": ${path}. Nothing was written.`);
    this.name = "IngestDuplicateError";
  }
}

export interface IngestInput extends ChangeMeta {
  /** One of `INGEST_TEMPLATE_IDS`. */
  template: string;
  title: string;
  /** Default: the template's area. */
  area?: string;
  /** The original text, filed word for word. */
  text: string;
  /** Where the original comes from: path, URL or ticket (also the `source` of the change). */
  sourceRef: string;
  /** Date of the source, `YYYY-MM-DD`; left out when unknown. */
  sourceDate?: string;
  /** Sections the agent already structured (node format of `bloommd_create_map`, parents are skeleton refs). */
  nodes?: KnowledgeNodeInput[];
}

export interface IngestResult extends CommitResult {
  area: string;
  /** Id of the `kind: source` node that holds the original text. */
  sourceNode: string;
  /** Characters of the original text (code points). */
  characters: number;
  /** Section nodes given by the agent (skeleton and source node not counted). */
  sections: number;
}

/**
 * The section nodes of an ingest from outside (JSON of the CLI, `nodes` of the MCP tool): at most
 * `INGEST_MAX_NODES`, checked before the generic node parser so the message names both numbers.
 */
export function parseIngestNodes(value: unknown): KnowledgeNodeInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new KnowledgeInputError("The sections must be an array of nodes (same format as the nodes of bloommd_create_map).");
  assertIngestNodeCount(value.length);
  return parseKnowledgeNodeInputs(value, { minItems: 0 });
}

function assertIngestNodeCount(count: number): void {
  if (count > INGEST_MAX_NODES) throw new KnowledgeInputError(`Too many sections: ${count} nodes, at most ${INGEST_MAX_NODES} are allowed (template skeleton and source node not counted). Nothing was written.`);
}

/** Calendar check for `YYYY-MM-DD` (2026-02-30 is no date). */
function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The original text as node content: in a code fence, so headings, lists and `---` lines inside a
 * transcript stay text and nothing is trimmed or rewritten. The fence is longer than any backtick
 * run of the text, so the text cannot close it.
 */
function sourceContent(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

export type Proposal = AgentProposal;

/** A proposal as the owner lists it (no document text); cloud proposals also say whether the map moved on. */
export type ProposalSummary = Omit<AgentProposal, "markdown"> & { stale?: boolean; changes?: Array<{ mark: string; id: string; title: string; level: number }> };

/** A change log entry of the server in the shape of the local log. */
function cloudLogEntry(change: CloudChange): Record<string, unknown> {
  return {
    at: change.createdAt,
    agent: change.agentName,
    target: "cloud",
    event: change.event,
    ...(change.tool ? { tool: change.tool } : {}),
    ...(change.filename ? { path: change.filename } : {}),
    area: change.area,
    changeId: change.id,
    ...(change.proposalId ? { proposalId: change.proposalId } : {}),
    ...(change.summary ? { summary: change.summary } : {}),
    ...(change.reason ? { reason: change.reason } : {}),
    ...(change.source ? { source: change.source } : {}),
    ...(change.reviewerName ? { reviewer: change.reviewerName } : {}),
    undoable: change.undoable,
  };
}

/** The most entries the server returns for the change log of a token. */
const CLOUD_LOG_MAX = 200;

const SINCE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** An ISO date (`2026-10-27`, start of that day) or date-time (`2026-10-27T08:30:00Z`; without an offset: UTC). */
export function parseKnowledgeSince(value: string): Date {
  const text = value.trim();
  const invalid = () => new KnowledgeInputError(`since must be an ISO date (2026-10-27) or date-time (2026-10-27T08:30:00Z), got "${value}".`);
  if (!SINCE_RE.test(text)) throw invalid();
  // An impossible day (2026-02-30) must not roll over into the next month.
  const [year, month, day] = text.slice(0, 10).split("-").map(Number) as [number, number, number];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw invalid();
  const parsed = new Date(text.includes("T") && !/(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? `${text}Z` : text);
  if (Number.isNaN(parsed.getTime())) throw invalid();
  return parsed;
}

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Frontmatter fields shown on every search hit: only those the map has. */
function trustFields(lifecycle: ReturnType<typeof knowledgeLifecycle>) {
  return {
    ...(lifecycle.status ? { status: lifecycle.status } : {}),
    ...(lifecycle.stale_after ? { stale_after: lifecycle.stale_after } : {}),
    ...(lifecycle.expired !== undefined ? { expired: lifecycle.expired } : {}),
    ...(lifecycle.ageDays !== undefined ? { ageDays: lifecycle.ageDays } : {}),
  };
}

/** The map's area is `filter` or lies below it ("Learnings" also finds "Learnings/dev-team"). */
function inArea(area: string, filter: string): boolean {
  return areaCovers(filter, area);
}

export class KnowledgeService {
  /** Tail of the queue per map (folded path), so read → change → write never interleaves. */
  private readonly locks = new Map<string, Promise<unknown>>();

  /** Rights, proposals, history, log and requests: the same rules as in the Obsidian plugin. */
  readonly ledger: AgentLedger;

  constructor(readonly store: KnowledgeStore, readonly agent: string) {
    this.ledger = new AgentLedger(nodeStateFiles(store.stateDir), agent, store.kind);
  }

  /** The store as the ledger sees it: missing documents are null, vault maps can be removed. */
  private get documents(): AgentDocuments {
    const store = this.store;
    return {
      read: (path) => store.read(path).catch(() => null),
      write: (path, markdown, expectedVersion) => store.write(path, markdown, expectedVersion),
      ...(store instanceof VaultKnowledgeStore ? { remove: (path: string) => store.remove(path) } : {}),
    };
  }

  /**
   * Runs `task` after every earlier task with the same key. The MCP server handles requests
   * concurrently; without this, two updates of one map would both read the same version and the
   * second write would drop the first.
   */
  private async withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    let normalized = key;
    try {
      if (this.store.kind === "vault" && !key.startsWith("create:")) normalized = safeVaultPath(key);
    } catch {
      // An invalid path fails in the store; it still needs some key.
    }
    const lockKey = foldName(normalized);
    const previous = this.locks.get(lockKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.catch(() => undefined);
    this.locks.set(lockKey, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(lockKey) === tail) this.locks.delete(lockKey);
    }
  }

  /** The area of a path as stored (vault paths come back from the store with the on-disk spelling). */
  private areaOf(path: string): string {
    return this.store.kind === "cloud" ? cloudAreaOf(path) : vaultAreaPath(path);
  }

  /** The server side of a cloud workspace (rights, proposals, log); for the owner's commands. */
  cloudAgent() {
    if (!this.cloud) throw new Error("Rechte, Vorschläge und Protokoll auf dem Server gibt es nur mit --cloud.");
    return this.cloud.agent;
  }

  /** In a cloud workspace the server holds the rights of the token and enforces them. */
  private get cloud(): CloudKnowledgeStore | null {
    return this.store instanceof CloudKnowledgeStore ? this.store : null;
  }

  private access(area: string): Promise<KnowledgeAccess> {
    return this.ledger.access(area);
  }

  private log(event: Record<string, unknown>): Promise<void> {
    return this.ledger.log(event);
  }

  async overview() {
    const maps = await this.store.list();
    const config = await this.rights();
    const areas = [...new Set(maps.map((map) => map.area))].sort().map((area) => ({
      area: area || "(top level)",
      maps: maps.filter((map) => map.area === area).length,
      access: accessFor(config, area),
    }));
    const unavailable = maps.filter((map) => map.available === false).length;
    return {
      target: this.store.kind,
      defaultAccess: config.access,
      areas,
      maps: maps.slice(0, 300),
      truncated: maps.length > 300,
      ...(unavailable ? { unavailable, hint: `${unavailable} file(s) could not be read (probably only in iCloud); search skips them.` } : {}),
    };
  }

  /**
   * The rights of the agent: the local `agent.json` for a vault, the server's rights of the token
   * for a cloud workspace (a person's own token is not limited there and counts as "write").
   */
  private async rights() {
    const cloud = this.cloud;
    if (!cloud) return this.ledger.rights();
    const { unrestricted, rights } = await cloud.agent.selfRights();
    return unrestricted || !rights ? { access: "write" as const, areas: {} } : rights;
  }

  async getMap(path: string) {
    const document = await this.store.read(path);
    return { path: document.path, version: document.version, area: this.areaOf(document.path), ...outlineMarkdown(document.markdown) };
  }

  /** One node with title, content, metadata, parent, child ids and relations, plus the map's version for safe updates. */
  async getNode(path: string, nodeId: string) {
    const document = await this.store.read(path);
    return { path: document.path, version: document.version, area: this.areaOf(document.path), node: knowledgeNodeDetail(document.markdown, nodeId) };
  }

  /**
   * Maps and nodes that link to a map or note, with the line and the link as written. Only maps the
   * agent can read are searched: a map the store refuses to read (a cloud area the token may not
   * see, an unavailable file) never shows up as a source, so it cannot leak through its links.
   */
  async backlinks(path: string) {
    const target = await this.store.read(path);
    const files = [{ path: target.path, markdown: target.markdown }];
    for (const map of await this.store.list()) {
      if (map.available === false || map.path === target.path) continue;
      const document = await this.store.read(map.path).catch(() => null);
      if (document) files.push({ path: document.path, markdown: document.markdown });
    }
    const markdownOf = new Map(files.map((file) => [file.path, file.markdown]));
    const backlinks = backlinksFor(files, target.path).map((entry) => {
      const node = knowledgeNodeAtLine(markdownOf.get(entry.path) ?? "", entry.line);
      return { path: entry.path, area: this.areaOf(entry.path), title: entry.title, nodeId: node?.id ?? "", nodeTitle: node?.title ?? "", line: entry.line, link: entry.raw };
    });
    return { path: target.path, backlinks };
  }

  /**
   * Search over node titles and content and, additionally, tags, scope, source, status and title
   * of the frontmatter. `status`, `tag` and `scope` filter maps (the query may then be empty:
   * one `map` hit per matching map). Expired maps and maps marked veraltet/ersetzt are left out
   * unless `includeStale` is set or a `status` filter is given.
   */
  async search(query: string, options: SearchOptions = {}) {
    const limit = options.limit ?? 40;
    const day = today(options.now);
    const filter: KnowledgeFilter = { status: options.status, tag: options.tag, scope: options.scope };
    const moreTags = options.tags ?? [];
    const filtered = filter.status !== undefined || filter.tag !== undefined || filter.scope !== undefined || moreTags.length > 0;
    if (!query.trim() && !filtered) throw new KnowledgeInputError("query must not be empty unless status, tag or scope is given.");
    const maps = (await this.store.list()).filter((map) => map.available !== false && (options.area === undefined || inArea(map.area, options.area)));
    const hits: SearchHit[] = [];
    for (const map of maps) {
      if (hits.length >= limit) break;
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      const frontmatter = readKnowledgeFrontmatter(document.markdown);
      if (!matchesKnowledgeFilter(frontmatter, filter) || moreTags.some((tag) => !matchesKnowledgeFilter(frontmatter, { tag }))) continue;
      const lifecycle = knowledgeLifecycle(frontmatter, day);
      if (!options.includeStale && filter.status === undefined && isKnowledgeRetired(lifecycle)) continue;
      const trust = trustFields(lifecycle);
      if (!query.trim()) {
        const snippet = [frontmatter.status && `status: ${frontmatter.status}`, frontmatter.scope && `scope: ${frontmatter.scope}`, frontmatter.tags.length > 0 && `tags: ${frontmatter.tags.join(", ")}`].filter(Boolean).join("; ");
        hits.push({ path: map.path, nodeId: "", kind: "map", title: frontmatter.title ?? map.title, snippet, ...trust });
        continue;
      }
      const inFrontmatter = searchKnowledgeFrontmatter(frontmatter, query);
      if (inFrontmatter) hits.push({ path: map.path, nodeId: "", kind: "frontmatter", title: frontmatter.title ?? map.title, snippet: inFrontmatter.snippet, field: inFrontmatter.field, ...trust });
      for (const hit of searchKnowledge(document.markdown, query, Math.max(0, limit - hits.length))) hits.push({ path: map.path, kind: "node", ...hit, ...trust });
    }
    return { query, hits: hits.slice(0, limit) };
  }

  /**
   * Maps whose `stale_after` is today or earlier (and, with `days`, those expiring within that
   * many days), most overdue first. `daysOverdue` is negative for a map that has not expired yet.
   */
  async stale(options: StaleOptions = {}) {
    const day = today(options.now);
    const horizon = new Date(`${day}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + Math.max(0, options.days ?? 0));
    const until = horizon.toISOString().slice(0, 10);
    const filter: KnowledgeFilter = { tag: options.tag, scope: options.scope };
    const stale = [];
    for (const map of (await this.store.list()).filter((entry) => entry.available !== false && (options.area === undefined || inArea(entry.area, options.area)))) {
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      const frontmatter = readKnowledgeFrontmatter(document.markdown);
      const { stale_after: staleAfter } = knowledgeLifecycle(frontmatter, day);
      if (!staleAfter || staleAfter > until || !matchesKnowledgeFilter(frontmatter, filter)) continue;
      stale.push({
        path: map.path,
        title: frontmatter.title ?? map.title,
        ...(frontmatter.status ? { status: frontmatter.status } : {}),
        stale_after: staleAfter,
        daysOverdue: knowledgeDaysBetween(staleAfter, day),
        ...(frontmatter.scope ? { scope: frontmatter.scope } : {}),
      });
    }
    return { stale: stale.sort((a, b) => a.stale_after.localeCompare(b.stale_after) || a.path.localeCompare(b.path)) };
  }

  async tasks(options: { area?: string; includeDone?: boolean; assignee?: string; dueBefore?: string } = {}) {
    const result = [];
    for (const map of (await this.store.list()).filter((entry) => entry.available !== false && (options.area === undefined || inArea(entry.area, options.area)))) {
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      for (const task of knowledgeTasks(document.markdown, options.includeDone)) {
        if (options.assignee && task.assignee?.toLowerCase() !== options.assignee.toLowerCase()) continue;
        if (options.dueBefore && (!task.due || task.due > options.dueBefore)) continue;
        result.push({ path: map.path, mapTitle: map.title, ...task });
      }
    }
    return { tasks: result.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999")) };
  }

  async decisions(area?: string) {
    const result = [];
    for (const map of (await this.store.list()).filter((entry) => entry.available !== false && (area === undefined || inArea(entry.area, area)))) {
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      for (const decision of knowledgeDecisions(document.markdown)) result.push({ path: map.path, mapTitle: map.title, ...decision });
    }
    return { decisions: result };
  }

  templates(id?: string) {
    if (id) {
      const template = knowledgeTemplate(id);
      if (!template) throw new Error(`Unknown template "${id}". Known: ${KNOWLEDGE_TEMPLATES.map((entry) => entry.id).join(", ")}.`);
      return template;
    }
    return { templates: KNOWLEDGE_TEMPLATES.map(({ id: key, name, area, description }) => ({ id: key, name, area, description })) };
  }

  /**
   * `frontmatter` (status, stale_after, verified, scope, replaced_by) is written into the new map
   * and overrides the template's values; without it a template's defaults apply as before.
   */
  async createMap(input: { area: string; title: string; template?: string; nodes?: KnowledgeNodeInput[]; tags?: string[]; frontmatter?: KnowledgeFrontmatterInput } & ChangeMeta): Promise<CommitResult> {
    return this.createMapAs("bloommd_create_map", input);
  }

  /** `createMap` under the name of `tool` in the log; `guard` runs under the area lock, before a path is taken. */
  private createMapAs(
    tool: string,
    input: { area: string; title: string; template?: string; nodes?: KnowledgeNodeInput[]; tags?: string[]; frontmatter?: KnowledgeFrontmatterInput } & ChangeMeta,
    guard?: (area: string) => Promise<void>,
  ): Promise<CommitResult> {
    const template = input.template ? knowledgeTemplate(input.template) : null;
    if (input.template && !template) throw new Error(`Unknown template "${input.template}".`);
    const area = input.area.trim() || template?.area || "";
    const date = today();
    const base = newKnowledgeMap({ title: input.title, area, tags: input.tags, source: input.source, date, frontmatter: templateFrontmatter(template, { date }) });
    const withFrontmatter = input.frontmatter ? applyKnowledgeFrontmatter(base, input.frontmatter) : { markdown: base, fields: [] };
    const change = { ...applyKnowledgeNodes(withFrontmatter.markdown, [...(template?.skeleton ?? []), ...(input.nodes ?? [])]), ...(withFrontmatter.fields.length > 0 ? { frontmatter: withFrontmatter.fields } : {}) };
    // One lock per area: two maps with the same title must not both get the same free path.
    return this.withLock(`create:${area}`, async () => {
      await guard?.(area);
      const path = await this.store.freePath(area, input.title);
      return this.withLock(path, () => this.commit(tool, path, null, null, change.markdown, change, input));
    });
  }

  /**
   * Files raw material (transcript, chat, note) as a map from a template: the agent hands over the
   * original text and the sections it already structured; nothing is invented and no model is called.
   * The original stands word for word as a `kind: source` node (below "Quellen"; templates without
   * that node get one) with the reference and date of the source. Refused, with nothing written:
   * a template other than meeting, conversation, discussion, lesson, project or weekly, a missing
   * original or source reference, more than `INGEST_MAX_TEXT_CHARS` characters or `INGEST_MAX_NODES`
   * section nodes, and a map with the same title in the target area (`IngestDuplicateError`).
   * Rights, proposals, log and undo are those of `createMap`.
   */
  async ingest(input: IngestInput): Promise<IngestResult> {
    const templateId = input.template?.trim();
    if (!templateId) throw new KnowledgeInputError(`Give a template: ${INGEST_TEMPLATE_IDS.join(", ")}.`);
    if (templateId === "learning") throw new KnowledgeInputError("The template learning cannot be ingested; use agent create / agent append for learnings.");
    const template = knowledgeTemplate(templateId);
    if (!template || !INGEST_TEMPLATE_IDS.includes(template.id)) throw new Error(`Unknown template "${templateId}". Known: ${INGEST_TEMPLATE_IDS.join(", ")}.`);
    const title = input.title?.trim();
    if (!title) throw new KnowledgeInputError("A map needs a title.");

    const sourceRef = input.sourceRef?.trim() ?? "";
    if (typeof input.text !== "string" || !input.text.trim()) throw new KnowledgeInputError("Missing source: the original text is missing or empty. Nothing was written.");
    if (!sourceRef) throw new KnowledgeInputError("Missing source: give where the original comes from (path, URL or ticket). Nothing was written.");
    if (sourceRef.length > SOURCE_REF_MAX || /[\r\n]/.test(sourceRef) || BLOOM_COMMENT_RE.test(sourceRef)) throw new KnowledgeInputError(`The source reference must be one line of at most ${SOURCE_REF_MAX} characters, without BloomMD comments.`);
    const sourceDate = input.sourceDate?.trim();
    if (sourceDate !== undefined && sourceDate !== "" && !isIsoDay(sourceDate)) throw new KnowledgeInputError(`The date of the source must be YYYY-MM-DD, got "${sourceDate}".`);

    const characters = [...input.text].length;
    if (characters > INGEST_MAX_TEXT_CHARS) throw new KnowledgeInputError(`Original text too long: ${characters} characters, at most ${INGEST_MAX_TEXT_CHARS} are allowed. Nothing was written.`);
    if (BLOOM_COMMENT_RE.test(input.text)) throw new KnowledgeInputError("The original text contains a BloomMD comment (<!-- bloommd: … -->), which is reserved for BloomMD's own metadata. Nothing was written.");
    const sections = input.nodes ?? [];
    assertIngestNodeCount(sections.length);
    if (sections.some((node) => node.ref === INGEST_SOURCE_REF)) throw new KnowledgeInputError(`The ref "${INGEST_SOURCE_REF}" is reserved for the source node.`);

    const hasSources = template.skeleton.some((node) => node.ref === INGEST_PARENT_REF);
    const citation = [sourceRef, ...(sourceDate ? [sourceDate] : [])].join(", ");
    const nodes: KnowledgeNodeInput[] = [
      ...(hasSources ? [] : [{ ref: INGEST_PARENT_REF, title: "Quellen", kind: "source" as const }]),
      ...sections,
      { ref: INGEST_SOURCE_REF, parent: INGEST_PARENT_REF, title: "Originaltext", kind: "source", citation, ...(/^https?:\/\/\S+$/i.test(sourceRef) ? { url: sourceRef } : {}), content: sourceContent(input.text) },
    ];
    const area = input.area?.trim() || template.area;
    const result = await this.createMapAs(
      "bloommd_ingest",
      { area, title, template: template.id, nodes, source: citation, reason: input.reason ?? `Ingest nach Vorlage ${template.name}` },
      async (target) => {
        // A vault names its maps by file name, which is the title as safeSegment writes it.
        const wanted = new Set([normalizeKnowledgeTitle(title), normalizeKnowledgeTitle(safeSegment(title))]);
        const same = (await this.store.list()).find((entry) => entry.available !== false && foldName(entry.area) === foldName(target) && wanted.has(normalizeKnowledgeTitle(entry.title)));
        if (same) throw new IngestDuplicateError(same.path, same.title, target);
      },
    );
    return { ...result, area, sourceNode: result.ids[INGEST_SOURCE_REF] ?? "", characters, sections: sections.length };
  }

  /**
   * Adds or updates nodes and/or sets frontmatter fields (`frontmatter`); at least one of the two.
   * Only the fields given are touched, the rest of the map stays as it is. In a cloud workspace
   * a change with frontmatter is a whole-document save (refused while the map is open).
   */
  async updateMap(input: { path: string; version?: string; nodes?: KnowledgeNodeInput[]; frontmatter?: KnowledgeFrontmatterInput } & ChangeMeta): Promise<CommitResult> {
    if (!input.nodes?.length && !input.frontmatter) throw new KnowledgeInputError("Give nodes or at least one of status, stale_after, verified, scope, replaced_by.");
    return this.withLock(input.path, () => this.updateMapNow(input));
  }

  private async updateMapNow(input: { path: string; version?: string; nodes?: KnowledgeNodeInput[]; frontmatter?: KnowledgeFrontmatterInput } & ChangeMeta): Promise<CommitResult> {
    const document = await this.store.read(input.path);
    if (input.version && input.version !== document.version) {
      throw new Error(`${input.path} changed since version ${input.version} (now ${document.version}). Read it again with bloommd_get_map.`);
    }
    const nodes = input.nodes ?? [];
    // Without nodes the map is left byte for byte as it is (applying nothing would still add heading ids).
    const nodeChange = nodes.length > 0 ? applyKnowledgeNodes(document.markdown, nodes) : { markdown: document.markdown, ids: {}, created: [], updated: [] };
    const withFrontmatter = input.frontmatter ? applyKnowledgeFrontmatter(nodeChange.markdown, input.frontmatter) : { markdown: nodeChange.markdown, fields: [] };
    const change = { ...nodeChange, markdown: withFrontmatter.markdown, ...(withFrontmatter.fields.length > 0 ? { frontmatter: withFrontmatter.fields } : {}) };
    const area = this.areaOf(document.path);
    if (this.store.applyNodes && nodes.length > 0 && !input.frontmatter && (this.cloud || (await this.access(area)) === "write")) {
      // Cloud: node operations merge into the live document instead of replacing it. The server
      // decides by the token's rights: it writes, or keeps the change as a proposal.
      const applied = await this.store.applyNodes(document.path, nodes, { tool: "bloommd_update_map", reason: input.reason, source: input.source });
      if (this.cloud) {
        if (applied.proposalId) return { path: document.path, mode: "proposed", proposalId: applied.proposalId, ids: nodeChange.ids, created: nodeChange.created, updated: nodeChange.updated };
        return { path: document.path, mode: "written", changeId: applied.changeId, version: applied.version, ids: applied.ids, created: applied.created, updated: applied.updated };
      }
      const changeId = await this.remember({ origin: "agent", tool: "bloommd_update_map", path: document.path, before: document.markdown, afterVersion: applied.version, reason: input.reason, source: input.source });
      await this.log({ event: "written", tool: "bloommd_update_map", path: document.path, changeId, summary: `${applied.created.length} node(s) created, ${applied.updated.length} updated`, created: applied.created, updated: applied.updated, reason: input.reason, source: input.source });
      return { path: document.path, mode: "written", changeId, version: applied.version, ids: applied.ids, created: applied.created, updated: applied.updated };
    }
    return this.commit("bloommd_update_map", document.path, document.markdown, document.version, change.markdown, change, input);
  }

  /**
   * Changes one existing node partially: the fields in `patch` (title, content, kind, status,
   * decision, due, assignee, note, citation, url, relations) and/or new `children`, appended at the
   * end of the node. Everything not named stays as it is. Same rules as `updateMap` and the server's
   * `PATCH …/nodes/:nodeId`: the rights of the agent decide between proposal and direct write, and
   * the change is logged for undo. An unknown node id is refused.
   */
  async updateNode(input: { path: string; nodeId: string; patch: unknown; version?: string } & ChangeMeta): Promise<CommitResult> {
    return this.withLock(input.path, async () => {
      const nodes = parseKnowledgeNodePatch(input.patch, input.nodeId);
      const document = await this.store.read(input.path);
      if (input.version && input.version !== document.version) {
        throw new Error(`${input.path} changed since version ${input.version} (now ${document.version}). Read it again with bloommd_get_map.`);
      }
      // Fails for an unknown node before anything is sent or written.
      const change = applyKnowledgeNodes(document.markdown, nodes);
      const tool = "bloommd_update_node";
      if (this.cloud && this.store.patchNode) {
        // The server merges the change into the live document and decides by the token's rights.
        const applied = await this.store.patchNode(document.path, input.nodeId, input.patch as Record<string, unknown>, { tool, reason: input.reason, source: input.source });
        if (applied.proposalId) return { path: document.path, mode: "proposed", proposalId: applied.proposalId, ids: change.ids, created: change.created, updated: change.updated };
        return { path: document.path, mode: "written", changeId: applied.changeId, version: applied.version, ids: applied.ids, created: applied.created, updated: applied.updated };
      }
      return this.commit(tool, document.path, document.markdown, document.version, change.markdown, change, input);
    });
  }

  private async commit(
    tool: string,
    path: string,
    before: string | null,
    baseVersion: string | null,
    after: string,
    change: { created: string[]; updated: string[]; ids: Record<string, string>; frontmatter?: string[] },
    meta: ChangeMeta,
  ): Promise<CommitResult> {
    const area = this.areaOf(path);
    const fields = change.frontmatter ?? [];
    const summary = `${change.created.length} node(s) created, ${change.updated.length} updated${fields.length > 0 ? `, frontmatter: ${fields.join(", ")}` : ""}`;
    if (this.cloud) {
      // The server checks the token's right for the area: refused, kept as a proposal, or written and logged.
      const result = await this.cloud.write(path, after, baseVersion, { tool, summary, reason: meta.reason, source: meta.source });
      if (result.proposalId) return { path, mode: "proposed", proposalId: result.proposalId, ...change };
      return { path: result.path, mode: "written", changeId: result.changeId, version: result.version, ...change };
    }
    const access = await this.access(area);
    if (access === "read") throw new Error(`The agent may only read in "${area || "(top level)"}". Ask the owner to allow proposals or writing there.`);
    if (access === "propose") {
      const proposalId = await this.propose({ tool, path, area, baseVersion, markdown: after, summary, ...meta });
      return { path, mode: "proposed", proposalId, ...change };
    }
    const written = await this.store.write(path, after, baseVersion);
    const changeId = await this.remember({ origin: "agent", tool, path, before, afterVersion: written.version, ...meta });
    await this.log({ event: "written", tool, path, changeId, summary, created: change.created, updated: change.updated, ...(fields.length > 0 ? { frontmatter: fields } : {}), reason: meta.reason, source: meta.source });
    return { path, mode: "written", changeId, version: written.version, ...change };
  }

  private propose(input: Pick<Proposal, "tool" | "path" | "area" | "baseVersion" | "markdown" | "summary"> & ChangeMeta): Promise<string> {
    return this.ledger.propose(input);
  }

  private remember(entry: Parameters<AgentLedger["remember"]>[0]): Promise<string> {
    return this.ledger.remember(entry);
  }

  /** A read-only link for colleagues (cloud maps only). */
  async shareLink(path: string, expiresInDays = 30) {
    if (!this.store.shareLink) throw new Error("Read-only links exist only for maps in a BloomMD cloud workspace. For vault notes, export the map as PDF in Obsidian.");
    // In a cloud workspace the server refuses a link outside the token's write rights.
    if (!this.cloud) {
      const access = await this.access(this.areaOf(path));
      if (access !== "write") throw new Error(`Sharing needs write access in "${this.areaOf(path) || "(top level)"}".`);
    }
    const link = await this.store.shareLink(path, expiresInDays);
    if (!this.cloud) await this.log({ event: "shared", path, expiresAt: link.expiresAt });
    return { path, ...link };
  }

  /**
   * The agent's change log, newest first. `since` (ISO date or date-time, see `parseKnowledgeSince`)
   * keeps only entries from that moment on; `limit` still caps the result.
   */
  async changes(limit = 20, since?: string) {
    const from = since === undefined ? undefined : parseKnowledgeSince(since);
    // With `since` the log is filtered after reading, so it is read whole (the server caps it at 200 entries).
    const cloud = this.cloud;
    const entries = cloud
      ? (await cloud.agent.selfChanges(from === undefined ? limit : CLOUD_LOG_MAX)).map(cloudLogEntry)
      : await this.ledger.changes(from === undefined ? limit : Number.MAX_SAFE_INTEGER);
    if (from === undefined) return { changes: entries };
    return { since: from.toISOString(), changes: entries.filter((entry) => Date.parse(String(entry.at)) >= from.getTime()).slice(0, limit) };
  }

  /** The owner's view of the change log of the agent tokens of a cloud workspace (all, or one token). */
  async ownerChanges(limit = 20, tokenId?: string) {
    return { changes: (await this.cloudAgent().log({ limit, tokenId })).map(cloudLogEntry) };
  }

  /**
   * Restores the state before a change, unless the map was edited since.
   *
   * By default (the agent through MCP) only the agent's own direct writes can be undone, and only
   * within its rights: in a `propose` area the undo becomes a proposal, in a `read` area it is
   * refused. A change a person approved is never undone by the agent. `asOwner` (the CLI) may undo
   * any change. In a cloud workspace the server holds the history and applies these rules.
   */
  async undo(changeId: string, options: { asOwner?: boolean } = {}) {
    const cloud = this.cloud;
    if (cloud) return options.asOwner ? cloud.agent.ownerUndo(changeId) : cloud.agent.selfUndo(changeId);
    const record = await this.ledger.change(changeId);
    return this.withLock(record.path, () => this.ledger.undo(changeId, this.documents, { asOwner: options.asOwner, areaOf: (path) => this.areaOf(path) }));
  }

  /** Open proposals of a vault, oldest first (with the proposed document). */
  proposals(): Promise<Proposal[]> {
    return this.ledger.proposals();
  }

  /** Open proposals without their document text, for the owner's list (vault and cloud). */
  async listProposals(): Promise<ProposalSummary[]> {
    const cloud = this.cloud;
    if (cloud) {
      return (await cloud.agent.proposals()).map((proposal) => ({
        id: proposal.id,
        at: proposal.createdAt,
        agent: proposal.agentName,
        tool: proposal.tool,
        target: "cloud" as const,
        path: proposal.filename,
        area: proposal.area,
        baseVersion: proposal.baseVersion === null ? null : String(proposal.baseVersion),
        summary: proposal.summary,
        ...(proposal.reason ? { reason: proposal.reason } : {}),
        ...(proposal.source ? { source: proposal.source } : {}),
        stale: proposal.stale,
        changes: proposal.changes,
      }));
    }
    return (await this.ledger.proposals()).map(({ markdown: _markdown, ...entry }) => entry);
  }

  /** For people only (CLI); the MCP server does not offer this. In the cloud the server names the signed-in reviewer. */
  async applyProposal(id: string, reviewer: string, options: { overwrite?: boolean } = {}) {
    const cloud = this.cloud;
    if (cloud) return cloud.agent.approve(id, options);
    const proposal = await this.ledger.proposal(id);
    return this.withLock(proposal.path, () => this.ledger.applyProposal(proposal, reviewer, this.documents, options));
  }

  rejectProposal(id: string, reviewer: string, reason?: string) {
    const cloud = this.cloud;
    return cloud ? cloud.agent.reject(id, reason) : this.ledger.rejectProposal(id, reviewer, reason);
  }

  /** Questions and instructions people left on map nodes; open ones unless `includeDone`. */
  async requests(includeDone = false): Promise<{ requests: AgentRequest[] }> {
    const requests = await this.ledger.requests();
    return { requests: includeDone ? requests : requests.filter((request) => request.status === "open") };
  }

  /**
   * Answers a request. Nodes for the request's map go through `updateMap`, so the agent's rights
   * decide whether they are written directly or become a proposal.
   */
  async answerRequest(input: { id: string; answer: string; failed?: boolean; nodes?: KnowledgeNodeInput[]; version?: string } & ChangeMeta) {
    const request = await this.ledger.request(input.id);
    const commit = input.nodes?.length ? await this.updateMap({ path: request.path, version: input.version, nodes: input.nodes, reason: input.reason ?? `Request ${request.id}: ${request.question.slice(0, 120)}`, source: input.source }) : null;
    const answered = await this.ledger.answerRequest(request.id, { answer: input.answer, status: input.failed ? "failed" : "answered", proposalId: commit?.proposalId, changeId: commit?.changeId });
    return { request: answered, ...(commit ? { change: commit } : {}) };
  }

  /** Version of a document for display (e.g. in CLI output). */
  static version(markdown: string): string {
    return knowledgeVersion(markdown);
  }
}
