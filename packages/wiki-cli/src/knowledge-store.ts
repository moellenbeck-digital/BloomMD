/**
 * Where an agent files knowledge: a local folder (e.g. an Obsidian vault in iCloud) or a BloomMD
 * cloud workspace. Both expose the same small interface; access rules, the change log, undo and
 * proposals are handled once in `KnowledgeService`.
 */
import { appendFile, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { accessFor, AgentLedger, areaSegments, CLOUD_AREA_SEPARATOR, cloudAreaOf, foldName, vaultAreaPath, type AgentAccessConfig, type AgentStateFiles } from "@bloommd/core/agent-ledger";
import { knowledgeVersion, type KnowledgeNodeInput } from "@bloommd/core/knowledge";
import { parseFile, serializeToMarkdown } from "@bloommd/core/parser";
import { sanitizeMarkdownFilename } from "@bloommd/core/paths";
import { CloudAgentApi, cloudRequest, type CloudOptions as CloudConnection } from "./cloud-agent";

export interface KnowledgeMapEntry {
  path: string;
  title: string;
  area: string;
  /** False when the file could not be read, e.g. an iCloud file that is only in the cloud. */
  available?: boolean;
}

export interface KnowledgeDocument {
  path: string;
  markdown: string;
  /** Opaque version for optimistic writes. */
  version: string;
}

/** What the agent says about a change (shown in the change log); it never decides about rights. */
export interface KnowledgeWriteMeta {
  tool?: string;
  reason?: string;
  source?: string;
  summary?: string;
}

/**
 * The result of a save. In a cloud workspace the server decides by the agent's rights: with a
 * `proposalId` nothing was written, a person has to review the change; otherwise `changeId` is the
 * entry in the server's change log.
 */
export interface KnowledgeWriteResult extends KnowledgeDocument {
  proposalId?: string;
  changeId?: string;
}

export interface KnowledgeStore {
  readonly kind: "vault" | "cloud";
  list(): Promise<KnowledgeMapEntry[]>;
  read(path: string): Promise<KnowledgeDocument>;
  /** Writes when `expectedVersion` still matches (null = must not exist yet). */
  write(path: string, markdown: string, expectedVersion: string | null, meta?: KnowledgeWriteMeta): Promise<KnowledgeWriteResult>;
  /** A free path for a new map of `title` in `area`. */
  freePath(area: string, title: string): Promise<string>;
  /** Where requests (and, for a vault, config, log, history and proposals) live on this machine. */
  readonly stateDir: string;
  /**
   * Node operations applied by the store itself (cloud: merged into the live document, so they work
   * while people edit the map). Without it, the service rewrites the Markdown and calls `write`.
   */
  applyNodes?(path: string, nodes: KnowledgeNodeInput[], meta?: KnowledgeWriteMeta): Promise<{ ids: Record<string, string>; created: string[]; updated: string[]; version: string; proposalId?: string; changeId?: string }>;
  /**
   * One partial node change applied by the store itself (cloud: `PATCH …/nodes/:nodeId`, merged into the
   * live document). Without it, the service rewrites the Markdown and calls `write`.
   */
  patchNode?(path: string, nodeId: string, patch: Record<string, unknown>, meta?: KnowledgeWriteMeta): Promise<{ ids: Record<string, string>; created: string[]; updated: string[]; version: string; proposalId?: string; changeId?: string }>;
  /** A read-only link for people without an account (cloud only). */
  shareLink?(path: string, expiresInDays: number): Promise<{ url: string; expiresAt: string }>;
}

export class KnowledgeConflictError extends Error {
  constructor(path: string) {
    super(`${path} changed since it was read. Read it again and repeat the change.`);
  }
}

/** A whole-document cloud save (undo, approved proposal) while someone has the map open. */
export class KnowledgeMapOpenError extends Error {
  constructor(path: string) {
    super(`Die Map „${path}“ ist gerade in BloomMD geöffnet; schließe sie auf allen Geräten und versuche es dann erneut. / The map "${path}" is open in BloomMD right now; close it on all devices and try again.`);
    this.name = "KnowledgeMapOpenError";
  }
}

export { foldName };

/** True when `path` is `root` or lies inside it (both absolute, already resolved). */
function isInside(root: string, path: string): boolean {
  const rest = relative(root, path);
  return rest === "" || (!rest.startsWith("..") && !isAbsolute(rest));
}

// `lost+found` is the root-only folder of an ext4 volume mounted directly as the vault.
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".obsidian", ".trash", ".bloommd", "lost+found"]);
const MAX_FILES = 5_000;

/** Vault-relative Markdown path, or an error for anything outside the vault or in hidden folders. */
export function safeVaultPath(input: string): string {
  const cleaned = normalize(input.replace(/\\/g, "/")).replace(/^(\.\/)+/, "");
  if (!cleaned || cleaned.startsWith("..") || cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) throw new Error(`"${input}" is not a path inside the vault.`);
  const parts = cleaned.split(/[\\/]/);
  if (parts.some((part) => part.startsWith(".") || part === "" || SKIPPED_DIRS.has(part))) throw new Error(`"${input}" points into a hidden or system folder.`);
  if (!/\.md$/i.test(cleaned)) throw new Error(`"${input}" is not a Markdown file.`);
  return parts.join("/");
}

function safeSegment(value: string): string {
  return sanitizeMarkdownFilename(`${value}.md`).replace(/\.md$/i, "").replace(/[\\/]/g, "-").replace(/[.\s]+$/, "").trim();
}

/** Reading a file iCloud is still syncing can block indefinitely; give up after this long. */
export const VAULT_READ_TIMEOUT_MS = 3_000;

export class VaultKnowledgeStore implements KnowledgeStore {
  readonly kind = "vault" as const;
  readonly stateDir: string;
  /** Files whose read timed out in this session; they are reported, not retried. */
  private readonly blocked = new Set<string>();
  /** Short-lived folder listings for `resolve`, so a search over many maps lists each folder once. */
  private readonly listings = new Map<string, { names: string[] | null; at: number }>();

  constructor(readonly root: string, private readonly readTimeoutMs = VAULT_READ_TIMEOUT_MS) {
    this.stateDir = join(root, ".bloommd");
  }

  private readText(path: string, full: string): Promise<string> {
    if (this.blocked.has(path)) return Promise.reject(new Error(`${path} is not available right now (iCloud is still syncing it).`));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.blocked.add(path);
        reject(new Error(`${path} did not open within ${this.readTimeoutMs / 1000}s (iCloud is probably syncing it); try again later.`));
      }, this.readTimeoutMs);
    });
    return Promise.race([readFile(full, "utf8"), timeout]).finally(() => clearTimeout(timer));
  }

  async list(): Promise<KnowledgeMapEntry[]> {
    const entries: KnowledgeMapEntry[] = [];
    const walk = async (dir: string) => {
      if (entries.length >= MAX_FILES) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && /\.md$/i.test(entry.name)) {
          const path = relative(this.root, full).split(sep).join("/");
          const area = vaultAreaPath(path);
          // Like Obsidian, the file name is the title; listing never opens files. iCloud keeps
          // rarely used files only in the cloud (no local blocks); opening one can block or fail
          // (EDEADLK), so they are reported instead of read.
          const info = await stat(full).catch(() => null);
          const local = Boolean(info && !(info.size > 0 && info.blocks === 0));
          const available = local && !this.blocked.has(path);
          entries.push({ path, title: entry.name.replace(/\.md$/i, ""), area, ...(available ? {} : { available: false }) });
        }
      }
    };
    await walk(this.root);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * The vault path as it is on disk: every existing folder or file is matched case- and
   * Unicode-insensitively, so `arbeit/plan.md` names `Arbeit/Plan.md` (on APFS they are the same
   * file, and the area rules must see the real folder). Symlinks that lead out of the vault are
   * refused: the nearest existing ancestor must resolve inside the vault.
   */
  async resolve(path: string): Promise<{ safe: string; full: string }> {
    const parts = safeVaultPath(path).split("/").map((part) => part.normalize("NFC"));
    const resolved: string[] = [];
    let dir = this.root;
    let existing = this.root;
    for (const part of parts) {
      const names = await this.names(dir);
      const match = names?.find((name) => name.normalize("NFC") === part) ?? names?.find((name) => foldName(name) === foldName(part));
      resolved.push(match ?? part);
      dir = join(dir, match ?? part);
      if (!match) {
        resolved.push(...parts.slice(resolved.length));
        break;
      }
      existing = dir;
    }
    const safe = safeVaultPath(resolved.join("/"));
    const [realRoot, realExisting] = await Promise.all([realpath(this.root), realpath(existing).catch(() => null)]);
    if (!realExisting || !isInside(realRoot, realExisting)) throw new Error(`"${path}" leads outside the vault.`);
    return { safe, full: join(this.root, safe) };
  }

  private async names(dir: string): Promise<string[] | null> {
    const cached = this.listings.get(dir);
    if (cached && Date.now() - cached.at < 2_000) return cached.names;
    const names = await readdir(dir).catch(() => null);
    this.listings.set(dir, { names, at: Date.now() });
    return names;
  }

  async read(path: string): Promise<KnowledgeDocument> {
    const { safe, full } = await this.resolve(path);
    const markdown = await this.readText(safe, full);
    return { path: safe, markdown, version: knowledgeVersion(markdown) };
  }

  async write(path: string, markdown: string, expectedVersion: string | null): Promise<KnowledgeDocument> {
    const { safe, full } = await this.resolve(path);
    const exists = await stat(full).then(() => true, () => false);
    const current = exists ? await this.readText(safe, full) : null;
    if (expectedVersion === null ? current !== null : current === null || knowledgeVersion(current) !== expectedVersion) {
      throw new KnowledgeConflictError(safe);
    }
    await mkdir(dirname(full), { recursive: true });
    // Write next to the target and rename: Obsidian and iCloud never see a half-written note.
    const temp = join(dirname(full), `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.bloommd-tmp`);
    await writeFile(temp, markdown, "utf8");
    await rename(temp, full);
    this.listings.clear();
    return { path: safe, markdown, version: knowledgeVersion(markdown) };
  }

  async freePath(area: string, title: string): Promise<string> {
    const folder = area.split("/").map(safeSegment).filter(Boolean).join("/");
    const base = safeSegment(title) || "Notiz";
    for (let index = 1; index < 100; index += 1) {
      const { safe, full } = await this.resolve(`${folder ? `${folder}/` : ""}${base}${index > 1 ? ` ${index}` : ""}.md`);
      const exists = await stat(full).then(() => true, () => false);
      if (!exists) return safe;
    }
    throw new Error(`No free file name for "${title}".`);
  }

  async remove(path: string): Promise<void> {
    await rm((await this.resolve(path)).full, { force: true });
    this.listings.clear();
  }
}

interface CloudOptions extends CloudConnection {
  /** Requests stay on this machine; rights, proposals and the change log live on the server. */
  stateDir: string;
}

/**
 * A BloomMD cloud workspace through the REST API. The cloud has no folders, so the area becomes
 * part of the file name ("Arbeit – Teammeeting.md", "Learnings › dev-team – Idee.md") and is kept
 * in the frontmatter. Rights are enforced by the server, per agent token.
 */
export class CloudKnowledgeStore implements KnowledgeStore {
  readonly kind = "cloud" as const;
  readonly stateDir: string;
  /** Rights, proposals and change log of the token in this workspace (on the server). */
  readonly agent: CloudAgentApi;
  private readonly versions = new Map<string, number>();

  constructor(private readonly options: CloudOptions) {
    this.stateDir = options.stateDir;
    this.agent = new CloudAgentApi(options);
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return cloudRequest(this.options, path, init);
  }

  async list(): Promise<KnowledgeMapEntry[]> {
    const response = await this.request("/api/mindmaps");
    if (!response.ok) throw new Error(`BloomMD cloud list failed (${response.status}).`);
    const body = (await response.json()) as { files?: Array<{ filename: string; title?: string }> };
    return (body.files ?? []).map((file) => {
      const area = cloudAreaOf(file.filename);
      return { path: file.filename, title: file.title ?? file.filename.replace(/\.md$/i, ""), area };
    });
  }

  async read(path: string): Promise<KnowledgeDocument> {
    const response = await this.request(`/api/mindmaps/${encodeURIComponent(path)}`);
    if (!response.ok) throw new Error(`BloomMD cloud could not read ${path} (${response.status}).`);
    const body = (await response.json()) as {
      filePath: string;
      frontmatter: Record<string, unknown>;
      nodes: Record<string, unknown>;
      rootId: string;
      preamble?: string;
      storage?: { version?: number };
    };
    const markdown = serializeToMarkdown({
      filePath: body.filePath,
      frontmatter: body.frontmatter as never,
      nodes: new Map(Object.entries(body.nodes)) as never,
      rootId: body.rootId,
      preamble: body.preamble ?? "",
      rawMarkdown: "",
    } as never);
    const version = body.storage?.version ?? 0;
    this.versions.set(path, version);
    return { path, markdown, version: String(version) };
  }

  async write(path: string, markdown: string, expectedVersion: string | null, meta: KnowledgeWriteMeta = {}): Promise<KnowledgeWriteResult> {
    // Fails before anything is sent when the agent produced a document BloomMD cannot parse.
    parseFile(path, markdown);
    const agentMeta = Object.keys(meta).length > 0 ? { agentMeta: meta } : {};
    const response = expectedVersion === null
      ? await this.request("/api/mindmaps", { method: "POST", body: JSON.stringify({ filename: path, markdown, ...agentMeta }) })
      : await this.request(`/api/mindmaps/${encodeURIComponent(path)}`, { method: "PUT", body: JSON.stringify({ markdown, expectedVersion: Number(expectedVersion), ...agentMeta }) });
    if (response.status === 409) throw new KnowledgeConflictError(path);
    const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string; mode?: string; proposalId?: string; changeId?: string; filePath?: string };
    if (!response.ok) {
      // Whole-document saves are refused while the map is open somewhere (they would overwrite
      // live edits); node operations do not have this limit.
      if (body.code === "SYNC_ROOM_ACTIVE" || body.code === "SYNC_ROOM_PENDING") throw new KnowledgeMapOpenError(path);
      // The server names the agent's right and the area ("may only read in ...").
      throw new Error(body.error ?? `BloomMD cloud could not save ${path} (${response.status}).`);
    }
    // The server turned the change into a proposal: nothing was written.
    if (body.mode === "proposed" && body.proposalId) return { path, markdown, version: expectedVersion ?? "", proposalId: body.proposalId };
    // A new map may get another name when the name is taken.
    const written = await this.read(body.filePath ?? path);
    return { ...written, ...(body.changeId ? { changeId: body.changeId } : {}) };
  }

  async applyNodes(path: string, nodes: KnowledgeNodeInput[], meta: KnowledgeWriteMeta = {}) {
    const response = await this.request(`/api/mindmaps/${encodeURIComponent(path)}/nodes`, { method: "POST", body: JSON.stringify({ nodes, ...(Object.keys(meta).length > 0 ? { agentMeta: meta } : {}) }) });
    const body = (await response.json().catch(() => ({}))) as { ids?: Record<string, string>; created?: string[]; updated?: string[]; version?: number | null; error?: string; mode?: string; proposalId?: string; changeId?: string };
    if (!response.ok) throw new Error(body.error ?? `BloomMD cloud could not update ${path} (${response.status}).`);
    return { ids: body.ids ?? {}, created: body.created ?? [], updated: body.updated ?? [], version: String(body.version ?? ""), ...(body.proposalId ? { proposalId: body.proposalId } : {}), ...(body.changeId ? { changeId: body.changeId } : {}) };
  }

  async patchNode(path: string, nodeId: string, patch: Record<string, unknown>, meta: KnowledgeWriteMeta = {}) {
    const response = await this.request(`/api/mindmaps/${encodeURIComponent(path)}/nodes/${encodeURIComponent(nodeId)}`, { method: "PATCH", body: JSON.stringify({ ...patch, ...(Object.keys(meta).length > 0 ? { agentMeta: meta } : {}) }) });
    const body = (await response.json().catch(() => ({}))) as { ids?: Record<string, string>; created?: string[]; updated?: string[]; version?: number | null; error?: string; mode?: string; proposalId?: string; changeId?: string };
    if (!response.ok) throw new Error(body.error ?? `BloomMD cloud could not change node ${nodeId} of ${path} (${response.status}).`);
    return { ids: body.ids ?? {}, created: body.created ?? [], updated: body.updated ?? [], version: String(body.version ?? ""), ...(body.proposalId ? { proposalId: body.proposalId } : {}), ...(body.changeId ? { changeId: body.changeId } : {}) };
  }

  async shareLink(path: string, expiresInDays: number) {
    const response = await this.request(`/api/mindmaps/${encodeURIComponent(path)}/share-links`, { method: "POST", body: JSON.stringify({ expiresInDays }) });
    const body = (await response.json().catch(() => ({}))) as { url?: string; expiresAt?: string; error?: string };
    if (!response.ok || !body.url) throw new Error(body.error ?? `BloomMD cloud could not share ${path} (${response.status}).`);
    return { url: body.url, expiresAt: body.expiresAt ?? "" };
  }

  async freePath(area: string, title: string): Promise<string> {
    const taken = new Set((await this.list()).map((entry) => entry.path));
    // Sub-areas ("Learnings/dev-team") are joined by " › ": a file name cannot contain "/".
    const prefix = areaSegments(area).map((segment) => safeSegment(segment).replace(/ [–›] /g, " - ")).filter(Boolean).join(CLOUD_AREA_SEPARATOR);
    const base = `${prefix ? `${prefix} – ` : ""}${safeSegment(title) || "Notiz"}`;
    for (let index = 1; index < 100; index += 1) {
      const candidate = `${base}${index > 1 ? ` ${index}` : ""}.md`;
      if (!taken.has(candidate)) return candidate;
    }
    throw new Error(`No free file name for "${title}".`);
  }
}

export type { AgentAccessConfig };
export { accessFor };

/** Reads `.bloommd/agent.json`; without it the agent may only propose changes. */
export async function readAccessConfig(stateDir: string): Promise<AgentAccessConfig> {
  return new AgentLedger(nodeStateFiles(stateDir), "", "vault").rights();
}

export async function writeAccessConfig(stateDir: string, config: AgentAccessConfig): Promise<void> {
  await new AgentLedger(nodeStateFiles(stateDir), "", "vault").setRights(config);
}

/** The agent state folder (`.bloommd`) on this machine, for the shared `AgentLedger`. */
export function nodeStateFiles(stateDir: string): AgentStateFiles {
  const full = (name: string) => join(stateDir, ...name.split("/"));
  return {
    read: (name) => readFile(full(name), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
    async write(name, text) {
      await mkdir(dirname(full(name)), { recursive: true });
      await writeFile(full(name), text, "utf8");
    },
    async append(name, text) {
      await mkdir(dirname(full(name)), { recursive: true });
      await appendFile(full(name), text, "utf8");
    },
    remove: (name) => rm(full(name), { force: true }),
    list: (dir) => readdir(full(dir)).catch(() => [] as string[]),
  };
}
