import { exportOpml, serializeToMarkdown, type MindMapDocument } from "@bloommd/core/browser";

export type ExportFormat = "markdown" | "opml" | "pdf" | "png" | "svg";

/** Order and set of the export menu. Every platform shows exactly these entries, none locked. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ["markdown", "opml", "pdf", "png", "svg"];

export interface ExportFile {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

const EXPORT_TYPES: Record<ExportFormat, { extension: string; mimeType: string }> = {
  markdown: { extension: "md", mimeType: "text/markdown" },
  opml: { extension: "opml", mimeType: "text/x-opml+xml" },
  pdf: { extension: "pdf", mimeType: "application/pdf" },
  png: { extension: "png", mimeType: "image/png" },
  svg: { extension: "svg", mimeType: "image/svg+xml" },
};

export function exportExtension(format: ExportFormat): string {
  return EXPORT_TYPES[format].extension;
}

export function exportMimeType(format: ExportFormat): string {
  return EXPORT_TYPES[format].mimeType;
}

/** `<Title>.<extension>`; characters that no file system accepts in a name become `-`. */
export function exportFilename(title: string | undefined, format: ExportFormat): string {
  // eslint-disable-next-line no-control-regex
  const base = (title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/^\.+/, "") || "mindmap";
  return `${base}.${exportExtension(format)}`;
}

export function buildExportFile(format: ExportFormat, title: string | undefined, data: Uint8Array | string): ExportFile {
  return {
    filename: exportFilename(title, format),
    mimeType: exportMimeType(format),
    data: typeof data === "string" ? new TextEncoder().encode(data) : data,
  };
}

/** Markdown and OPML are plain text conversions of the document; the map formats need the canvas. */
export function buildTextExport(format: "markdown" | "opml", doc: MindMapDocument): ExportFile {
  return buildExportFile(format, doc.frontmatter.title, format === "markdown" ? serializeToMarkdown(doc) : exportOpml(doc));
}

/** Saves a file through the browser's download mechanism (web app). */
export function downloadExportFile(file: ExportFile): void {
  const blob = new Blob([file.data as BlobPart], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  // Revoking right away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
