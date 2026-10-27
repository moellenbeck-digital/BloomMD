"use client";

import { useCallback, useEffect, useState } from "react";
import { WikiExplorer, type KnowledgeGraphData, type WikiExplorerPage } from "./WikiExplorer";
import { WikiProposals, type WikiProposalsData } from "./WikiProposals";
import { useLocale } from "@bloommd/ui";

interface WikiPage {
  path: string;
  title: string;
  type: string;
  updated: string | null;
  content: string;
  sources?: Array<{ id: string; resource: string; contentHash?: string; title?: string }>;
  resources?: Array<{ kind: string; target: string; label: string; alt?: string; title?: string; safe: boolean }>;
  issues?: string[];
  lifecycle?: "draft" | "stable" | "deprecated";
  trustTier?: "verified" | "generated" | "unattributed";
  generated?: { by: string; at: string } | null;
  verified?: Array<{ by: string; at: string }>;
  staleAfter?: string | null;
  expired?: boolean;
}

const TRUST_LABEL: Record<string, string> = {
  verified: "verified by a human",
  generated: "agent-generated, unreviewed",
  unattributed: "no attribution",
};

const TRUST_STYLE: Record<string, string> = {
  verified: "border-emerald-300 bg-emerald-50 text-emerald-800",
  generated: "border-amber-300 bg-amber-50 text-amber-900",
  unattributed: "border-neutral-300 bg-neutral-50 text-neutral-600",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

interface WikiResponse {
  enabled?: boolean;
  message?: string;
  error?: string;
  sourceVerification?: "verified" | "unavailable";
  index?: string | null;
  log?: string | null;
  status?: {
    okfVersion?: string | null;
    pageCount: number;
    sourceCount: number;
    staleSourceCount: number;
    pendingPageCount: number;
    expiredPageCount?: number;
    trustCounts?: Record<string, number>;
    issueCount: number;
  };
  pages?: WikiPage[];
  graph?: KnowledgeGraphData | null;
  graphHealth?: { brokenLinks: number; pagesWithoutProvenance: number; concepts: number } | null;
}

export default function WikiPageRoute() {
  const { locale } = useLocale();
  const [data, setData] = useState<WikiResponse | null>(null);
  // `undefined` while loading, `null` when the proposal review is not available (feature off or not signed in).
  const [proposals, setProposals] = useState<WikiProposalsData | null | undefined>(undefined);
  const en = locale === "en";

  const loadProposals = useCallback(async () => {
    try {
      const response = await fetch("/api/wiki/proposals", { cache: "no-store" });
      const body = response.ok ? ((await response.json()) as WikiProposalsData) : null;
      setProposals(body && Array.isArray(body.proposals) ? body : null);
    } catch (error) {
      console.error("[BloomMD] Wiki proposals could not be loaded:", error instanceof Error ? error.message : "unknown");
      setProposals(null);
    }
  }, []);

  // Selection, search and view mode live in WikiExplorer; this route only fetches.
  useEffect(() => {
    void fetch("/api/wiki").then(async (response) => {
      setData((await response.json()) as WikiResponse);
    });
    void loadProposals();
  }, [loadProposals]);

  const proposalView = proposals ? <WikiProposals data={proposals} locale={locale} onChanged={loadProposals} /> : undefined;

  if (!data || proposals === undefined) return <main className="mx-auto max-w-6xl px-6 py-16">{en ? "Loading Wiki..." : "Wiki wird geladen …"}</main>;
  if (!data.enabled && proposalView) return <main className="min-h-screen bg-[#FAFAFA] px-4 py-8 text-[#1A1A1A] sm:px-8"><div className="mx-auto max-w-7xl"><header className="border-b border-neutral-200 pb-6"><p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD · LLM Wiki</p><h1 className="mt-2 text-4xl font-semibold">{en ? "Review Wiki proposals" : "Wiki-Vorschläge prüfen"}</h1></header>{proposalView}</div></main>;
  if (!data.enabled) return <main className="mx-auto max-w-3xl px-6 py-16"><p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD · LLM Wiki</p><h1 className="mt-2 text-3xl font-semibold">{en ? "Wiki is not enabled here" : "Wiki ist hier nicht aktiviert"}</h1><p className="mt-4 text-neutral-600">{en ? "This deployment has no public Wiki bundle configured. That is intentional until a reviewed Markdown bundle is mounted." : "Für dieses Deployment ist kein öffentliches Wiki-Bundle konfiguriert. Das ist beabsichtigt, bis ein geprüftes Markdown-Bundle eingebunden ist."}</p><div className="mt-8 border border-neutral-200 bg-neutral-50 p-5 text-sm leading-6 text-neutral-700"><p className="font-semibold">{en ? "Local development" : "Lokale Entwicklung"}</p><code className="mt-2 block whitespace-pre-wrap text-xs">BLOOMMD_WIKI_PUBLIC=1{`\n`}BLOOMMD_WIKI_DIR=./data/wiki</code><p className="mt-4">{en ? <>On Hetzner, mount a reviewed read-only bundle and set <code>BLOOMMD_WIKI_DIR=/app/wiki</code>. Publishing stays separate from the public read-only browser.</> : <>Auf Hetzner ein geprüftes Read-only-Bundle mounten und <code>BLOOMMD_WIKI_DIR=/app/wiki</code> setzen. Die Veröffentlichung bleibt vom öffentlichen Read-only-Browser getrennt.</>}</p></div></main>;
  if (data.error) return <main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">BloomMD Wiki</h1><p className="mt-4 text-red-700">{data.error}</p></main>;

  return <main className="min-h-screen bg-[#FAFAFA] px-4 py-8 text-[#1A1A1A] sm:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="border-b border-neutral-200 pb-6">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD · LLM Wiki</p>
        <h1 className="mt-2 text-4xl font-semibold">{en ? "A maintained knowledge map" : "Eine gepflegte Wissenskarte"}</h1>
        <p className="mt-3 max-w-2xl text-neutral-600">{en ? "Markdown remains the source of truth. Sources, pages and drift status stay inspectable and portable." : "Markdown bleibt die Quelle der Wahrheit. Quellen, Seiten und Drift-Status bleiben prüfbar und portabel."}</p>
        {data.status && <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-neutral-600">{data.status.okfVersion && <Badge className="border-neutral-300 bg-white text-neutral-700">OKF {data.status.okfVersion}</Badge>}<span>{data.status.pageCount} {en ? "pages" : "Seiten"}</span><span>{data.status.sourceCount} {en ? "sources" : "Quellen"}</span>{data.status.trustCounts && <Badge className={TRUST_STYLE.verified!}>{data.status.trustCounts.verified ?? 0} {en ? "verified" : "geprüft"}</Badge>}{data.status.trustCounts && (data.status.trustCounts.generated ?? 0) > 0 && <Badge className={TRUST_STYLE.generated!}>{data.status.trustCounts.generated} {en ? "unreviewed" : "ungeprüft"}</Badge>}{(data.status.expiredPageCount ?? 0) > 0 && <Badge className="border-red-300 bg-red-50 text-red-800">{data.status.expiredPageCount} {en ? "expired" : "abgelaufen"}</Badge>}<span>{data.status.staleSourceCount} {en ? "stale" : "veraltet"}</span><span>{data.status.issueCount} {en ? "issues" : "Probleme"}</span><span className={data.sourceVerification === "verified" ? "text-emerald-700" : "text-amber-700"}>{data.sourceVerification === "verified" ? (en ? "provenance verified" : "Herkunft geprüft") : (en ? "provenance not verified" : "Herkunft nicht geprüft")}</span></div>}
      </header>
      <WikiExplorer
        pages={(data.pages ?? []) as unknown as WikiExplorerPage[]}
        graph={(data.graph ?? null) as KnowledgeGraphData | null}
        graphHealth={data.graphHealth ?? null}
        log={data.log ?? null}
        locale={locale}
        proposals={proposalView}
        proposalCount={proposals?.proposals.length ?? 0}
      />
    </div>
  </main>;
}
