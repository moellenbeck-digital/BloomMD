/**
 * Live source hashes for Wiki Bundles.
 *
 * Until now the current hash of a cited source came from a hand-maintained JSON file. Here the
 * hash is read from the source folder itself, so drift is detected without anyone keeping a list.
 *
 * Everything in this module is read-only: it stats and reads files below one folder the caller
 * names, and never writes. The folder is chosen by a person (CLI flag, environment variable) and is
 * never an argument an agent can supply.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { isSafeWikiResourceTarget, type WikiPage, type WikiSourceCheck, type WikiSourceHashes, type WikiSourceProvenance } from "./wiki";

/**
 * - `present`: a local file inside the source folder; `hash`, `size` and `mtimeMs` are set.
 * - `missing`: a safe local path with no regular file behind it.
 * - `unmonitored`: http(s). Never fetched, never an error.
 * - `unsafe`: not a safe relative path (absolute, `..`, other scheme) or resolves outside the folder.
 */
export type WikiSourceState = "present" | "missing" | "unmonitored" | "unsafe";

export interface WikiSourceEntry {
  state: WikiSourceState;
  hash?: string;
  size?: number;
  mtimeMs?: number;
}

/** The state of all cited sources at one point in time. Keys are `sources[].resource`, sorted. */
export interface WikiSourceSnapshot {
  version: 1;
  sources: Record<string, WikiSourceEntry>;
}

export type WikiSourceChange = "changed" | "added" | "removed";

/** What differs between two snapshots. Every list is sorted, and there are no timestamps. */
export interface WikiSourceDiff {
  changed: string[];
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface WikiSourceImpact {
  /** One entry per changed source, sorted by resource, with the pages that cite it (sorted). */
  sources: Array<{ resource: string; change: WikiSourceChange; pages: string[] }>;
  /** Union of all affected pages, sorted. */
  pages: string[];
}

/** Everything lint, status, the CLI and the UI need from one live check. */
export interface WikiLiveSources {
  snapshot: WikiSourceSnapshot;
  /** Current hash per present source, keyed by resource. */
  sourceHashes: WikiSourceHashes;
  missing: string[];
  unmonitored: string[];
  unsafe: string[];
}

/** Keeps the previous snapshot between calls of a long-running process, so unchanged files are not rehashed. */
export interface WikiSourceCache {
  snapshot: WikiSourceSnapshot | null;
}

export const createWikiSourceCache = (): WikiSourceCache => ({ snapshot: null });

const HTTP = /^https?:\/\//i;

/** Plain code-unit order, so the result does not depend on the locale of the machine. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function isWikiSourceUnmonitored(resource: string): boolean {
  return HTTP.test(resource.trim());
}

/** Unique, sorted resources of every source the given pages cite. */
export function collectWikiSourceResources(pages: ReadonlyArray<Pick<WikiPage, "sources">>): string[] {
  return [...new Set(pages.flatMap((page) => page.sources.map((source) => source.resource)))].sort(byCodeUnit);
}

/** Source resource → pages citing it. Both lists are sorted. */
export function buildWikiSourcePageIndex(pages: ReadonlyArray<Pick<WikiPage, "path" | "sources">>): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const source of page.sources) {
      const cited = index.get(source.resource) ?? new Set<string>();
      cited.add(page.path);
      index.set(source.resource, cited);
    }
  }
  return new Map([...index.entries()].sort(([a], [b]) => byCodeUnit(a, b)).map(([resource, cited]) => [resource, [...cited].sort(byCodeUnit)]));
}

/**
 * Resolves a source resource to a file below `sourcesDir`.
 *
 * Containment is checked on the resolved path, and again on the real path so that a symlink inside
 * the folder cannot lead out of it. Returns null for anything that is not a safe local path.
 */
async function resolveSourceFile(sourcesDir: string, resource: string): Promise<{ absolute: string } | { missing: true } | null> {
  if (!isSafeWikiResourceTarget(resource) || isWikiSourceUnmonitored(resource)) return null;
  const root = resolve(sourcesDir);
  const absolute = resolve(root, resource);
  if (absolute === root || !absolute.startsWith(`${root}${sep}`)) return null;
  let real: string;
  try {
    real = await realpath(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ENOENT: the file is gone. ENOTDIR: a path segment became a file. Both mean "not there".
    if (code === "ENOENT" || code === "ENOTDIR") return { missing: true };
    throw error;
  }
  const realRoot = await realpath(root);
  if (!real.startsWith(`${realRoot}${sep}`)) return null;
  return { absolute: real };
}

/** Streams the raw bytes, so a large binary is neither decoded nor held in memory. */
function hashFile(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolveHash(`sha256:${hash.digest("hex")}`));
  });
}

/**
 * Reads the current state of the given sources from `sourcesDir`.
 *
 * A source whose size and modification time equal those in `previous` keeps its previous hash and
 * is not read again. Everything else is hashed from its raw bytes — exactly what `contentHash`
 * records for valid UTF-8 text, and the only meaningful hash for binary files.
 */
export async function scanWikiSources(
  sourcesDir: string,
  resources: readonly string[],
  previous: WikiSourceSnapshot | null = null,
): Promise<WikiSourceSnapshot> {
  const sources: Record<string, WikiSourceEntry> = {};
  for (const resource of [...new Set(resources)].sort(byCodeUnit)) {
    if (isWikiSourceUnmonitored(resource)) {
      sources[resource] = { state: "unmonitored" };
      continue;
    }
    const resolved = await resolveSourceFile(sourcesDir, resource);
    if (!resolved) {
      sources[resource] = { state: "unsafe" };
      continue;
    }
    if ("missing" in resolved) {
      sources[resource] = { state: "missing" };
      continue;
    }
    const info = await stat(resolved.absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info || !info.isFile()) {
      sources[resource] = { state: "missing" };
      continue;
    }
    const before = previous?.sources[resource];
    if (before?.state === "present" && before.hash && before.size === info.size && before.mtimeMs === info.mtimeMs) {
      sources[resource] = before;
      continue;
    }
    sources[resource] = { state: "present", hash: await hashFile(resolved.absolute), size: info.size, mtimeMs: info.mtimeMs };
  }
  return { version: 1, sources };
}

/**
 * Compares two snapshots. Only `present` sources take part: http and unsafe sources are not
 * watched, and a source that is `missing` counts as removed if it was present before.
 */
export function compareWikiSources(previous: WikiSourceSnapshot | null, current: WikiSourceSnapshot): WikiSourceDiff {
  const before = (resource: string) => (previous?.sources[resource]?.state === "present" ? previous.sources[resource] : undefined);
  const diff: WikiSourceDiff = { changed: [], added: [], removed: [], unchanged: [] };
  for (const resource of Object.keys(current.sources).sort(byCodeUnit)) {
    const now = current.sources[resource]!;
    const was = before(resource);
    if (now.state === "present") {
      if (!was) diff.added.push(resource);
      else if (was.hash !== now.hash) diff.changed.push(resource);
      else diff.unchanged.push(resource);
    } else if (was) {
      diff.removed.push(resource);
    }
  }
  // A source that dropped out of the snapshot altogether (no page cites it any more) is also gone.
  for (const resource of Object.keys(previous?.sources ?? {}).sort(byCodeUnit)) {
    if (before(resource) && !(resource in current.sources)) diff.removed.push(resource);
  }
  diff.removed.sort(byCodeUnit);
  return diff;
}

/** Maps a diff to the pages that cite a changed source. Pages that cite only unchanged sources are not touched. */
export function affectedWikiPages(pages: ReadonlyArray<Pick<WikiPage, "path" | "sources">>, diff: WikiSourceDiff): WikiSourceImpact {
  const index = buildWikiSourcePageIndex(pages);
  const entries: WikiSourceImpact["sources"] = [
    ...diff.changed.map((resource) => ({ resource, change: "changed" as const })),
    ...diff.added.map((resource) => ({ resource, change: "added" as const })),
    ...diff.removed.map((resource) => ({ resource, change: "removed" as const })),
  ]
    .sort((a, b) => byCodeUnit(a.resource, b.resource))
    .map((entry) => ({ ...entry, pages: index.get(entry.resource) ?? [] }));
  return { sources: entries, pages: [...new Set(entries.flatMap((entry) => entry.pages))].sort(byCodeUnit) };
}

/** Flattens a snapshot into what lint and status take. */
export function liveWikiSourcesFrom(snapshot: WikiSourceSnapshot): WikiLiveSources {
  const live: WikiLiveSources = { snapshot, sourceHashes: {}, missing: [], unmonitored: [], unsafe: [] };
  for (const [resource, entry] of Object.entries(snapshot.sources)) {
    if (entry.state === "present" && entry.hash) live.sourceHashes[resource] = entry.hash;
    else if (entry.state === "missing") live.missing.push(resource);
    else if (entry.state === "unmonitored") live.unmonitored.push(resource);
    else if (entry.state === "unsafe") live.unsafe.push(resource);
  }
  return live;
}

export const wikiSourceCheckOf = (live: WikiLiveSources): WikiSourceCheck => ({ missingSources: live.missing, unmonitoredSources: live.unmonitored });

/**
 * One live check of all sources the pages cite. Pass a cache (or the previous snapshot) to keep
 * unchanged files from being hashed again.
 */
export async function readLiveWikiSources(
  sourcesDir: string,
  pages: ReadonlyArray<Pick<WikiPage, "sources">>,
  previous: WikiSourceSnapshot | WikiSourceCache | null = null,
): Promise<WikiLiveSources> {
  const base = previous && "snapshot" in previous ? previous.snapshot : previous;
  const snapshot = await scanWikiSources(sourcesDir, collectWikiSourceResources(pages), base);
  if (previous && "snapshot" in previous) previous.snapshot = snapshot;
  return liveWikiSourcesFrom(snapshot);
}

/** How a single citation stands against the live check; what the UI shows as "Quelle geändert" / "Quelle fehlt". */
export type WikiCitationSourceState = "ok" | "changed" | "missing" | "unmonitored" | "unverified" | "no-hash";

export function citationSourceState(source: Pick<WikiSourceProvenance, "resource" | "id" | "contentHash">, live: WikiLiveSources): WikiCitationSourceState {
  if (live.missing.includes(source.resource)) return "missing";
  if (live.unmonitored.includes(source.resource)) return "unmonitored";
  const current = live.sourceHashes[source.resource];
  if (!current) return "unverified";
  if (!source.contentHash) return "no-hash";
  return current === source.contentHash ? "ok" : "changed";
}

/** Serialises a snapshot for the `--state` file: present sources only, keys sorted. */
export function serializeWikiSourceSnapshot(snapshot: WikiSourceSnapshot): string {
  const present = Object.fromEntries(Object.entries(snapshot.sources).filter(([, entry]) => entry.state === "present"));
  return `${JSON.stringify({ version: 1, sources: present }, null, 2)}\n`;
}

/** Parses a `--state` file. Throws on anything that is not a snapshot this module wrote. */
export function parseWikiSourceSnapshot(text: string): WikiSourceSnapshot {
  const fail = (): never => {
    throw new Error("Ungültige Zustandsdatei: erwartet {\"version\":1,\"sources\":{…}}.");
  };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail();
  }
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) return fail();
  const entries = (raw as { sources?: unknown }).sources;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return fail();
  const sources: Record<string, WikiSourceEntry> = {};
  for (const [resource, entry] of Object.entries(entries as Record<string, unknown>).sort(([a], [b]) => byCodeUnit(a, b))) {
    const value = entry as Partial<WikiSourceEntry> | null;
    if (!value || value.state !== "present" || typeof value.hash !== "string" || typeof value.size !== "number" || typeof value.mtimeMs !== "number") return fail();
    sources[resource] = { state: "present", hash: value.hash, size: value.size, mtimeMs: value.mtimeMs };
  }
  return { version: 1, sources };
}
