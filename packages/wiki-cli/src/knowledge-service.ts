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
  knowledgeTasks,
  knowledgeVersion,
  matchesKnowledgeFilter,
  newKnowledgeMap,
  outlineMarkdown,
  readKnowledgeFrontmatter,
  searchKnowledge,
  searchKnowledgeFrontmatter,
  type KnowledgeAccess,
  type KnowledgeFilter,
  type KnowledgeFrontmatterInput,
  type KnowledgeNodeInput,
} from "@bloommd/core/knowledge";
import { KNOWLEDGE_TEMPLATES, knowledgeTemplate, templateFrontmatter } from "@bloommd/core/knowledge-templates";
import { accessFor, CloudKnowledgeStore, foldName, nodeStateFiles, safeVaultPath, type KnowledgeStore, VaultKnowledgeStore } from "./knowledge-store";
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
    const filtered = filter.status !== undefined || filter.tag !== undefined || filter.scope !== undefined;
    if (!query.trim() && !filtered) throw new KnowledgeInputError("query must not be empty unless status, tag or scope is given.");
    const maps = (await this.store.list()).filter((map) => map.available !== false && (options.area === undefined || inArea(map.area, options.area)));
    const hits: SearchHit[] = [];
    for (const map of maps) {
      if (hits.length >= limit) break;
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      const frontmatter = readKnowledgeFrontmatter(document.markdown);
      if (!matchesKnowledgeFilter(frontmatter, filter)) continue;
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
    const template = input.template ? knowledgeTemplate(input.template) : null;
    if (input.template && !template) throw new Error(`Unknown template "${input.template}".`);
    const area = input.area.trim() || template?.area || "";
    const date = today();
    const base = newKnowledgeMap({ title: input.title, area, tags: input.tags, source: input.source, date, frontmatter: templateFrontmatter(template, { date }) });
    const withFrontmatter = input.frontmatter ? applyKnowledgeFrontmatter(base, input.frontmatter) : { markdown: base, fields: [] };
    const change = { ...applyKnowledgeNodes(withFrontmatter.markdown, [...(template?.skeleton ?? []), ...(input.nodes ?? [])]), ...(withFrontmatter.fields.length > 0 ? { frontmatter: withFrontmatter.fields } : {}) };
    // One lock per area: two maps with the same title must not both get the same free path.
    return this.withLock(`create:${area}`, async () => {
      const path = await this.store.freePath(area, input.title);
      return this.withLock(path, () => this.commit("bloommd_create_map", path, null, null, change.markdown, change, input));
    });
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

  async changes(limit = 20) {
    const cloud = this.cloud;
    return { changes: cloud ? (await cloud.agent.selfChanges(limit)).map(cloudLogEntry) : await this.ledger.changes(limit) };
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
