import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileText, FolderUp, Link2Off, X } from "lucide-react";
import type * as Rpc from "./rpc";
import type { DesktopFolderActivityEntry, DesktopFolderDecision, DesktopFolderShareInfo } from "../shared/rpc-types";
import { formatPublicationBytes, publicationBlockReasonLabel } from "./FolderPublicationDialog";

type Locale = "de" | "en";

/** The RPC calls the dialog needs; passed in so the dialog stays testable without the native bridge. */
export type FolderSharesApi = Pick<typeof Rpc, "listFolderShares" | "getFolderActivity" | "resolveFolderActivity" | "disconnectFolderShare">;

export function folderSharesLabel(locale: Locale): string {
  return locale === "de" ? "Ordnerfreigaben" : "Folder shares";
}

export function describeFolderShareError(error: string | undefined, locale: Locale): string {
  const de = locale === "de";
  if (error?.startsWith("FOLDER_FILE_NOT_UPLOADABLE")) {
    return de ? "Diese Datei kann nicht hochgeladen werden (Namenskonflikt oder nicht einschließbar). Du kannst sie ignorieren." : "This file cannot be uploaded (name conflict or not includable). You can ignore it.";
  }
  switch (error) {
    case "FOLDER_ACCESS_REVOKED":
      return de ? "Der Zugriff auf den Workspace wurde entzogen. Der Abgleich ist gestoppt, lokale Dateien bleiben unverändert." : "Access to the workspace was revoked. Syncing has stopped; local files stay unchanged.";
    case "FOLDER_NOT_FOUND":
      return de ? "Der Ordner wurde nicht gefunden oder ist nicht lesbar." : "The folder was not found or cannot be read.";
    case "FOLDER_FILE_STILL_PRESENT":
      return de ? "Die Datei ist inzwischen wieder vorhanden. Es wurde nichts geändert; lade die Liste neu." : "The file is back on disk. Nothing was changed; reload the list.";
    case "FOLDER_FILE_NOT_FOUND":
      return de ? "Die lokale Datei gibt es nicht mehr. Es wurde nichts geändert." : "The local file no longer exists. Nothing was changed.";
    case "FOLDER_FILE_ALREADY_PUBLISHED":
      return de ? "Die Datei ist bereits mit dem Workspace verbunden." : "The file is already connected to the workspace.";
    case "SHARE_AUDIT_FAILED":
      return de ? "Die Aktion konnte nicht im Workspace-Audit festgehalten werden und wurde zurückgenommen." : "The action could not be recorded in the workspace audit and was rolled back.";
    case "FOLDER_SHARE_NOT_FOUND":
      return de ? "Diese Ordnerfreigabe gibt es nicht mehr." : "This folder share no longer exists.";
    default:
      return error || (de ? "Die Aktion ist fehlgeschlagen." : "The action failed.");
  }
}

interface ShareState {
  share: DesktopFolderShareInfo;
  entries: DesktopFolderActivityEntry[] | null;
  unreachable: boolean;
  folderMissing: boolean;
  loading: boolean;
  error: string | null;
}

const entryKey = (entry: DesktopFolderActivityEntry) => entry.kind === "renamed" ? `renamed:${entry.from}>${entry.to}` : `${entry.kind}:${entry.relativePath}`;

export function FolderSharesDialog({
  locale,
  api,
  onClose,
  onChanged,
}: {
  locale: Locale;
  api: FolderSharesApi;
  onClose: () => void;
  /** Called after anything that changes a share, so the sidebar can refresh its badge. */
  onChanged: () => void;
}) {
  const de = locale === "de";
  const [shares, setShares] = useState<ShareState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [assignTargets, setAssignTargets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const patchShare = useCallback((id: string, patch: Partial<ShareState>) => {
    setShares((current) => current.map((entry) => entry.share.id === id ? { ...entry, ...patch } : entry));
  }, []);

  const loadActivity = useCallback(async (id: string) => {
    patchShare(id, { loading: true, error: null });
    try {
      const response = await api.getFolderActivity(id);
      if (!response.success) {
        patchShare(id, { loading: false, entries: null, folderMissing: response.error === "FOLDER_NOT_FOUND", error: describeFolderShareError(response.error, locale) });
        return;
      }
      patchShare(id, {
        loading: false,
        entries: response.entries ?? [],
        unreachable: Boolean(response.unreachable),
        folderMissing: false,
        ...(response.share ? { share: response.share } : {}),
      });
    } catch (cause) {
      patchShare(id, { loading: false, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }, [api, locale, patchShare]);

  useEffect(() => {
    let disposed = false;
    void api.listFolderShares(false)
      .then(({ shares: list }) => {
        if (disposed) return;
        setShares(list.map((share) => ({ share, entries: null, unreachable: false, folderMissing: false, loading: true, error: null })));
        setLoaded(true);
        for (const share of list) void loadActivity(share.id);
      })
      .catch((cause: unknown) => {
        console.error("[BloomMD] Folder shares could not be loaded:", cause);
        if (!disposed) {
          setMessage(cause instanceof Error ? cause.message : String(cause));
          setLoaded(true);
        }
      });
    return () => { disposed = true; };
  }, [api, loadActivity]);

  const decide = async (id: string, decision: DesktopFolderDecision, key: string) => {
    setBusyKey(key);
    setConfirming(null);
    patchShare(id, { error: null });
    try {
      const response = await api.resolveFolderActivity(id, decision);
      const failure = response.success ? null : describeFolderShareError(response.error, locale);
      onChanged();
      await loadActivity(id);
      // The reload clears old errors; the reason of this refusal must stay visible next to the fresh list.
      if (failure) patchShare(id, { error: failure });
    } catch (cause) {
      patchShare(id, { error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusyKey(null);
    }
  };

  const disconnect = async (id: string) => {
    setBusyKey(`disconnect:${id}`);
    setConfirming(null);
    try {
      const response = await api.disconnectFolderShare(id);
      if (!response.success) {
        patchShare(id, { error: describeFolderShareError(response.error, locale) });
        return;
      }
      setShares((current) => current.filter((entry) => entry.share.id !== id));
      setMessage(de ? "Ordnerfreigabe getrennt. Lokale Dateien und Cloud-Dokumente wurden nicht gelöscht." : "Folder share disconnected. No local file and no cloud document was deleted.");
      onChanged();
    } catch (cause) {
      patchShare(id, { error: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusyKey(null);
    }
  };

  const stateLabel = (state: ShareState) => {
    if (state.share.state === "revoked") return de ? "Zugriff entzogen" : "Access revoked";
    if (state.folderMissing) return de ? "Ordner nicht gefunden" : "Folder not found";
    if (state.unreachable) return de ? "Server nicht erreichbar" : "Server not reachable";
    return de ? "Verbunden" : "Connected";
  };

  const button = "rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50";
  const primary = "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
  const danger = "rounded-lg border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50";

  const renderEntry = (state: ShareState, entry: DesktopFolderActivityEntry) => {
    const id = state.share.id;
    const key = entryKey(entry);
    const revoked = state.share.state === "revoked";
    const busy = busyKey !== null;
    // Not every rename is certain; any new file can be named by hand as the new place of a removed one.
    const newCandidates = entry.kind === "removed" && !revoked ? (state.entries ?? []).flatMap((candidate) => candidate.kind === "new" ? [candidate] : []) : [];
    const label = entry.kind === "new" ? (de ? "neu, noch nicht geteilt" : "new, not shared yet")
      : entry.kind === "removed" ? (de ? "lokal entfernt" : "removed locally")
        : (de ? "lokal umbenannt" : "renamed locally");
    const path = entry.kind === "renamed" ? `${entry.from} → ${entry.to}` : entry.relativePath;
    return (
      <li key={key} className="rounded-lg border border-[var(--color-border)] p-3 text-sm" data-testid="folder-activity-entry" data-kind={entry.kind} data-path={entry.kind === "renamed" ? entry.to : entry.relativePath}>
        <div className="flex flex-wrap items-center gap-2">
          <FileText size={14} className="text-[var(--color-ink-faint)]" />
          <span className="break-all font-medium text-[var(--color-ink)]">{path}</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-500" data-testid="folder-activity-label">{label}</span>
          {entry.kind === "new" && <span className="text-xs text-[var(--color-ink-faint)]">{formatPublicationBytes(entry.sizeBytes)}</span>}
        </div>

        {entry.kind === "new" && entry.status === "upload" && (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{de ? "Wird erst nach deiner Bestätigung hochgeladen als " : "Is uploaded only after you confirm, as "}<span className="font-mono">{entry.uploadFilename}</span></p>
        )}
        {entry.kind === "new" && entry.status === "conflict" && (
          <p className="mt-1 text-xs text-amber-500">{de ? `Konflikt: „${entry.cloudFilename}“ existiert im Workspace und bleibt unberührt. Diese Datei kann nicht hochgeladen werden.` : `Conflict: “${entry.cloudFilename}” already exists in the workspace and stays untouched. This file cannot be uploaded.`}</p>
        )}
        {entry.kind === "new" && entry.status === "blocked" && entry.reason && (
          <p className="mt-1 flex items-start gap-1 text-xs text-red-500"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{publicationBlockReasonLabel(entry.reason, locale)}</p>
        )}
        {entry.kind !== "new" && (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{de ? "Cloud-Dokument: " : "Cloud document: "}<span className="font-mono">{entry.cloudFilename}</span>{de ? ". Es wird nie automatisch gelöscht." : ". It is never deleted automatically."}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {entry.kind === "new" && (
            <>
              {entry.status === "upload" && <button type="button" className={primary} disabled={revoked || busy} onClick={() => void decide(id, { kind: "new", relativePath: entry.relativePath, action: "upload" }, key)} data-testid="folder-activity-upload">{busyKey === key ? (de ? "Wird hochgeladen …" : "Uploading …") : (de ? "Hochladen" : "Upload")}</button>}
              <button type="button" className={button} disabled={busy} onClick={() => void decide(id, { kind: "new", relativePath: entry.relativePath, action: "ignore" }, key)} data-testid="folder-activity-ignore">{de ? "Nicht teilen" : "Do not share"}</button>
            </>
          )}
          {entry.kind === "removed" && (
            <>
              <button type="button" className={button} disabled={busy} onClick={() => void decide(id, { kind: "removed", relativePath: entry.relativePath, action: "keep-cloud" }, key)} data-testid="folder-activity-keep-cloud">{de ? "Cloud-Dokument behalten" : "Keep cloud document"}</button>
              {confirming === key
                ? (
                  <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-500">
                    {de ? "Cloud-Dokument wirklich entfernen?" : "Really remove the cloud document?"}
                    <button type="button" className={danger} disabled={busy} onClick={() => void decide(id, { kind: "removed", relativePath: entry.relativePath, action: "remove-cloud" }, key)} data-testid="folder-activity-remove-cloud-confirm">{de ? "Ja, entfernen" : "Yes, remove"}</button>
                    <button type="button" className={button} onClick={() => setConfirming(null)}>{de ? "Abbrechen" : "Cancel"}</button>
                  </span>
                )
                : <button type="button" className={danger} disabled={revoked || busy} onClick={() => setConfirming(key)} data-testid="folder-activity-remove-cloud">{de ? "Cloud-Dokument entfernen …" : "Remove cloud document …"}</button>}
              {newCandidates.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <select
                    value={assignTargets[key] ?? ""}
                    onChange={(event) => setAssignTargets((current) => ({ ...current, [key]: event.target.value }))}
                    aria-label={de ? "Neuer Name dieser Datei" : "New name of this file"}
                    data-testid="folder-activity-assign-target"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-ink)]"
                  >
                    <option value="">{de ? "Wurde umbenannt in …" : "Was renamed to …"}</option>
                    {newCandidates.map((candidate) => <option key={candidate.relativePath} value={candidate.relativePath}>{candidate.relativePath}</option>)}
                  </select>
                  <button type="button" className={button} disabled={busy || !assignTargets[key]} onClick={() => void decide(id, { kind: "renamed", from: entry.relativePath, to: assignTargets[key] ?? "", action: "reassign" }, key)} data-testid="folder-activity-assign">{de ? "Neu zuordnen" : "Reassign"}</button>
                </span>
              )}
            </>
          )}
          {entry.kind === "renamed" && (
            <>
              <button type="button" className={primary} disabled={busy} onClick={() => void decide(id, { kind: "renamed", from: entry.from, to: entry.to, action: "reassign" }, key)} data-testid="folder-activity-reassign">{de ? "Neu zuordnen" : "Reassign"}</button>
              <button type="button" className={button} disabled={busy} onClick={() => void decide(id, { kind: "renamed", from: entry.from, to: entry.to, action: "split" }, key)} data-testid="folder-activity-split">{de ? "Als neue Datei behandeln" : "Treat as a new file"}</button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label={folderSharesLabel(locale)} data-testid="folder-shares-dialog">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-primary)]"><FolderUp size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">{de ? "Veröffentlichte Ordner" : "Published folders"}</span></div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">{folderSharesLabel(locale)}</h2>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{de ? "Änderungen im Ordner werden nur angezeigt. Hochgeladen oder entfernt wird erst nach deiner Entscheidung pro Eintrag." : "Changes in the folder are only listed. Nothing is uploaded or removed until you decide per entry."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]" aria-label={de ? "Schließen" : "Close"}><X size={19} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {message && <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2 text-sm text-[var(--color-ink-muted)]" data-testid="folder-shares-message">{message}</p>}
          {loaded && shares.length === 0 && <p className="text-sm text-[var(--color-ink-muted)]" data-testid="folder-shares-empty">{de ? "Es gibt keine veröffentlichten Ordner." : "There are no published folders."}</p>}
          {shares.map((state) => {
            const { share } = state;
            return (
              <section key={share.id} className="space-y-3 rounded-xl border border-[var(--color-border)] p-4" data-testid="folder-share" data-id={share.id} data-state={share.state}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--color-ink)]">{share.folderName}</h3>
                    <p className="break-all font-mono text-xs text-[var(--color-ink-muted)]">{share.folderPath}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{share.profileName} · {de ? `${share.fileCount} Datei(en) verbunden` : `${share.fileCount} file(s) connected`}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${share.state === "revoked" ? "bg-red-500/15 text-red-500" : state.unreachable || state.error ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"}`} data-testid="folder-share-state">{stateLabel(state)}</span>
                </div>

                {share.state === "revoked" && (
                  <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500" data-testid="folder-share-revoked">
                    {de
                      ? "Zugriff entzogen: Der Abgleich ist gestoppt. Deine lokalen Dateien bleiben unverändert; es wird nichts hochgeladen, zurückgeschrieben oder gelöscht. Du kannst die Ordnerfreigabe trennen."
                      : "Access revoked: syncing has stopped. Your local files stay unchanged; nothing is uploaded, written back or deleted. You can disconnect the folder share."}
                  </p>
                )}
                {state.unreachable && share.state !== "revoked" && <p className="text-xs text-amber-500">{de ? "Der Server ist nicht erreichbar. Namenskonflikte können erst nach dem Verbinden geprüft werden." : "The server is not reachable. Name conflicts can only be checked once connected."}</p>}
                {state.error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500" data-testid="folder-share-error">{state.error}</p>}

                <div>
                  <h4 className="text-sm font-medium text-[var(--color-ink)]">{de ? "Aktivität" : "Activity"}</h4>
                  {state.loading && !state.entries && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{de ? "Wird gelesen …" : "Reading …"}</p>}
                  {state.entries && state.entries.length === 0 && <p className="mt-1 text-sm text-[var(--color-ink-muted)]" data-testid="folder-activity-empty">{de ? "Keine Änderungen seit der Veröffentlichung." : "No changes since publication."}</p>}
                  {state.entries && state.entries.length > 0 && <ul className="mt-2 space-y-2">{state.entries.map((entry) => renderEntry(state, entry))}</ul>}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                  {confirming === `disconnect:${share.id}`
                    ? (
                      <span className="inline-flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                        {de ? "Beendet nur die lokale Bindung. Lokale Dateien und Cloud-Dokumente bleiben; das wird im Workspace-Audit festgehalten." : "Ends the local binding only. Local files and cloud documents stay; this is recorded in the workspace audit trail."}
                        <button type="button" className={danger} disabled={busyKey !== null} onClick={() => void disconnect(share.id)} data-testid="folder-share-disconnect-confirm">{de ? "Trennen bestätigen" : "Confirm disconnect"}</button>
                        <button type="button" className={button} onClick={() => setConfirming(null)}>{de ? "Abbrechen" : "Cancel"}</button>
                      </span>
                    )
                    : <button type="button" className={danger} disabled={busyKey !== null} onClick={() => setConfirming(`disconnect:${share.id}`)} data-testid="folder-share-disconnect"><Link2Off size={13} className="mr-1 inline" />{de ? "Ordnerfreigabe trennen" : "Disconnect folder share"}</button>}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-[var(--color-border)] px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">{de ? "Schließen" : "Close"}</button>
        </div>
      </div>
    </div>
  );
}
