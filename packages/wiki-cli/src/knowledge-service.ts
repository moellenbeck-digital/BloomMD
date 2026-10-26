/**
 * The agent-facing knowledge operations on top of a store: access rules per area, a change log,
 * undo, and proposals that only a person can apply (never the agent itself).
 */
import { AgentLedger, type AgentDocuments, type AgentProposal, type AgentRequest } from "@bloommd/core/agent-ledger";
import {
  applyKnowledgeNodes,
  knowledgeDecisions,
  knowledgeTasks,
  knowledgeVersion,
  newKnowledgeMap,
  outlineMarkdown,
  searchKnowledge,
  type KnowledgeAccess,
  type KnowledgeNodeInput,
} from "@bloommd/core/knowledge";
import { KNOWLEDGE_TEMPLATES, knowledgeTemplate, templateFrontmatter } from "@bloommd/core/knowledge-templates";
import { accessFor, foldName, nodeStateFiles, safeVaultPath, type KnowledgeStore, VaultKnowledgeStore } from "./knowledge-store";

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
}

export type Proposal = AgentProposal;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameArea(a: string, b: string): boolean {
  return foldName(a) === foldName(b);
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
    if (this.store.kind === "cloud") return /^(.+?) – /.exec(path)?.[1] ?? "";
    return path.includes("/") ? path.split("/")[0]! : "";
  }

  private access(area: string): Promise<KnowledgeAccess> {
    return this.ledger.access(area);
  }

  private log(event: Record<string, unknown>): Promise<void> {
    return this.ledger.log(event);
  }

  async overview() {
    const maps = await this.store.list();
    const config = await this.ledger.rights();
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

  async getMap(path: string) {
    const document = await this.store.read(path);
    return { path: document.path, version: document.version, area: this.areaOf(document.path), ...outlineMarkdown(document.markdown) };
  }

  async search(query: string, area?: string, limit = 40) {
    const maps = (await this.store.list()).filter((map) => map.available !== false && (area === undefined || sameArea(map.area, area)));
    const hits: Array<{ path: string; nodeId: string; title: string; snippet: string }> = [];
    for (const map of maps) {
      if (hits.length >= limit) break;
      const document = await this.store.read(map.path).catch(() => null);
      if (!document) continue;
      for (const hit of searchKnowledge(document.markdown, query, limit - hits.length)) hits.push({ path: map.path, ...hit });
    }
    return { query, hits };
  }

  async tasks(options: { area?: string; includeDone?: boolean; assignee?: string; dueBefore?: string } = {}) {
    const result = [];
    for (const map of (await this.store.list()).filter((entry) => entry.available !== false && (options.area === undefined || sameArea(entry.area, options.area)))) {
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
    for (const map of (await this.store.list()).filter((entry) => entry.available !== false && (area === undefined || sameArea(entry.area, area)))) {
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

  async createMap(input: { area: string; title: string; template?: string; nodes?: KnowledgeNodeInput[]; tags?: string[]; scope?: string } & ChangeMeta): Promise<CommitResult> {
    const template = input.template ? knowledgeTemplate(input.template) : null;
    if (input.template && !template) throw new Error(`Unknown template "${input.template}".`);
    const area = input.area.trim() || template?.area || "";
    const date = today();
    const base = newKnowledgeMap({ title: input.title, area, tags: input.tags, source: input.source, date, frontmatter: templateFrontmatter(template, { date, scope: input.scope }) });
    const change = applyKnowledgeNodes(base, [...(template?.skeleton ?? []), ...(input.nodes ?? [])]);
    // One lock per area: two maps with the same title must not both get the same free path.
    return this.withLock(`create:${area}`, async () => {
      const path = await this.store.freePath(area, input.title);
      return this.withLock(path, () => this.commit("bloommd_create_map", path, null, null, change.markdown, change, input));
    });
  }

  async updateMap(input: { path: string; version?: string; nodes: KnowledgeNodeInput[] } & ChangeMeta): Promise<CommitResult> {
    return this.withLock(input.path, () => this.updateMapNow(input));
  }

  private async updateMapNow(input: { path: string; version?: string; nodes: KnowledgeNodeInput[] } & ChangeMeta): Promise<CommitResult> {
    const document = await this.store.read(input.path);
    if (input.version && input.version !== document.version) {
      throw new Error(`${input.path} changed since version ${input.version} (now ${document.version}). Read it again with bloommd_get_map.`);
    }
    const change = applyKnowledgeNodes(document.markdown, input.nodes);
    const area = this.areaOf(document.path);
    if (this.store.applyNodes && (await this.access(area)) === "write") {
      // Cloud: node operations merge into the live document instead of replacing it.
      const applied = await this.store.applyNodes(document.path, input.nodes);
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
    change: { created: string[]; updated: string[]; ids: Record<string, string> },
    meta: ChangeMeta,
  ): Promise<CommitResult> {
    const area = this.areaOf(path);
    const access = await this.access(area);
    const summary = `${change.created.length} node(s) created, ${change.updated.length} updated`;
    if (access === "read") throw new Error(`The agent may only read in "${area || "(top level)"}". Ask the owner to allow proposals or writing there.`);
    if (access === "propose") {
      const proposalId = await this.propose({ tool, path, area, baseVersion, markdown: after, summary, ...meta });
      return { path, mode: "proposed", proposalId, ...change };
    }
    const written = await this.store.write(path, after, baseVersion);
    const changeId = await this.remember({ origin: "agent", tool, path, before, afterVersion: written.version, ...meta });
    await this.log({ event: "written", tool, path, changeId, summary, created: change.created, updated: change.updated, reason: meta.reason, source: meta.source });
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
    const access = await this.access(this.areaOf(path));
    if (access !== "write") throw new Error(`Sharing needs write access in "${this.areaOf(path) || "(top level)"}".`);
    const link = await this.store.shareLink(path, expiresInDays);
    await this.log({ event: "shared", path, expiresAt: link.expiresAt });
    return { path, ...link };
  }

  async changes(limit = 20) {
    return { changes: await this.ledger.changes(limit) };
  }

  /**
   * Restores the state before a change, unless the map was edited since.
   *
   * By default (the agent through MCP) only the agent's own direct writes can be undone, and only
   * within its rights: in a `propose` area the undo becomes a proposal, in a `read` area it is
   * refused. A change a person approved is never undone by the agent. `asOwner` (the CLI) may undo
   * any change.
   */
  async undo(changeId: string, options: { asOwner?: boolean } = {}) {
    const record = await this.ledger.change(changeId);
    return this.withLock(record.path, () => this.ledger.undo(changeId, this.documents, { asOwner: options.asOwner, areaOf: (path) => this.areaOf(path) }));
  }

  proposals(): Promise<Proposal[]> {
    return this.ledger.proposals();
  }

  /** For people only (CLI); the MCP server does not offer this. */
  async applyProposal(id: string, reviewer: string) {
    const proposal = await this.ledger.proposal(id);
    return this.withLock(proposal.path, () => this.ledger.applyProposal(proposal, reviewer, this.documents));
  }

  rejectProposal(id: string, reviewer: string, reason?: string) {
    return this.ledger.rejectProposal(id, reviewer, reason);
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
