/**
 * On-demand previews and page-level citations for Wiki Bundles.
 *
 * Reference-first, and the word "on-demand" is load-bearing. Nothing here fetches, thumbnails or
 * caches anything on its own: opening a page must not cause the machine to make requests the reader
 * did not ask for. A preview happens because someone clicked, and remote previews additionally
 * require the caller to pass explicit consent — a boolean that has to be typed at the call site
 * rather than defaulted.
 *
 * A reference that cannot be previewed stays visible as a reference. Hiding a broken link is how a
 * bundle quietly rots: nobody sees what needs fixing.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { extractWikiResources, isSafeWikiResourceTarget, type WikiPage, type WikiResourceKind, type WikiResourceReference } from "./wiki";
import { citationSourceState, type WikiCitationSourceState, type WikiLiveSources } from "./wiki-sources";

export type PreviewAvailability =
  /** Can be previewed now: a local file inside the bundle that exists. */
  | "available"
  /** A remote target. Requires explicit consent because previewing it makes a request. */
  | "needs-consent"
  /** Inside the bundle, but the file is not there. */
  | "missing"
  /** Refused: escapes the bundle, is an absolute path, or uses a scheme other than http(s). */
  | "unsafe";

export interface ResourcePreview {
  reference: WikiResourceReference;
  availability: PreviewAvailability;
  /** Human-readable explanation. Always set for anything other than "available". */
  reason: string | null;
  /** Bundle-relative path, only for local targets that resolved safely. */
  resolvedPath: string | null;
  byteSize: number | null;
}

export interface PageCitation {
  id: string;
  resource: string;
  title: string | null;
  author: string | null;
  retrievedAt: string | null;
  contentHash: string | null;
  /** True when the source has a hash and it no longer matches the known hash of that source. */
  drifted: boolean;
  /** True when the page cites a source id that the bundle does not know. */
  unknown: boolean;
  /** Only with a live source check: how the cited source stands right now. */
  sourceState?: WikiCitationSourceState;
}

const REMOTE_SCHEME = /^https?:\/\//i;

/**
 * Resolves a bundle-relative target without touching the filesystem.
 *
 * Containment is checked on the resolved path rather than the input, because an input can be made
 * to look harmless and still resolve outside — the check has to happen after resolution or it
 * checks the wrong thing.
 */
function resolveInsideBundle(rootDir: string, target: string): string | null {
  const withoutFragment = target.split(/[?#]/, 1)[0] ?? "";
  if (!withoutFragment) return null;
  const root = resolve(rootDir);
  const absolute = resolve(root, withoutFragment);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

/**
 * Classifies a reference without acting on it.
 *
 * Deliberately async only for the local-existence check. Remote targets are never contacted here —
 * classifying a URL must not be a way to make a request happen as a side effect.
 */
export async function describeResource(rootDir: string, reference: WikiResourceReference): Promise<ResourcePreview> {
  const base: Omit<ResourcePreview, "availability" | "reason"> = {
    reference,
    resolvedPath: null,
    byteSize: null,
  };

  if (!reference.safe || !isSafeWikiResourceTarget(reference.target)) {
    return {
      ...base,
      availability: "unsafe",
      reason: "Ziel liegt außerhalb des Bundles oder nutzt ein nicht unterstütztes Schema.",
    };
  }

  if (REMOTE_SCHEME.test(reference.target)) {
    return {
      ...base,
      availability: "needs-consent",
      reason: "Externe Adresse. Eine Vorschau würde eine Anfrage auslösen und braucht ausdrückliche Zustimmung.",
    };
  }

  // Wiki links point at pages, not at files on disk; they are resolved by the bundle, not here.
  if (reference.kind === "wiki") {
    return { ...base, availability: "available", reason: null };
  }

  const absolute = resolveInsideBundle(rootDir, reference.target);
  if (!absolute) {
    return { ...base, availability: "unsafe", reason: "Pfad verlässt das Bundle." };
  }

  try {
    const info = await stat(/* turbopackIgnore: true */ absolute);
    if (!info.isFile()) {
      return { ...base, availability: "missing", reason: "Ziel ist keine Datei." };
    }
    return {
      ...base,
      availability: "available",
      reason: null,
      resolvedPath: reference.target,
      byteSize: info.size,
    };
  } catch {
    return { ...base, availability: "missing", reason: "Datei existiert im Bundle nicht." };
  }
}

/** Classifies every reference on a page. */
export async function describePageResources(rootDir: string, page: Pick<WikiPage, "content">): Promise<ResourcePreview[]> {
  const references = extractWikiResources(page.content);
  return Promise.all(references.map((reference) => describeResource(rootDir, reference)));
}

export interface PreviewRequest {
  /** Must be true for a remote target. There is no default — consent has to be stated. */
  allowRemote?: boolean;
  /** Refuses to read local files above this size. */
  maxBytes?: number;
}

export interface PreviewPayload {
  kind: WikiResourceKind;
  /** Local file contents. Never populated for remote targets: nothing is fetched here. */
  bytes: Uint8Array | null;
  /** Set for remote targets the caller consented to; the caller performs the request itself. */
  remoteUrl: string | null;
  byteSize: number | null;
}

/** Refused preview requests carry the reason, so the UI can say why rather than showing nothing. */
export class PreviewRefused extends Error {
  constructor(readonly availability: PreviewAvailability, message: string) {
    super(message);
    this.name = "PreviewRefused";
  }
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Produces a preview for one reference, on request.
 *
 * Local files are read here. Remote targets are **not** fetched even with consent — the URL is
 * handed back and the caller makes the request in whatever context it controls. That keeps the
 * decision to talk to a third party at the layer that can see the user, rather than buried in a
 * library that a background job could call.
 */
export async function requestResourcePreview(
  rootDir: string,
  reference: WikiResourceReference,
  request: PreviewRequest = {},
): Promise<PreviewPayload> {
  const description = await describeResource(rootDir, reference);

  if (description.availability === "unsafe") {
    throw new PreviewRefused("unsafe", description.reason ?? "Unsicheres Ziel.");
  }
  if (description.availability === "missing") {
    throw new PreviewRefused("missing", description.reason ?? "Datei fehlt.");
  }
  if (description.availability === "needs-consent") {
    if (!request.allowRemote) {
      throw new PreviewRefused("needs-consent", "Externe Vorschau wurde nicht freigegeben.");
    }
    return { kind: reference.kind, bytes: null, remoteUrl: reference.target, byteSize: null };
  }

  if (reference.kind === "wiki" || !description.resolvedPath) {
    return { kind: reference.kind, bytes: null, remoteUrl: null, byteSize: null };
  }

  const limit = request.maxBytes ?? DEFAULT_MAX_BYTES;
  if ((description.byteSize ?? 0) > limit) {
    throw new PreviewRefused("unsafe", `Datei ist größer als das Vorschau-Limit von ${limit} Bytes.`);
  }

  const absolute = resolveInsideBundle(rootDir, description.resolvedPath);
  if (!absolute) throw new PreviewRefused("unsafe", "Pfad verlässt das Bundle.");
  const bytes = new Uint8Array(await readFile(/* turbopackIgnore: true */ absolute));
  return { kind: reference.kind, bytes, remoteUrl: null, byteSize: bytes.byteLength };
}

/**
 * Page-level citations, as inspectable metadata rather than rendered prose.
 *
 * `knownHashes` maps a source id to the hash currently expected for it. A mismatch means the source
 * changed after the page was written, which is exactly the moment a generated claim stops being
 * supported by what it cites — so it is surfaced rather than smoothed over.
 */
export function pageCitations(page: WikiPage, knownHashes: Record<string, string> = {}, live?: WikiLiveSources): PageCitation[] {
  return page.sources.map((source) => {
    // A live check is keyed by resource (the path in the source folder), a hash file by id.
    const expected = live ? live.sourceHashes[source.resource] : knownHashes[source.id];
    return {
      id: source.id,
      resource: source.resource,
      title: source.title ?? null,
      author: source.author ?? null,
      retrievedAt: source.retrievedAt ?? null,
      contentHash: source.contentHash ?? null,
      drifted: Boolean(expected && source.contentHash && expected !== source.contentHash),
      unknown: live ? false : Object.keys(knownHashes).length > 0 && expected === undefined,
      ...(live ? { sourceState: citationSourceState(source, live) } : {}),
    };
  });
}

export interface CitationSummary {
  total: number;
  drifted: number;
  unknown: number;
  withoutHash: number;
  /** Only with a live source check. */
  changed?: number;
  missing?: number;
}

/** Counts for a page badge, so a reader sees the state before opening the list. */
export function citationSummary(citations: PageCitation[]): CitationSummary {
  return {
    total: citations.length,
    drifted: citations.filter((citation) => citation.drifted).length,
    unknown: citations.filter((citation) => citation.unknown).length,
    withoutHash: citations.filter((citation) => !citation.contentHash).length,
    ...(citations.some((citation) => citation.sourceState)
      ? {
          changed: citations.filter((citation) => citation.sourceState === "changed").length,
          missing: citations.filter((citation) => citation.sourceState === "missing").length,
        }
      : {}),
  };
}
