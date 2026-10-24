"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Trash2, X } from "lucide-react";

interface ShareLink {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
}

const TEXT = {
  de: {
    title: "Lese-Links",
    subtitle: "Wer den Link hat, sieht diese Map ohne Konto – nur lesen. Widerrufene Links funktionieren sofort nicht mehr.",
    validity: "Gültig für",
    days: (days: number) => (days === 1 ? "1 Tag" : `${days} Tage`),
    create: "Neuen Link erstellen",
    created: "Link kopiert. Er wird nur jetzt angezeigt:",
    copy: "Kopieren",
    empty: "Noch keine Lese-Links für diese Map.",
    active: "Aktiv bis",
    expired: "Abgelaufen",
    revoked: "Widerrufen",
    lastViewed: "Zuletzt angesehen",
    never: "noch nie",
    revoke: "Widerrufen",
    close: "Schließen",
    failed: "Lese-Links konnten nicht geladen werden.",
  },
  en: {
    title: "Read-only links",
    subtitle: "Anyone with the link can view this map without an account – read only. Revoked links stop working immediately.",
    validity: "Valid for",
    days: (days: number) => (days === 1 ? "1 day" : `${days} days`),
    create: "Create new link",
    created: "Link copied. It is shown only now:",
    copy: "Copy",
    empty: "No read-only links for this map yet.",
    active: "Active until",
    expired: "Expired",
    revoked: "Revoked",
    lastViewed: "Last viewed",
    never: "never",
    revoke: "Revoke",
    close: "Close",
    failed: "Read-only links could not be loaded.",
  },
};

const EXPIRY_DAYS = [1, 7, 30, 90];

/** Create, list and revoke the read-only links of one cloud map. */
export function ShareLinksDialog({ filename, workspaceId, locale, onClose }: { filename: string; workspaceId?: string | null; locale: "de" | "en"; onClose: () => void }) {
  const text = TEXT[locale];
  const endpoint = `/api/mindmaps/${encodeURIComponent(filename)}/share-links${workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : ""}`;
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [days, setDays] = useState(30);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString(locale === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }) : text.never);

  const load = useCallback(async () => {
    const response = await fetch(endpoint);
    const body = await response.json().catch(() => ({})) as { links?: ShareLink[]; error?: string };
    if (!response.ok) throw new Error(body.error || text.failed);
    setLinks(body.links ?? []);
  }, [endpoint, text.failed]);

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : text.failed));
  }, [load, text.failed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresInDays: days }) });
    const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
    if (!response.ok || !body.url) throw new Error(body.error || text.failed);
    setCreatedUrl(body.url);
    await navigator.clipboard.writeText(body.url).catch(() => undefined);
  });

  const revoke = (id: string) => run(async () => {
    const response = await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || text.failed);
  });

  const now = Date.now();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/35 p-4 backdrop-blur-sm sm:items-center" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-2xl" role="dialog" aria-modal="true" aria-label={text.title} data-testid="share-links-dialog">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 rounded-lg bg-[#FF6B35]/10 p-2 text-[#FF6B35]"><Link2 size={20} aria-hidden="true" /></span>
            <div>
              <h2 className="text-lg font-semibold">{text.title}</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">{text.subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]" aria-label={text.close}><X size={18} /></button>
        </header>
        <div className="grid gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-medium">
              {text.validity}
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3">
                {EXPIRY_DAYS.map((value) => <option key={value} value={value}>{text.days(value)}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => void create()} className="h-10 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white disabled:opacity-50">{text.create}</button>
          </div>
          {createdUrl && (
            <div className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3 text-sm">
              <span>{text.created}</span>
              <div className="flex gap-2">
                <input readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-mono text-xs" aria-label={text.title} />
                <button type="button" onClick={() => void navigator.clipboard.writeText(createdUrl).catch(() => undefined)} className="inline-flex h-9 items-center gap-1 rounded border border-[var(--color-border)] px-2 text-xs font-semibold"><Copy size={14} aria-hidden="true" />{text.copy}</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {links.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">{text.empty}</p>
          ) : (
            <ul className="grid gap-2">
              {links.map((link) => {
                const active = !link.revokedAt && new Date(link.expiresAt).getTime() > now;
                return (
                  <li key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{link.revokedAt ? text.revoked : active ? `${text.active} ${formatDate(link.expiresAt)}` : text.expired}</div>
                      <div className="text-xs text-[var(--color-ink-muted)]">{formatDate(link.createdAt)} · {text.lastViewed}: {formatDate(link.lastViewedAt)}</div>
                    </div>
                    {active && <button type="button" disabled={busy} onClick={() => void revoke(link.id)} className="inline-flex h-9 items-center gap-1 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 size={15} aria-hidden="true" />{text.revoke}</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
