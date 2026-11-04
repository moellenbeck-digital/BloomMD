import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CloudUpload, FileText, Folder, FolderUp, X } from "lucide-react";
import type { SharedFolderBlockReason, SharedFolderConflictStrategy, SharedFolderPlanItem } from "@bloommd/core/shared-folder-publication";
import type { DesktopConnectionProfile, DesktopFolderPublicationPreview, DesktopFolderPublicationResult, DesktopWorkspaceInfo } from "../shared/rpc-types";
import {
  choosePublicationFolder,
  getConnectionMode,
  listProfileWorkspaces,
  previewFolderPublication,
  publishFolderAsWorkspace,
  selectOpenFolderForPublication,
} from "./rpc";

type Step = "folder" | "target" | "preview" | "result";
type Locale = "de" | "en";

/** Names the folder mode apart from "Diese lokale Datei teilen"; both entry points use these labels. */
export function folderPublicationLabel(locale: Locale): string {
  return locale === "de" ? "Ordner als gemeinsamen Workspace veröffentlichen" : "Publish folder as a shared workspace";
}

export function formatPublicationBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function publicationBlockReasonLabel(reason: SharedFolderBlockReason, locale: Locale): string {
  const de = locale === "de";
  switch (reason) {
    case "name-not-portable":
      return de ? "Der Dateiname passt nicht in einen Cloud-Namen (Sonderzeichen, Punkt am Anfang oder doppelte Leerzeichen)." : "The file name does not fit a cloud name (special characters, leading dot or repeated spaces).";
    case "name-collision":
      return de ? "Nach dem Zusammenführen der Ordner ist der Cloud-Name mit einer anderen lokalen Datei identisch." : "After joining the folders the cloud name equals the name of another local file.";
    case "too-large":
      return de ? "Die Datei ist größer als 1 MB." : "The file is larger than 1 MB.";
  }
}

export function describePublicationError(error: string | undefined, locale: Locale): string {
  const de = locale === "de";
  switch (error) {
    case "WORKSPACE_READ_ONLY":
      return de ? "Dieser Workspace ist schreibgeschützt (Viewer). Wähle einen Workspace mit Schreibrecht." : "This workspace is read-only (viewer). Choose a workspace you can write to.";
    case "PUBLICATION_FOLDER_NOT_SELECTED":
      return de ? "Es ist noch kein Ordner gewählt." : "No folder has been chosen yet.";
    case "FOLDER_TOO_MANY_FILES":
      return de ? "Der Ordner enthält mehr als 5000 Markdown-Dateien. Wähle einen kleineren Ordner." : "The folder contains more than 5000 Markdown files. Choose a smaller folder.";
    case "FOLDER_PUBLICATION_LOCAL_ONLY":
      return de ? "Ordner lassen sich nur im lokalen Modus veröffentlichen." : "Folders can only be published in local mode.";
    case "SHARE_AUDIT_FAILED":
      return de ? "Die Freigabe konnte nicht im Workspace-Audit festgehalten werden. Die angelegten Cloud-Dokumente wurden wieder entfernt." : "The share could not be recorded in the workspace audit. The cloud documents created for it were removed again.";
    case "SHARE_AUDIT_FAILED_CLOUD_DOCUMENTS_CREATED":
      return de ? "Die Freigabe konnte nicht im Workspace-Audit festgehalten werden, und einige Cloud-Dokumente ließen sich nicht wieder entfernen. Bitte prüfe den Workspace." : "The share could not be recorded in the workspace audit and some cloud documents could not be removed again. Please check the workspace.";
    case "NOTHING_PUBLISHED":
      return de ? "Es wurde nichts veröffentlicht." : "Nothing was published.";
    case "FOLDER_BINDING_NOT_SAVED":
      return de ? "Die Dateien sind hochgeladen, die lokale Verbindung konnte aber nicht gespeichert werden." : "The files were uploaded, but the local connection could not be saved.";
    default:
      return error || (de ? "Der Ordner konnte nicht veröffentlicht werden." : "The folder could not be published.");
  }
}

interface TreeNode {
  name: string;
  path: string;
  folders: Map<string, TreeNode>;
  files: SharedFolderPlanItem[];
}

function buildTree(items: readonly SharedFolderPlanItem[]): TreeNode {
  const root: TreeNode = { name: "", path: "", folders: new Map(), files: [] };
  for (const item of items) {
    const segments = item.relativePath.split("/");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const path = node.path ? `${node.path}/${segment}` : segment;
      let child = node.folders.get(segment);
      if (!child) {
        child = { name: segment, path, folders: new Map(), files: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }
    node.files.push(item);
  }
  return root;
}

/** Files the person can still include or exclude: classified as uploadable by the plan. */
function selectableFiles(node: TreeNode): SharedFolderPlanItem[] {
  return [...node.files.filter((item) => item.status === "upload"), ...[...node.folders.values()].flatMap(selectableFiles)];
}

export function FolderPublicationDialog({
  profiles,
  locale,
  onClose,
}: {
  profiles: DesktopConnectionProfile[];
  locale: Locale;
  onClose: () => void;
}) {
  const de = locale === "de";
  const [step, setStep] = useState<Step>("folder");
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceInfo[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [strategy, setStrategy] = useState<SharedFolderConflictStrategy>("keep-cloud");
  const [preview, setPreview] = useState<DesktopFolderPublicationPreview | null>(null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<DesktopFolderPublicationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestPreview = useRef(0);

  useEffect(() => {
    let disposed = false;
    void getConnectionMode()
      .then((mode) => { if (!disposed && mode.type === "local") setOpenFolder(mode.dir); })
      .catch((cause: unknown) => console.error("[BloomMD] Open folder could not be read:", cause));
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (step !== "target" || !profileId) return;
    let disposed = false;
    setLoadingWorkspaces(true);
    setError(null);
    void listProfileWorkspaces(profileId)
      .then((context) => {
        if (disposed) return;
        setWorkspaces(context.workspaces);
        setWorkspaceId((current) => context.workspaces.some((workspace) => workspace.id === current && workspace.role !== "viewer")
          ? current
          : context.workspaces.find((workspace) => workspace.id === context.workspace?.id && workspace.role !== "viewer")?.id
            ?? context.workspaces.find((workspace) => workspace.role !== "viewer")?.id
            ?? "");
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setWorkspaces([]);
        setWorkspaceId("");
        setError(cause instanceof Error ? cause.message : (de ? "Workspaces konnten nicht geladen werden." : "Workspaces could not be loaded."));
      })
      .finally(() => { if (!disposed) setLoadingWorkspaces(false); });
    return () => { disposed = true; };
  }, [de, profileId, step]);

  const pickCurrentFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = await selectOpenFolderForPublication();
      if (!chosen.path) throw new Error(describePublicationError(chosen.error, locale));
      setFolderPath(chosen.path);
      setStep("target");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const pickOtherFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      const chosen = await choosePublicationFolder();
      if (chosen.error) throw new Error(describePublicationError(chosen.error, locale));
      if (!chosen.path) return;
      setFolderPath(chosen.path);
      setStep("target");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  /** Classification always runs without exclusions; the checkboxes below apply them locally. */
  const loadPreview = useCallback(async (nextStrategy: SharedFolderConflictStrategy) => {
    const requestId = ++latestPreview.current;
    setBusy(true);
    setError(null);
    try {
      const response = await previewFolderPublication({ profileId, workspaceId, strategy: nextStrategy, excluded: [] });
      if (requestId !== latestPreview.current) return;
      if (!response.success || !response.preview) throw new Error(describePublicationError(response.error, locale));
      setPreview(response.preview);
      setStep("preview");
    } catch (cause) {
      if (requestId === latestPreview.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === latestPreview.current) setBusy(false);
    }
  }, [locale, profileId, workspaceId]);

  const changeStrategy = (next: SharedFolderConflictStrategy) => {
    setStrategy(next);
    void loadPreview(next);
  };

  const tree = useMemo(() => (preview ? buildTree(preview.items) : null), [preview]);

  const summary = useMemo(() => {
    if (!preview) return { count: 0, bytes: 0, conflicts: 0, blocked: 0, excluded: 0 };
    let count = 0;
    let bytes = 0;
    for (const item of preview.items) {
      if (item.status === "upload" && !excluded.has(item.relativePath)) {
        count += 1;
        bytes += item.sizeBytes;
      }
    }
    return {
      count,
      bytes,
      conflicts: preview.totals.conflictCount,
      blocked: preview.totals.blockedCount,
      excluded: preview.items.filter((item) => item.status === "upload" && excluded.has(item.relativePath)).length,
    };
  }, [excluded, preview]);

  const toggleFiles = (paths: readonly string[], include: boolean) => {
    setExcluded((current) => {
      const next = new Set(current);
      for (const path of paths) {
        if (include) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  };

  const toggleCollapsed = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const publish = async () => {
    if (!preview || summary.count === 0) return;
    setBusy(true);
    setError(null);
    try {
      const confirmedUploads = preview.items.filter((item) => item.status === "upload" && !excluded.has(item.relativePath)).map((item) => item.relativePath);
      const response = await publishFolderAsWorkspace({ profileId, workspaceId, strategy, excluded: [...excluded], confirmedUploads });
      setResult(response);
      setStep("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (de ? "Der Ordner konnte nicht veröffentlicht werden." : "The folder could not be published."));
    } finally {
      setBusy(false);
    }
  };

  const strategyOptions: Array<{ value: SharedFolderConflictStrategy; label: string; hint: string }> = [
    {
      value: "keep-cloud",
      label: de ? "Vorhandene Cloud-Datei nicht anfassen, als Konflikt melden" : "Leave the existing cloud file alone and report a conflict",
      hint: de ? "Standard. Die lokale Datei wird dann nicht hochgeladen." : "Default. The local file is then not uploaded.",
    },
    {
      value: "suffix",
      label: de ? "Lokale Datei unter anderem Namen hochladen (Suffix)" : "Upload the local file under another name (suffix)",
      hint: de ? "Der Name erhält „-local“ vor der Endung; vorhandene Dateien bleiben unverändert." : "The name gets “-local” before the extension; existing files stay untouched.",
    },
  ];

  const renderFile = (item: SharedFolderPlanItem, depth: number) => {
    const included = item.status === "upload" && !excluded.has(item.relativePath);
    const name = item.relativePath.split("/").pop() ?? item.relativePath;
    return (
      <li key={item.relativePath} className="py-1" style={{ paddingLeft: `${depth * 18}px` }} data-testid="folder-publication-file" data-status={item.status} data-path={item.relativePath}>
        <div className="flex items-start gap-2 text-sm">
          {item.status === "upload" ? (
            <input type="checkbox" checked={included} onChange={(event) => toggleFiles([item.relativePath], event.target.checked)} aria-label={de ? `${item.relativePath} einschließen` : `Include ${item.relativePath}`} className="mt-1" />
          ) : (
            <input type="checkbox" checked={false} disabled aria-label={de ? `${item.relativePath} kann nicht eingeschlossen werden` : `${item.relativePath} cannot be included`} className="mt-1" />
          )}
          <FileText size={14} className="mt-1 shrink-0 text-[var(--color-ink-faint)]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`break-all ${included ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"}`}>{name}</span>
              <span className="text-xs text-[var(--color-ink-faint)]">{formatPublicationBytes(item.sizeBytes)}</span>
              {item.status === "upload" && item.uploadFilename && (
                <span className="break-all font-mono text-xs text-[var(--color-ink-muted)]" title={de ? "Name im Workspace" : "Name in the workspace"}>→ {item.uploadFilename}</span>
              )}
            </div>
            {item.status === "conflict" && (
              <p className="text-xs text-amber-500">{de ? `Konflikt: „${item.cloudFilename}“ existiert im Workspace und bleibt unberührt. Diese Datei wird nicht hochgeladen.` : `Conflict: “${item.cloudFilename}” already exists in the workspace and stays untouched. This file is not uploaded.`}</p>
            )}
            {item.status === "upload" && item.renamedByStrategy && (
              <p className="text-xs text-amber-500">{de ? `„${item.cloudFilename}“ existiert bereits; diese Datei wird unter dem Suffix-Namen hochgeladen.` : `“${item.cloudFilename}” already exists; this file is uploaded under the suffixed name.`}</p>
            )}
            {item.status === "blocked" && item.reason && (
              <p className="flex items-start gap-1 text-xs text-red-500"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{publicationBlockReasonLabel(item.reason, locale)}</p>
            )}
          </div>
        </div>
      </li>
    );
  };

  const renderFolder = (node: TreeNode, depth: number): ReactNode => {
    const selectable = selectableFiles(node);
    const includedCount = selectable.filter((item) => !excluded.has(item.relativePath)).length;
    const isCollapsed = collapsed.has(node.path);
    const sortedFolders = [...node.folders.values()].sort((left, right) => (left.name < right.name ? -1 : 1));
    const sortedFiles = [...node.files].sort((left, right) => (left.relativePath < right.relativePath ? -1 : 1));
    return (
      <li key={node.path} className="py-1" style={{ paddingLeft: `${depth * 18}px` }} data-testid="folder-publication-folder" data-path={node.path}>
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={selectable.length > 0 && includedCount === selectable.length}
            ref={(element) => { if (element) element.indeterminate = includedCount > 0 && includedCount < selectable.length; }}
            disabled={selectable.length === 0}
            onChange={(event) => toggleFiles(selectable.map((item) => item.relativePath), event.target.checked)}
            aria-label={de ? `Ordner ${node.path} einschließen` : `Include folder ${node.path}`}
          />
          <button type="button" onClick={() => toggleCollapsed(node.path)} className="inline-flex items-center gap-1" aria-expanded={!isCollapsed}>
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <Folder size={14} className="text-[var(--color-primary)]" />
            <span>{node.name}</span>
          </button>
          <span className="text-xs font-normal text-[var(--color-ink-faint)]">{includedCount}/{selectable.length}</span>
        </div>
        {!isCollapsed && (
          <ul>
            {sortedFolders.map((child) => renderFolder(child, depth + 1))}
            {sortedFiles.map((item) => renderFile(item, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const workspaceName = preview?.workspace.name ?? workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label={folderPublicationLabel(locale)} data-testid="folder-publication-dialog">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-primary)]"><FolderUp size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">{de ? "Bewusst veröffentlichen" : "Explicit publication"}</span></div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">{folderPublicationLabel(locale)}</h2>
            {folderPath && <p className="mt-1 break-all font-mono text-xs text-[var(--color-ink-muted)]" data-testid="folder-publication-path">{folderPath}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]" aria-label={de ? "Schließen" : "Close"}><X size={19} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {step === "folder" && (
            <>
              <p className="text-sm leading-6 text-[var(--color-ink-muted)]">
                {de
                  ? "Wähle den Ordner, den du als gemeinsamen Workspace veröffentlichen willst. Es wird nichts gelesen oder hochgeladen, bevor du in der Vorschau bestätigst. Nur Markdown-Dateien kommen infrage; der Ordnerpfad bleibt auf deinem Gerät."
                  : "Choose the folder you want to publish as a shared workspace. Nothing is read or uploaded until you confirm in the preview. Only Markdown files qualify; the folder path stays on your device."}
              </p>
              {profiles.length === 0 && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">{de ? "Lege zuerst unter Server-Verbindungen ein Profil mit persönlichem Zugriffstoken an." : "First create a server profile with a personal access token."}</p>}
              {openFolder && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4 text-sm">
                  <div className="font-semibold text-[var(--color-ink)]">{de ? "Vorschlag: aktuell geöffneter Ordner" : "Suggestion: the folder that is open now"}</div>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--color-ink-muted)]" data-testid="folder-publication-suggestion">{openFolder}</p>
                  <button type="button" disabled={busy || profiles.length === 0} onClick={() => void pickCurrentFolder()} data-testid="folder-publication-use-current" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"><Folder size={14} />{de ? "Diesen Ordner verwenden" : "Use this folder"}</button>
                </div>
              )}
              <button type="button" disabled={busy || profiles.length === 0} onClick={() => void pickOtherFolder()} data-testid="folder-publication-choose" className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"><FolderUp size={14} />{de ? "Anderen Ordner wählen …" : "Choose another folder …"}</button>
            </>
          )}

          {step === "target" && (
            <>
              <label className="block text-sm font-medium text-[var(--color-ink)]">{de ? "Server-Profil" : "Server profile"}
                <select value={profileId} onChange={(event) => { setProfileId(event.target.value); setWorkspaceId(""); }} data-testid="folder-publication-profile" className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-ink)]">
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.url}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-[var(--color-ink)]">Workspace
                <select value={workspaceId} disabled={loadingWorkspaces || workspaces.length === 0} onChange={(event) => setWorkspaceId(event.target.value)} data-testid="folder-publication-workspace" className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-ink)]">
                  <option value="">{loadingWorkspaces ? (de ? "Workspaces werden geladen …" : "Loading workspaces …") : (de ? "Workspace wählen" : "Choose workspace")}</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id} disabled={workspace.role === "viewer"}>{workspace.name} · {workspace.role}{workspace.role === "viewer" ? (de ? " (nur lesen)" : " (read only)") : ""}</option>)}
                </select>
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[var(--color-ink)]">{de ? "Wenn eine Datei im Workspace schon existiert" : "When a file already exists in the workspace"}</legend>
                {strategyOptions.map((option) => (
                  <label key={option.value} className="flex items-start gap-2 text-sm text-[var(--color-ink-muted)]">
                    <input type="radio" name="folder-publication-strategy" checked={strategy === option.value} onChange={() => setStrategy(option.value)} className="mt-1" data-testid={`folder-publication-strategy-${option.value}`} />
                    <span><span className="font-medium text-[var(--color-ink)]">{option.label}</span><br />{option.hint}</span>
                  </label>
                ))}
                <p className="text-xs text-[var(--color-ink-faint)]">{de ? "Keine Variante überschreibt eine vorhandene Cloud-Datei." : "Neither option overwrites an existing cloud file."}</p>
              </fieldset>
            </>
          )}

          {step === "preview" && preview && tree && (
            <>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4 text-sm" data-testid="folder-publication-summary">
                <dl className="grid gap-1.5 text-[var(--color-ink-muted)]">
                  <div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Ziel-Workspace: " : "Target workspace: "}</dt><dd className="inline" data-testid="folder-publication-target">{preview.workspace.name} · {preview.workspace.role}</dd></div>
                  <div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Markdown-Dateien: " : "Markdown files: "}</dt><dd className="inline" data-testid="folder-publication-count">{summary.count}</dd><span> {de ? `von ${preview.totals.fileCount} im Ordner` : `of ${preview.totals.fileCount} in the folder`}</span></div>
                  <div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Gesamtgröße: " : "Total size: "}</dt><dd className="inline" data-testid="folder-publication-size">{formatPublicationBytes(summary.bytes)}</dd></div>
                  <div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Konfliktstrategie: " : "Conflict strategy: "}</dt><dd className="inline" data-testid="folder-publication-strategy-label">{strategyOptions.find((option) => option.value === strategy)?.label}</dd></div>
                  {summary.excluded > 0 && <div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Ausgeschlossen: " : "Excluded: "}</dt><dd className="inline">{summary.excluded}</dd></div>}
                  {summary.conflicts > 0 && <div className="text-amber-500">{de ? `${summary.conflicts} Konflikt(e): vorhandene Cloud-Dateien bleiben unberührt.` : `${summary.conflicts} conflict(s): existing cloud files stay untouched.`}</div>}
                  {summary.blocked > 0 && <div className="text-red-500">{de ? `${summary.blocked} Datei(en) können nicht eingeschlossen werden.` : `${summary.blocked} file(s) cannot be included.`}</div>}
                  {preview.alreadyPublished > 0 && <div>{de ? `${preview.alreadyPublished} Datei(en) sind bereits aus diesem Ordner in diesen Workspace veröffentlicht.` : `${preview.alreadyPublished} file(s) were already published from this folder to this workspace.`}</div>}
                  {preview.alreadyShared > 0 && <div>{de ? `${preview.alreadyShared} Datei(en) sind bereits einzeln geteilt und werden nicht erneut angeboten.` : `${preview.alreadyShared} file(s) are already shared one by one and are not offered again.`}</div>}
                </dl>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium text-[var(--color-ink)]">{de ? "Konfliktstrategie" : "Conflict strategy"}</legend>
                {strategyOptions.map((option) => (
                  <label key={option.value} className="flex items-start gap-2 text-sm text-[var(--color-ink-muted)]">
                    <input type="radio" name="folder-publication-preview-strategy" checked={strategy === option.value} disabled={busy} onChange={() => changeStrategy(option.value)} className="mt-1" />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
              <p className="text-xs leading-5 text-[var(--color-ink-faint)]">
                {de
                  ? "Unterordner werden im Workspace-Namen mit „__“ verbunden (notes/2026/idee.md → notes__2026__idee.md); der Workspace kennt keine Unterordner. Nur die hier angehakten Markdown-Dateien werden hochgeladen."
                  : "Sub-folders are joined with “__” in the workspace name (notes/2026/idea.md → notes__2026__idea.md); the workspace has no sub-folders. Only the Markdown files ticked here are uploaded."}
              </p>
              {preview.items.length === 0 ? (
                <p className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink-muted)]">{de ? "In diesem Ordner gibt es keine Markdown-Dateien, die angeboten werden können." : "This folder has no Markdown files that can be offered."}</p>
              ) : (
                <ul className="rounded-xl border border-[var(--color-border)] px-3 py-2" data-testid="folder-publication-list">
                  {[...tree.folders.values()].sort((left, right) => (left.name < right.name ? -1 : 1)).map((node) => renderFolder(node, 0))}
                  {[...tree.files].sort((left, right) => (left.relativePath < right.relativePath ? -1 : 1)).map((item) => renderFile(item, 0))}
                </ul>
              )}
            </>
          )}

          {step === "result" && result && (
            <div className="space-y-3 text-sm text-[var(--color-ink-muted)]" data-testid="folder-publication-result">
              <p className={`rounded-lg border px-3 py-2 ${result.success ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-red-500/40 bg-red-500/10 text-red-500"}`}>
                {result.success
                  ? (de ? `${result.published} Datei(en) in „${workspaceName}“ veröffentlicht.` : `${result.published} file(s) published to “${workspaceName}”.`)
                  : describePublicationError(result.error, locale)}
              </p>
              {result.success && result.error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-500">{describePublicationError(result.error, locale)}</p>}
              {result.failed.length > 0 && (
                <div><p className="font-medium text-[var(--color-ink)]">{de ? "Nicht hochgeladen (Fehler):" : "Not uploaded (errors):"}</p><ul className="mt-1 list-disc pl-5">{result.failed.map((entry) => <li key={entry.relativePath} className="break-all">{entry.relativePath} — {entry.error}</li>)}</ul></div>
              )}
              {result.skipped.length > 0 && (
                <div><p className="font-medium text-[var(--color-ink)]">{de ? "Übersprungen:" : "Skipped:"}</p><ul className="mt-1 list-disc pl-5">{result.skipped.map((entry) => <li key={entry.relativePath} className="break-all">{entry.relativePath} — {entry.reason === "not-confirmed" ? (de ? "nicht in der bestätigten Vorschau" : "not part of the confirmed preview") : entry.reason === "too-large" ? (de ? "inzwischen größer als 1 MB" : "now larger than 1 MB") : (de ? "nicht lesbar" : "unreadable")}</li>)}</ul></div>
              )}
              {result.rollbackFailures.length > 0 && (
                <div><p className="font-medium text-red-500">{de ? "Diese Cloud-Dokumente konnten nicht wieder entfernt werden:" : "These cloud documents could not be removed again:"}</p><ul className="mt-1 list-disc pl-5">{result.rollbackFailures.map((path) => <li key={path} className="break-all">{path}</li>)}</ul></div>
              )}
              <p>{de ? "Deine lokalen Dateien wurden nicht verändert. In der Cloud wurde nichts überschrieben oder gelöscht." : "Your local files were not changed. Nothing in the cloud was overwritten or deleted."}</p>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500" data-testid="folder-publication-error">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <div className="text-xs text-[var(--color-ink-faint)]">
            {step === "preview" && summary.count > 0 && (de
              ? `Mit „Veröffentlichen“ werden ${summary.count} Datei(en) (${formatPublicationBytes(summary.bytes)}) in „${workspaceName}“ hochgeladen.`
              : `“Publish” uploads ${summary.count} file(s) (${formatPublicationBytes(summary.bytes)}) to “${workspaceName}”.`)}
          </div>
          <div className="flex gap-3">
            {step === "result" ? (
              <button type="button" onClick={onClose} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">{de ? "Schließen" : "Close"}</button>
            ) : (
              <>
                <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50">{de ? "Abbrechen" : "Cancel"}</button>
                {step === "target" && (
                  <>
                    <button type="button" onClick={() => setStep("folder")} disabled={busy} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50">{de ? "Zurück" : "Back"}</button>
                    <button type="button" onClick={() => void loadPreview(strategy)} disabled={busy || !workspaceId} data-testid="folder-publication-preview" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{busy ? (de ? "Wird gelesen …" : "Reading …") : (de ? "Vorschau anzeigen" : "Show preview")}</button>
                  </>
                )}
                {step === "preview" && (
                  <>
                    <button type="button" onClick={() => setStep("target")} disabled={busy} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50">{de ? "Zurück" : "Back"}</button>
                    <button type="button" onClick={() => void publish()} disabled={busy || summary.count === 0} data-testid="folder-publication-confirm" className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><CloudUpload size={15} />{busy ? (de ? "Wird veröffentlicht …" : "Publishing …") : (de ? "Veröffentlichen" : "Publish")}</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
