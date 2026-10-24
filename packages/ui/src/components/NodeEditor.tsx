"use client";

import { workspaceSourceFile, openWorkspaceSource } from "../utils/workspaceSource";
import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Copy,
  ExternalLink,
  File as FileIcon,
  FileText,
  Film,
  Folder,
  Globe2,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Music2,
  Network,
  Scale,
  Signpost,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MindMapDocument, MindMapListEntry, MindMapNode, MindMapNodeKind, MindMapNodeMetadata } from "@bloommd/core/browser";
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  imagePlugin,
  linkPlugin,
  linkDialogPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertTable,
  InsertCodeBlock,
  InsertImage,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./NodeEditor.css";
import { useMindMapStore } from "../hooks/useMindMapStore";
import { useLocale } from "../i18n/LocaleContext";
import { requestNodeFocus } from "../utils/nodeFocus";
import { InkAttachmentsContext } from "../ink/attachments";
import { restoreWikiLinks } from "../utils/wiki-links-escape";
import type { Translations } from "../i18n/translations";
import { extractLinksFromMarkdown, extractMapLinksFromMarkdown, resolveMapLinkInDocument, type MapLinkResource, type MapLinkResolution } from "../utils/links";
import {
  countChildKinds,
  directResourcePreviewUrl,
  metadataForKindChange,
  nodeResourceIssue,
  resourcePreviewKind,
  shouldShowPrimaryMarkdownEditor,
  workspaceReferencesForNode,
  type ResourcePreviewKind,
} from "./node-panel-model";

interface NodeEditorProps {
  /** When true, renders without the aside wrapper (for embedding in bottom sheets etc.) */
  embedded?: boolean;
}

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

interface BacklinkEntry {
  filename: string;
  mapTitle: string;
  nodeId: string;
  nodeTitle: string;
}

interface MetadataDraft {
  url: string;
  file: string;
  targetNodeId: string;
  citation: string;
  due: string;
  assignee: string;
}

type ResourcePreviewState =
  | { status: "idle" }
  | { status: "loading"; kind: ResourcePreviewKind }
  | { status: "ready"; kind: Exclude<ResourcePreviewKind, "unsupported">; url: string }
  | { status: "unsupported" }
  | { status: "unavailable"; message: string };

interface ResourcePreviewRequest {
  kind: MindMapNodeKind;
  file: string;
  respond: (result: { url: string; revokeOnCleanup?: boolean } | { error: string }) => void;
}

interface ResourceChooseRequest {
  kind: "file" | "pdf";
  respond: (result: { path: string } | { canceled: true } | { error: string }) => void;
}

interface LinkPreviewRequest {
  url: string;
  respond: (result: { preview: { title?: string; description?: string; image?: string } } | { error: string }) => void;
}

interface ListMapsRequest {
  respond: (result: { files: MindMapListEntry[] } | { error: string }) => void;
}

interface LoadMapDocumentRequest {
  filename: string;
  respond: (result: { document: ApiDocResponse } | { error: string }) => void;
}

interface OpenUrlRequest {
  url: string;
  respond: (result: { opened: true } | { error: string }) => void;
}

function getNodeKindOptions(t: Translations): Array<{ value: MindMapNodeKind; label: string; hint: string; Icon: LucideIcon }> {
  return [
    { value: "topic", label: t.nodeKindTopic, hint: t.nodeKindTopicHint, Icon: Signpost },
    { value: "workspace", label: t.nodeKindWorkspace, hint: t.nodeKindWorkspaceHint, Icon: Network },
    { value: "folder", label: t.nodeKindFolder, hint: t.nodeKindFolderHint, Icon: Folder },
    { value: "portal", label: t.nodeKindPortal, hint: t.nodeKindPortalHint, Icon: ExternalLink },
    { value: "web", label: t.nodeKindWeb, hint: t.nodeKindWebHint, Icon: Globe2 },
    { value: "file", label: t.nodeKindFile, hint: t.nodeKindFileHint, Icon: FileIcon },
    { value: "pdf", label: t.nodeKindPdf, hint: t.nodeKindPdfHint, Icon: FileText },
    { value: "source", label: t.nodeKindSource, hint: t.nodeKindSourceHint, Icon: BookOpen },
    { value: "task", label: t.nodeKindTask, hint: t.nodeKindTaskHint, Icon: CheckSquare },
    { value: "decision", label: t.nodeKindDecision, hint: t.nodeKindDecisionHint, Icon: Scale },
  ];
}

function filenameFor(doc: MindMapDocument): string {
  return doc.filePath.split("/").pop() || doc.filePath;
}

function hydrateDocument(data: ApiDocResponse): MindMapDocument {
  return {
    ...data,
    nodes: new Map(Object.entries(data.nodes)),
    rawMarkdown: "",
  };
}

const NodeHandwriting = lazy(() => import("./NodeHandwriting").then((module) => ({ default: module.NodeHandwriting })));

export function NodeEditor({ embedded }: NodeEditorProps = {}) {
  const inkAttachments = useContext(InkAttachmentsContext);
  const { t } = useLocale();
  const nodeKindOptions = getNodeKindOptions(t);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const document = useMindMapStore((s) => s.document);
  const readOnly = useMindMapStore((s) => s.readOnly);
  const setDocument = useMindMapStore((s) => s.setDocument);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const setEditorVisible = useMindMapStore((s) => s.setEditorVisible);
  const updateNodeContent = useMindMapStore((s) => s.updateNodeContent);
  const updateNodeMetadata = useMindMapStore((s) => s.updateNodeMetadata);
  const deleteNodeAction = useMindMapStore((s) => s.deleteNodeAction);
  const editorRef = useRef<MDXEditorMethods>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);
  const [mapOptions, setMapOptions] = useState<MindMapListEntry[]>([]);
  const [brokenMapLinks, setBrokenMapLinks] = useState<Set<string>>(new Set());
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({ url: "", file: "", targetNodeId: "", citation: "", due: "", assignee: "" });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resourcePreview, setResourcePreview] = useState<ResourcePreviewState>({ status: "idle" });

  const selectedNode = selectedNodeId
    ? document?.nodes.get(selectedNodeId)
    : null;
  const isWorkspaceDocument = document?.derived?.kind === "workspace";
  const sourceFile = selectedNodeId ? workspaceSourceFile(document, selectedNodeId) : undefined;
  const linkResources = selectedNode ? extractLinksFromMarkdown(selectedNode.content) : [];
  const mapLinkResources = selectedNode && !isWorkspaceDocument ? extractMapLinksFromMarkdown(selectedNode.content) : [];
  const workspaceReferences = document && selectedNode ? workspaceReferencesForNode(document, selectedNode.id) : [];

  useEffect(() => {
    const node = selectedNodeId ? document?.nodes.get(selectedNodeId) : undefined;
    const metadata = node?.metadata;
    setMetadataDraft({
      url: metadata?.url ?? "",
      file: metadata?.file ?? "",
      targetNodeId: metadata?.targetNodeId ?? "",
      citation: metadata?.citation ?? "",
      due: metadata?.due ?? "",
      assignee: metadata?.assignee ?? "",
    });
  }, [document?.filePath, selectedNodeId]);

  useEffect(() => {
    if (editorRef.current && selectedNode) {
      editorRef.current.setMarkdown(selectedNode.content);
    }
  }, [selectedNodeId, selectedNode]);

  const onChange = useCallback(
    (markdown: string) => {
      if (selectedNodeId) {
        // Keep Obsidian links and handwriting embeds intact; the editor escapes `[[`.
        updateNodeContent(selectedNodeId, restoreWikiLinks(markdown));
      }
    },
    [selectedNodeId, updateNodeContent],
  );

  const copyUrl = useCallback((url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
  }, []);

  const openUrl = useCallback((url: string) => {
    const event = new CustomEvent<OpenUrlRequest>("bloommd:open-url", {
      cancelable: true,
      detail: {
        url,
        respond: () => {},
      },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const focusMapNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setEditorVisible(true);
      requestNodeFocus(nodeId);
    },
    [requestNodeFocus, setEditorVisible, setSelectedNodeId],
  );

  const loadMapList = useCallback(async (): Promise<MindMapListEntry[]> => {
    if (typeof window !== "undefined") {
      const shellResult = await new Promise<MindMapListEntry[] | null>((resolve, reject) => {
        let shellResponded = false;
        const event = new CustomEvent<ListMapsRequest>("bloommd:list-maps", {
          cancelable: true,
          detail: {
            respond: (result) => {
              shellResponded = true;
              if ("error" in result) reject(new Error(result.error));
              else resolve(result.files);
            },
          },
        });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) {
          resolve(null);
          return;
        }
        window.setTimeout(() => {
        if (!shellResponded) reject(new Error(t.mapsUnavailable));
        }, 10_000);
      });
      if (shellResult) return shellResult;
    }

    if (typeof fetch === "undefined") return [];
    const response = await fetch("/api/mindmaps");
    if (!response.ok) return [];
    const data = await response.json() as ApiListResponse;
    return data.files;
  }, [t.mapsUnavailable]);

  const loadMapDocument = useCallback(async (filename: string): Promise<MindMapDocument | null> => {
    if (typeof window !== "undefined") {
      const shellResult = await new Promise<ApiDocResponse | null>((resolve, reject) => {
        let shellResponded = false;
        const event = new CustomEvent<LoadMapDocumentRequest>("bloommd:load-map-document", {
          cancelable: true,
          detail: {
            filename,
            respond: (result) => {
              shellResponded = true;
              if ("error" in result) reject(new Error(result.error));
              else resolve(result.document);
            },
          },
        });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) {
          resolve(null);
          return;
        }
        window.setTimeout(() => {
        if (!shellResponded) reject(new Error(t.mapUnavailable));
        }, 10_000);
      });
      if (shellResult) return hydrateDocument(shellResult);
    }

    if (typeof fetch === "undefined") return null;
    const response = await fetch(`/api/mindmaps/${encodeURIComponent(filename)}`);
    if (!response.ok) return null;
    return hydrateDocument(await response.json() as ApiDocResponse);
  }, [t.mapUnavailable]);

  const openMapLink = useCallback(
    async (link: MapLinkResource) => {
      if (!document) return;
      const currentFilename = filenameFor(document);
      const targetFilename = link.targetFile ?? currentFilename;
      const targetNodeId = link.targetNodeId;

      if (targetFilename === currentFilename) {
        if (targetNodeId && document.nodes.has(targetNodeId)) {
          focusMapNode(targetNodeId);
          return;
        }
        const resolved = resolveMapLinkInDocument(link, currentFilename, document.nodes.values());
        if (resolved.status === "resolved") {
          focusMapNode(resolved.nodeId);
        }
        return;
      }

      try {
        const nextDoc = await loadMapDocument(targetFilename);
        if (!nextDoc) return;
        setDocument(nextDoc);
        const resolved = resolveMapLinkInDocument(link, targetFilename, nextDoc.nodes.values());
        const nextSelection = resolved.status === "resolved" ? resolved.nodeId : nextDoc.rootId;
        setTimeout(() => {
          focusMapNode(nextSelection);
        }, 0);
      } catch {
        // Keep the markdown link visible even when this surface cannot fetch files.
      }
    },
    [document, focusMapNode, loadMapDocument, setDocument],
  );

  const openBacklink = useCallback(
    async (entry: BacklinkEntry) => {
      if (!document) return;
      const currentFilename = filenameFor(document);
      if (entry.filename === currentFilename) {
        focusMapNode(entry.nodeId);
        return;
      }
      try {
        const nextDoc = await loadMapDocument(entry.filename);
        if (!nextDoc) return;
        setDocument(nextDoc);
        setTimeout(() => {
          focusMapNode(entry.nodeId);
        }, 0);
      } catch {
        // Backlinks are best-effort in non-web shells.
      }
    },
    [document, focusMapNode, loadMapDocument, setDocument],
  );

  useEffect(() => {
    if (!document || !selectedNodeId) {
      setBacklinks([]);
      setBrokenMapLinks(new Set());
      return;
    }

    let cancelled = false;
    const activeDocument = document;
    const currentFilename = filenameFor(activeDocument);
    const outgoingLinks = selectedNode ? extractMapLinksFromMarkdown(selectedNode.content) : [];

    async function loadLinkGraph() {
      try {
        const files = await loadMapList();
        const docs = new Map<string, MindMapDocument>();
        docs.set(currentFilename, activeDocument);

        await Promise.all(
          files.map(async (file) => {
            if (file.filename === currentFilename) return;
            try {
              const doc = await loadMapDocument(file.filename);
              if (doc) docs.set(file.filename, doc);
            } catch {
              // Skip unavailable files.
            }
          }),
        );

        const nextBacklinks: BacklinkEntry[] = [];
        for (const [filename, doc] of docs) {
          for (const node of doc.nodes.values()) {
            if (filename === currentFilename && node.id === selectedNodeId) continue;
            const links = extractMapLinksFromMarkdown(node.content);
            const linksToSelected = links.some((link) => {
              if (link.targetNodeId !== selectedNodeId) return false;
              if (!link.targetFile) return filename === currentFilename;
              return link.targetFile === currentFilename;
            });
            if (linksToSelected) {
              nextBacklinks.push({
                filename,
                mapTitle: doc.frontmatter.title,
                nodeId: node.id,
                nodeTitle: node.title,
              });
            }
          }
        }

        const broken = new Set<string>();
        for (const link of outgoingLinks) {
          const targetFilename = link.targetFile ?? currentFilename;
          const targetDoc = docs.get(targetFilename);
          if (!targetDoc) {
            broken.add(link.raw);
            continue;
          }
          const resolved = resolveMapLinkInDocument(link, targetFilename, targetDoc.nodes.values());
          if (resolved.status === "missing" || resolved.status === "ambiguous") broken.add(link.raw);
        }

        if (!cancelled) {
          setBacklinks(nextBacklinks);
          setBrokenMapLinks(broken);
        }
      } catch {
        if (!cancelled) {
          setBacklinks([]);
          setBrokenMapLinks(new Set());
        }
      }
    }

    void loadLinkGraph();
    return () => {
      cancelled = true;
    };
  }, [document, loadMapDocument, loadMapList, selectedNode, selectedNodeId]);

  const metadata = selectedNode?.metadata;
  const kind = metadata?.kind ?? "topic";
  const resourcePath = selectedNode ? metadataDraft.file.trim() || metadata?.file || selectedNode.content.trim() : "";
  const resourceIssue = selectedNode ? nodeResourceIssue({
    ...selectedNode,
    metadata: kind === "topic"
      ? undefined
      : {
        ...metadata,
        kind,
        file: metadataDraft.file,
        url: metadataDraft.url,
        targetNodeId: metadataDraft.targetNodeId,
        citation: metadataDraft.citation,
      },
  }, t) : null;

  useEffect(() => {
    if (kind !== "portal") return;

    let cancelled = false;

    async function loadMaps() {
      try {
        const files = await loadMapList();
        if (!cancelled) setMapOptions(files);
      } catch {
        if (!cancelled) setMapOptions([]);
      }
    }

    void loadMaps();
    return () => {
      cancelled = true;
    };
  }, [kind, loadMapList]);

  useEffect(() => {
    if ((kind !== "file" && kind !== "pdf") || !resourcePath) {
      setResourcePreview({ status: "idle" });
      return;
    }

    const previewKind = resourcePreviewKind(kind, resourcePath);
    if (previewKind === "unsupported") {
      setResourcePreview({ status: "unsupported" });
      return;
    }

    const directUrl = directResourcePreviewUrl(resourcePath);
    if (directUrl) {
      setResourcePreview({ status: "ready", kind: previewKind, url: directUrl });
      return;
    }

    if (typeof window === "undefined") {
      setResourcePreview({ status: "unavailable", message: t.previewUnavailable });
      return;
    }

    let cancelled = false;
    let previewUrl: string | null = null;
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setResourcePreview({ status: "unavailable", message: t.localPreviewUnavailable });
      }
    }, 500);

    setResourcePreview({ status: "loading", kind: previewKind });
    window.dispatchEvent(new CustomEvent<ResourcePreviewRequest>("bloommd:preview-resource", {
      detail: {
        kind,
        file: resourcePath,
        respond: (result) => {
          if (cancelled) {
            if ("url" in result && result.revokeOnCleanup) URL.revokeObjectURL(result.url);
            return;
          }
          window.clearTimeout(timeout);
          if ("error" in result) {
            setResourcePreview({ status: "unavailable", message: result.error });
            return;
          }
          previewUrl = result.revokeOnCleanup ? result.url : null;
          setResourcePreview({ status: "ready", kind: previewKind, url: result.url });
        },
      },
    }));

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [kind, resourcePath, t.localPreviewUnavailable, t.previewUnavailable]);

  if (!selectedNode) return null;

  const updateMetadata = (patch: Partial<MindMapNodeMetadata>) => {
    if (!selectedNodeId) return;
    updateNodeMetadata(selectedNodeId, { kind, ...metadata, ...patch });
  };
  const commitMetadataField = (field: keyof MetadataDraft) => {
    const value = metadataDraft[field].trim();
    // Empty optional facts are removed instead of being stored as "".
    if ((field === "due" || field === "assignee") && !value) {
      const next = { kind, ...metadata };
      delete next[field];
      if (selectedNodeId) updateNodeMetadata(selectedNodeId, next);
      return;
    }
    if (field === "due" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    updateMetadata({ [field]: field === "assignee" ? value.slice(0, 120) : metadataDraft[field] });
  };
  const changeKind = (nextKind: MindMapNodeKind) => {
    if (!selectedNodeId) return;
    updateNodeMetadata(selectedNodeId, metadataForKindChange(metadata, nextKind));
  };
  const loadWebsitePreview = async () => {
    const url = metadataDraft.url.trim();
    if (!url) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const previewFromShell = await new Promise<{ title?: string; description?: string; image?: string } | null>((resolve, reject) => {
        let shellResponded = false;
        const event = new CustomEvent<LinkPreviewRequest>("bloommd:load-link-preview", {
          cancelable: true,
          detail: {
            url,
            respond: (result) => {
              shellResponded = true;
              if ("error" in result) reject(new Error(result.error));
              else resolve(result.preview);
            },
          },
        });
        window.dispatchEvent(event);
        if (!event.defaultPrevented) {
          resolve(null);
          return;
        }
        window.setTimeout(() => {
          if (!shellResponded) reject(new Error(t.previewUnavailable));
        }, 10_000);
      });
      let data: { preview?: { title?: string; description?: string; image?: string }; error?: string };
      if (previewFromShell) {
        data = { preview: previewFromShell };
      } else {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        const raw = await response.text();
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          throw new Error(`${t.previewServiceError} ${response.status || 500}.`);
        }
        if (!response.ok || !data.preview) throw new Error(data.error || t.previewUnavailable);
      }
      const preview = data.preview;
      if (!preview) throw new Error(t.previewUnavailable);
      updateMetadata({
        ...(preview.title ? { previewTitle: preview.title } : {}),
        ...(preview.description ? { previewDescription: preview.description } : {}),
        ...(preview.image ? { previewImage: preview.image } : {}),
      });
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : t.previewUnavailable);
    } finally {
      setPreviewLoading(false);
    }
  };
  const openTypedResource = () => {
    if (!selectedNodeId || !metadata?.kind) return;
    if (metadata.kind === "web" || metadata.kind === "source") {
      const url = metadataDraft.url.trim() || metadata.url;
      if (url) openUrl(url);
      return;
    }
    window.dispatchEvent(new CustomEvent("bloommd:open-resource", {
      detail: {
        nodeId: selectedNodeId,
        kind: metadata.kind,
        file: metadataDraft.file.trim() || metadata.file,
        targetNodeId: metadataDraft.targetNodeId.trim() || metadata.targetNodeId,
        url: metadataDraft.url.trim() || metadata.url,
      },
    }));
  };
  const chooseResourceFile = () => {
    if (kind !== "file" && kind !== "pdf") return;
    const event = new CustomEvent<ResourceChooseRequest>("bloommd:choose-resource", {
      cancelable: true,
      detail: {
        kind,
        respond: (result) => {
          if ("path" in result) {
            setMetadataDraft((draft) => ({ ...draft, file: result.path }));
            updateMetadata({ file: result.path });
          } else if ("error" in result) {
            setResourcePreview({ status: "unavailable", message: result.error });
          }
        },
      },
    });
    window.dispatchEvent(event);

    setTimeout(() => {
      if (!event.defaultPrevented) fileInputRef.current?.click();
    }, 0);
  };

  const selectedKindOption = nodeKindOptions.find((option) => option.value === kind) ?? nodeKindOptions[0]!;
  const SelectedKindIcon = selectedKindOption.Icon;
  const childNodes = selectedNode.children
    .map((childId) => document?.nodes.get(childId))
    .filter((node): node is MindMapNode => Boolean(node));
  const childCounts = countChildKinds(childNodes);
  const showPrimaryMarkdownEditor = shouldShowPrimaryMarkdownEditor(kind);
  const mapLinkResolutions = new Map<string, MapLinkResolution>();
  if (document) {
    const currentFilename = filenameFor(document);
    for (const resource of mapLinkResources) {
      mapLinkResolutions.set(resource.raw, resolveMapLinkInDocument(resource, currentFilename, document.nodes.values()));
    }
  }

  const levelColors: Record<number, string> = {
    1: "bg-[#1A1A1A] text-white",
    2: "bg-[#FF6B35] text-white",
    3: "bg-[#FFF4EE] text-[#FF6B35]",
    4: "bg-[#F5F3F0] text-[var(--color-ink-muted)]",
    5: "bg-[#F5F3F0] text-[var(--color-ink-muted)]",
    6: "bg-[#E8E4DF] text-[var(--color-ink-muted)]",
  };

  const content = (
    <>
      <input ref={fileInputRef} type="file" accept={kind === "pdf" ? ".pdf,application/pdf" : "*/*"} className="hidden" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) {
          const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          setMetadataDraft((draft) => ({ ...draft, file: path }));
          updateMetadata({ file: path });
        }
        event.target.value = "";
      }} />
      {/* Header */}
      <div className={`${embedded ? "px-4 py-3" : "p-5"} relative border-b border-[var(--color-border)] shrink-0`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${levelColors[selectedNode.level] ?? levelColors[4]}`}>
            {t.level} {selectedNode.level}
          </span>
          {selectedNode.children.length > 0 && (
            <span className="text-[10px] text-[var(--color-ink-faint)] uppercase tracking-wide">
              {selectedNode.children.length} {t.children}
            </span>
          )}
        </div>
        <h2 className={`${embedded ? "text-lg" : "text-xl"} font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[var(--color-ink)] tracking-tight truncate`}>
          {selectedNode.title}
        </h2>
        {readOnly && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">{isWorkspaceDocument ? t.workspaceOverviewReadOnly : t.readOnlyMessage}</p>}
        {sourceFile && <button type="button" className="mt-2 underline" onClick={() => openWorkspaceSource(sourceFile)}>{t.openSourceFile}</button>}
        {!readOnly && selectedNode.id !== document?.rootId && <button type="button" onClick={() => { deleteNodeAction(selectedNode.id); setEditorVisible(false); }} className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" title={t.deleteNodeBranch} aria-label={t.deleteNodeBranch} data-testid="node-editor-delete"><Trash2 size={16} /></button>}
      </div>

      <div className={`${embedded ? "px-4 py-3" : "px-5 py-4"} grid gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]`} data-testid="node-metadata-editor">
        <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
          {t.nodeType}
          <select value={kind} onChange={(event) => changeKind(event.target.value as MindMapNodeKind)} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-kind-select">
            {nodeKindOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3" data-testid="node-type-panel">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-bloom-light)] text-[#FF6B35]">
              <SelectedKindIcon size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--color-ink)]">{selectedKindOption.label}</div>
              <p className="mt-0.5 text-xs leading-5 text-[var(--color-ink-muted)]">{selectedKindOption.hint}</p>
            </div>
          </div>
          {resourceIssue && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800" data-testid="node-resource-issue">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{resourceIssue}</span>
            </div>
          )}
          {(kind === "workspace" || kind === "folder") && (
            <div className="grid gap-2" data-testid="node-structure-panel">
              <div className="rounded-md bg-[var(--color-surface)] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{kind === "workspace" ? t.workspaceSource : t.folderPath}</div>
                <div className="mt-1 truncate text-sm font-medium text-[var(--color-ink)]">{resourcePath || selectedNode.title}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                  <div className="text-sm font-semibold text-[var(--color-ink)]">{childCounts.folders}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">{t.folder}</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                  <div className="text-sm font-semibold text-[var(--color-ink)]">{childCounts.files}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">{t.files}</div>
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
                  <div className="text-sm font-semibold text-[var(--color-ink)]">{childCounts.sections}</div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">{t.sections}</div>
                </div>
              </div>
              <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
                {kind === "workspace"
                  ? t.workspaceDescription
                  : t.folderDescription}
              </p>
            </div>
          )}
          {(kind === "file" || kind === "pdf") && (
            <div className="grid gap-2" data-testid="node-file-panel">
              <div className="rounded-md bg-[var(--color-surface)] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{kind === "pdf" ? t.pdfPath : t.filePath}</div>
                <div className="mt-1 truncate text-sm font-medium text-[var(--color-ink)]">{resourcePath || t.noFileSelected}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={chooseResourceFile} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"><FileText size={15} />{t.chooseFile}</button>
                <button type="button" onClick={openTypedResource} disabled={!resourcePath} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><ExternalLink size={15} />{t.open}</button>
              </div>
              <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
                {kind === "file"
                  ? t.fileResourceDescription
                  : t.pdfResourceDescription}
              </p>
              {resourcePreview.status === "loading" && (
                <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink-muted)]" data-testid="node-resource-preview-loading">
                  {t.loadingPreview}
                </div>
              )}
              {resourcePreview.status === "ready" && resourcePreview.kind === "image" && (
                <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" data-testid="node-image-preview">
                  <img src={resourcePreview.url} alt={`Vorschau von ${selectedNode.title}`} loading="lazy" className="max-h-64 w-full object-contain" />
                </div>
              )}
              {resourcePreview.status === "ready" && resourcePreview.kind === "pdf" && (
                <iframe
                  src={resourcePreview.url}
                  title={`PDF-Vorschau von ${selectedNode.title}`}
                  className="h-72 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
                  data-testid="node-pdf-preview"
                />
              )}
              {resourcePreview.status === "unsupported" && kind === "file" && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-ink-muted)]" data-testid="node-resource-preview-unsupported">
                  {t.noInlinePreview}
                </div>
              )}
              {resourcePreview.status === "unavailable" && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-5 text-[var(--color-ink-muted)]" data-testid="node-resource-preview-unavailable">
                  {resourcePreview.message}
                </div>
              )}
            </div>
          )}
          {kind === "portal" && (
            <div className="rounded-md bg-[var(--color-surface)] px-3 py-2" data-testid="node-portal-panel">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{t.target}</div>
              <div className="mt-1 truncate text-sm font-medium text-[var(--color-ink)]">{metadataDraft.file || t.noMapSelected}{metadataDraft.targetNodeId ? ` #${metadataDraft.targetNodeId}` : ""}</div>
            </div>
          )}
          {(kind === "web" || kind === "source") && (
            <div className="grid gap-2" data-testid="node-url-panel">
              <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
                URL
                <input type="url" value={metadataDraft.url} onChange={(event) => setMetadataDraft((draft) => ({ ...draft, url: event.target.value }))} onBlur={() => commitMetadataField("url")} placeholder="https://example.com" className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-url-input" />
              </label>
              <button type="button" onClick={() => void loadWebsitePreview()} disabled={!metadataDraft.url.trim() || previewLoading} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {previewLoading ? <LoaderCircle size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                {previewLoading ? t.loadPreview : t.loadWebsitePreview}
              </button>
              {previewError && <p className="text-xs text-red-700">{previewError}</p>}
              {(metadata?.previewTitle || metadata?.previewDescription || metadata?.previewImage) && (
                <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
                  {metadata.previewImage && <img src={metadata.previewImage} alt="Website preview" loading="lazy" className="h-28 w-full object-cover" />}
                  <div className="grid gap-1 p-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#C94D20]">{t.savedPreview}</span>
                    <strong className="text-sm text-[var(--color-ink)]">{metadata.previewTitle || selectedNode.title}</strong>
                    {metadata.previewDescription && <span className="text-xs leading-5 text-[var(--color-ink-muted)]">{metadata.previewDescription}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
          {(kind === "web" || kind === "source") && metadataDraft.url.trim() && (
            <button type="button" onClick={openTypedResource} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"><ExternalLink size={15} />{t.openUrl}</button>
          )}
        </div>
        {kind === "portal" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.targetMap}
            <select value={metadataDraft.file} onChange={(event) => { setMetadataDraft((draft) => ({ ...draft, file: event.target.value })); updateMetadata({ file: event.target.value }); }} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-portal-map-select">
              <option value="">{t.selectMap}</option>
              {mapOptions.map((map) => <option key={map.filename} value={map.filename}>{map.frontmatter.title || map.filename}</option>)}
            </select>
          </label>
        )}
        {kind === "portal" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.targetNode}
            <input value={metadataDraft.targetNodeId} onChange={(event) => setMetadataDraft((draft) => ({ ...draft, targetNodeId: event.target.value }))} onBlur={() => commitMetadataField("targetNodeId")} placeholder={t.optional} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" />
          </label>
        )}
        {kind === "source" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.citation}
            <input value={metadataDraft.citation} onChange={(event) => setMetadataDraft((draft) => ({ ...draft, citation: event.target.value }))} onBlur={() => commitMetadataField("citation")} placeholder={t.citationPlaceholder} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" />
          </label>
        )}
        {kind === "task" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.status}
            <select value={metadata?.status ?? "open"} onChange={(event) => updateMetadata({ status: event.target.value as NonNullable<MindMapNodeMetadata["status"]> })} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-task-status"><option value="open">{t.openStatus}</option><option value="in_progress">{t.inProgressStatus}</option><option value="done">{t.doneStatus}</option></select>
          </label>
        )}
        {kind === "task" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.dueDate}
            <input type="date" value={metadataDraft.due} onChange={(event) => setMetadataDraft((draft) => ({ ...draft, due: event.target.value }))} onBlur={() => commitMetadataField("due")} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-task-due" />
          </label>
        )}
        {(kind === "task" || kind === "decision") && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {kind === "task" ? t.responsible : t.decidedBy}
            <input value={metadataDraft.assignee} maxLength={120} onChange={(event) => setMetadataDraft((draft) => ({ ...draft, assignee: event.target.value }))} onBlur={() => commitMetadataField("assignee")} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]" data-testid="node-task-assignee" />
          </label>
        )}
        {kind === "decision" && (
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-ink-muted)]">
            {t.decisionStatus}
            <select value={metadata?.decision ?? "proposed"} onChange={(event) => updateMetadata({ decision: event.target.value as NonNullable<MindMapNodeMetadata["decision"]> })} className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-sm text-[var(--color-ink)]"><option value="proposed">{t.proposedStatus}</option><option value="accepted">{t.acceptedStatus}</option><option value="rejected">{t.rejectedStatus}</option></select>
          </label>
        )}
      </div>

      {inkAttachments && document && (
        <Suspense fallback={null}>
          <NodeHandwriting nodeId={selectedNode.id} content={selectedNode.content} notePath={document.filePath} readOnly={readOnly} />
        </Suspense>
      )}

      {(linkResources.length > 0 || mapLinkResources.length > 0 || backlinks.length > 0 || workspaceReferences.length > 0) && (
        <details open className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">{t.linksAndReferences}</summary>
          <div
            data-testid="node-resource-panel"
            className={`${embedded ? "px-4 py-3" : "px-5 py-4"}`}
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              <Link2 size={14} className="text-[#FF6B35]" />
              <span>{t.resources}</span>
            </div>
            <div className="grid gap-2">
              {linkResources.map((resource) => (
                <div
                  key={resource.url}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2"
                >
                  {resource.kind === "image" ? <ImageIcon size={16} className="shrink-0 text-[#FF6B35]" /> : resource.kind === "video" ? <Film size={16} className="shrink-0 text-[#FF6B35]" /> : resource.kind === "audio" ? <Music2 size={16} className="shrink-0 text-[#FF6B35]" /> : <Link2 size={16} className="shrink-0 text-[#FF6B35]" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--color-ink)]">
                      {resource.label}
                    </div>
                    <div className="truncate text-xs text-[var(--color-ink-faint)]">
                      {resource.host}
                    </div>
                    {/^https?:\/\//i.test(resource.url) && ["image", "video", "audio"].includes(resource.kind) && (
                      <details className="mt-2 text-xs text-[var(--color-ink-muted)]">
                        <summary className="cursor-pointer select-none hover:text-[var(--color-ink)]">{t.preview}</summary>
                        {resource.kind === "image" && <img src={resource.url} alt={resource.label} loading="lazy" className="mt-2 max-h-48 max-w-full rounded-md border border-[var(--color-border)] object-contain" />}
                        {resource.kind === "video" && <video src={resource.url} controls preload="metadata" className="mt-2 max-h-48 max-w-full rounded-md border border-[var(--color-border)]" />}
                        {resource.kind === "audio" && <audio src={resource.url} controls preload="metadata" className="mt-2 max-w-full" />}
                      </details>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyUrl(resource.url)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
                    title={t.copyLink}
                    aria-label={`${t.copyLink}: ${resource.url}`}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openUrl(resource.url)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
                    title={t.openLink}
                    aria-label={`${t.openLink}: ${resource.url}`}
                  >
                    <ExternalLink size={15} />
                  </button>
                </div>
              ))}
              {mapLinkResources.map((resource) => {
                const resolution = mapLinkResolutions.get(resource.raw);
                const broken = brokenMapLinks.has(resource.raw);
                const disabled = resolution?.status === "missing" || resolution?.status === "ambiguous";
                const subtitle = resolution?.status === "resolved"
                  ? `${t.targetNode}: "${resolution.nodeTitle}"`
                  : resolution?.status === "ambiguous"
                    ? t.ambiguousReference
                    : resource.targetFile
                      ? resource.raw
                      : t.targetNotFound;
                return (
                  <button
                    key={resource.raw}
                    type="button"
                    onClick={() => void openMapLink(resource)}
                    disabled={disabled}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-left hover:bg-[var(--color-surface-sunken)] disabled:cursor-not-allowed disabled:opacity-70"
                    data-testid={broken ? "broken-map-link" : "map-link-resource"}
                  >
                    <FileText size={16} className="shrink-0 text-[#FF6B35]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">
                        {resource.label}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                        {subtitle}
                      </span>
                    </span>
                    {broken && <AlertTriangle size={15} className="shrink-0 text-red-600" />}
                  </button>
                );
              })}
              {backlinks.map((entry) => (
                <button
                  key={`${entry.filename}:${entry.nodeId}`}
                  type="button"
                  onClick={() => void openBacklink(entry)}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-left hover:bg-[var(--color-surface-sunken)]"
                  data-testid="node-backlink"
                >
                  <Link2 size={16} className="shrink-0 text-[#FF6B35]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">
                      {entry.nodeTitle}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                      {t.backlinkFrom.replace("%title%", entry.mapTitle)}
                    </span>
                  </span>
                </button>
              ))}
              {workspaceReferences.map((entry) => (
                <button
                  key={entry.reference.id}
                  type="button"
                  onClick={() => focusMapNode(entry.otherNodeId)}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-left hover:bg-[var(--color-surface-sunken)]"
                  data-testid="node-workspace-reference"
                >
                  <Link2 size={16} className="shrink-0 text-[#FF6B35]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">
                      {entry.direction === "outgoing" ? t.links : t.backlinks} {entry.otherNodeTitle}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                      {entry.origin || t.workspaceReference}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* Editor */}
      {showPrimaryMarkdownEditor ? (
        <details open className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="node-content-panel">
          <summary className="cursor-pointer list-none border-b border-[var(--color-border)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">{t.content}</summary>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MDXEditor
              ref={editorRef}
              markdown={selectedNode.content}
              onChange={onChange}
              readOnly={readOnly}
              plugins={[
                headingsPlugin(),
                listsPlugin(),
                quotePlugin(),
                thematicBreakPlugin(),
                markdownShortcutPlugin(),
                tablePlugin(),
                codeBlockPlugin({ defaultCodeBlockLanguage: "typescript" }),
                codeMirrorPlugin({ codeBlockLanguages: { typescript: "TypeScript", javascript: "JavaScript", css: "CSS", html: "HTML", json: "JSON", markdown: "Markdown", python: "Python", bash: "Bash", "": "Plain Text" } }),
                imagePlugin(),
                linkPlugin(),
                linkDialogPlugin(),
                toolbarPlugin({
                  toolbarContents: () => (
                    <>
                      <BoldItalicUnderlineToggles />
                      <ListsToggle />
                      <BlockTypeSelect />
                      <CreateLink />
                      <InsertTable />
                      <InsertCodeBlock />
                      <InsertImage />
                    </>
                  ),
                }),
              ]}
              contentEditableClassName={`bloommd-markdown-editor prose prose-sm max-w-none ${embedded ? "px-4 py-2" : "px-5 py-3"} min-h-[120px] focus:outline-none text-[var(--color-ink)]`}
            />
          </div>
        </details>
      ) : (
        <div className={`${embedded ? "px-4 py-3" : "px-5 py-4"} border-t border-[var(--color-border)] text-sm leading-6 text-[var(--color-ink-muted)]`} data-testid="node-content-unavailable">
          {kind === "file"
            ? t.fileContentDescription
            : kind === "folder" || kind === "workspace"
              ? t.derivedContentDescription
              : t.resourceContentDescription}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="flex flex-col overflow-hidden h-full">{content}</div>;
  }

  return (
    <aside className="h-full bg-[var(--color-surface-raised)] flex flex-col overflow-hidden">
      {content}
    </aside>
  );
}
