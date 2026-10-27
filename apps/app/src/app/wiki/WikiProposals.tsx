"use client";

import { collapseUnchanged, diffLines, diffStats } from "@bloommd/core/browser";
import { useMemo, useState } from "react";
import type { WikiProposalChangeView, WikiProposalSourceView, WikiProposalView } from "../../lib/wiki-proposals";
import type { AppLocale } from "../../lib/locale";

export interface WikiProposalsData {
  reviewer: string;
  sourceVerification: "verified" | "unavailable";
  proposals: WikiProposalView[];
}

export interface WikiProposalsProps {
  data: WikiProposalsData;
  locale: AppLocale;
  /** Called after a decision so the list (and the count next to the view button) is read again. */
  onChanged: () => Promise<void>;
}

function proposalCopy(locale: AppLocale) {
  return locale === "en" ? {
    title: "Wiki proposals",
    intro: "Agents propose page changes. Nothing reaches the Wiki until a person approves it here. Discarded proposals stay in the history.",
    open: "open proposals", openOne: "open proposal", none: "No open proposals.", created: "Created", pages: "Pages", page: "page", pagesPlural: "pages",
    changedBadge: "Page changed", noSourceBadge: "No source",
    pickOne: "Select a proposal to review it.", reason: "Reason", changeFor: "Change to", newPage: "New page", unchangedPage: "No line changes",
    added: "added", removed: "removed", unchanged: "unchanged", skipped: "%count% unchanged lines",
    sources: "Cited sources", noSources: "This proposal names no source. Its claims cannot be verified.",
    sourceUnchanged: "Source unchanged", sourceChanged: "Source has changed", sourceNoHash: "without hash", sourceUnverified: "not verifiable — no hash register",
    citedBy: "cited on", pageChanged: "Page has changed since the proposal was created",
    pageChangedHelp: "The proposal was written against an older version of: %paths%. Approving is blocked; discard it and ask for a new proposal.",
    invalid: "This proposal cannot be applied", approve: "Approve", approving: "Applying …", approveHint: "Approved as %name%. The change is applied to the Wiki immediately.",
    discard: "Discard", discarding: "Discarding …", reasonLabel: "Reason for discarding (required)", reasonRequired: "Please give a reason.",
    approved: "Approved and applied.", discarded: "Proposal discarded. It stays in the history.",
    errChanged: "Page has changed since the proposal was created. The Wiki was not modified.", errDecided: "This proposal has already been decided.",
    errNotFound: "This proposal no longer exists.", errUnauthorized: "Your session has expired. Please sign in again.", errGeneric: "The action failed. Please try again.",
    errInvalid: "The proposal is invalid and was not applied.",
    verificationOff: "Source hashes cannot be compared: no hash register is configured.",
  } : {
    title: "Wiki-Vorschläge",
    intro: "Agenten schlagen Seitenänderungen vor. Nichts gelangt ins Wiki, bevor hier ein Mensch freigibt. Verworfene Vorschläge bleiben im Verlauf.",
    open: "offene Vorschläge", openOne: "offener Vorschlag", none: "Keine offenen Vorschläge.", created: "Erstellt", pages: "Seiten", page: "Seite", pagesPlural: "Seiten",
    changedBadge: "Seite geändert", noSourceBadge: "Ohne Quelle",
    pickOne: "Wähle einen Vorschlag zur Prüfung aus.", reason: "Begründung", changeFor: "Änderung an", newPage: "Neue Seite", unchangedPage: "Keine Zeilenänderung",
    added: "hinzugefügt", removed: "entfernt", unchanged: "unverändert", skipped: "%count% unveränderte Zeilen",
    sources: "Zitierte Quellen", noSources: "Dieser Vorschlag nennt keine Quelle. Seine Aussagen lassen sich nicht überprüfen.",
    sourceUnchanged: "Quelle unverändert", sourceChanged: "Quelle hat sich geändert", sourceNoHash: "ohne Hash", sourceUnverified: "nicht prüfbar — kein Hash-Register",
    citedBy: "zitiert auf", pageChanged: "Seite hat sich seit Erstellung des Vorschlags geändert",
    pageChangedHelp: "Der Vorschlag wurde auf einer älteren Fassung von %paths% geschrieben. Freigeben ist gesperrt; verwirf ihn und lass einen neuen Vorschlag erstellen.",
    invalid: "Dieser Vorschlag lässt sich nicht anwenden", approve: "Freigeben", approving: "Wird angewendet …", approveHint: "Freigabe unter dem Namen %name%. Die Änderung wird sofort ins Wiki übernommen.",
    discard: "Verwerfen", discarding: "Wird verworfen …", reasonLabel: "Begründung für das Verwerfen (Pflicht)", reasonRequired: "Bitte eine Begründung angeben.",
    approved: "Freigegeben und angewendet.", discarded: "Vorschlag verworfen. Er bleibt im Verlauf erhalten.",
    errChanged: "Die Seite hat sich seit Erstellung des Vorschlags geändert. Das Wiki wurde nicht verändert.", errDecided: "Dieser Vorschlag wurde bereits entschieden.",
    errNotFound: "Dieser Vorschlag existiert nicht mehr.", errUnauthorized: "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.", errGeneric: "Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.",
    errInvalid: "Der Vorschlag ist ungültig und wurde nicht angewendet.",
    verificationOff: "Quell-Hashes lassen sich nicht vergleichen: Es ist kein Hash-Register konfiguriert.",
  };
}

type Copy = ReturnType<typeof proposalCopy>;

const LINE_STYLE: Record<string, string> = {
  added: "bg-[#EAF6E9] text-[#2F6B2B]",
  removed: "bg-[#FDECE7] text-[#9B3412]",
  equal: "text-neutral-600",
};
const PREFIX: Record<string, string> = { added: "+", removed: "-", equal: " " };

const SOURCE_STYLE: Record<WikiProposalSourceView["hashStatus"], string> = {
  unchanged: "border-emerald-300 bg-emerald-50 text-emerald-800",
  changed: "border-red-300 bg-red-50 text-red-800",
  "no-hash": "border-neutral-300 bg-neutral-50 text-neutral-600",
  unverified: "border-amber-300 bg-amber-50 text-amber-900",
};

function sourceLabel(status: WikiProposalSourceView["hashStatus"], copy: Copy): string {
  return status === "unchanged" ? copy.sourceUnchanged : status === "changed" ? copy.sourceChanged : status === "no-hash" ? copy.sourceNoHash : copy.sourceUnverified;
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

/** Line diff of one changed page. Same helpers as the editor's conflict dialog; the page's stored text is the "before". */
function ChangeDiff({ change, copy }: { change: WikiProposalChangeView; copy: Copy }) {
  const { rows, stats } = useMemo(() => {
    const lines = diffLines(change.before ?? "", change.after);
    return { rows: collapseUnchanged(lines), stats: diffStats(lines) };
  }, [change.before, change.after]);

  return (
    <section className="border border-neutral-200 bg-white" data-testid="wiki-proposal-change" data-path={change.path}>
      <header className="border-b border-neutral-200 px-4 py-3">
        <p className="font-mono text-sm font-semibold">{change.path}</p>
        <p className="mt-1 text-xs text-neutral-500">
          {change.before === null ? `${copy.newPage} · ` : ""}+{stats.added} {copy.added} · −{stats.removed} {copy.removed} · {stats.unchanged} {copy.unchanged}
        </p>
        {change.reason && <p className="mt-2 text-sm text-neutral-700"><span className="font-semibold">{copy.reason}:</span> {change.reason}</p>}
        {change.pageChanged && <p className="mt-2 text-xs font-semibold text-red-700">{copy.pageChanged}</p>}
      </header>
      <pre className="max-h-[28rem] overflow-auto font-mono text-xs leading-5" data-testid="wiki-proposal-diff">
        {stats.added === 0 && stats.removed === 0 ? (
          <div className="px-4 py-2 text-neutral-500">{copy.unchangedPage}</div>
        ) : rows.map((row, index) =>
          row.kind === "skipped" ? (
            <div key={`skip-${index}`} className="bg-neutral-100 px-4 py-1 text-neutral-500">{copy.skipped.replace("%count%", String(row.count))}</div>
          ) : (
            <div key={`${row.kind}-${index}`} className={`px-4 ${LINE_STYLE[row.kind]}`}>{PREFIX[row.kind]} {row.text || " "}</div>
          ),
        )}
      </pre>
    </section>
  );
}

function errorMessage(status: number, code: string | undefined, copy: Copy): string {
  if (status === 401) return copy.errUnauthorized;
  if (code === "wiki-page-changed") return copy.errChanged;
  if (code === "not-open") return copy.errDecided;
  if (code === "not-found") return copy.errNotFound;
  if (code === "reason-required") return copy.reasonRequired;
  if (code === "proposal-invalid") return copy.errInvalid;
  return copy.errGeneric;
}

export function WikiProposals({ data, locale, onChanged }: WikiProposalsProps) {
  const copy = proposalCopy(locale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState<"approve" | "discard" | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const selected = data.proposals.find((proposal) => proposal.id === selectedId) ?? data.proposals[0] ?? null;

  async function decide(action: "approve" | "discard") {
    if (!selected || busy) return;
    if (action === "discard" && !reason.trim()) {
      setReasonError(true);
      return;
    }
    setBusy(action);
    setResult(null);
    try {
      const response = await fetch(`/api/wiki/proposals/${encodeURIComponent(selected.id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "discard" ? JSON.stringify({ reason }) : "{}",
      });
      if (response.ok) {
        setResult({ kind: "ok", text: action === "approve" ? copy.approved : copy.discarded });
        setReason("");
        setReasonError(false);
      } else {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        setResult({ kind: "error", text: errorMessage(response.status, body.code, copy) });
      }
      await onChanged();
    } catch (error) {
      console.error("[BloomMD] Wiki proposal action failed:", error instanceof Error ? error.message : "unknown");
      setResult({ kind: "error", text: copy.errGeneric });
    } finally {
      setBusy(null);
    }
  }

  const changedPaths = selected?.changes.filter((change) => change.pageChanged).map((change) => change.path) ?? [];
  const formatter = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="py-8" data-testid="wiki-proposals">
      <h2 className="text-2xl font-semibold">{copy.title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">{copy.intro}</p>
      <p className="mt-3 text-sm font-semibold" data-testid="wiki-proposals-count">{data.proposals.length} {data.proposals.length === 1 ? copy.openOne : copy.open}</p>
      {data.sourceVerification === "unavailable" && <p className="mt-1 text-xs text-amber-700">{copy.verificationOff}</p>}
      {result && (
        <p
          role={result.kind === "error" ? "alert" : "status"}
          data-testid="wiki-proposal-result"
          className={`mt-4 border px-4 py-3 text-sm ${result.kind === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
        >
          {result.text}
        </p>
      )}

      {data.proposals.length === 0 ? (
        <p className="mt-6 text-neutral-600" data-testid="wiki-proposals-empty">{copy.none}</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
          <ul className="space-y-2" data-testid="wiki-proposal-list">
            {data.proposals.map((proposal) => (
              <li key={proposal.id}>
                <button
                  type="button"
                  data-testid="wiki-proposal-item"
                  data-proposal-id={proposal.id}
                  aria-pressed={selected?.id === proposal.id}
                  onClick={() => { setSelectedId(proposal.id); setResult(null); setReason(""); setReasonError(false); }}
                  className={`block w-full border p-3 text-left text-sm ${selected?.id === proposal.id ? "border-[#FF6B35] bg-[#FFF4EE]" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}
                >
                  <span className="block font-mono text-xs text-neutral-500">{proposal.id.slice(0, 8)}</span>
                  <span className="mt-1 block text-neutral-700">{copy.created}: {formatter.format(new Date(proposal.createdAt))}</span>
                  <span className="mt-1 block font-semibold">{proposal.changes.length} {proposal.changes.length === 1 ? copy.page : copy.pagesPlural}</span>
                  <span className="mt-1 block break-all font-mono text-xs text-neutral-600">{proposal.changes.map((change) => change.path).join(", ")}</span>
                  {(proposal.pageChanged || !proposal.hasSources) && (
                    <span className="mt-2 flex flex-wrap gap-1">
                      {proposal.pageChanged && <Badge className="border-red-300 bg-red-50 text-red-800">{copy.changedBadge}</Badge>}
                      {!proposal.hasSources && <Badge className="border-amber-300 bg-amber-50 text-amber-900">{copy.noSourceBadge}</Badge>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="space-y-5" data-testid="wiki-proposal-detail" data-proposal-id={selected.id}>
              {selected.pageChanged && (
                <div role="alert" data-testid="wiki-proposal-page-changed" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-semibold">{copy.pageChanged}</p>
                  <p className="mt-1">{copy.pageChangedHelp.replace("%paths%", changedPaths.join(", "))}</p>
                </div>
              )}
              {selected.validationErrors.length > 0 && (
                <div role="alert" data-testid="wiki-proposal-invalid" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-semibold">{copy.invalid}</p>
                  <ul className="mt-1 list-disc pl-5">{selected.validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
                </div>
              )}

              {selected.changes.map((change) => <ChangeDiff key={change.path} change={change} copy={copy} />)}

              <section className="border border-neutral-200 bg-white p-4" data-testid="wiki-proposal-sources">
                <h3 className="text-sm font-semibold">{copy.sources}</h3>
                {selected.sources.length === 0 ? (
                  <p className="mt-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="wiki-proposal-no-sources">{copy.noSources}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {selected.sources.map((source) => (
                      <li key={source.id} className="text-sm" data-testid="wiki-proposal-source" data-hash-status={source.hashStatus}>
                        <span className="font-medium">{source.title ?? source.resource}</span>
                        <span className="ml-2 font-mono text-xs text-neutral-500">{source.id}</span>
                        <Badge className={`ml-2 ${SOURCE_STYLE[source.hashStatus]}`}>{sourceLabel(source.hashStatus, copy)}</Badge>
                        <span className="mt-0.5 block text-xs text-neutral-500">{copy.citedBy}: {source.paths.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-4 border border-neutral-200 bg-white p-4">
                <div>
                  <button
                    type="button"
                    data-testid="wiki-proposal-approve"
                    disabled={!selected.canApprove || busy !== null}
                    onClick={() => void decide("approve")}
                    className="h-10 bg-[#FF6B35] px-5 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:cursor-not-allowed disabled:bg-neutral-300"
                  >
                    {busy === "approve" ? copy.approving : copy.approve}
                  </button>
                  <p className="mt-2 text-xs text-neutral-600" data-testid="wiki-proposal-reviewer">{copy.approveHint.replace("%name%", data.reviewer)}</p>
                </div>
                <div>
                  <label htmlFor="wiki-proposal-reason" className="block text-sm font-semibold">{copy.reasonLabel}</label>
                  <textarea
                    id="wiki-proposal-reason"
                    data-testid="wiki-proposal-reason"
                    value={reason}
                    maxLength={2000}
                    rows={3}
                    required
                    aria-invalid={reasonError}
                    aria-describedby={reasonError ? "wiki-proposal-reason-error" : undefined}
                    onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setReasonError(false); }}
                    className="mt-1 w-full border border-neutral-300 p-2 text-sm"
                  />
                  {reasonError && <p id="wiki-proposal-reason-error" role="alert" data-testid="wiki-proposal-reason-error" className="mt-1 text-xs text-red-700">{copy.reasonRequired}</p>}
                  <button
                    type="button"
                    data-testid="wiki-proposal-discard"
                    disabled={busy !== null}
                    onClick={() => void decide("discard")}
                    className="mt-2 h-10 border border-neutral-400 px-5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "discard" ? copy.discarding : copy.discard}
                  </button>
                </div>
              </section>
            </div>
          ) : (
            <p className="text-neutral-600">{copy.pickOne}</p>
          )}
        </div>
      )}
    </div>
  );
}
