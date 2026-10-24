"use client";

import { useLocale } from "../i18n/LocaleContext";
import type { Translations } from "../i18n/translations";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  versionLabel?: string;
  showWorkspaceNavigationShortcut?: boolean;
}

function getShortcuts(t: Translations, showWorkspaceNavigationShortcut: boolean) {
  return [
    { category: t.categoryFile, items: [
      { keys: "Cmd/Ctrl+N", action: t.shortcutNew },
      { keys: "Cmd/Ctrl+S", action: t.shortcutSave },
      { keys: "Cmd/Ctrl+R", action: t.shortcutReload },
      { keys: "Cmd/Ctrl+O", action: t.shortcutFileBrowser },
      { keys: "Cmd/Ctrl+K", action: t.shortcutCommandPalette },
      { keys: "Cmd/Ctrl+I", action: t.shortcutImport },
      { keys: "Cmd/Ctrl+E", action: t.shortcutExport },
    ]},
    { category: t.categoryEdit, items: [
      { keys: "Cmd/Ctrl+Z", action: t.shortcutUndo },
      { keys: "Cmd/Ctrl+Shift+Z", action: t.shortcutRedo },
      { keys: t.shortcutDoubleClick, action: t.shortcutRename },
      { keys: "Tab", action: t.shortcutAddChild },
      { keys: "Enter", action: t.shortcutAddSibling },
      { keys: "Cmd/Ctrl+Enter / Opt+Enter", action: t.shortcutEditContent },
      { keys: "Delete", action: t.shortcutDelete },
    ]},
    { category: t.categoryNav, items: [
      ...(showWorkspaceNavigationShortcut
        ? [
            { keys: "Cmd/Ctrl+←", action: t.shortcutBackToWorkspace },
            { keys: "Cmd/Ctrl+→", action: t.shortcutForwardToFile },
          ]
        : []),
      { keys: "Escape", action: t.shortcutBackToCanvas },
      { keys: t.shortcutClick, action: t.shortcutSelectNode },
      { keys: "ArrowRight", action: t.shortcutSelectChild },
      { keys: "ArrowLeft", action: t.shortcutSelectParent },
      { keys: "ArrowDown", action: t.shortcutSelectNextSibling },
      { keys: "ArrowUp", action: t.shortcutSelectPreviousSibling },
      { keys: t.shortcutScrollPinch, action: t.shortcutZoom },
      { keys: t.shortcutDragBackground, action: t.shortcutPan },
    ]},
    { category: t.categoryHelp, items: [
      { keys: "F1 / ? / Cmd/Ctrl+/", action: t.shortcutShowHelp },
    ]},
  ];
}

export function HelpModal({ open, onClose, versionLabel, showWorkspaceNavigationShortcut = false }: HelpModalProps) {
  const { t } = useLocale();
  const shortcuts = getShortcuts(t, showWorkspaceNavigationShortcut);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-[#1A1A1A]/25 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          data-testid="shortcut-help"
          className="bg-[var(--color-surface-raised)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto border border-[var(--color-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[var(--color-ink)] tracking-tight">
              {t.helpTitle}
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="12" y2="12" />
                <line x1="12" y1="2" x2="2" y2="12" />
              </svg>
            </button>
          </div>

          {/* Shortcut list */}
          <div className="px-6 py-5 space-y-6">
            {shortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-[10px] font-bold text-[#FF6B35] uppercase tracking-[0.15em] mb-3">
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <div
                      key={item.keys}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-[var(--color-ink)]">
                        {item.action}
                      </span>
                      <kbd className="text-[11px] font-[var(--font-mono,monospace)] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] px-2.5 py-1 rounded-lg border border-[var(--color-border)]">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-[var(--color-border)] text-center">
            <span
              className="text-[11px] text-[var(--color-ink-faint)] font-[var(--font-mono,monospace)]"
              data-testid="help-build-version"
            >
              {versionLabel ?? t.helpVersion}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
