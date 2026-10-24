"use client";

import { useCallback, useEffect, useRef, useImperativeHandle, forwardRef, useState, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, FilePlus, FolderPlus, Upload, Download, Link2, Save, Check, RefreshCw, CircleHelp, Info, Sun, Moon, Search, Languages, BookOpen, MessageSquare, UserCircle, Rocket, type LucideIcon } from "lucide-react";
import { isWorkspaceMindMap, parseFile, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";
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
  onNewFile?: (doc: ReturnType<typeof parseFile>) => void | Promise<void>;
  onSaveFile?: (doc: ReturnType<typeof parseFile>) => void | Promise<void>;
  onImportFile?: () => Promise<void>;
  onCreateNew?: () => Promise<void>;
  onExportFile?: () => Promise<void>;
  /** Creates a read-only link for colleagues without an account (cloud maps only). */
  onShareLink?: () => void | Promise<void>;
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

export const Toolbar = forwardRef<ToolbarHandle, ToolbarProps>(function Toolbar({ onReload, onToggleHelp, onOpenAbout, onToggleCommandPalette, onOpenFeedback, feedbackTestId, onOpenOnboarding, docsHref, accountHref, onCreateFolder, onNewFile, onSaveFile, onImportFile, onCreateNew, onExportFile, onShareLink }, ref) {
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

  const onExport = useCallback(async () => {
    if (!document) return;
    if (onExportFile) {
      await onExportFile();
      return;
    }
    const markdown = serializeToMarkdown(document);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.frontmatter.title || "mindmap"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [document, onExportFile]);

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
        const raw = reader.result as string;
        const doc = parseFile(file.name, raw);
        setDocument(doc);

        const markdown = serializeToMarkdown(doc);
        const filename = file.name.endsWith(".md") ? file.name : `${file.name}.md`;

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
    [setDocument, onNewFile],
  );

  return (
    <div className="flex items-center gap-1.5" data-testid="toolbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown"
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
      <button
        type="button"
        data-testid="toolbar-export"
        onClick={onExport}
        disabled={!document}
        className="p-2 rounded-lg text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150 disabled:opacity-30"
        title={`${t.exportMd} (Cmd+E)`}
        aria-label={t.exportMd}
      >
        <Download size={18} />
      </button>
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
