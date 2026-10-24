import type { MindMapDocument, MindMapNode, MindMapNodeKind, MindMapNodeMetadata, MindMapReference } from "@bloommd/core/browser";
import { translations, type Translations } from "../i18n/translations";

export interface NodeKindCopy {
  label: string;
  hint: string;
}

export interface ChildKindCounts {
  folders: number;
  files: number;
  sections: number;
}

export type ResourcePreviewKind = "image" | "pdf" | "unsupported";

export interface NodeWorkspaceReference {
  reference: MindMapReference;
  otherNodeId: string;
  otherNodeTitle: string;
  direction: "outgoing" | "incoming";
  origin: string;
}

export const STRUCTURAL_NODE_KINDS = new Set<MindMapNodeKind>(["workspace", "folder", "file", "pdf"]);
const IMAGE_FILE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export const NODE_KIND_COPY: Record<MindMapNodeKind, NodeKindCopy> = {
  topic: {
    label: "Thema / Notiz",
    hint: "Ein Markdown-Abschnitt mit bearbeitbaren Notizen.",
  },
  workspace: {
    label: "Workspace",
    hint: "Abgeleitete Ansicht eines geöffneten Ordners oder Cloud-Workspaces.",
  },
  folder: {
    label: "Ordner",
    hint: "Ein Container aus der Workspace-Struktur. Inhalte werden über Dateien bearbeitet.",
  },
  portal: {
    label: "Map-Verweis",
    hint: "Springt zu einer anderen BloomMD-Map oder zu einem konkreten Node.",
  },
  web: {
    label: "Webseite",
    hint: "Externe Web-Ressource mit URL und optionaler Vorschau.",
  },
  file: {
    label: "Datei",
    hint: "Eine Datei aus dem geöffneten Workspace. Bilder werden direkt als Vorschau angezeigt.",
  },
  pdf: {
    label: "PDF-Dokument",
    hint: "Lokale oder externe PDF-Datei als Ressource.",
  },
  source: {
    label: "Quelle / Zitat",
    hint: "Referenz mit URL, Vorschau und Zitierhinweis.",
  },
  task: {
    label: "Aufgabe",
    hint: "Ein Action Item mit Status und bearbeitbaren Notizen.",
  },
  decision: {
    label: "Entscheidung",
    hint: "Ein Entscheidungsprotokoll mit Status und Begründung.",
  },
};

export function shouldShowPrimaryMarkdownEditor(kind: MindMapNodeKind): boolean {
  return !STRUCTURAL_NODE_KINDS.has(kind);
}

/**
 * Metadata after switching a node to another kind. Kind-specific fields are dropped, but the
 * concept-map fields (linked note, relations) survive so a type change never unlinks a node.
 */
export function metadataForKindChange(
  metadata: MindMapNodeMetadata | undefined,
  nextKind: MindMapNodeKind,
): MindMapNodeMetadata | undefined {
  const conceptMap: Pick<MindMapNodeMetadata, "note" | "relations"> = {
    ...(metadata?.note ? { note: metadata.note } : {}),
    ...(metadata?.relations?.length ? { relations: metadata.relations } : {}),
  };
  if (nextKind === "topic" && !conceptMap.note && !conceptMap.relations) return undefined;
  return { kind: nextKind, ...conceptMap };
}

export function countChildKinds(childNodes: MindMapNode[]): ChildKindCounts {
  return childNodes.reduce(
    (counts, child) => {
      const childKind = child.metadata?.kind ?? "topic";
      if (childKind === "folder") counts.folders += 1;
      else if (childKind === "file" || childKind === "pdf") counts.files += 1;
      else counts.sections += 1;
      return counts;
    },
    { folders: 0, files: 0, sections: 0 },
  );
}

export function resourcePreviewKind(nodeKind: MindMapNodeKind, path: string): ResourcePreviewKind {
  if (nodeKind === "pdf") return "pdf";
  if (nodeKind !== "file") return "unsupported";

  const extension = path.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  return extension && IMAGE_FILE_EXTENSIONS.has(extension) ? "image" : "unsupported";
}

export function directResourcePreviewUrl(path: string): string | null {
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return null;
}

export function nodeResourceIssue(node: MindMapNode, copy: Translations = translations.de): string | null {
  const kind = node.metadata?.kind ?? "topic";
  if (kind === "file" || kind === "pdf") {
    const file = node.metadata?.file?.trim() || node.content.trim();
    if (!file) return copy.missingFileResource;
  }
  if (kind === "portal") {
    if (!node.metadata?.file?.trim()) return copy.missingMapResource;
  }
  if (kind === "web" || kind === "source") {
    const url = node.metadata?.url?.trim();
    if (!url) return copy.nodeUrlMissing;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return copy.nodeUrlProtocol;
    } catch {
      return copy.nodeUrlInvalid;
    }
  }
  return null;
}

export function workspaceReferencesForNode(doc: MindMapDocument, nodeId: string): NodeWorkspaceReference[] {
  const entries: NodeWorkspaceReference[] = [];
  for (const reference of doc.references ?? []) {
    if (reference.sourceId !== nodeId && reference.targetId !== nodeId) continue;
    const direction = reference.sourceId === nodeId ? "outgoing" : "incoming";
    const otherNodeId = direction === "outgoing" ? reference.targetId : reference.sourceId;
    const otherNode = doc.nodes.get(otherNodeId);
    if (!otherNode) continue;

    const originParts: string[] = [];
    if (reference.raw) originParts.push(reference.raw);
    if (reference.sourceFile) {
      originParts.push(reference.line ? `${reference.sourceFile}:${reference.line}` : reference.sourceFile);
    }

    entries.push({
      reference,
      otherNodeId,
      otherNodeTitle: otherNode.title,
      direction,
      origin: originParts.join(" · "),
    });
  }
  return entries;
}
