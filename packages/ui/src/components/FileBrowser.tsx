"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Star } from "lucide-react";
import type { MindMapListEntry, MindMapDocument, MindMapNode } from "@bloommd/core/browser";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { FileContextMenu } from "./FileContextMenu";

interface ApiListResponse {
  files: MindMapListEntry[];
}

interface ApiDocResponse {
  filePath: string;
  frontmatter: MindMapDocument["frontmatter"];
  nodes: Record<string, MindMapNode>;
  rootId: string;
  preamble?: string;
  storage?: MindMapDocument["storage"];
}

interface FileBrowserProps {
  open: boolean;
  onClose: () => void;
  /** Starts the platform-specific rename flow while keeping this component presentation-only. */
  onRename?: (filename: string, title: string) => void | Promise<void>;
  /** Starts the platform-specific delete flow while keeping this component presentation-only. */
  onDelete?: (filename: string, title: string) => void | Promise<void>;
  /** Lets the host keep its active-file and sync state in step with the selected entry. */
  onOpen?: (filename: string) => void | Promise<void>;
  /** Keeps a context-menu target discoverable after a rename without switching the open document. */
  revealFilename?: string | null;
}

const FAVORITES_STORAGE_KEY = "bloommd_favorite_mindmaps";
const RECENTS_STORAGE_KEY = "bloommd_recent_mindmaps";

export function fileEntryTitle(entry: Partial<MindMapListEntry>, fallback = "Untitled"): string {
  return entry.frontmatter?.title?.trim() || entry.filename || fallback;
}

function fileEntryTags(entry: Partial<MindMapListEntry>): string[] {
  return Array.isArray(entry.frontmatter?.tags) ? entry.frontmatter.tags.filter((tag) => typeof tag === "string") : [];
}

function fileEntryId(entry: Partial<MindMapListEntry>): string | undefined {
  return entry.frontmatter?.id || entry.filename;
}

function normalizeComparablePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

function pathsReferToSameFile(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparablePath(left);
  const normalizedRight = normalizeComparablePath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
}

export function fileEntryIsActive(entry: MindMapListEntry, document: MindMapDocument | null): boolean {
  if (!document) return false;
  // Frontmatter IDs are not guaranteed to be unique (imports can legitimately reuse an ID), so
  // prefer the current path. Both directions matter: filesystem reads can return an absolute
  // document path while sync responses may return a short path for a list entry in a subfolder.
  if (pathsReferToSameFile(document.filePath, entry.filename)) return true;
  // The ID remains a fallback for documents supplied without a path.
  const filePath = normalizeComparablePath(document.filePath);
  return !filePath && document.frontmatter.id === fileEntryId(entry);
}

export function compareFileBrowserEntries(
  a: MindMapListEntry,
  b: MindMapListEntry,
  favorites: Set<string>,
  recents: string[],
): number {
  const aFavorite = favorites.has(a.filename);
  const bFavorite = favorites.has(b.filename);
  if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
  const aRecent = recents.indexOf(a.filename);
  const bRecent = recents.indexOf(b.filename);
  if (aRecent !== bRecent) {
    if (aRecent === -1) return 1;
    if (bRecent === -1) return -1;
    return aRecent - bRecent;
  }
  return fileEntryTitle(a).localeCompare(fileEntryTitle(b));
}

export function FileBrowser({ open, onClose, onRename, onDelete, onOpen, revealFilename }: FileBrowserProps) {
  const { t } = useLocale();
  const [files, setFiles] = useState<MindMapListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recents, setRecents] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filename: string; title: string } | null>(null);
  const revealActiveOnOpenRef = useRef(false);
  const listLoadRequestRef = useRef(0);
  const [listLoadVersion, setListLoadVersion] = useState(0);
  const setDocument = useMindMapStore((s) => s.setDocument);
  const currentDoc = useMindMapStore((s) => s.document);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      revealActiveOnOpenRef.current = false;
      return;
    }
    revealActiveOnOpenRef.current = true;
    const loadRequest = listLoadRequestRef.current + 1;
    listLoadRequestRef.current = loadRequest;
    try {
      setFavorites(new Set(JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]") as string[]));
      setRecents(JSON.parse(window.localStorage.getItem(RECENTS_STORAGE_KEY) || "[]") as string[]);
    } catch {
      setFavorites(new Set());
      setRecents([]);
    }
    setLoading(true);
    setFocusedIndex(-1);
    setQuery("");
    fetch("/api/mindmaps")
      .then((res) => res.json())
      .then((data: ApiListResponse) => {
        if (listLoadRequestRef.current !== loadRequest) return;
        setFiles(data.files);
        setLoading(false);
        // The reveal effect must wait for this open cycle's response. Otherwise it can consume
        // the reveal request against the previous list before the fresh entries have rendered.
        setListLoadVersion(loadRequest);
      })
      .catch(() => {
        if (listLoadRequestRef.current === loadRequest) setLoading(false);
      });
  }, [open, currentDoc?.frontmatter.id]);

  // Focus the list container when drawer opens so keyboard events work
  useEffect(() => {
    if (open && !loading && files.length > 0) {
      listRef.current?.focus();
    }
  }, [open, loading, files.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0) return;
    const container = listRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll<HTMLElement>("[data-file-entry]");
    buttons[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  /**
   * Picks up files that appeared elsewhere while the browser stayed open.
   *
   * Deliberately separate from the load above: that one resets the query, the focused row and the
   * loading flag, which would yank the list out from under someone who is typing. This only
   * replaces the entries, and only when they actually differ — a needless re-render moves the
   * scroll position for no reason.
   *
   * Polling rather than a push channel. A workspace-level socket would be the elegant answer, but
   * the sync server only serves per-document rooms today, and inventing a cross-service event with
   * its own authorisation is more surface than a beta needs to stop showing a stale list.
   */
  const refreshFiles = useCallback(async () => {
    try {
      const response = await fetch("/api/mindmaps");
      if (!response.ok) return;
      const data = (await response.json()) as ApiListResponse;
      setFiles((current) => {
        const same =
          current.length === data.files.length
          && current.every((file, index) => file.filename === data.files[index]?.filename);
        return same ? current : data.files;
      });
    } catch {
      // A failed background refresh keeps the last known list, which beats emptying it.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => void refreshFiles(), 10_000);
    // Coming back to the tab is the moment a stale list is most likely and most visible.
    const onFocus = () => void refreshFiles();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [open, refreshFiles]);

  const handleDelete = useCallback(
    async (filename: string, title: string) => {
      if (onDelete) {
        await onDelete(filename, title);
      } else {
        const response = await fetch(`/api/mindmaps/${encodeURIComponent(filename)}`, { method: "DELETE" });
        if (!response.ok) throw new Error(t.deleteFailed);
      }
      await refreshFiles();
    },
    [onDelete, refreshFiles, t.deleteFailed],
  );

  const handleRename = useCallback(
    (filename: string, title: string) => {
      if (onRename) {
        void onRename(filename, title);
        return;
      }
      fetch(`/api/mindmaps/${encodeURIComponent(filename)}`)
        .then((res) => res.json())
        .then((data: ApiDocResponse) => {
          const doc: MindMapDocument = {
            ...data,
            nodes: new Map(Object.entries(data.nodes)),
            rawMarkdown: "",
          };
          setDocument(doc);
          onClose();
          setTimeout(() => {
            const store = useMindMapStore.getState();
            store.setSelectedNodeId(doc.rootId);
            store.setAutoEditNodeId(doc.rootId);
          }, 300);
        });
    },
    [onClose, onRename, setDocument],
  );

  const openFile = useCallback(
    (filename: string) => {
      if (onOpen) {
        void onOpen(filename);
        setRecents((current) => {
          const next = [filename, ...current.filter((item) => item !== filename)].slice(0, 8);
          window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
          return next;
        });
        onClose();
        return;
      }
      fetch(`/api/mindmaps/${encodeURIComponent(filename)}`)
        .then((res) => res.json())
        .then((data: ApiDocResponse) => {
          const doc: MindMapDocument = {
            ...data,
            nodes: new Map(Object.entries(data.nodes)),
            rawMarkdown: "",
          };
          setDocument(doc);
          setRecents((current) => {
            const next = [filename, ...current.filter((item) => item !== filename)].slice(0, 8);
            window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
            return next;
          });
          onClose();
        });
    },
    [onClose, onOpen, setDocument],
  );

  const sortedFiles = [...files].sort((a, b) => compareFileBrowserEntries(a, b, favorites, recents));

  const filteredFiles = sortedFiles.filter((entry) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [
      fileEntryTitle(entry),
      entry.filename,
      ...fileEntryTags(entry),
    ].some((value) => value.toLowerCase().includes(normalized));
  });

  // The active entry must be revealed in the sorted/filtered list, not in the raw API order. The
  // two orders differ as soon as favorites or recents are present; using the raw index can scroll
  // to an unrelated file and leave the active file outside the viewport.
  useEffect(() => {
    if (!open || loading || listLoadVersion === 0 || listLoadVersion !== listLoadRequestRef.current || !revealActiveOnOpenRef.current) return;
    const requestedIndex = revealFilename
      ? filteredFiles.findIndex((entry) => entry.filename === revealFilename)
      : -1;
    const activeIndex = filteredFiles.findIndex((entry) => fileEntryIsActive(entry, currentDoc));
    setFocusedIndex(requestedIndex >= 0 ? requestedIndex : activeIndex >= 0 ? activeIndex : filteredFiles.length > 0 ? 0 : -1);
    revealActiveOnOpenRef.current = false;
  }, [currentDoc?.filePath, filteredFiles, listLoadVersion, loading, open, revealFilename]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredFiles.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredFiles.length) {
          openFile(filteredFiles[focusedIndex]!.filename);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filteredFiles, focusedIndex, openFile, onClose],
  );

  const toggleFavorite = useCallback((filename: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#1A1A1A]/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed left-0 top-0 bottom-0 w-80 bg-[var(--color-surface-raised)] shadow-2xl z-50 flex flex-col border-r border-[var(--color-border)]" data-testid="file-drawer">
        <div className="h-14 border-b border-[var(--color-border)] flex items-center justify-between px-5 shrink-0">
          <h2 className="text-sm font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[var(--color-ink)] tracking-tight">
            {t.mindmaps}
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

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-3 outline-none"
          data-testid="file-drawer-list"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-ink-muted)]">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusedIndex(0);
              }}
              placeholder={t.searchMindmaps}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
              data-testid="file-browser-search"
            />
          </label>

          {loading && (
            <div className="text-sm text-[var(--color-ink-faint)] p-3">{t.loading}</div>
          )}

          {!loading && files.length === 0 && (
            <div className="text-sm text-[var(--color-ink-faint)] p-3">
              {t.noMindmapsFound}
            </div>
          )}

          {!loading && files.length > 0 && filteredFiles.length === 0 && (
            <div className="text-sm text-[var(--color-ink-faint)] p-3">
              {t.noSearchResults}
            </div>
          )}

          {filteredFiles.map((entry, index) => {
            const title = fileEntryTitle(entry, t.noMindmapsFound);
            const tags = fileEntryTags(entry);
            const isActive = fileEntryIsActive(entry, currentDoc);
            const isFocused = index === focusedIndex;
            const isFavorite = favorites.has(entry.filename);
            return (
              <div
                key={entry.filename}
                data-file-entry
                data-testid="file-drawer-item"
                data-filename={entry.filename}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFocusedIndex(index);
                  setContextMenu({ x: e.clientX, y: e.clientY, filename: entry.filename, title });
                }}
                className={`
                  flex w-full items-center gap-2 rounded-xl mb-1.5 pr-2
                  transition-all duration-150
                  ${isActive
                    ? "bg-[var(--color-bloom-light)] border border-[var(--color-bloom-muted)]"
                    : "hover:bg-[var(--color-surface-sunken)] border border-transparent"}
                  ${isFocused && !isActive
                    ? "bg-[var(--color-surface-sunken)] border-[var(--color-border)]"
                    : ""}
                  ${isFocused ? "ring-2 ring-[#FF6B35]/40" : ""}
                `}
              >
                <button
                  type="button"
                  onClick={() => openFile(entry.filename)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    openFile(entry.filename);
                  }}
                  className="min-w-0 flex-1 px-4 py-3 text-left"
                  data-testid="file-drawer-open-file"
                  data-filename={entry.filename}
                >
                  <div className={`text-sm font-semibold font-[var(--font-display,Outfit,sans-serif)] truncate ${isActive ? "text-[#FF6B35]" : "text-[var(--color-ink)]"}`}>
                    {title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-[var(--color-ink-faint)] font-[var(--font-mono,monospace)]">{entry.filename}</span>
                    {tags.length > 0 && (
                      <span className="text-[11px] text-[var(--color-ink-faint)] truncate">
                        {tags.join(", ")}
                      </span>
                    )}
                    {recents.includes(entry.filename) && (
                      <span className="text-[10px] font-semibold uppercase text-[var(--color-ink-faint)]">
                        {t.recent}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(entry.filename)}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-surface-raised)] ${
                    isFavorite ? "text-[#FF6B35]" : "text-[var(--color-ink-faint)]"
                  }`}
                  title={isFavorite ? t.removeFavorite : t.favorite}
                  aria-label={isFavorite ? t.removeFavorite : t.favorite}
                  aria-pressed={isFavorite}
                  data-filename={entry.filename}
                  data-testid="favorite-mindmap"
                >
                  <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* File context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filename={contextMenu.filename}
          title={contextMenu.title}
          onRename={handleRename}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
