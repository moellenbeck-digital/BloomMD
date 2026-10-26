"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, FileUp, GitBranch, LayoutTemplate, ListTree, Play, ShieldCheck, SkipForward } from "lucide-react";
import { HelpModal, MindMapCanvas, ResizableEditor, useMindMapStore } from "@bloommd/ui";
import { parseFile, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";
import type { TemplateMetadata } from "../../lib/templates";
import type { MarketingLocale } from "../../lib/locale";
import { withMarketingLocale } from "../../lib/locale";
import { publicAppUrl } from "../../lib/deployment";
import { trackPlausibleEvent } from "../../lib/plausible";
import { isMarketingAnalyticsConfigured, scrubMarketingAnalyticsEvent } from "../../lib/telemetryPrivacy";

interface DemoClientProps {
  templates: TemplateMetadata[];
  locale: MarketingLocale;
  initialTemplate: {
    slug: string;
    markdown: string;
  };
}

type ViewMode = "mindmap" | "markdown";

function captureDemoEvent(name: string, properties?: Record<string, string | number | boolean>) {
  trackPlausibleEvent(name, properties);
  if (!isMarketingAnalyticsConfigured({
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  })) return;
  const event = scrubMarketingAnalyticsEvent(name, properties);
  if (!event) return;

  void import("posthog-js").then(({ default: posthog }) => {
    if (posthog.__loaded) {
      posthog.capture(event.name, event.properties);
    }
  });
}

function createDoc(slug: string, markdown: string) {
  return parseFile(`${slug}.md`, markdown);
}

export function DemoClient({ templates, initialTemplate, locale }: DemoClientProps) {
  const copy = locale === "de"
    ? { home: "BloomMD-Startseite", local: "Lokale Demo. Markdown bleibt in diesem Browser, sofern du sie nicht herunterlädst.", shortcuts: "Tastaturkürzel", select: "Vorlage auswählen", markdown: "Markdown", mindmap: "Mindmap", download: "Download", ownMarkdown: "Eigenes Markdown ausprobieren", paste: "Füge Markdown ein oder wähle eine lokale Datei. Die Demo verarbeitet sie im Browser und speichert sie nicht automatisch.", visualize: "Eingefügtes Markdown visualisieren", choose: "Lokale Markdown-Datei auswählen", afterMove: "Verschiebe einen Ast in der Mindmap und wechsle zu Markdown, um die aktualisierte Überschriftenstruktur zu sehen.", templates: "Templates entdecken", signup: "Jetzt registrieren", obsidian: "BloomMD mit Obsidian nutzen", preview: "Markdown-Vorschau", guided: "Geführte Demo", steps: ["Markdown-Überschriften werden Nodes.", "Öffne einen Node, um seinen Inhalt zu sehen.", "Ziehe einen Ast, um die Dokumentstruktur zu ändern.", "Wechsle zurück zu Markdown.", "Probiere deine eigene Datei aus."], skip: "Überspringen", start: "Starten" }
    : { home: "BloomMD home", local: "Local demo. Markdown stays in this browser unless you download it.", shortcuts: "Keyboard shortcuts", select: "Select template", markdown: "Markdown", mindmap: "Mindmap", download: "Download", ownMarkdown: "Try your own Markdown", paste: "Paste Markdown or choose a local file. The demo parses it in your browser and does not save it automatically.", visualize: "Visualize pasted Markdown", choose: "Choose local Markdown file", afterMove: "After you move a branch in the mind map, switch to Markdown to see the updated heading structure.", templates: "Explore templates", signup: "Register now", obsidian: "Use BloomMD with Obsidian", preview: "Markdown preview", guided: "Guided Demo", steps: ["Markdown headings become nodes.", "Open a node to view its content.", "Drag a branch to restructure the document.", "Switch back to Markdown.", "Try your own file."], skip: "Skip", start: "Start" };
  const signupUrl = `${publicAppUrl()}/signup${locale === "en" ? "?lang=en" : ""}`;
  const setDocument = useMindMapStore((s) => s.setDocument);
  const document = useMindMapStore((s) => s.document);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate.slug);
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [markdownInput, setMarkdownInput] = useState(initialTemplate.markdown);
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [inputPanelOpen, setInputPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const firstSelectionSeenRef = useRef(false);
  const lastSelectedNodeRef = useRef<string | null>(null);
  const lastStructureRef = useRef<string | null>(null);
  const suppressNextSelectionEventRef = useRef(false);
  const suppressNextStructureEventRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    suppressNextStructureEventRef.current = true;
    const doc = createDoc(initialTemplate.slug, initialTemplate.markdown);
    setDocument(doc);
    setMarkdownInput(initialTemplate.markdown);
    captureDemoEvent("demo_opened");
    if (window.localStorage.getItem("bloommd_demo_guided_seen") !== "1") {
      setGuidedOpen(true);
    }
  }, [initialTemplate.markdown, initialTemplate.slug, setDocument]);

  const currentMarkdown = useMemo(() => {
    if (!document) return markdownInput;
    return serializeToMarkdown(document);
  }, [document, markdownInput]);

  useEffect(() => {
    if (!document || !selectedNodeId) return;
    if (lastSelectedNodeRef.current === selectedNodeId) return;
    lastSelectedNodeRef.current = selectedNodeId;
    if (!firstSelectionSeenRef.current) {
      firstSelectionSeenRef.current = true;
      return;
    }
    if (suppressNextSelectionEventRef.current) {
      suppressNextSelectionEventRef.current = false;
      return;
    }

    const node = document.nodes.get(selectedNodeId);
    captureDemoEvent("node_opened", {
      template: selectedTemplate,
      node_level: node?.level ?? 0,
    });
  }, [document, selectedNodeId, selectedTemplate]);

  useEffect(() => {
    if (!document) return;
    const signature = Array.from(document.nodes.values())
      .map((node) => `${node.id}:${node.parentId ?? ""}:${node.level}:${node.children.join(",")}`)
      .sort()
      .join("|");

    if (lastStructureRef.current === null) {
      lastStructureRef.current = signature;
      suppressNextStructureEventRef.current = false;
      return;
    }

    if (lastStructureRef.current === signature) return;
    lastStructureRef.current = signature;

    if (suppressNextStructureEventRef.current) {
      suppressNextStructureEventRef.current = false;
      return;
    }

    captureDemoEvent("node_moved", { template: selectedTemplate });
  }, [document, selectedTemplate]);

  const loadTemplate = useCallback(
    async (slug: string) => {
      const response = await fetch(`/api/templates/${encodeURIComponent(slug)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { template: { markdown: string } };
      const doc = createDoc(slug, data.template.markdown);
      suppressNextSelectionEventRef.current = true;
      suppressNextStructureEventRef.current = true;
      setSelectedTemplate(slug);
      setDocument(doc);
      setMarkdownInput(data.template.markdown);
      setViewMode("mindmap");
      captureDemoEvent("template_opened", { slug });
    },
    [setDocument],
  );

  const applyMarkdownInput = useCallback(() => {
    const doc = parseFile("pasted-markdown.md", markdownInput);
    suppressNextSelectionEventRef.current = true;
    suppressNextStructureEventRef.current = true;
    setDocument(doc);
    setViewMode("mindmap");
    captureDemoEvent("custom_markdown_pasted");
  }, [markdownInput, setDocument]);

  const onFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const doc = parseFile(file.name || "local-file.md", raw);
        suppressNextSelectionEventRef.current = true;
        suppressNextStructureEventRef.current = true;
        setDocument(doc);
        setMarkdownInput(raw);
        setViewMode("mindmap");
        setInputPanelOpen(false);
        captureDemoEvent("custom_file_selected");
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [setDocument],
  );

  const downloadMarkdown = useCallback(() => {
    const blob = new Blob([currentMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document?.frontmatter.title || "bloommd-demo"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    captureDemoEvent("download_clicked");
  }, [currentMarkdown, document?.frontmatter.title]);

  const closeGuided = useCallback(() => {
    window.localStorage.setItem("bloommd_demo_guided_seen", "1");
    setGuidedOpen(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-3 px-5 py-3 lg:px-8">
          <h1 className="shrink-0 text-base font-semibold text-[var(--color-ink)]">
            <Link href={locale === "de" ? "/" : "/en"} aria-label={copy.home}>
              <span className="block h-7 w-[126px]">
                <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-7 w-auto" />
                <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-7 w-auto" />
              </span>
            </Link>
          </h1>
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)]">
            <ShieldCheck size={14} className="text-[#FF6B35]" />
            {copy.local}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-sm font-bold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]" title={copy.shortcuts} aria-label={copy.shortcuts}>?</button>
            <select
              value={selectedTemplate}
              onChange={(event) => void loadTemplate(event.target.value)}
              className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
              aria-label={copy.select}
            >
              {templates.map((template) => (
                <option key={template.slug} value={template.slug}>{template.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setViewMode((mode) => mode === "mindmap" ? "markdown" : "mindmap");
                captureDemoEvent(viewMode === "mindmap" ? "markdown_view_opened" : "mindmap_view_opened");
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
            >
              {viewMode === "mindmap" ? <ListTree size={16} /> : <GitBranch size={16} />}
              {viewMode === "mindmap" ? copy.markdown : copy.mindmap}
            </button>
            <button
              type="button"
              onClick={downloadMarkdown}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#FF6B35] px-3 text-sm font-semibold text-white hover:bg-[#E95F2F]"
            >
              <Download size={16} />
              {copy.download}
            </button>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 lg:border-b-0 lg:border-r lg:p-4">
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2 text-left text-sm font-semibold text-[var(--color-ink)] lg:hidden"
            aria-expanded={inputPanelOpen}
            aria-controls="demo-markdown-input"
            onClick={() => setInputPanelOpen((open) => !open)}
          >
            <LayoutTemplate size={17} className="text-[#FF6B35]" />
            <span>{copy.ownMarkdown}</span>
            <ChevronDown
              size={17}
              className={`ml-auto transition-transform lg:hidden ${inputPanelOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div className="hidden items-center gap-2 text-sm font-semibold text-[var(--color-ink)] lg:flex">
            <LayoutTemplate size={17} className="text-[#FF6B35]" />
            {copy.ownMarkdown}
          </div>
          <div id="demo-markdown-input" className={`${inputPanelOpen ? "block" : "hidden"} lg:block`}>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
              {copy.paste}
            </p>
            <textarea
              aria-label={locale === "en" ? "Markdown to visualize" : "Markdown zum Visualisieren"}
              value={markdownInput}
              onChange={(event) => setMarkdownInput(event.target.value)}
              className="mt-4 h-56 w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-[var(--font-mono,monospace)] text-xs leading-5 text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => {
                applyMarkdownInput();
                setInputPanelOpen(false);
              }}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-3 text-sm font-semibold text-white hover:bg-[#333]"
            >
              <Play size={16} />
              {copy.visualize}
            </button>
            <input ref={fileInputRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={onFileSelected} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
            >
              <FileUp size={16} />
              {copy.choose}
            </button>

            <div className="mt-5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-6 text-[var(--color-ink-muted)]">
              {copy.afterMove}
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <Link href={withMarketingLocale("/templates", locale)} className="font-semibold text-[#FF6B35]" onClick={() => captureDemoEvent("explore_templates_clicked")}>{copy.templates}</Link>
              <a href={signupUrl} className="font-semibold text-[#FF6B35]" onClick={() => captureDemoEvent("signup_click")}>{copy.signup}</a>
              <Link href={withMarketingLocale("/obsidian", locale)} className="font-semibold text-[#FF6B35]" onClick={() => captureDemoEvent("obsidian_plugin_clicked")}>{copy.obsidian}</Link>
            </div>
          </div>
        </aside>

        <section className="relative min-h-[520px] lg:min-h-[640px]">
          {viewMode === "mindmap" ? (
            <div className="flex h-full min-h-[520px] lg:min-h-[640px]">
              <div className="min-w-0 flex-1">
                <MindMapCanvas />
              </div>
              {selectedNodeId && editorVisible && <ResizableEditor />}
            </div>
          ) : (
            <pre tabIndex={0} aria-label={copy.preview} className="h-full min-h-[520px] overflow-auto bg-[#1A1A1A] p-5 text-xs leading-6 text-white lg:min-h-[640px]">
              <code>{currentMarkdown}</code>
            </pre>
          )}
        </section>
      </main>

      {guidedOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/25 p-4 backdrop-blur-sm sm:items-center">
          <section className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 shadow-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--color-ink)]">{copy.guided}</h2>
            <ol className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink-muted)]">
              {copy.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
            </ol>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeGuided} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]">
                <SkipForward size={16} />
                {copy.skip}
              </button>
              <button type="button" onClick={closeGuided} className="inline-flex h-10 items-center rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]">
                {copy.start}
              </button>
            </div>
          </section>
        </div>
      )}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
