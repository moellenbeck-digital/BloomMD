import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";

export const WIKI_BUNDLE_VERSION = "0.2";
/** Bundles written by earlier BloomMD versions stay readable. */
export const SUPPORTED_OKF_VERSIONS = ["0.1", "0.2"] as const;
const MAX_PAGE_BYTES = 2_000_000;

export type WikiIssueCode =
  | "missing-reserved-file"
  | "missing-type"
  | "invalid-frontmatter"
  | "duplicate-id"
  | "unsafe-resource"
  | "broken-link"
  | "missing-source-hash"
  | "stale-source"
  | "unindexed-page"
  | "expired-page"
  | "invalid-status"
  | "unknown-okf-version";

/** OKF v0.2 lifecycle status. Anything else is reported by lint and treated as `stable`. */
export type WikiPageStatus = "draft" | "stable" | "deprecated";
const WIKI_PAGE_STATUSES: readonly WikiPageStatus[] = ["draft", "stable", "deprecated"];

/**
 * Pages of `type: learning` (docs/LEARNINGS.md) use their own status words, each mapped to the
 * OKF lifecycle: neu = draft, bestätigt = stable, veraltet and ersetzt = deprecated.
 */
const LEARNING_PAGE_TYPE = "learning";
const LEARNING_STATUS_LIFECYCLE: Readonly<Record<string, WikiPageStatus>> = {
  neu: "draft",
  "bestätigt": "stable",
  veraltet: "deprecated",
  ersetzt: "deprecated",
};

const isLearning = (type: string | null): boolean => type?.toLowerCase() === LEARNING_PAGE_TYPE;

/** The lifecycle of a status word on a page of this type; null when the word is not allowed there. */
function lifecycleOf(type: string | null, rawStatus: string | null): WikiPageStatus | null {
  if (isLearning(type)) {
    return rawStatus && Object.hasOwn(LEARNING_STATUS_LIFECYCLE, rawStatus) ? LEARNING_STATUS_LIFECYCLE[rawStatus]! : null;
  }
  return WIKI_PAGE_STATUSES.includes(rawStatus as WikiPageStatus) ? (rawStatus as WikiPageStatus) : null;
}

/**
 * How much a consumer can rely on a page.
 *
 * Derived, never stored: a human or agent signing off in `verified` outranks the `generated`
 * record, and a page that declares neither is unattributed.
 */
export type WikiTrustTier = "verified" | "generated" | "unattributed";

export interface WikiActorEvent {
  by: string;
  at: string;
}

export interface WikiSourceProvenance {
  /** OKF v0.2 requires a resource per source. v0.1 bundles fall back to their `id`. */
  resource: string;
  id: string;
  /** BloomMD extension: enables deterministic drift detection against the raw source. */
  contentHash?: string;
  title?: string;
  author?: string;
  usageCount?: number;
  lastModified?: string;
  retrievedAt?: string;
}

export interface WikiUsageWindow {
  from?: string;
  to?: string;
}

export interface WikiPage {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  raw: string;
  contentHash: string;
  sources: WikiSourceProvenance[];
  /** OKF v0.2 trust signals. All optional — a bundle without them stays conformant. */
  type: string | null;
  description: string | null;
  status: WikiPageStatus;
  rawStatus: string | null;
  generated: WikiActorEvent | null;
  verified: WikiActorEvent[];
  staleAfter: string | null;
  usageWindow: WikiUsageWindow | null;
  trustTier: WikiTrustTier;
}

export interface WikiBundle {
  rootDir: string;
  pages: WikiPage[];
  index: string | null;
  log: string | null;
}

export interface WikiLintIssue {
  code: WikiIssueCode;
  path: string;
  message: string;
  relatedPath?: string;
}

export interface WikiSourceHashes {
  [sourceId: string]: string;
}

export interface WikiStatus {
  okfVersion: string | null;
  pageCount: number;
  sourceCount: number;
  staleSourceCount: number;
  missingSourceCount: number;
  unindexedPageCount: number;
  pendingPageCount: number;
  /** OKF v0.2 lifecycle and trust rollup, so an agent can ask "what may I rely on?" */
  statusCounts: Record<WikiPageStatus, number>;
  trustCounts: Record<WikiTrustTier, number>;
  expiredPageCount: number;
  issues: WikiLintIssue[];
}

export type WikiResourceKind = "web" | "image" | "video" | "audio" | "pdf" | "file" | "wiki";

export interface WikiResourceReference {
  kind: WikiResourceKind;
  target: string;
  label: string;
  alt?: string;
  title?: string;
  safe: boolean;
}

export interface WikiChange {
  path: string;
  content: string;
  reason: string;
  sourceIds?: string[];
}

export interface WikiProposalChange extends WikiChange {
  beforeHash: string | null;
  afterHash: string;
}

export interface WikiProposal {
  version: 1;
  id: string;
  createdAt: string;
  changes: WikiProposalChange[];
  approvedAt?: string;
  approvedBy?: string;
}

export interface WikiDiff {
  path: string;
  beforeHash: string | null;
  afterHash: string;
  text: string;
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function assertSafeMarkdownPath(path: string): string {
  const normalized = normalizedPath(path);
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`Wiki path must be relative: ${path}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "..")) throw new Error(`Unsafe wiki path: ${path}`);
  if (!normalized.toLowerCase().endsWith(".md")) throw new Error(`Wiki path must be Markdown: ${path}`);
  return normalized;
}

function absoluteWikiPath(rootDir: string, path: string): string {
  const safePath = assertSafeMarkdownPath(path);
  const root = resolve(rootDir);
  const absolute = resolve(root, safePath);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error(`Wiki path escapes bundle: ${path}`);
  return absolute;
}

export function hashWikiContent(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function titleFromPath(path: string, frontmatter: Record<string, unknown>): string {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) return frontmatter.title.trim();
  return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * OKF v0.2 §11 requires graceful degradation: a source entry that only carries `resource` is
 * valid, and BloomMD's `contentHash` extension is what additionally enables drift detection.
 * v0.1 bundles identified sources by `id` alone, so that still resolves to a resource.
 */
function parseSources(value: unknown): WikiSourceProvenance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const resource = str(source.resource) ?? str(source.id);
    if (!resource) return [];
    const usageCount = typeof source.usage_count === "number" ? source.usage_count : undefined;
    return [{
      resource,
      id: str(source.id) ?? resource,
      ...(str(source.contentHash) ? { contentHash: str(source.contentHash)! } : {}),
      ...(str(source.title) ? { title: str(source.title)! } : {}),
      ...(str(source.author) ? { author: str(source.author)! } : {}),
      ...(usageCount !== undefined ? { usageCount } : {}),
      ...(str(source.last_modified) ? { lastModified: str(source.last_modified)! } : {}),
      ...(str(source.retrievedAt) ? { retrievedAt: str(source.retrievedAt)! } : {}),
    }];
  });
}

function parseActorEvent(value: unknown): WikiActorEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  const by = str(event.by);
  const at = str(event.at);
  return by && at ? { by, at } : null;
}

/** `verified` accepts a single event or a list of them. */
function parseVerified(value: unknown): WikiActorEvent[] {
  if (Array.isArray(value)) return value.flatMap((entry) => parseActorEvent(entry) ?? []);
  const single = parseActorEvent(value);
  return single ? [single] : [];
}

function parseUsageWindow(value: unknown): WikiUsageWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const window = value as Record<string, unknown>;
  const from = str(window.from);
  const to = str(window.to);
  return from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : null;
}

function trustTierOf(generated: WikiActorEvent | null, verified: WikiActorEvent[]): WikiTrustTier {
  if (verified.length > 0) return "verified";
  return generated ? "generated" : "unattributed";
}

/** A page is expired once `stale_after` lies strictly before the reference date. */
export function isWikiPageExpired(page: WikiPage, now = new Date()): boolean {
  if (!page.staleAfter) return false;
  const deadline = Date.parse(`${page.staleAfter}T23:59:59.999Z`);
  return Number.isFinite(deadline) && deadline < now.getTime();
}

async function walkMarkdown(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const absolute = join(currentDir, entry.name);
    if (entry.isDirectory()) paths.push(...await walkMarkdown(rootDir, absolute));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) paths.push(normalizedPath(relative(rootDir, absolute)));
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

async function readPage(rootDir: string, path: string): Promise<WikiPage> {
  const raw = await readFile(absoluteWikiPath(rootDir, path), "utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_PAGE_BYTES) throw new Error(`Wiki page exceeds ${MAX_PAGE_BYTES} bytes: ${path}`);
  const parsed = parseFrontmatter(raw);
  const data = parsed.data;
  const generated = parseActorEvent(data.generated);
  const verified = parseVerified(data.verified);
  const rawStatus = str(data.status);
  const type = str(data.type);
  return {
    path,
    title: titleFromPath(path, data),
    frontmatter: data,
    content: parsed.content,
    raw,
    contentHash: hashWikiContent(raw),
    sources: parseSources(data.sources),
    type,
    description: str(data.description),
    // OKF defaults an absent or unrecognised status to `stable`; lint reports the unrecognised case.
    status: lifecycleOf(type, rawStatus) ?? "stable",
    rawStatus,
    generated,
    verified,
    staleAfter: str(data.stale_after),
    usageWindow: parseUsageWindow(data.usage_window),
    trustTier: trustTierOf(generated, verified),
  };
}

export async function readWikiBundle(rootDir: string): Promise<WikiBundle> {
  const root = resolve(rootDir);
  const paths = await walkMarkdown(root).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const [index, log] = await Promise.all([
    readFile(join(root, "index.md"), "utf8").catch(() => null),
    readFile(join(root, "log.md"), "utf8").catch(() => null),
  ]);
  const pages = await Promise.all(paths.filter((path) => path !== "index.md" && path !== "log.md").map((path) => readPage(root, path)));
  return { rootDir: root, pages, index, log };
}

export async function initWikiBundle(rootDir: string, title = "BloomMD Wiki"): Promise<void> {
  const root = resolve(rootDir);
  await mkdir(join(root, "concepts"), { recursive: true });
  await mkdir(join(root, "sources"), { recursive: true });
  const indexPath = join(root, "index.md");
  const logPath = join(root, "log.md");
  // The bundle root index declares the OKF version for every consumer of this directory.
  const index = stringifyFrontmatter(`# ${title}\n\n<!-- Wiki pages are indexed deterministically by BloomMD. -->\n`, {
    type: "index",
    title,
    okf_version: WIKI_BUNDLE_VERSION,
  });
  const log = stringifyFrontmatter(`# Wiki log\n\n`, {
    type: "log",
    okf_version: WIKI_BUNDLE_VERSION,
  });
  await writeFile(indexPath, await fileExists(indexPath) ? await readFile(indexPath, "utf8") : index, "utf8");
  await writeFile(logPath, await fileExists(logPath) ? await readFile(logPath, "utf8") : log, "utf8");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function regenerateWikiIndex(rootDir: string): Promise<string> {
  const bundle = await readWikiBundle(rootDir);
  const title = bundle.index ? titleFromPath("index.md", parseFrontmatter(bundle.index).data) : "BloomMD Wiki";
  const links = bundle.pages.map((page) => `- [${page.title}](./${page.path})`).join("\n");
  const output = stringifyFrontmatter(`# ${title}\n\n${links || "<!-- No Wiki pages yet. -->"}\n`, {
    type: "index",
    title,
    okf_version: WIKI_BUNDLE_VERSION,
    updated: new Date().toISOString(),
  });
  await writeFile(join(resolve(rootDir), "index.md"), output, "utf8");
  return output;
}

export async function appendWikiLog(rootDir: string, entry: { message: string; actor?: string; proposalId?: string }): Promise<void> {
  const root = resolve(rootDir);
  const logPath = join(root, "log.md");
  const existing = await readFile(logPath, "utf8").catch(() => stringifyFrontmatter("# Wiki log\n\n", { type: "log", okf_version: WIKI_BUNDLE_VERSION }));
  const date = new Date().toISOString().slice(0, 10);
  const line = `- ${entry.message}${entry.actor ? ` (actor: ${entry.actor})` : ""}${entry.proposalId ? ` [proposal: ${entry.proposalId}]` : ""}`;
  const next = existing.includes(`## ${date}`) ? existing.replace(`## ${date}`, `## ${date}\n${line}`) : `${existing.trimEnd()}\n\n## ${date}\n${line}\n`;
  await writeFile(logPath, next, "utf8");
}

function extensionFor(target: string): string {
  return target.split(/[?#]/, 1)[0]?.split(".").pop()?.toLowerCase() || "";
}

function resourceKind(target: string, image = false): WikiResourceKind {
  if (image) return "image";
  if (/^https?:\/\//i.test(target)) {
    const ext = extensionFor(target);
    if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return "image";
    if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
    if (ext === "pdf") return "pdf";
    return "web";
  }
  const ext = extensionFor(target);
  if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "file";
}

export function isSafeWikiResourceTarget(target: string): boolean {
  const value = target.trim();
  if (!value || /[\u0000-\u001f]/.test(value)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return /^https?:\/\//i.test(value);
  return !value.startsWith("/") && !value.split(/[?#]/, 1)[0]!.split("/").some((part) => part === "..");
}

export function extractWikiResources(markdown: string): WikiResourceReference[] {
  const resources: WikiResourceReference[] = [];
  const seen = new Set<string>();
  const add = (resource: WikiResourceReference) => {
    const key = `${resource.kind}:${resource.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      resources.push(resource);
    }
  };
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g;
  for (const match of markdown.matchAll(imageRe)) {
    const target = match[2] ?? "";
    add({ kind: resourceKind(target, true), target, label: match[1]?.trim() || target, ...(match[1] ? { alt: match[1].trim() } : {}), ...(match[3] ? { title: match[3] } : {}), safe: isSafeWikiResourceTarget(target) });
  }
  const linkRe = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g;
  for (const match of markdown.matchAll(linkRe)) {
    const target = match[2] ?? "";
    add({ kind: resourceKind(target), target, label: match[1]?.trim() || target, ...(match[3] ? { title: match[3] } : {}), safe: isSafeWikiResourceTarget(target) });
  }
  const wikiRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  for (const match of markdown.matchAll(wikiRe)) {
    const target = (match[1] ?? "").trim();
    add({ kind: "wiki", target, label: (match[2] ?? target).trim(), safe: isSafeWikiResourceTarget(target) });
  }
  const htmlMediaRe = /<(?:video|audio|source|img)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of markdown.matchAll(htmlMediaRe)) {
    const target = match[1] ?? "";
    add({ kind: resourceKind(target), target, label: target, safe: isSafeWikiResourceTarget(target) });
  }
  return resources;
}

export async function lintWikiBundle(rootDir: string, sourceHashes: WikiSourceHashes = {}): Promise<WikiLintIssue[]> {
  const bundle = await readWikiBundle(rootDir);
  const issues: WikiLintIssue[] = [];
  if (!bundle.index) issues.push({ code: "missing-reserved-file", path: "index.md", message: "Wiki bundle is missing index.md." });
  if (!bundle.log) issues.push({ code: "missing-reserved-file", path: "log.md", message: "Wiki bundle is missing log.md." });
  const ids = new Map<string, string>();
  const indexed = new Set<string>();
  if (bundle.index) {
    for (const match of bundle.index.matchAll(/\]\(\.\/([^\s)]+)\)/g)) indexed.add(match[1] ?? "");
  }
  const declaredVersion = bundle.index ? str(parseFrontmatter(bundle.index).data.okf_version) : null;
  if (declaredVersion && !SUPPORTED_OKF_VERSIONS.includes(declaredVersion as typeof SUPPORTED_OKF_VERSIONS[number])) {
    issues.push({
      code: "unknown-okf-version",
      path: "index.md",
      message: `Bundle declares OKF ${declaredVersion}; BloomMD reads ${SUPPORTED_OKF_VERSIONS.join(" and ")}. Unknown fields are preserved.`,
    });
  }

  for (const page of bundle.pages) {
    if (!page.type) issues.push({ code: "missing-type", path: page.path, message: "Every Wiki page needs a non-empty YAML type." });
    if (page.rawStatus && lifecycleOf(page.type, page.rawStatus) === null) {
      const defined = isLearning(page.type) ? `Learnings use ${Object.keys(LEARNING_STATUS_LIFECYCLE).join(", ")}` : `OKF defines ${WIKI_PAGE_STATUSES.join(", ")}`;
      issues.push({
        code: "invalid-status",
        path: page.path,
        message: `Unknown status "${page.rawStatus}". ${defined}; the page is treated as stable.`,
      });
    }
    if (isWikiPageExpired(page)) {
      issues.push({ code: "expired-page", path: page.path, message: `Page declared itself stale after ${page.staleAfter}.` });
    }
    const id = typeof page.frontmatter.id === "string" ? page.frontmatter.id : null;
    if (id && ids.has(id)) issues.push({ code: "duplicate-id", path: page.path, relatedPath: ids.get(id), message: `Duplicate Wiki page id: ${id}.` });
    if (id) ids.set(id, page.path);
    if (!indexed.has(page.path)) issues.push({ code: "unindexed-page", path: page.path, message: "Wiki page is not linked from index.md." });
    for (const resource of extractWikiResources(page.content)) {
      if (!resource.safe) issues.push({ code: "unsafe-resource", path: page.path, message: `Unsafe resource target: ${resource.target}` });
      if (["file", "pdf", "image", "video", "audio"].includes(resource.kind)) {
        const target = resource.target.split("#", 1)[0] ?? resource.target;
        const pageRelativeTarget = normalizedPath(join(dirname(page.path), target));
        const existsInBundle = bundle.pages.some((candidate) => candidate.path === pageRelativeTarget || candidate.path === target);
        const existsOnDisk = isSafeWikiResourceTarget(target) && !/^[a-z][a-z\d+.-]*:/i.test(target)
          ? await fileExists(resolve(rootDir, dirname(page.path), target))
          : false;
        const isExternalTarget = /^[a-z][a-z\d+.-]*:/i.test(target);
        if (isSafeWikiResourceTarget(target) && !isExternalTarget && !sourceHashes[target] && !existsInBundle && !existsOnDisk) {
          issues.push({ code: "broken-link", path: page.path, relatedPath: target, message: `Referenced local resource does not exist: ${target}` });
        }
      }
    }
    for (const source of page.sources) {
      // Drift detection needs BloomMD's contentHash extension. A plain OKF source without it is
      // conformant, so its absence is not an issue on its own.
      if (!source.contentHash) continue;
      const current = sourceHashes[source.id] ?? sourceHashes[source.resource];
      if (!current) issues.push({ code: "missing-source-hash", path: page.path, message: `No current hash is available for source: ${source.id}` });
      else if (current !== source.contentHash) issues.push({ code: "stale-source", path: page.path, message: `Source changed since distillation: ${source.id}` });
    }
  }
  return issues;
}

export async function getWikiStatus(rootDir: string, sourceHashes: WikiSourceHashes = {}): Promise<WikiStatus> {
  const bundle = await readWikiBundle(rootDir);
  const issues = await lintWikiBundle(rootDir, sourceHashes);
  const sources = bundle.pages.flatMap((page) => page.sources);
  const statusCounts: Record<WikiPageStatus, number> = { draft: 0, stable: 0, deprecated: 0 };
  const trustCounts: Record<WikiTrustTier, number> = { verified: 0, generated: 0, unattributed: 0 };
  for (const page of bundle.pages) {
    statusCounts[page.status] += 1;
    trustCounts[page.trustTier] += 1;
  }
  return {
    okfVersion: bundle.index ? str(parseFrontmatter(bundle.index).data.okf_version) : null,
    pageCount: bundle.pages.length,
    sourceCount: new Set(sources.map((source) => source.resource)).size,
    staleSourceCount: issues.filter((issue) => issue.code === "stale-source").length,
    missingSourceCount: issues.filter((issue) => issue.code === "missing-source-hash").length,
    unindexedPageCount: issues.filter((issue) => issue.code === "unindexed-page").length,
    pendingPageCount: statusCounts.draft,
    statusCounts,
    trustCounts,
    expiredPageCount: issues.filter((issue) => issue.code === "expired-page").length,
    issues,
  };
}

function lineDiff(before: string, after: string): string {
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  return [
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

export async function createWikiProposal(rootDir: string, changes: WikiChange[]): Promise<WikiProposal> {
  const unique = new Set<string>();
  const proposalChanges: WikiProposalChange[] = [];
  for (const change of changes) {
    const path = assertSafeMarkdownPath(change.path);
    if (unique.has(path)) throw new Error(`Proposal contains duplicate path: ${path}`);
    unique.add(path);
    if (Buffer.byteLength(change.content, "utf8") > MAX_PAGE_BYTES) throw new Error(`Proposal page exceeds ${MAX_PAGE_BYTES} bytes: ${path}`);
    const before = await readFile(absoluteWikiPath(rootDir, path), "utf8").catch(() => null);
    proposalChanges.push({ ...change, path, beforeHash: before === null ? null : hashWikiContent(before), afterHash: hashWikiContent(change.content) });
  }
  return { version: 1, id: randomUUID(), createdAt: new Date().toISOString(), changes: proposalChanges };
}

export function approveWikiProposal(proposal: WikiProposal, reviewer: string): WikiProposal {
  const normalizedReviewer = reviewer.trim();
  if (!normalizedReviewer) throw new Error("A reviewer is required to approve a Wiki proposal.");
  return { ...proposal, approvedBy: normalizedReviewer, approvedAt: new Date().toISOString() };
}

export async function validateWikiProposal(rootDir: string, proposal: WikiProposal): Promise<string[]> {
  if (proposal.version !== 1) return ["Unsupported Wiki proposal version."];
  const errors: string[] = [];
  for (const change of proposal.changes) {
    const current = await readFile(absoluteWikiPath(rootDir, change.path), "utf8").catch(() => null);
    const currentHash = current === null ? null : hashWikiContent(current);
    if (currentHash !== change.beforeHash) errors.push(`Source changed since proposal creation: ${change.path}`);
    if (hashWikiContent(change.content) !== change.afterHash) errors.push(`Proposal content hash is invalid: ${change.path}`);
    if (change.content.includes("\u0000")) errors.push(`Proposal contains a NUL byte: ${change.path}`);
    const parsed = parseFrontmatter(change.content);
    if (typeof parsed.data.type !== "string" || !parsed.data.type.trim()) errors.push(`Proposal page is missing frontmatter.type: ${change.path}`);
  }
  return errors;
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

export async function applyWikiProposal(rootDir: string, proposal: WikiProposal): Promise<WikiDiff[]> {
  if (!proposal.approvedBy || !proposal.approvedAt) throw new Error("Wiki proposals require explicit approval before apply.");
  const errors = await validateWikiProposal(rootDir, proposal);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const diffs: WikiDiff[] = [];
  for (const change of proposal.changes) {
    const path = absoluteWikiPath(rootDir, change.path);
    const before = await readFile(path, "utf8").catch(() => "");
    diffs.push({ path: change.path, beforeHash: change.beforeHash, afterHash: change.afterHash, text: lineDiff(before, change.content) });
    await writeAtomic(path, change.content);
  }
  await regenerateWikiIndex(rootDir);
  await appendWikiLog(rootDir, { message: `Applied approved Wiki proposal: ${proposal.changes.length} page(s)`, actor: proposal.approvedBy, proposalId: proposal.id });
  return diffs;
}

export function renderWikiDiff(diffs: WikiDiff[]): string {
  return diffs.map((diff) => `--- a/${diff.path}\n+++ b/${diff.path}\n${diff.text}`).join("\n\n");
}
