"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, History, LoaderCircle, Plus, Save, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { provenanceParts } from "./agent-provenance";
import {
  AGENT_ACCESS_LEVELS,
  accessLabel,
  draftFromRights,
  rightsFromDraft,
  sameRights,
  type AgentAccessLevel,
  type AgentRights,
  type RightsDraft,
} from "./agent-rights-form";

interface AgentToken {
  tokenId: string;
  tokenName: string;
  agentName: string;
  userEmail: string;
  scope: "read" | "write";
  rights: AgentRights;
  configured: boolean;
}

interface OutlineChange {
  mark: "+" | "-" | "~";
  id: string;
  title: string;
  level: number;
}

interface TokenProposal {
  id: string;
  agentName: string;
  tool: string;
  filename: string;
  area: string;
  summary: string;
  reason: string | null;
  source: string | null;
  createdAt: string;
  stale: boolean;
  changes: OutlineChange[];
}

interface TokenChange {
  id: string;
  agentName: string;
  event: string;
  filename: string | null;
  area: string;
  summary: string | null;
  tool: string | null;
  reason: string | null;
  source: string | null;
  reviewerName: string | null;
  undoable: boolean;
  createdAt: string;
}

const copy = {
  de: {
    title: "Agent-Zugriff",
    intro: "Agenten, die per Zugriffstoken arbeiten: Rechte, Vorschläge und Protokoll liegen auf dem Server und gelten für jeden Rechner mit diesem Token.",
    proposals: "Offene Vorschläge",
    noProposals: "Keine offenen Vorschläge.",
    approve: "Freigeben",
    approveAnyway: "Trotzdem übernehmen",
    reject: "Ablehnen",
    rejectReason: "Grund (optional)",
    confirmReject: "Ablehnen bestätigen",
    cancel: "Abbrechen",
    stale: "Die Map hat sich seit dem Vorschlag geändert.",
    area: "Bereich",
    topLevel: "(oberste Ebene)",
    rights: "Rechte je Agent-Token",
    noTokens: "Keine Agent-Tokens. Lege unter Konto → Zugriffstokens ein Token mit Agent-Namen an.",
    notSet: "Noch nichts gesetzt: nur Vorschläge.",
    defaultRight: "Standardrecht",
    areaRights: "Rechte je Bereich (Unterbereiche wie Learnings/dev-team sind möglich; der längste passende Bereich gilt)",
    areaPlaceholder: "Bereich, z. B. Learnings/dev-team",
    addArea: "Bereich hinzufügen",
    removeArea: "Bereich entfernen",
    save: "Rechte speichern",
    saved: "Gespeichert.",
    log: "Protokoll",
    noLog: "Noch keine Änderungen.",
    undo: "Rückgängig",
    undoConfirm: "Diese Änderung zurücknehmen? Das geht nur, wenn die Map seitdem niemand bearbeitet hat.",
    undone: "Zurückgenommen.",
    by: "von",
    source: "Quelle",
    via: "über",
    duplicate: "Ein Bereich ist doppelt eingetragen: ",
    tooLong: "Ein Bereichsname ist zu lang.",
    loading: "Lädt…",
    events: { written: "geschrieben", proposed: "vorgeschlagen", approved: "freigegeben", rejected: "abgelehnt", undone: "zurückgenommen", renamed: "umbenannt", deleted: "gelöscht" } as Record<string, string>,
  },
  en: {
    title: "Agent access",
    intro: "Agents that work with an access token: rights, proposals and log live on the server and apply to every machine using that token.",
    proposals: "Open proposals",
    noProposals: "No open proposals.",
    approve: "Approve",
    approveAnyway: "Apply anyway",
    reject: "Reject",
    rejectReason: "Reason (optional)",
    confirmReject: "Confirm rejection",
    cancel: "Cancel",
    stale: "The map changed since the proposal was made.",
    area: "Area",
    topLevel: "(top level)",
    rights: "Rights per agent token",
    noTokens: "No agent tokens. Create a token with an agent name under Account → Access tokens.",
    notSet: "Nothing set yet: proposals only.",
    defaultRight: "Default right",
    areaRights: "Rights per area (sub-areas such as Learnings/dev-team work; the longest matching area wins)",
    areaPlaceholder: "Area, e.g. Learnings/dev-team",
    addArea: "Add area",
    removeArea: "Remove area",
    save: "Save rights",
    saved: "Saved.",
    log: "Change log",
    noLog: "No changes yet.",
    undo: "Undo",
    undoConfirm: "Undo this change? This only works if nobody edited the map since.",
    undone: "Undone.",
    by: "by",
    source: "Source",
    via: "via",
    duplicate: "An area is listed twice: ",
    tooLong: "An area name is too long.",
    loading: "Loading…",
    events: { written: "written", proposed: "proposed", approved: "approved", rejected: "rejected", undone: "undone", renamed: "renamed", deleted: "deleted" } as Record<string, string>,
  },
} as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(payload.error || `Request failed (${response.status}).`), { code: payload.code });
  return payload;
}

/** Whether a draft still stands for the saved rights; a draft with a duplicate name is being edited. */
function draftMatches(draft: RightsDraft, rights: AgentRights): boolean {
  try {
    return sameRights(rightsFromDraft(draft), rights);
  } catch {
    return false;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Request failed.");

/**
 * Rights, open proposals and the change log of the agent tokens of a workspace, for its owner.
 * Approving names the signed-in owner in the log; the CLI takes the same server path.
 */
export function AgentTokenAccess({ workspaceId, locale, refreshTick, onApplied }: { workspaceId: string; locale: "de" | "en"; refreshTick: number; onApplied: () => Promise<void> }) {
  const text = copy[locale];
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [proposals, setProposals] = useState<TokenProposal[]>([]);
  const [changes, setChanges] = useState<TokenChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RightsDraft>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [rights, open, log] = await Promise.all([
        api<{ tokens: AgentToken[] }>(`${base}/agent-rights`),
        api<{ proposals: TokenProposal[] }>(`${base}/agent-token-proposals?status=pending`),
        api<{ changes: TokenChange[] }>(`${base}/agent-log?limit=20`),
      ]);
      setTokens(rights.tokens);
      setProposals(open.proposals);
      setChanges(log.changes);
      // A saved draft follows the server; one the owner is editing stays.
      setDrafts((current) => Object.fromEntries(rights.tokens.map((token) => [token.tokenId, current[token.tokenId] && !draftMatches(current[token.tokenId]!, token.rights) ? current[token.tokenId]! : draftFromRights(token.rights)])));
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(message(actionError));
    } finally {
      setBusy(null);
    }
  };

  const review = (proposal: TokenProposal, action: "approve" | "reject", overwrite = false) =>
    run(proposal.id, async () => {
      try {
        await api(`${base}/agent-token-proposals/${encodeURIComponent(proposal.id)}`, { method: "POST", body: JSON.stringify({ action, ...(action === "reject" && reason.trim() ? { reason: reason.trim() } : {}), ...(overwrite ? { overwrite: true } : {}) }) });
      } catch (reviewError) {
        // The map changed since: the owner has seen the outline and may apply it anyway.
        if ((reviewError as { code?: string }).code === "AGENT_PROPOSAL_CONFLICT") {
          setConflict((current) => ({ ...current, [proposal.id]: message(reviewError) }));
          return;
        }
        throw reviewError;
      }
      setRejecting(null);
      setReason("");
      setConflict(({ [proposal.id]: _done, ...rest }) => rest);
      if (action === "approve") await onApplied();
      await load();
    });

  const save = (token: AgentToken) =>
    run(token.tokenId, async () => {
      let rights: AgentRights;
      try {
        rights = rightsFromDraft(drafts[token.tokenId] ?? draftFromRights(token.rights));
      } catch (formError) {
        const code = message(formError);
        throw new Error(code.startsWith("DUPLICATE_AREA:") ? `${text.duplicate}${code.slice("DUPLICATE_AREA:".length)}` : text.tooLong);
      }
      await api(`${base}/agent-rights`, { method: "PUT", body: JSON.stringify({ tokenId: token.tokenId, access: rights.access, areas: rights.areas }) });
      setNotice(`${text.saved} (${token.agentName})`);
      await load();
    });

  const undo = (change: TokenChange) => {
    if (!window.confirm(text.undoConfirm)) return Promise.resolve();
    return run(change.id, async () => {
      await api(`${base}/agent-log/${encodeURIComponent(change.id)}`, { method: "POST", body: JSON.stringify({ action: "undo" }) });
      setNotice(text.undone);
      await onApplied();
      await load();
    });
  };

  const setDraft = (tokenId: string, update: (draft: RightsDraft) => RightsDraft) =>
    setDrafts((current) => ({ ...current, [tokenId]: update(current[tokenId] ?? { access: "propose", rows: [] }) }));
  const when = (iso: string) => new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const area = (value: string) => value || text.topLevel;
  const selectClass = "rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs";

  return (
    <section className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4" data-testid="agent-token-access">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck size={15} />
        {text.title}
      </h3>
      <p className="mt-1 text-xs leading-5 text-[var(--color-ink-faint)]">{text.intro}</p>
      {error && <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}
      {notice && <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200" role="status">{notice}</p>}
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-ink-muted)]"><LoaderCircle size={14} className="animate-spin" />{text.loading}</p>
      ) : (
        <>
          <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{text.proposals} ({proposals.length})</h4>
          {proposals.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{text.noProposals}</p>
          ) : (
            <ul className="mt-2 grid gap-2" data-testid="agent-token-proposals">
              {proposals.map((proposal) => (
                <li key={proposal.id} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{proposal.agentName}</span> · {proposal.filename}
                      <div className="mt-0.5 text-[var(--color-ink-faint)]">{text.area}: {area(proposal.area)} · {when(proposal.createdAt)}</div>
                    </div>
                  </div>
                  <p className="mt-2">{proposal.summary}</p>
                  {proposal.reason && <p className="mt-1 text-[var(--color-ink-muted)]">„{proposal.reason}“</p>}
                  {(proposal.source || proposal.tool) && <p className="mt-1 text-[var(--color-ink-faint)]">{provenanceParts({ source: proposal.source, tool: proposal.tool }, text).join(" · ")}</p>}
                  {proposal.changes.length > 0 && (
                    <ul className="mt-2 font-mono text-[11px] leading-5">
                      {proposal.changes.map((change) => (
                        <li key={`${change.mark}${change.id}`} style={{ paddingLeft: `${Math.max(0, change.level - 1) * 12}px` }}>
                          <span className={change.mark === "+" ? "text-emerald-700 dark:text-emerald-300" : change.mark === "-" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}>{change.mark}</span> {change.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(proposal.stale || conflict[proposal.id]) && <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-900 dark:text-amber-200">{conflict[proposal.id] ?? text.stale}</p>}
                  {rejecting === proposal.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={text.rejectReason} aria-label={text.rejectReason} className={`${selectClass} min-w-48 flex-1`} />
                      <button type="button" disabled={busy !== null} onClick={() => void review(proposal, "reject")} className="rounded bg-red-600 px-2 py-1 font-semibold text-white disabled:opacity-50"><X size={12} className="mr-1 inline" />{text.confirmReject}</button>
                      <button type="button" onClick={() => { setRejecting(null); setReason(""); }} className="rounded border border-[var(--color-border)] px-2 py-1">{text.cancel}</button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy !== null} onClick={() => void review(proposal, "approve", Boolean(conflict[proposal.id]))} className="rounded bg-[#FF6B35] px-2 py-1 font-semibold text-white disabled:opacity-50"><Check size={12} className="mr-1 inline" />{conflict[proposal.id] ? text.approveAnyway : text.approve}</button>
                      <button type="button" disabled={busy !== null} onClick={() => { setRejecting(proposal.id); setReason(""); }} className="rounded border border-red-500/30 px-2 py-1 text-red-700 disabled:opacity-50 dark:text-red-300"><X size={12} className="mr-1 inline" />{text.reject}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">{text.rights}</h4>
          {tokens.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{text.noTokens}</p>
          ) : (
            <div className="mt-2 grid gap-3" data-testid="agent-token-rights">
              {tokens.map((token) => {
                const draft = drafts[token.tokenId] ?? draftFromRights(token.rights);
                const dirty = !draftMatches(draft, token.rights);
                return (
                  <div key={token.tokenId} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-xs">
                    <div className="font-semibold">{token.agentName} <span className="font-normal text-[var(--color-ink-faint)]">· {token.tokenName} · {token.userEmail}</span></div>
                    {!token.configured && <p className="mt-1 text-[var(--color-ink-faint)]">{text.notSet}</p>}
                    <label className="mt-2 flex items-center gap-2">
                      {text.defaultRight}
                      <select value={draft.access} onChange={(event) => setDraft(token.tokenId, (current) => ({ ...current, access: event.target.value as AgentAccessLevel }))} className={selectClass}>
                        {AGENT_ACCESS_LEVELS.map((level) => <option key={level} value={level}>{accessLabel(level, locale)}</option>)}
                      </select>
                    </label>
                    <p className="mt-2 text-[var(--color-ink-faint)]">{text.areaRights}</p>
                    <div className="mt-1 grid gap-1">
                      {draft.rows.map((row, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <input value={row.area} placeholder={text.areaPlaceholder} aria-label={text.area} onChange={(event) => setDraft(token.tokenId, (current) => ({ ...current, rows: current.rows.map((entry, position) => (position === index ? { ...entry, area: event.target.value } : entry)) }))} className={`${selectClass} min-w-48 flex-1`} />
                          <select value={row.access} aria-label={`${text.area} ${row.area}`} onChange={(event) => setDraft(token.tokenId, (current) => ({ ...current, rows: current.rows.map((entry, position) => (position === index ? { ...entry, access: event.target.value as AgentAccessLevel } : entry)) }))} className={selectClass}>
                            {AGENT_ACCESS_LEVELS.map((level) => <option key={level} value={level}>{accessLabel(level, locale)}</option>)}
                          </select>
                          <button type="button" aria-label={text.removeArea} onClick={() => setDraft(token.tokenId, (current) => ({ ...current, rows: current.rows.filter((_, position) => position !== index) }))} className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDraft(token.tokenId, (current) => ({ ...current, rows: [...current.rows, { area: "", access: "propose" }] }))} className="rounded border border-[var(--color-border)] px-2 py-1"><Plus size={12} className="mr-1 inline" />{text.addArea}</button>
                      <button type="button" disabled={busy !== null || (!dirty && token.configured)} onClick={() => void save(token)} className="rounded bg-[#FF6B35] px-2 py-1 font-semibold text-white disabled:opacity-50"><Save size={12} className="mr-1 inline" />{text.save}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h4 className="mt-5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"><History size={13} />{text.log}</h4>
          {changes.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{text.noLog}</p>
          ) : (
            <ul className="mt-2 grid gap-1" data-testid="agent-token-log">
              {changes.map((change) => (
                <li key={change.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-border)] px-2 py-1 text-xs">
                  <span>
                    <span className="font-semibold">{change.agentName}</span> {text.events[change.event] ?? change.event}
                    {change.filename ? ` · ${change.filename}` : ""} · {when(change.createdAt)}
                    {change.reviewerName ? ` · ${text.by} ${change.reviewerName}` : ""}
                    {change.summary ? <span className="text-[var(--color-ink-faint)]"> — {change.summary}</span> : null}
                    {provenanceParts(change, text).length > 0 && <span className="block text-[var(--color-ink-faint)]" data-testid="agent-token-log-source">{provenanceParts(change, text).join(" · ")}</span>}
                  </span>
                  {change.undoable && (
                    <button type="button" disabled={busy !== null} onClick={() => void undo(change)} className="rounded border border-[var(--color-border)] px-2 py-0.5 disabled:opacity-50"><Undo2 size={12} className="mr-1 inline" />{text.undo}</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
