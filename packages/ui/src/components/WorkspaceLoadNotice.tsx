import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { WorkspaceLoadIssue } from "@bloommd/core/browser";

export function loadIssueExplanation(issue: WorkspaceLoadIssue, locale: string): string {
  const de = locale === "de";
  switch (issue.kind) {
    case "yaml": return de
      ? `Die YAML-Kopfdaten sind ungültig${issue.line ? ` (Zeile ${issue.line}${issue.column ? `, Spalte ${issue.column}` : ""} im YAML-Block)` : ""}. Prüfe Einrückungen und setze Werte mit Doppelpunkten in Anführungszeichen.`
      : `The YAML header is invalid${issue.line ? ` (line ${issue.line}${issue.column ? `, column ${issue.column}` : ""} in the YAML block)` : ""}. Check indentation and quote values containing colons.`;
    case "permission": return de ? "Der Lesezugriff wurde verweigert. Prüfe die Zugriffsrechte für diese Datei oder diesen Ordner." : "Read access was denied. Check permissions for this file or folder.";
    case "missing": return de ? "Die Datei oder der Ordner wurde verschoben oder gelöscht. Lade die Übersicht erneut." : "The file or folder was moved or deleted. Reload the overview.";
    case "path": return de ? "Der Dateipfad wird nicht unterstützt. Prüfe Sonderzeichen und Leerzeichen am Anfang oder Ende des Namens." : "This path is not supported. Check special characters and leading or trailing spaces in the name.";
    default: return de ? "Die Datei oder der Ordner konnte nicht gelesen werden. Prüfe, ob sie lokal verfügbar sind, und versuche es erneut." : "The file or folder could not be read. Check that it is available locally and try again.";
  }
}

export function WorkspaceLoadNotice({ issues, failed, locale, onRetry }: {
  issues: WorkspaceLoadIssue[]; failed: boolean; locale: string; onRetry: () => Promise<void>;
}) {
  const de = locale === "de";
  const signature = JSON.stringify([failed, issues]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  if (!failed && issues.length === 0) return null;
  const title = failed ? (de ? "Der Ordner konnte nicht geladen werden." : "The folder could not be loaded.")
    : de ? `${issues.length} Einträge konnten nicht geladen werden.` : `${issues.length} entries could not be loaded.`;
  if (dismissed === signature) return <div className="shrink-0 px-4 py-1 text-xs text-[var(--color-ink-muted)]">
    <button type="button" className="underline pointer-coarse:min-h-11" onClick={() => { setDismissed(null); setDetails(true); }}>{de ? "Ladehinweise anzeigen" : "Show loading issues"} ({issues.length || 1})</button>
  </div>;
  return <section aria-label={de ? "Ladehinweise" : "Loading issues"} data-testid="local-workspace-load-error" className="shrink-0 border-b border-orange-500/40 bg-[var(--color-surface-raised)] text-sm">
    <div className="flex flex-wrap items-center gap-3 px-4 py-2">
      <AlertTriangle size={16} className="shrink-0 text-orange-500" />
      <p role="status" className="min-w-0 flex-1">{title} <span className="text-[var(--color-ink-muted)]">{de ? "Die übrigen Dateien bleiben verfügbar." : "The remaining files are still available."}</span></p>
      <button type="button" aria-expanded={details} aria-controls="workspace-load-details" onClick={() => setDetails(!details)} className="underline pointer-coarse:min-h-11">{details ? (de ? "Details schließen" : "Hide details") : "Details"}</button>
      <button type="button" disabled={busy} className="underline disabled:opacity-50 pointer-coarse:min-h-11" onClick={async () => {
        setBusy(true); setRetryFailed(false);
        try { await onRetry(); } catch (error) { console.error("[BloomMD] Workspace retry failed:", error); setRetryFailed(true); }
        finally { setBusy(false); }
      }}>{busy ? (de ? "Wird geprüft …" : "Checking …") : (de ? "Erneut prüfen" : "Retry")}</button>
      <button type="button" aria-label={de ? "Ladehinweise ausblenden" : "Dismiss loading issues"} title={de ? "Ladehinweise ausblenden" : "Dismiss loading issues"} onClick={() => setDismissed(signature)} className="rounded p-2 hover:bg-[var(--color-surface-sunken)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"><X size={16} /></button>
    </div>
    {retryFailed && <p role="alert" className="px-4 pb-2">{de ? "Erneutes Laden fehlgeschlagen. Prüfe, ob der Ordner erreichbar ist." : "Reload failed. Check that the folder is accessible."}</p>}
    {details && <div id="workspace-load-details" className="max-h-48 overflow-auto border-t border-[var(--color-border)] px-4 py-3">
      <p className="mb-3 text-xs text-[var(--color-ink-muted)]">{de ? "Nicht geladene Dateien haben noch keinen Knoten in der Karte. Korrigiere die Datei in deinem Texteditor und wähle danach „Erneut prüfen“." : "Files that could not be loaded have no node in the map. Correct the file in your text editor, then choose Retry."}</p>
      <ul className="space-y-3">{issues.map((issue) => <li key={issue.path}><p className="break-all font-medium">{issue.path}</p><p className="text-[var(--color-ink-muted)]">{loadIssueExplanation(issue, locale)}</p></li>)}</ul>
      {failed && issues.length === 0 && <p>{de ? "Prüfe, ob der Ordner noch existiert und BloomMD ihn lesen darf." : "Check that the folder still exists and BloomMD has permission to read it."}</p>}
    </div>}
  </section>;
}
