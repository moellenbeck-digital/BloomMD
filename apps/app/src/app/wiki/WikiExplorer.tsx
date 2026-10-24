"use client";

import { useMemo, useState } from "react";
import type { AppLocale } from "../../lib/locale";

function wikiCopy(locale: AppLocale) {
  return locale === "en" ? {
    rejected: "blocked", missing: "missing", externalAddress: "an external address", preview: "Load preview — sends a request to", bundle: "KB in bundle", mapTitle: "Knowledge Map", mapIntro: "Nodes are concept pages; edges come from wiki links, tags and cited sources — not from the folder structure. Broken references remain visible.", withoutSource: "without source", pointsTo: "Points to: ", nothing: "nothing", linkedBy: "Linked from: ", nobody: "nobody", sources: "Sources: ", view: "View", pages: "Pages", map: "Knowledge Map", log: "Log", brokenLinks: "broken links", search: "Search the wiki", placeholder: "Title, path, tag, status, content", onlyProblems: "Only pages with problems", count: "of", changed: " · source changed", noSource: " · without source", logTitle: "Wiki log", noLog: "No log available.", wikiPages: "Wiki pages", citations: "Citations", noCitations: "This page names no source. Its claims cannot be verified.", changedBadge: "Source has changed", unknown: "unknown source", noHash: "without hash — drift cannot be detected", references: "References and media", external: "External previews load only after a click. No request leaves this page beforehand.", noPage: "No page found."
  } : {
    rejected: "abgelehnt", missing: "fehlt", externalAddress: "eine externe Adresse", preview: "Vorschau laden — sendet eine Anfrage an", bundle: "KB im Bundle", mapTitle: "Knowledge Map", mapIntro: "Knoten sind Konzeptseiten, Kanten stammen aus Wiki-Links, Tags und zitierten Quellen — nicht aus der Ordnerstruktur. Defekte Verweise bleiben sichtbar.", withoutSource: "ohne Quelle", pointsTo: "Verweist auf: ", nothing: "nichts", linkedBy: "Wird verlinkt von: ", nobody: "niemandem", sources: "Quellen: ", view: "Ansicht", pages: "Seiten", map: "Knowledge Map", log: "Log", brokenLinks: "defekte Links", search: "Wiki durchsuchen", placeholder: "Titel, Pfad, Tag, Status, Inhalt", onlyProblems: "Nur Seiten mit Problemen", count: "von", changed: " · Quelle verändert", noSource: " · ohne Quelle", logTitle: "Wiki-Log", noLog: "Kein Log verfügbar.", wikiPages: "Wiki-Seiten", citations: "Zitate", noCitations: "Diese Seite nennt keine Quelle. Aussagen darauf lassen sich nicht überprüfen.", changedBadge: "Quelle hat sich geändert", unknown: "unbekannte Quelle", noHash: "ohne Hash — Drift nicht feststellbar", references: "Verweise und Medien", external: "Externe Vorschauen werden erst auf Klick geladen. Vorher verlässt keine Anfrage diese Seite.", noPage: "Keine Seite gefunden."
  };
}

export interface WikiCitation {
  id: string;
  resource: string;
  title: string | null;
  author: string | null;
  retrievedAt: string | null;
  contentHash: string | null;
  drifted: boolean;
  unknown: boolean;
}

export interface WikiPreview {
  reference: { kind: string; target: string; label: string; alt?: string; safe: boolean };
  availability: "available" | "needs-consent" | "missing" | "unsafe";
  reason: string | null;
  resolvedPath: string | null;
  byteSize: number | null;
}

export interface WikiExplorerPage {
  path: string;
  title: string;
  type: string;
  updated: string | null;
  content: string;
  tags?: string[];
  citations?: WikiCitation[];
  citationSummary?: { total: number; drifted: number; unknown: number; withoutHash: number };
  previews?: WikiPreview[];
  issues?: string[];
  lifecycle?: "draft" | "stable" | "deprecated";
  trustTier?: "verified" | "generated" | "unattributed";
}

export interface KnowledgeGraphData {
  nodes: Array<{
    id: string;
    path: string;
    title: string;
    kind: "concept" | "page";
    status: string;
    trustTier: string;
    citationCount: number;
    missingProvenance: boolean;
  }>;
  edges: Array<{ id: string; kind: "link" | "tag" | "source"; source: string; target: string | null; label: string; broken: boolean }>;
}

const TRUST_STYLE: Record<string, string> = {
  verified: "border-emerald-300 bg-emerald-50 text-emerald-800",
  generated: "border-amber-300 bg-amber-50 text-amber-900",
  unattributed: "border-neutral-300 bg-neutral-50 text-neutral-600",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

/**
 * A single reference, previewed only when asked.
 *
 * The previous version rendered `<img src={remoteUrl}>` for every external image as soon as a page
 * opened, which quietly told a third-party server who was reading which page. Loading now takes a
 * click, and the button says what the click will do.
 */
function ReferenceCard({ preview, locale }: { preview: WikiPreview; locale: AppLocale }) {
  const copy = wikiCopy(locale);
  const [loaded, setLoaded] = useState(false);
  const { reference, availability, reason } = preview;

  if (availability === "unsafe") {
    return (
      <div className="border border-red-200 bg-red-50 p-3" data-testid="wiki-reference-unsafe">
        <p className="text-xs uppercase tracking-wide text-red-700">{copy.rejected} · {reference.kind}</p>
        <code className="mt-1 block break-all text-sm text-red-900">{reference.target}</code>
        <p className="mt-1 text-xs text-red-700">{reason}</p>
      </div>
    );
  }

  if (availability === "missing") {
    return (
      <div className="border border-amber-300 bg-amber-50 p-3" data-testid="wiki-reference-missing">
        <p className="text-xs uppercase tracking-wide text-amber-800">{copy.missing} · {reference.kind}</p>
        <code className="mt-1 block break-all text-sm text-amber-900">{reference.target}</code>
        <p className="mt-1 text-xs text-amber-800">{reason}</p>
      </div>
    );
  }

  const isRemote = availability === "needs-consent";

  return (
    <div className="border border-neutral-200 bg-white p-3" data-testid="wiki-reference">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{reference.kind}</p>
      <a href={reference.target} target="_blank" rel="noreferrer noopener" className="mt-1 block break-all text-sm font-medium text-[#B84218] underline">
        {reference.label}
      </a>

      {isRemote && !loaded && (
        <button
          type="button"
          data-testid="wiki-preview-request"
          onClick={() => setLoaded(true)}
          className="mt-2 border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {copy.preview} {safeHost(reference.target, locale)}
        </button>
      )}

      {isRemote && loaded && reference.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reference.target} alt={reference.alt ?? reference.label} className="mt-2 max-h-48 w-full object-contain" />
      )}

      {preview.byteSize !== null && (
        <p className="mt-1 text-xs text-neutral-500">{Math.ceil(preview.byteSize / 1024)} {copy.bundle}</p>
      )}
    </div>
  );
}

function safeHost(target: string, locale: AppLocale): string {
  try {
    return new URL(target).host;
  } catch {
    return locale === "en" ? "an external address" : "eine externe Adresse";
  }
}

/**
 * The Knowledge Map.
 *
 * Rendered as a grouped list rather than a force-directed canvas: for a bundle of this size a list
 * that says which pages link where is readable, and a hairball is not. The Document Map stays a
 * separate view mode — the folder a page lives in is not a claim about what it means.
 */
function KnowledgeMap({ graph, onSelect, locale }: { graph: KnowledgeGraphData; onSelect: (path: string) => void; locale: AppLocale }) {
  const copy = wikiCopy(locale);
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);

  return (
    <div data-testid="wiki-knowledge-map">
      <h2 className="text-2xl font-semibold">{copy.mapTitle}</h2>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        {copy.mapIntro}
      </p>

      <ul className="mt-6 space-y-4">
        {graph.nodes.map((node) => {
          const outgoing = graph.edges.filter((edge) => edge.source === node.id);
          const incoming = graph.edges.filter((edge) => edge.kind === "link" && edge.target === node.id);
          return (
            <li key={node.id} className="border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onSelect(node.path)} className="text-left text-base font-semibold text-[#B84218] underline">
                  {node.title}
                </button>
                <Badge className={node.kind === "concept" ? "border-[#FF6B35] bg-[#FFF4EE] text-[#B84218]" : "border-neutral-300 bg-neutral-50 text-neutral-600"}>
                  {node.kind}
                </Badge>
                <Badge className={TRUST_STYLE[node.trustTier] ?? ""}>{node.trustTier}</Badge>
                {node.missingProvenance && (
                  <Badge className="border-amber-300 bg-amber-50 text-amber-900">{copy.withoutSource}</Badge>
                )}
              </div>

              <dl className="mt-3 grid gap-1 text-xs text-neutral-600">
                <div>
                  <dt className="inline font-semibold">{copy.pointsTo}</dt>
                  <dd className="inline">
                    {outgoing.filter((edge) => edge.kind === "link").length === 0
                      ? copy.nothing
                      : outgoing
                          .filter((edge) => edge.kind === "link")
                          .map((edge) => (edge.broken ? `${edge.label} (defekt)` : byId.get(edge.target ?? "")?.title ?? edge.label))
                          .join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{copy.linkedBy}</dt>
                  <dd className="inline">
                    {incoming.length === 0 ? copy.nobody : incoming.map((edge) => byId.get(edge.source)?.title ?? edge.source).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold">{copy.sources}</dt>
                  <dd className="inline">{node.citationCount}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface WikiExplorerProps {
  pages: WikiExplorerPage[];
  graph: KnowledgeGraphData | null;
  graphHealth: { brokenLinks: number; pagesWithoutProvenance: number; concepts: number } | null;
  log: string | null;
  locale?: AppLocale;
}

type ViewMode = "pages" | "map" | "log";

export function WikiExplorer({ pages, graph, graphHealth, log, locale = "de" }: WikiExplorerProps) {
  const copy = wikiCopy(locale);
  const [view, setView] = useState<ViewMode>("pages");
  const [selectedPath, setSelectedPath] = useState<string | null>(pages[0]?.path ?? null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const page of pages) for (const tag of page.tags ?? []) tags.add(tag);
    return [...tags].sort();
  }, [pages]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return pages.filter((page) => {
      if (tagFilter && !(page.tags ?? []).includes(tagFilter)) return false;
      if (onlyProblems) {
        const problem =
          (page.citationSummary?.total ?? 0) === 0
          || (page.citationSummary?.drifted ?? 0) > 0
          || (page.issues?.length ?? 0) > 0
          || (page.previews ?? []).some((preview) => preview.availability === "missing" || preview.availability === "unsafe");
        if (!problem) return false;
      }
      if (!needle) return true;
      const haystack = [page.title, page.path, page.type, ...(page.tags ?? []), page.lifecycle ?? "", page.trustTier ?? ""].join(" ").toLowerCase();
      return haystack.includes(needle) || page.content.toLowerCase().includes(needle);
    });
  }, [pages, query, tagFilter, onlyProblems]);

  const selected = pages.find((page) => page.path === selectedPath) ?? filtered[0] ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-4" role="group" aria-label={copy.view}>
        {(["pages", "map", "log"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            data-testid={`wiki-view-${mode}`}
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
            className={`border px-3 py-1.5 text-sm font-semibold ${
              view === mode ? "border-[#FF6B35] bg-[#FFF4EE] text-[#B84218]" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {mode === "pages" ? copy.pages : mode === "map" ? copy.map : copy.log}
          </button>
        ))}
        {graphHealth && (
          <span className="ml-auto flex flex-wrap gap-2 text-xs">
            {graphHealth.brokenLinks > 0 && (
              <Badge className="border-amber-300 bg-amber-50 text-amber-900">{graphHealth.brokenLinks} {copy.brokenLinks}</Badge>
            )}
            {graphHealth.pagesWithoutProvenance > 0 && (
              <Badge className="border-neutral-300 bg-neutral-50 text-neutral-600">{graphHealth.pagesWithoutProvenance} {copy.withoutSource}</Badge>
            )}
          </span>
        )}
      </div>

      {view === "map" && graph ? (
        <div className="py-8">
          <KnowledgeMap
            graph={graph}
            locale={locale}
            onSelect={(path) => {
              setSelectedPath(path);
              setView("pages");
            }}
          />
        </div>
      ) : view === "log" ? (
        <div className="py-8">
          <h2 className="text-2xl font-semibold">{copy.logTitle}</h2>
          <pre className="mt-6 whitespace-pre-wrap font-sans text-[15px] leading-7 text-neutral-700">{log ?? copy.noLog}</pre>
        </div>
      ) : (
        <div className="grid gap-8 py-8 lg:grid-cols-[300px_1fr]">
          <nav aria-label={copy.wikiPages} className="border-r border-neutral-200 pr-5">
            <input
              aria-label={copy.search}
              data-testid="wiki-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.placeholder}
              className="w-full border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#FF6B35]"
            />

            <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600">
              <input type="checkbox" data-testid="wiki-only-problems" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
              {copy.onlyProblems}
            </label>

            {allTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={tagFilter === tag}
                    onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                    className={`border px-2 py-0.5 text-xs ${tagFilter === tag ? "border-[#FF6B35] bg-[#FFF4EE] text-[#B84218]" : "border-neutral-300 text-neutral-600"}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-4 text-xs text-neutral-500">{filtered.length} {copy.count} {pages.length} {copy.pages.toLowerCase()}</p>

            <div className="mt-2">
              {filtered.map((page) => (
                <button
                  key={page.path}
                  type="button"
                  onClick={() => setSelectedPath(page.path)}
                  className={`mb-1 block w-full border-l-2 px-3 py-2 text-left ${
                    selected?.path === page.path ? "border-[#FF6B35] bg-[#FFF4EE]" : "border-transparent hover:bg-neutral-100"
                  }`}
                >
                  <span className="block text-sm font-semibold">{page.title}</span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    {page.type}
                    {(page.citationSummary?.drifted ?? 0) > 0 ? copy.changed : ""}
                    {(page.citationSummary?.total ?? 0) === 0 ? copy.noSource : ""}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <article className="min-w-0">
            {selected ? (
              <>
                <p className="font-mono text-xs text-neutral-500">{selected.path}</p>
                <h2 className="mt-2 text-3xl font-semibold">{selected.title}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selected.trustTier && <Badge className={TRUST_STYLE[selected.trustTier] ?? ""}>{selected.trustTier}</Badge>}
                  {selected.lifecycle && selected.lifecycle !== "stable" && (
                    <Badge className="border-neutral-300 bg-neutral-50 text-neutral-700">{selected.lifecycle}</Badge>
                  )}
                  {(selected.tags ?? []).map((tag) => (
                    <Badge key={tag} className="border-neutral-300 bg-white text-neutral-600">#{tag}</Badge>
                  ))}
                </div>

                <pre className="mt-6 whitespace-pre-wrap font-sans text-[15px] leading-7 text-neutral-700">{selected.content}</pre>

                <section className="mt-8 border-t border-neutral-200 pt-5" data-testid="wiki-citations">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    {copy.citations} {selected.citationSummary ? `(${selected.citationSummary.total})` : ""}
                  </h3>
                  {(selected.citations ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-amber-800">
                      {copy.noCitations}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {(selected.citations ?? []).map((citation) => (
                        <li
                          key={citation.id}
                          className={`border px-3 py-2 ${citation.drifted ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}
                        >
                          <span className="font-medium">{citation.title ?? citation.resource}</span>
                          {citation.drifted && (
                            <Badge className="ml-2 border-amber-400 bg-amber-100 text-amber-900">{copy.changedBadge}</Badge>
                          )}
                          {citation.unknown && (
                            <Badge className="ml-2 border-neutral-300 bg-neutral-100 text-neutral-600">{copy.unknown}</Badge>
                          )}
                          <code className="mt-1 block break-all text-xs text-neutral-500">{citation.resource}</code>
                          {citation.contentHash ? (
                            <code className="mt-1 block break-all text-xs text-neutral-400">{citation.contentHash}</code>
                          ) : (
                            <span className="mt-1 block text-xs text-neutral-500">{copy.noHash}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {(selected.previews ?? []).length > 0 && (
                  <section className="mt-8 border-t border-neutral-200 pt-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{copy.references}</h3>
                    <p className="mt-1 text-xs text-neutral-500">{copy.external}</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      {(selected.previews ?? []).map((preview) => (
                        <ReferenceCard key={`${preview.reference.kind}:${preview.reference.target}`} preview={preview} locale={locale} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <p className="text-neutral-600">{copy.noPage}</p>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
