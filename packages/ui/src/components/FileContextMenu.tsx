"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, Pencil, Trash2 } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

interface FileContextMenuProps {
  x: number;
  y: number;
  filename: string;
  title: string;
  onShare?: (filename: string) => void;
  onRename: (filename: string, title: string) => void;
  onDelete: (filename: string, title: string) => void;
  onClose: () => void;
}

export function FileContextMenu({ x, y, filename, title, onShare, onRename, onDelete, onClose }: FileContextMenuProps) {
  const { t } = useLocale();
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 100,
  };

  return (
    <div ref={menuRef} style={style} className="min-w-[180px] py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-xl" data-testid="file-context-menu">
      {!confirmingDelete ? (
        <>
          {onShare && (
            <>
              <button
                onClick={() => { onShare(filename); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors"
                data-testid="file-context-share"
              >
                <CloudUpload size={14} className="text-[var(--color-primary)]" />
                {t.share}
              </button>
              <div className="mx-2.5 my-1 h-px bg-[var(--color-border)]" />
            </>
          )}
          <button
            onClick={() => { onRename(filename, title); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-colors"
            data-testid="file-context-rename"
          >
            <Pencil size={14} className="text-[var(--color-ink-faint)]" />
            {t.rename}
          </button>
          <div className="mx-2.5 my-1 h-px bg-[var(--color-border)]" />
          <button
            onClick={() => setConfirmingDelete(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            data-testid="file-context-delete"
          >
            <Trash2 size={14} />
            {t.deleteMindmap}
          </button>
        </>
      ) : (
        <div className="px-3.5 py-2">
          <div className="text-xs font-semibold text-[var(--color-ink)] mb-1">{t.confirmDelete}</div>
          <div className="text-[11px] text-[var(--color-ink-faint)] mb-2.5 truncate max-w-[200px]">
            {t.confirmDeleteMessage.replace("%title%", title)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] transition-colors"
              data-testid="file-context-cancel-delete"
            >
              {t.cancel}
            </button>
            <button
              onClick={() => { onDelete(filename, title); onClose(); }}
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
              data-testid="file-context-confirm-delete"
            >
              {t.deleteMindmap}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
