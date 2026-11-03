"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, FileText, Search, CornerDownLeft, Plus, Save, Upload, Download, RefreshCw, LocateFixed, Link2, History, Quote, BookOpen } from "lucide-react";
import { buildPdfCitationNode, parseFile, serializeToMarkdown, type MindMapDocument, type MindMapListEntry, type MindMapNode } from "@bloommd/core/browser";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { bibliographyFilename, bibliographyForDocument, downloadTextFile } from "../utils/bibliography";
import { extractLinksFromMarkdown } from "../utils/links";
import { ConflictCopyBadge } from "./ConflictCopyBadge";

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
  /** Opens the version history of the open note; the action is only listed when it is given. */
  onOpenHistory?: () => void;
  onOpenMindmap?: (filename: string) => void | Promise<void>;
}

type PaletteItem =
  | { id: string; category: string; title: string; subtitle: string; kind: "action"; icon: typeof Plus; run: () => void | Promise<void>; keepOpen?: boolean }
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
  onOpenHistory,
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
  const readOnly = useMindMapStore((s) => s.readOnly);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const updateNodeContent = useMindMapStore((s) => s.updateNodeContent);
  const [pdfForm, setPdfForm] = useState<{ file: string; page: string; quote: string; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFocusedIndex(0);
    setPdfForm(null);
    setNotice(null);
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

  const exportBibliography = useCallback(
    (format: "bib" | "md") => {
      if (!document) return false;
      try {
        const result = bibliographyForDocument(document, files);
        if (result.entries.length === 0) {
          setNotice(t.bibliographyEmpty);
          return false;
        }
        downloadTextFile(
          bibliographyFilename(document, format),
          format === "bib" ? result.bibtex : result.markdown,
          format === "bib" ? "application/x-bibtex" : "text/markdown",
        );
        return true;
      } catch (error) {
        console.error("[BloomMD] Bibliography export failed:", error);
        setNotice(t.bibliographyFailed);
        return false;
      }
    },
    [document, files, t.bibliographyEmpty, t.bibliographyFailed],
  );

  const submitPdfForm = useCallback(() => {
    if (!pdfForm) return;
    const fail = (error: string) => setPdfForm({ ...pdfForm, error });
    if (!document) return fail(t.pdfCitationNoMap);
    const built = buildPdfCitationNode({ file: pdfForm.file, page: pdfForm.page, quote: pdfForm.quote });
    if (!built.ok) return fail(built.error === "page-invalid" ? t.pdfCitationErrorPage : t.pdfCitationErrorFile);
    const parentId = selectedNodeId && document.nodes.has(selectedNodeId) ? selectedNodeId : document.rootId;
    const nodeId = addChildNode(parentId, built.title);
    if (!nodeId) return fail(t.pdfCitationFailed);
    updateNodeContent(nodeId, built.content);
    setSelectedNodeId(nodeId);
    setEditorVisible(true);
    onClose();
  }, [addChildNode, document, onClose, pdfForm, selectedNodeId, setEditorVisible, setSelectedNodeId, t, updateNodeContent]);

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      { id: "action-new", category: t.categoryCommands, title: t.newMindmap, subtitle: "Cmd/Ctrl+N", kind: "action", icon: Plus, run: onNew },
      { id: "action-save", category: t.categoryCommands, title: t.save, subtitle: "Cmd/Ctrl+S", kind: "action", icon: Save, run: onSave },
      { id: "action-import", category: t.categoryCommands, title: t.importMd, subtitle: "Cmd/Ctrl+I", kind: "action", icon: Upload, run: onImport },
      { id: "action-export", category: t.categoryCommands, title: t.exportMd, subtitle: "Cmd/Ctrl+E", kind: "action", icon: Download, run: onExport },
      { id: "action-reload", category: t.categoryCommands, title: t.reload, subtitle: "Cmd/Ctrl+R", kind: "action", icon: RefreshCw, run: onReload },
      ...(onOpenHistory && document
        ? [{ id: "action-history", category: t.categoryCommands, title: t.historyAction, subtitle: document.frontmatter.title, kind: "action" as const, icon: History, run: onOpenHistory }]
        : []),
      ...(document && !readOnly
        ? [{ id: "action-pdf-citation", category: t.categoryCommands, title: t.insertPdfCitation, subtitle: t.pdfCitationHint, kind: "action" as const, icon: Quote, keepOpen: true, run: () => setPdfForm({ file: "", page: "1", quote: "", error: null }) }]
        : []),
      ...(document && !document.derived
        ? [
            { id: "action-bibliography-bibtex", category: t.categoryCommands, title: t.exportBibtex, subtitle: t.bibliographyHint, kind: "action" as const, icon: BookOpen, keepOpen: true, run: () => { if (exportBibliography("bib")) onClose(); } },
            { id: "action-bibliography-markdown", category: t.categoryCommands, title: t.exportBibliographyMd, subtitle: t.bibliographyHint, kind: "action" as const, icon: BookOpen, keepOpen: true, run: () => { if (exportBibliography("md")) onClose(); } },
          ]
        : []),
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
  }, [createTemplateMindmap, document, exportBibliography, files, onClose, onExport, onImport, onNew, onOpenHistory, onReload, onSave, readOnly, t]);

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
        setNotice(null);
        await item.run();
        if (item.keepOpen) return;
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
        if (pdfForm) setPdfForm(null);
        else onClose();
        return;
      }
      // Inside the PDF form Enter and the arrows belong to the fields, not to the command list.
      if (pdfForm) return;
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
    [filteredItems, focusedIndex, onClose, pdfForm, runItem],
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
              disabled={Boolean(pdfForm)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
              data-testid="command-palette-input"
            />
            <div className="hidden items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--color-ink-faint)] sm:flex">
              <Command size={12} />
              <span>K</span>
            </div>
          </div>

          {notice && (
            <p role="status" className="border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-ink-muted)]" data-testid="command-palette-notice">
              {notice}
            </p>
          )}

          {pdfForm && (
            <form
              className="grid gap-3 p-4"
              data-testid="pdf-citation-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitPdfForm();
              }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                <Quote size={16} className="text-[#FF6B35]" />
                {t.insertPdfCitation}
              </div>
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                {t.pdfCitationFile}
                <input
                  autoFocus
                  value={pdfForm.file}
                  onChange={(event) => setPdfForm({ ...pdfForm, file: event.target.value, error: null })}
                  placeholder={t.pdfCitationFilePlaceholder}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
                  data-testid="pdf-citation-file"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                {t.pdfCitationPage}
                <input
                  value={pdfForm.page}
                  onChange={(event) => setPdfForm({ ...pdfForm, page: event.target.value, error: null })}
                  inputMode="numeric"
                  className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
                  data-testid="pdf-citation-page"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                {t.pdfCitationQuote}
                <textarea
                  value={pdfForm.quote}
                  onChange={(event) => setPdfForm({ ...pdfForm, quote: event.target.value, error: null })}
                  rows={4}
                  className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
                  data-testid="pdf-citation-quote"
                />
              </label>
              {pdfForm.error && (
                <p role="alert" className="text-xs text-red-600" data-testid="pdf-citation-error">
                  {pdfForm.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPdfForm(null)}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
                >
                  {t.pdfCitationCancel}
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#FF6B35] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
                  data-testid="pdf-citation-submit"
                >
                  {t.pdfCitationInsert}
                </button>
              </div>
            </form>
          )}

          <div className={pdfForm ? "hidden" : "max-h-[420px] overflow-y-auto p-2"}>
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
                    <span className="flex items-center gap-2">
                      <span className="block min-w-0 truncate text-sm font-semibold text-[var(--color-ink)]">{item.title}</span>
                      {item.kind === "mindmap" && <ConflictCopyBadge filename={item.filename} />}
                    </span>
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
