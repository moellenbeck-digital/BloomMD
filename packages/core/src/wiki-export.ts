/**
 * Static export of a Wiki Bundle: a folder that reads on any web space, without Node, a database
 * or a running server.
 *
 * The export is an OKF-conformant copy of the bundle plus two additions — `wiki.json`, the same
 * information `/api/wiki` serves, and `index.html`, a self-contained read-only browser that embeds
 * a copy of that JSON so it also opens from `file://`.
 *
 * Two properties are load-bearing:
 * - **Deterministic.** Nothing in the output depends on when or where it was written, so two runs
 *   over the same bundle produce byte-identical folders. (`expired` is the one value that depends
 *   on the calendar; pass `now` to pin it. The browser re-evaluates it when the page is opened.)
 * - **Nothing leaves the bundle.** Only files that resolve, symlinks included, to a safe location
 *   inside the bundle are copied. Everything else is listed as unavailable with a reason; it is
 *   never silently dropped, because a wiki whose broken references vanish looks healthier than it is.
 */

import { copyFile, mkdir, readdir, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import {
  extractWikiResources,
  getWikiStatus,
  isSafeWikiResourceTarget,
  isWikiPageExpired,
  readWikiBundle,
  type WikiActorEvent,
  type WikiPage,
  type WikiPageStatus,
  type WikiResourceReference,
  type WikiSourceHashes,
  type WikiSourceProvenance,
  type WikiTrustTier,
  type WikiUsageWindow,
} from "./wiki";
import { renderWikiBrowserHtml } from "./wiki-export-browser";
import { citationSummary, pageCitations, type CitationSummary, type PageCitation, type PreviewAvailability, type ResourcePreview } from "./wiki-preview";
import { buildKnowledgeGraph, knowledgeGraphHealth, type KnowledgeGraph, type KnowledgeGraphHealth } from "./wiki-search";

export const WIKI_EXPORT_FORMAT = "bloommd-wiki-export";
export const WIKI_EXPORT_VERSION = 1;

/** Files the export writes itself; a bundle resource may not take their place. */
const RESERVED_EXPORT_PATHS = new Set(["index.html", "wiki.json"]);

/**
 * Local files that may be copied. Deliberately an allowlist: an `.html` or `.svg` copied next to
 * the browser would run with the export's origin when opened, so documents that can carry script
 * are not shipped.
 */
const EXPORTABLE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif",
  "mp4", "webm", "mov", "m4v",
  "mp3", "wav", "ogg", "m4a",
  "pdf", "txt", "csv", "tsv", "json",
  "docx", "xlsx", "pptx", "odt", "ods", "odp", "zip",
]);

const DEFAULT_MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

export type ExportReasonCode =
  | "outside-bundle"
  | "scheme"
  | "invalid-encoding"
  | "not-found"
  | "not-a-file"
  | "hidden"
  | "type-not-allowed"
  | "too-large"
  | "reserved-name"
  | "page-not-found"
  | "external";

/** `ResourcePreview` plus a machine-readable reason, so the browser can word it in either language. */
export interface ExportedResource extends ResourcePreview {
  reasonCode: ExportReasonCode | null;
}

export interface WikiExportPage {
  path: string;
  title: string;
  id: string | null;
  type: string;
  description: string | null;
  updated: string | null;
  content: string;
  tags: string[];
  lifecycle: WikiPageStatus;
  trustTier: WikiTrustTier;
  generated: WikiActorEvent | null;
  verified: WikiActorEvent[];
  staleAfter: string | null;
  expired: boolean;
  usageWindow: WikiUsageWindow | null;
  sources: WikiSourceProvenance[];
  citations: PageCitation[];
  citationSummary: CitationSummary;
  /** Every reference found in the page, with the `safe` flag as `extractWikiResources` computed it. */
  resources: WikiResourceReference[];
  /** Availability per reference in the export; unavailable ones stay listed with their reason. */
  previews: ExportedResource[];
  /** Lint issue codes for the page. */
  issues: string[];
}

export interface WikiExportData {
  format: typeof WIKI_EXPORT_FORMAT;
  formatVersion: typeof WIKI_EXPORT_VERSION;
  title: string;
  sourceVerification: "verified" | "unavailable";
  status: {
    okfVersion: string | null;
    pageCount: number;
    sourceCount: number;
    staleSourceCount: number;
    pendingPageCount: number;
    expiredPageCount: number;
    statusCounts: Record<WikiPageStatus, number>;
    trustCounts: Record<WikiTrustTier, number>;
    issueCount: number;
  };
  index: string | null;
  log: string | null;
  indexPreviews: ExportedResource[];
  logPreviews: ExportedResource[];
  graph: KnowledgeGraph;
  graphHealth: KnowledgeGraphHealth;
  pages: WikiExportPage[];
  /** Every file of the export relative to its root, sorted. Lets a re-export replace exactly its own output. */
  files: string[];
}

export interface ExportWikiBundleOptions {
  /**
   * Replace a previous export in a non-empty `outDir`. Only a folder whose `wiki.json` identifies it
   * as a BloomMD Wiki export qualifies, and only the files that export lists are removed.
   */
  overwrite?: boolean;
  /** Hashes the sources currently have, as for `getWikiStatus`. Enables "source changed" markers. */
  sourceHashes?: WikiSourceHashes;
  /** Reference date for `expired`. Defaults to now; pin it for output that must not change with the calendar. */
  now?: Date;
  /** Overrides the title otherwise taken from the bundle's `index.md`. */
  title?: string;
  /** Local files above this size are listed as unavailable instead of copied. Default 25 MiB. */
  maxResourceBytes?: number;
}

export interface WikiExportResult {
  outDir: string;
  files: string[];
  pageCount: number;
  /** Local resources copied into the export. */
  resourceCount: number;
  /** References the export could not ship (missing, refused, unsupported). */
  unavailableCount: number;
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
}

function isNotFound(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/** `realpath` for a path that may not exist yet: resolves the part that does and appends the rest. */
async function realpathLenient(path: string): Promise<string> {
  const missing: string[] = [];
  let current = resolve(path);
  for (;;) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function nameKey(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "").toLowerCase();
}

interface ExportContext {
  root: string;
  realRoot: string;
  /** Bundle paths that are pages, plus the reserved `index.md`/`log.md` when present. */
  pagePaths: Set<string>;
  pagesByName: Map<string, string[]>;
  /** Bundle-relative target path → real file to copy. */
  copies: Map<string, string>;
  maxResourceBytes: number;
}

function exported(
  reference: WikiResourceReference,
  availability: PreviewAvailability,
  reasonCode: ExportReasonCode | null,
  reason: string | null,
  extra: { resolvedPath?: string; byteSize?: number } = {},
): ExportedResource {
  return {
    reference,
    availability,
    reason,
    reasonCode,
    resolvedPath: extra.resolvedPath ?? null,
    byteSize: extra.byteSize ?? null,
  };
}

/** Wiki links resolve like the Knowledge Map does: path relative to the page first, then bare name. */
function resolveWikiTarget(context: ExportContext, fromPath: string, target: string): string | null {
  const cleaned = (target.split("#", 1)[0] ?? "").trim().replace(/^\.\//, "");
  if (!cleaned) return fromPath;
  const withExtension = /\.md$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
  const folder = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const relative = folder ? `${folder}/${withExtension}` : withExtension;
  if (context.pagePaths.has(relative)) return relative;
  if (context.pagePaths.has(withExtension)) return withExtension;
  if (!cleaned.includes("/")) {
    const candidates = context.pagesByName.get(nameKey(cleaned)) ?? [];
    // An ambiguous bare name stays unresolved: guessing which page was meant is worse than saying so.
    if (candidates.length === 1) return candidates[0]!;
  }
  return null;
}

async function describeLocalTarget(context: ExportContext, fromPath: string, reference: WikiResourceReference): Promise<ExportedResource> {
  const bare = reference.target.split(/[?#]/, 1)[0] ?? "";
  // A bare `#anchor` points into the page it is on.
  if (!bare) return exported(reference, "available", null, null, { resolvedPath: fromPath });

  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return exported(reference, "unsafe", "invalid-encoding", "The path is not validly percent-encoded.");
  }
  // Re-check after decoding: `%2e%2e/` is `../` once the browser or a file system reads it.
  if (decoded.includes("\\") || !isSafeWikiResourceTarget(decoded)) {
    return exported(reference, "unsafe", "outside-bundle", "The target lies outside the bundle.");
  }

  // Markdown links are relative to their page; bundles written for the API also use bundle-root paths.
  const candidates = [...new Set([posix.normalize(posix.join(posix.dirname(fromPath), decoded)), posix.normalize(decoded)])]
    .filter((candidate) => candidate !== ".." && !candidate.startsWith("../") && !isAbsolute(candidate));

  let sawDirectory = false;
  for (const candidate of candidates) {
    const absolute = resolve(context.root, candidate);
    let real: string;
    try {
      real = await realpath(absolute);
    } catch (error) {
      if (isNotFound(error)) continue;
      throw error;
    }
    // Containment is decided on the resolved path, so a symlink cannot lead out of the bundle.
    if (!isInside(context.realRoot, real)) {
      return exported(reference, "unsafe", "outside-bundle", "The target resolves to a location outside the bundle.");
    }
    const info = await stat(real);
    if (!info.isFile()) {
      sawDirectory = true;
      continue;
    }
    return classifyExistingFile(context, reference, candidate, real, info.size);
  }
  return sawDirectory
    ? exported(reference, "missing", "not-a-file", "The target is not a file.")
    : exported(reference, "missing", "not-found", "The file does not exist in the bundle.");
}

function classifyExistingFile(context: ExportContext, reference: WikiResourceReference, candidate: string, real: string, size: number): ExportedResource {
  const ext = extensionOf(candidate);
  // A Markdown file that is a page is already part of the export; the link just points at it.
  if (ext === "md" && context.pagePaths.has(candidate)) {
    return exported(reference, "available", null, null, { resolvedPath: candidate });
  }
  if (candidate.split("/").some((segment) => segment.startsWith(".") || segment === "node_modules")) {
    return exported(reference, "unsafe", "hidden", "Hidden paths are not exported.");
  }
  if (RESERVED_EXPORT_PATHS.has(candidate.toLowerCase())) {
    return exported(reference, "unsafe", "reserved-name", "The name is reserved by the export.");
  }
  if (!EXPORTABLE_EXTENSIONS.has(ext)) {
    return exported(reference, "unsafe", "type-not-allowed", "This file type is not shipped in the export.");
  }
  if (size > context.maxResourceBytes) {
    return exported(reference, "unsafe", "too-large", `The file exceeds the export limit of ${context.maxResourceBytes} bytes.`);
  }
  context.copies.set(candidate, real);
  return exported(reference, "available", null, null, { resolvedPath: candidate, byteSize: size });
}

async function describeReference(context: ExportContext, fromPath: string, reference: WikiResourceReference): Promise<ExportedResource> {
  if (!reference.safe || !isSafeWikiResourceTarget(reference.target)) {
    const scheme = /^[a-z][a-z\d+.-]*:/i.test(reference.target.trim());
    return scheme
      ? exported(reference, "unsafe", "scheme", "Only http(s) and bundle-relative targets are supported.")
      : exported(reference, "unsafe", "outside-bundle", "The target lies outside the bundle.");
  }
  if (/^https?:\/\//i.test(reference.target)) {
    // Never contacted, previewed or embedded: the browser offers a link and nothing else.
    return exported(reference, "needs-consent", "external", "External address. The export never loads it; it opens only on click.");
  }
  if (reference.kind === "wiki") {
    const resolved = resolveWikiTarget(context, fromPath, reference.target);
    return resolved
      ? exported(reference, "available", null, null, { resolvedPath: resolved })
      : exported(reference, "missing", "page-not-found", "No page with this name in the bundle.");
  }
  return describeLocalTarget(context, fromPath, reference);
}

async function describeAll(context: ExportContext, fromPath: string, markdown: string): Promise<ExportedResource[]> {
  const out: ExportedResource[] = [];
  for (const reference of extractWikiResources(markdown)) out.push(await describeReference(context, fromPath, reference));
  return out;
}

interface ExistingExport {
  files: string[];
}

/**
 * Decides whether `outDir` may be written to. Returns the previous export to replace, or null when
 * the folder is empty or absent. Everything else throws before a byte is written.
 */
async function inspectOutDir(root: string, outDir: string, overwrite: boolean): Promise<ExistingExport | null> {
  const realRoot = await realpath(root);
  const realOut = await realpathLenient(outDir);
  if (isInside(realRoot, realOut)) throw new Error(`The output directory must not be inside the bundle: ${outDir}`);
  if (isInside(realOut, realRoot)) throw new Error(`The output directory must not contain the bundle: ${outDir}`);

  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") throw new Error(`The output path is not a directory: ${outDir}`);
    throw error;
  }
  if (entries.length === 0) return null;
  if (!overwrite) throw new Error(`The output directory is not empty: ${outDir}. Pass overwrite to replace a previous export.`);

  const previous = await readFile(join(outDir, "wiki.json"), "utf8")
    .then((text) => JSON.parse(text) as unknown)
    .catch((error: unknown) => {
      throw new Error(`Refusing to overwrite ${outDir}: it does not contain a BloomMD Wiki export (${error instanceof Error ? error.message : "unreadable wiki.json"}).`);
    });
  const manifest = previous as Partial<WikiExportData> | null;
  if (!manifest || manifest.format !== WIKI_EXPORT_FORMAT || !Array.isArray(manifest.files)) {
    throw new Error(`Refusing to overwrite ${outDir}: wiki.json is not a BloomMD Wiki export.`);
  }
  // The manifest is data from disk, not a trusted instruction: it may only name files below outDir.
  const files = manifest.files.filter((file): file is string => typeof file === "string" && isSafeRelativeFile(file));
  return { files };
}

function isSafeRelativeFile(path: string): boolean {
  return Boolean(path) && !path.includes("\\") && !isAbsolute(path) && path.split("/").every((part) => part && part !== "." && part !== "..");
}

async function removePreviousExport(outDir: string, previous: ExistingExport): Promise<void> {
  const base = resolve(outDir);
  const directories = new Set<string>();
  for (const file of [...previous.files, "wiki.json", "index.html"]) {
    const absolute = resolve(base, file);
    if (!isInside(base, absolute) || absolute === base) continue;
    await rm(absolute, { force: true });
    for (let dir = dirname(absolute); dir !== base && isInside(base, dir); dir = dirname(dir)) directories.add(dir);
  }
  // Prune folders the old export emptied, deepest first; anything still holding a file stays.
  for (const dir of [...directories].sort((a, b) => b.length - a.length)) {
    if ((await readdir(dir)).length === 0) await rmdir(dir);
  }
}

/**
 * Writes the static export of the bundle at `rootDir` into `outDir`.
 *
 * @throws when `outDir` is inside the bundle (or contains it), or is non-empty and not an
 * export that `options.overwrite` may replace. Nothing is written in that case.
 */
export async function exportWikiBundle(rootDir: string, outDir: string, options: ExportWikiBundleOptions = {}): Promise<WikiExportResult> {
  const root = resolve(rootDir);
  const rootInfo = await stat(root).catch((error: unknown) => {
    if (isNotFound(error)) throw new Error(`Wiki bundle not found: ${rootDir}`);
    throw error;
  });
  if (!rootInfo.isDirectory()) throw new Error(`Wiki bundle is not a directory: ${rootDir}`);
  const out = resolve(outDir);
  const previous = await inspectOutDir(root, out, options.overwrite === true);

  const sourceHashes = options.sourceHashes ?? {};
  const now = options.now ?? new Date();
  const [bundle, status] = await Promise.all([readWikiBundle(root), getWikiStatus(root, sourceHashes)]);
  const pages = [...bundle.pages].sort((a, b) => compareCodeUnits(a.path, b.path));
  const sorted = { ...bundle, pages };

  const pagePaths = new Set(pages.map((page) => page.path));
  if (bundle.index !== null) pagePaths.add("index.md");
  if (bundle.log !== null) pagePaths.add("log.md");
  const pagesByName = new Map<string, string[]>();
  for (const page of pages) {
    const key = nameKey(page.path);
    pagesByName.set(key, [...(pagesByName.get(key) ?? []), page.path]);
  }
  const context: ExportContext = {
    root,
    realRoot: await realpath(root),
    pagePaths,
    pagesByName,
    copies: new Map(),
    maxResourceBytes: options.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES,
  };

  const issuesByPath = new Map<string, string[]>();
  for (const issue of status.issues) issuesByPath.set(issue.path, [...(issuesByPath.get(issue.path) ?? []), issue.code]);

  const exportPages: WikiExportPage[] = [];
  for (const page of pages) exportPages.push(await toExportPage(context, page, sourceHashes, now, issuesByPath.get(page.path) ?? []));

  const indexData = bundle.index === null ? null : parseFrontmatter(bundle.index);
  const logData = bundle.log === null ? null : parseFrontmatter(bundle.log);
  const indexPreviews = indexData ? await describeAll(context, "index.md", indexData.content) : [];
  const logPreviews = logData ? await describeAll(context, "log.md", logData.content) : [];

  const graph = buildKnowledgeGraph(sorted);
  const bundleFiles = [
    ...(bundle.index !== null ? ["index.md"] : []),
    ...(bundle.log !== null ? ["log.md"] : []),
    ...pages.map((page) => page.path),
  ];
  const files = [...new Set([...bundleFiles, ...context.copies.keys(), "index.html", "wiki.json"])].sort(compareCodeUnits);

  const title = options.title?.trim() || textOrNull(indexData?.data.title)?.trim() || "Wiki";
  const data: WikiExportData = {
    format: WIKI_EXPORT_FORMAT,
    formatVersion: WIKI_EXPORT_VERSION,
    title,
    sourceVerification: Object.keys(sourceHashes).length > 0 ? "verified" : "unavailable",
    status: {
      okfVersion: status.okfVersion,
      pageCount: status.pageCount,
      sourceCount: status.sourceCount,
      staleSourceCount: status.staleSourceCount,
      pendingPageCount: status.pendingPageCount,
      expiredPageCount: exportPages.filter((page) => page.expired).length,
      statusCounts: status.statusCounts,
      trustCounts: status.trustCounts,
      issueCount: status.issues.length,
    },
    index: bundle.index,
    log: bundle.log,
    indexPreviews,
    logPreviews,
    graph,
    graphHealth: knowledgeGraphHealth(graph),
    pages: exportPages,
    files,
  };
  const dataJson = JSON.stringify(data, null, 2);

  // All checks and reads are done; from here on the output directory is touched.
  if (previous) await removePreviousExport(out, previous);
  await mkdir(out, { recursive: true });

  const textFiles = new Map<string, string>();
  if (bundle.index !== null) textFiles.set("index.md", bundle.index);
  if (bundle.log !== null) textFiles.set("log.md", bundle.log);
  for (const page of pages) textFiles.set(page.path, page.raw);
  textFiles.set("wiki.json", `${dataJson}\n`);
  textFiles.set("index.html", renderWikiBrowserHtml({ title, dataJson }));

  for (const [path, content] of textFiles) {
    const destination = exportDestination(out, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  for (const [path, source] of context.copies) {
    const destination = exportDestination(out, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  return {
    outDir: out,
    files,
    pageCount: pages.length,
    resourceCount: context.copies.size,
    unavailableCount: [...exportPages.flatMap((page) => page.previews), ...indexPreviews, ...logPreviews]
      .filter((preview) => preview.availability === "missing" || preview.availability === "unsafe").length,
  };
}

function exportDestination(out: string, path: string): string {
  const destination = resolve(out, path);
  if (!isInside(out, destination) || destination === out) throw new Error(`Refusing to write outside the export directory: ${path}`);
  return destination;
}

async function toExportPage(context: ExportContext, page: WikiPage, sourceHashes: WikiSourceHashes, now: Date, issues: string[]): Promise<WikiExportPage> {
  const citations = pageCitations(page, sourceHashes);
  return {
    path: page.path,
    title: page.title,
    id: textOrNull(page.frontmatter.id),
    type: page.type ?? "concept",
    description: page.description,
    updated: textOrNull(page.frontmatter.updated) ?? textOrNull(page.frontmatter.date),
    content: page.content,
    tags: Array.isArray(page.frontmatter.tags) ? page.frontmatter.tags.filter((tag): tag is string => typeof tag === "string") : [],
    lifecycle: page.status,
    trustTier: page.trustTier,
    generated: page.generated,
    verified: page.verified,
    staleAfter: page.staleAfter,
    expired: isWikiPageExpired(page, now),
    usageWindow: page.usageWindow,
    sources: page.sources,
    citations,
    citationSummary: citationSummary(citations),
    resources: extractWikiResources(page.content),
    previews: await describeAll(context, page.path, page.content),
    issues,
  };
}
