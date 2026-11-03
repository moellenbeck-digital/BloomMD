"use client";

import { useCallback, useEffect, useRef, useImperativeHandle, forwardRef, useState, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, FilePlus, History, FilePlus2, FolderPlus, Upload, Download, FileText, ListTree, FileDown, ImageDown, Shapes, Link2, Save, Check, RefreshCw, CircleHelp, Info, Sun, Moon, Search, Languages, BookOpen, MessageSquare, UserCircle, Rocket, type LucideIcon } from "lucide-react";
import { importOpml, isWorkspaceMindMap, OpmlError, parseFile, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";
import { MapExportError } from "../export/capture-map";
import { buildTextExport, downloadExportFile, EXPORT_FORMATS, type ExportFile, type ExportFormat } from "../export/export-file";
import { exportMapFile } from "../export/run-map-export";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../hooks/useTheme";

interface ToolbarProps {
  onReload?: () => void;
  onToggleHelp?: () => void;
  onOpenAbout?: () => void;
  onToggleCommandPalette?: () => void;
  onOpenFeedback?: () => void;
  feedbackTestId?: string;
  onOpenOnboarding?: () => void;
  docsHref?: string;
  accountHref?: string;
  onCreateFolder?: () => void;
  /** Opens the new-file dialog, which offers the templates. */
  onCreateFromTemplate?: () => void;
  onNewFile?: (doc: ReturnType<typeof parseFile>) => void | Promise<void>;
  onSaveFile?: (doc: ReturnType<typeof parseFile>) => void | Promise<void>;
  onImportFile?: () => Promise<void>;
  onCreateNew?: () => Promise<void>;
  /** Hands an exported file to the platform (desktop saves natively); the web app downloads it by default. */
  onDeliverExport?: (file: ExportFile) => void | Promise<void>;
  /** Creates a read-only link for colleagues without an account (cloud maps only). */
  onShareLink?: () => void | Promise<void>;
  /** Opens the version history of the open note (notes in a local folder or the cloud). */
  onOpenHistory?: () => void;
}

export interface ToolbarHandle {
  triggerImport: () => void;
  triggerExport: () => void;
  triggerSave: () => Promise<void>;
  triggerNew: () => void;
}

interface ToolbarMenuProps {
  label: string;
  Icon: LucideIcon;
  testId: string;
  children: ReactNode;
}

function ToolbarMenu({ label, Icon, testId, children }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onMenuClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[role="menuitem"]')) setOpen(false);
  };

  const onMenuClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[role="menuitem"]')) menuButtonRef.current?.focus();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        ref={menuButtonRef}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
            : "border-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
        }`}
      >
        <Icon size={17} aria-hidden="true" />
        <span className="hidden xl:inline">{label}</span>
        <span aria-hidden="true" className="text-[10px] opacity-60">⌄</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onClickCapture={onMenuClickCapture}
          onClick={onMenuClick}
          className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 text-[var(--color-ink)] shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

const toolbarMenuItemClass = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]";

export const Toolbar = forwardRef<ToolbarHandle, ToolbarProps>(function Toolbar({ onReload, onToggleHelp, onOpenAbout, onToggleCommandPalette, onOpenFeedback, feedbackTestId, onOpenOnboarding, docsHref, accountHref, onCreateFolder, onCreateFromTemplate, onNewFile, onSaveFile, onImportFile, onCreateNew, onDeliverExport, onShareLink, onOpenHistory }, ref) {
  const { t, locale, toggleLocale } = useLocale();
  const { theme, toggleTheme } = useTheme();
  const document = useMindMapStore((s) => s.document);
  const setDocument = useMindMapStore((s) => s.setDocument);
  const setStorageMetadata = useMindMapStore((s) => s.setStorageMetadata);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const onNew = useCallback(() => {
    if (onCreateNew) {
      onCreateNew().catch((err) => console.error("[BloomMD] createNew error:", err));
      return;
    }
    const title = t.newMindmap;
    const slug = `mindmap-${Date.now()}`;
    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const markdown = [
      "---",
      `title: ${title}`,
      `id: ${id}`,
      `created: "${now}"`,
      `updated: "${now}"`,
      "layout:",
      "  direction: LR",
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");

    const filename = `${slug}.md`;
    const doc = parseFile(filename, markdown);
    setDocument(doc);

    if (onNewFile) {
      Promise.resolve(onNewFile(doc)).catch(() => {});
    } else {
      fetch("/api/mindmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, markdown: serializeToMarkdown(doc) }),
      }).catch(() => {});
    }

    // Select root node so user can immediately rename with the canvas shortcut.
    setTimeout(() => {
      const rootId = doc.rootId;
      useMindMapStore.getState().setSelectedNodeId(rootId);
    }, 100);
  }, [t, setDocument, onNewFile, onCreateNew]);

  const onSave = useCallback(async () => {
    if (!document) return;
    if (isWorkspaceMindMap(document)) {
      setSaved(false);
      useMindMapStore.getState().setStatusMessage(t.derivedWorkspaceSave);
      return;
    }
    setSaving(true);
    setSaveError(false);

    try {
      if (onSaveFile) {
        await onSaveFile(document);
      } else {
        const markdown = serializeToMarkdown(document);
        const filename = document.filePath.split("/").pop() || "mindmap.md";
        const res = await fetch(`/api/mindmaps/${encodeURIComponent(filename)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown, expectedVersion: document.storage?.version }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `Save failed with HTTP ${res.status}`);
        }
        const saved = (await res.json()) as { storage?: MindMapDocument["storage"] };
        if (saved.storage) setStorageMetadata(saved.storage);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [document, onSaveFile, setStorageMetadata, t.derivedWorkspaceSave]);

  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const setStatusMessage = useMindMapStore((s) => s.setStatusMessage);

  const runExport = useCallback(async (format: ExportFormat) => {
    const current = useMindMapStore.getState().document;
    if (!current) return;
    if (isWorkspaceMindMap(current)) {
      setStatusMessage(t.derivedWorkspaceExport);
      return;
    }
    try {
      const file = format === "markdown" || format === "opml" ? buildTextExport(format, current) : await exportMapFile(format);
      await (onDeliverExport ?? downloadExportFile)(file);
    } catch (error) {
      console.error("[BloomMD] export failed:", error);
      setStatusMessage(error instanceof MapExportError && error.code === "no-map" ? t.exportNoMap : t.exportFailed);
    }
  }, [onDeliverExport, setStatusMessage, t.derivedWorkspaceExport, t.exportFailed, t.exportNoMap]);

  const onExport = useCallback(async () => {
    if (!document) return;
    setExportOpen((open) => !open);
  }, [document]);

  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExportOpen(false);
        exportButtonRef.current?.focus();
      }
    };
    window.document.addEventListener("pointerdown", onPointerDown);
    window.document.addEventListener("keydown", onKeyDown);
    exportMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown);
      window.document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportOpen]);

  const onExportMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const index = items.indexOf(window.document.activeElement as HTMLElement);
    const move = (target: number) => {
      event.preventDefault();
      items[(target + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
  }, []);

  const exportLabels: Record<ExportFormat, { label: string; Icon: LucideIcon }> = {
    markdown: { label: t.exportMarkdown, Icon: FileText },
    opml: { label: t.exportOpml, Icon: ListTree },
    pdf: { label: t.exportPdf, Icon: FileDown },
    png: { label: t.exportPng, Icon: ImageDown },
    svg: { label: t.exportSvg, Icon: Shapes },
  };

  const onImport = useCallback(async () => {
    if (onImportFile) {
      await onImportFile();
      return;
    }
    fileInputRef.current?.click();
  }, [onImportFile, setDocument, onNewFile]);

  useImperativeHandle(ref, () => ({
    triggerImport: onImport,
    triggerExport: onExport,
    triggerSave: onSave,
    triggerNew: onNew,
  }));

  const onFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        let raw = reader.result as string;
        let name = file.name;
        if (/\.opml$/i.test(name)) {
          // OPML becomes a new map; the title follows the file name, exactly as for .md files.
          try {
            raw = importOpml(raw).markdown;
          } catch (error) {
            if (!(error instanceof OpmlError)) throw error;
            console.error("[BloomMD] OPML import failed:", error);
            setStatusMessage(`${t.importOpmlFailed} ${error.message}`);
            return;
          }
          name = name.replace(/\.opml$/i, ".md");
        }
        const doc = parseFile(name, raw);
        setDocument(doc);

        const markdown = serializeToMarkdown(doc);
        const filename = name.endsWith(".md") ? name : `${name}.md`;

        if (onNewFile) {
          onNewFile(doc);
        } else {
          fetch("/api/mindmaps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, markdown }),
          }).catch((err) => console.error("Import save failed:", err));
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [setDocument, onNewFile, setStatusMessage, t.importOpmlFailed],
  );

  return (
    <div className="flex items-center gap-1.5" data-testid="toolbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.opml,text/markdown,text/x-opml+xml,text/xml"
        className="hidden"
        onChange={onFileSelected}
      />

      <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5" role="group" aria-label={t.documentActions} data-testid="toolbar-document-actions">
      <button
        type="button"
        data-testid="toolbar-new"
        onClick={onNew}
        className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
        title={`${t.newMindmap} (Cmd+N)`}
        aria-label={t.newMindmap}
      >
        <FilePlus size={18} />
      </button>
      <button
        type="button"
        data-testid="toolbar-save"
        onClick={onSave}
        disabled={!document || saving}
        className={`
          p-2 rounded-lg transition-all duration-150
          ${saveError
            ? "text-red-600 bg-red-50 dark:bg-red-950/30"
            : saved
            ? "text-[#FF6B35] bg-[var(--color-bloom-light)]"
            : "text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"}
          disabled:opacity-30
        `}
        title={`${saveError ? t.saveFailed : t.save} (Cmd+S)`}
        aria-label={saveError ? t.saveFailed : t.save}
      >
        {saveError ? <AlertTriangle size={18} /> : saved ? <Check size={18} /> : <Save size={18} />}
      </button>
      </div>
      <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5" role="group" aria-label={t.fileActions} data-testid="toolbar-file-actions">
      <button
        type="button"
        data-testid="toolbar-import"
        onClick={onImport}
        className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
        title={`${t.importMd} (Cmd+I)`}
        aria-label={t.importMd}
      >
        <Upload size={18} />
      </button>
      <div ref={exportMenuRef} className="relative">
        <button
          type="button"
          ref={exportButtonRef}
          data-testid="toolbar-export"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          onClick={() => void onExport()}
          disabled={!document}
          className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150 disabled:opacity-30"
          title={`${t.exportMenu} (Cmd+E)`}
          aria-label={t.exportMenu}
        >
          <Download size={18} />
        </button>
        {exportOpen && (
          <div
            role="menu"
            aria-label={t.exportMenu}
            data-testid="export-menu"
            onKeyDown={onExportMenuKeyDown}
            className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 text-[var(--color-ink)] shadow-xl"
          >
            {EXPORT_FORMATS.map((format) => {
              const { label, Icon } = exportLabels[format];
              return (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  data-testid={`export-${format}`}
                  onClick={() => {
                    setExportOpen(false);
                    exportButtonRef.current?.focus();
                    void runExport(format);
                  }}
                  className={toolbarMenuItemClass}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {onShareLink && (
        <button
          type="button"
          data-testid="toolbar-share-link"
          onClick={() => void onShareLink()}
          disabled={!document}
          className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150 disabled:opacity-30"
          title={t.shareReadOnlyLink}
          aria-label={t.shareReadOnlyLink}
        >
          <Link2 size={18} />
        </button>
      )}
      {onOpenHistory && (
        <button
          type="button"
          data-testid="toolbar-history"
          onClick={onOpenHistory}
          disabled={!document}
          className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150 disabled:opacity-30"
          title={t.historyAction}
          aria-label={t.historyAction}
        >
          <History size={18} />
        </button>
      )}
      {onReload && (
        <button
          type="button"
          data-testid="toolbar-reload"
          onClick={onReload}
          disabled={!document}
          className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150 disabled:opacity-30"
          title={`${t.reload} (Cmd+R)`}
          aria-label={t.reload}
        >
          <RefreshCw size={18} />
        </button>
      )}
      {onCreateFromTemplate && (
        <button
          type="button"
          data-testid="toolbar-create-from-template"
          onClick={onCreateFromTemplate}
          className="p-2 rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
          title={t.newFromTemplate}
          aria-label={t.newFromTemplate}
        >
          <FilePlus2 size={18} />
        </button>
      )}
      {onCreateFolder && (
        <button
          type="button"
          data-testid="toolbar-create-folder"
          onClick={onCreateFolder}
          className="p-2 rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
          title={t.newFolder}
          aria-label={t.newFolder}
        >
          <FolderPlus size={18} />
        </button>
      )}
      </div>
      {onToggleCommandPalette && (
        <button
          type="button"
          data-testid="toolbar-search"
          onClick={onToggleCommandPalette}
          className="p-2 rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
          title={`${t.commandPalette} (Cmd+K)`}
          aria-label={t.commandPalette}
        >
          <Search size={18} />
        </button>
      )}
      <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
      {(onToggleHelp || onOpenAbout || onOpenFeedback || onOpenOnboarding || docsHref || accountHref) && (
        <ToolbarMenu label={t.helpAndSettings} Icon={CircleHelp} testId="toolbar-help-menu">
          {onOpenAbout && <button type="button" role="menuitem" data-testid="toolbar-about" onClick={onOpenAbout} className={toolbarMenuItemClass}><Info size={16} aria-hidden="true" /><span>{t.aboutTitle}</span></button>}
          {onToggleHelp && <button type="button" role="menuitem" data-testid="toolbar-help" onClick={onToggleHelp} className={toolbarMenuItemClass}><CircleHelp size={16} aria-hidden="true" /><span>{t.helpTitle}</span><kbd className="ml-auto text-[10px] text-[var(--color-ink-faint)]">F1</kbd></button>}
          {onOpenOnboarding && <button type="button" role="menuitem" data-testid="toolbar-onboarding" onClick={onOpenOnboarding} className={toolbarMenuItemClass}><Rocket size={16} aria-hidden="true" /><span>{t.gettingStarted}</span></button>}
          {docsHref && <a role="menuitem" data-testid="toolbar-documentation" href={docsHref} className={toolbarMenuItemClass}><BookOpen size={16} aria-hidden="true" /><span>{t.documentation}</span></a>}
          {onOpenFeedback && <button type="button" role="menuitem" data-testid={feedbackTestId ?? "toolbar-feedback"} onClick={onOpenFeedback} className={toolbarMenuItemClass}><MessageSquare size={16} aria-hidden="true" /><span>{t.feedback}</span></button>}
          {accountHref && <a role="menuitem" data-testid="toolbar-account" href={accountHref} className={toolbarMenuItemClass}><UserCircle size={16} aria-hidden="true" /><span>{t.account}</span></a>}
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button type="button" role="menuitem" data-testid="toolbar-theme" onClick={toggleTheme} className={toolbarMenuItemClass}>
            {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}<span>{theme === "light" ? t.darkMode : t.lightMode}</span>
          </button>
          <button type="button" role="menuitem" data-testid="toolbar-locale" onClick={toggleLocale} className={toolbarMenuItemClass}>
            <Languages size={16} aria-hidden="true" /><span>{t.language}</span><kbd className="ml-auto font-[var(--font-mono,monospace)] text-[10px] text-[var(--color-ink-faint)]">{locale === "de" ? "EN" : "DE"}</kbd>
          </button>
        </ToolbarMenu>
      )}
    </div>
  );
});
