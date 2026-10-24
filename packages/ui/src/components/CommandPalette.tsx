"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, FileText, Search, CornerDownLeft, Plus, Save, Upload, Download, RefreshCw, LocateFixed, Link2 } from "lucide-react";
import { parseFile, serializeToMarkdown, type MindMapDocument, type MindMapListEntry, type MindMapNode } from "@bloommd/core/browser";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { extractLinksFromMarkdown } from "../utils/links";

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

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onReload: () => void;
  onOpenMindmap?: (filename: string) => void | Promise<void>;
}

type PaletteItem =
  | { id: string; category: string; title: string; subtitle: string; kind: "action"; icon: typeof Plus; run: () => void | Promise<void> }
  | { id: string; category: string; title: string; subtitle: string; kind: "mindmap"; filename: string }
  | { id: string; category: string; title: string; subtitle: string; kind: "node"; nodeId: string; linkCount: number };

function hydrateDocument(data: ApiDocResponse): MindMapDocument {
  return {
    ...data,
    nodes: new Map(Object.entries(data.nodes)),
    rawMarkdown: "",
  };
}

export function CommandPalette({
  open,
  onClose,
  onNew,
  onSave,
  onImport,
  onExport,
  onReload,
  onOpenMindmap,
}: CommandPaletteProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<MindMapListEntry[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setDocument = useMindMapStore((s) => s.setDocument);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const setEditorVisible = useMindMapStore((s) => s.setEditorVisible);
  const document = useMindMapStore((s) => s.document);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFocusedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    fetch("/api/mindmaps")
      .then((res) => res.json())
      .then((data: ApiListResponse) => setFiles(data.files))
      .catch(() => setFiles([]));
  }, [open]);

  const openMindmap = useCallback(
    async (filename: string) => {
      if (onOpenMindmap) {
        await onOpenMindmap(filename);
        return;
      }
      const res = await fetch(`/api/mindmaps/${encodeURIComponent(filename)}`);
      const data = (await res.json()) as ApiDocResponse;
      setDocument(hydrateDocument(data));
    },
    [onOpenMindmap, setDocument],
  );

  const createTemplateMindmap = useCallback(
    async (template: "research" | "project") => {
      const now = new Date().toISOString();
      const id = crypto.randomUUID().slice(0, 8);
      const title = template === "research" ? t.researchPlan : t.projectPlan;
      const filename = `${template}-${Date.now()}.md`;
      const sections = template === "research"
        ? [
            `# ${t.researchPlan}`,
            "",
            t.researchIntro,
            "",
            `## ${t.sources}`,
            "",
            t.addSources,
            "",
            `## ${t.claims}`,
            "",
            t.breakFindings,
            "",
            `## ${t.nextSteps}`,
            "",
            `- ${t.reviewSources}`,
            `- ${t.summarizeFindings}`,
          ]
        : [
            `# ${t.projectPlan}`,
            "",
            t.projectIntro,
            "",
            `## ${t.milestones}`,
            "",
            `- ${t.defineMvp}`,
            `- ${t.validateWorkflow}`,
            "",
            `## ${t.risks}`,
            "",
            t.trackRisks,
            "",
            `## ${t.tasks}`,
            "",
            `- ${t.firstTask}`,
          ];
      const markdown = [
        "---",
        `title: ${title}`,
        `id: ${id}`,
        `created: "${now}"`,
        `updated: "${now}"`,
        "tags:",
        `  - ${template}`,
        "layout:",
        "  direction: LR",
        "---",
        "",
        ...sections,
      ].join("\n");
      const doc = parseFile(filename, markdown);
      const serialized = serializeToMarkdown(doc);
      const response = await fetch("/api/mindmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, markdown: serialized }),
      });
      if (!response.ok) throw new Error(await response.text());
      setDocument(doc);
    },
    [setDocument, t],
  );

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      { id: "action-new", category: t.categoryCommands, title: t.newMindmap, subtitle: "Cmd/Ctrl+N", kind: "action", icon: Plus, run: onNew },
      { id: "action-save", category: t.categoryCommands, title: t.save, subtitle: "Cmd/Ctrl+S", kind: "action", icon: Save, run: onSave },
      { id: "action-import", category: t.categoryCommands, title: t.importMd, subtitle: "Cmd/Ctrl+I", kind: "action", icon: Upload, run: onImport },
      { id: "action-export", category: t.categoryCommands, title: t.exportMd, subtitle: "Cmd/Ctrl+E", kind: "action", icon: Download, run: onExport },
      { id: "action-reload", category: t.categoryCommands, title: t.reload, subtitle: "Cmd/Ctrl+R", kind: "action", icon: RefreshCw, run: onReload },
      { id: "action-template-research", category: t.categoryCommands, title: t.researchTemplate, subtitle: t.template, kind: "action", icon: FileText, run: () => createTemplateMindmap("research") },
      { id: "action-template-project", category: t.categoryCommands, title: t.projectTemplate, subtitle: t.template, kind: "action", icon: FileText, run: () => createTemplateMindmap("project") },
    ];

    const mindmaps: PaletteItem[] = files.map((file) => ({
      id: `mindmap-${file.filename}`,
      category: t.mindmaps,
      title: file.frontmatter.title,
      subtitle: file.filename,
      kind: "mindmap",
      filename: file.filename,
    }));

    const nodes: PaletteItem[] = document
      ? [...document.nodes.values()].map((node) => {
          const linkCount = extractLinksFromMarkdown(node.content).length;
          return {
            id: `node-${node.id}`,
            category: t.categoryNodes,
            title: node.title,
            subtitle: linkCount > 0 ? `${linkCount} ${linkCount === 1 ? t.resourceSingular : t.resourcesPlural}` : `${t.level} ${node.level}`,
            kind: "node",
            nodeId: node.id,
            linkCount,
          };
        })
      : [];

    return [...actions, ...mindmaps, ...nodes];
  }, [createTemplateMindmap, document, files, onExport, onImport, onNew, onReload, onSave, t]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      return [item.title, item.subtitle, item.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [items, query]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  const runItem = useCallback(
    async (item: PaletteItem) => {
      if (item.kind === "action") {
        await item.run();
      } else if (item.kind === "mindmap") {
        await openMindmap(item.filename);
      } else {
        setSelectedNodeId(item.nodeId);
        setEditorVisible(true);
      }
      onClose();
    },
    [onClose, openMindmap, setEditorVisible, setSelectedNodeId],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (filteredItems.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((index) => Math.min(index + 1, filteredItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void runItem(filteredItems[focusedIndex] ?? filteredItems[0]!);
      }
    },
    [filteredItems, focusedIndex, onClose, runItem],
  );

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[#1A1A1A]/25 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 top-20 z-50 mx-auto w-[min(680px,calc(100vw-24px))]">
        <section
          data-testid="command-palette"
          className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex h-14 items-center gap-3 border-b border-[var(--color-border)] px-4">
            <Search size={18} className="text-[#FF6B35]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.commandPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
              data-testid="command-palette-input"
            />
            <div className="hidden items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--color-ink-faint)] sm:flex">
              <Command size={12} />
              <span>K</span>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {filteredItems.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-[var(--color-ink-faint)]">
                {t.noSearchResults}
              </div>
            )}

            {filteredItems.map((item, index) => {
              const selected = index === focusedIndex;
              const Icon =
                item.kind === "action"
                  ? item.icon
                  : item.kind === "mindmap"
                    ? FileText
                    : item.linkCount > 0
                      ? Link2
                      : LocateFixed;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void runItem(item)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${
                    selected ? "bg-[var(--color-bloom-light)]" : "hover:bg-[var(--color-surface-sunken)]"
                  }`}
                  data-testid={`command-palette-item-${item.kind}`}
                  data-command-id={item.id}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[#FF6B35]">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">{item.title}</span>
                    <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                      {item.category} · {item.subtitle}
                    </span>
                  </span>
                  {selected && <CornerDownLeft size={16} className="text-[var(--color-ink-faint)]" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
