import {
  buildBibliography,
  serializeToMarkdown,
  type Bibliography,
  type MindMapDocument,
  type MindMapListEntry,
} from "@bloommd/core/browser";

/**
 * The literature list of the open map: its own `citekey` plus those of the maps it links to.
 *
 * The app only knows the other maps by name and frontmatter (the map list), which is all a one-hop
 * list needs, so no other map has to be loaded.
 */
export function bibliographyForDocument(document: MindMapDocument, maps: MindMapListEntry[]): Bibliography {
  const rootPath = document.filePath.split("/").pop() || document.filePath;
  const others = maps.filter((entry) => entry.filename !== rootPath);
  return buildBibliography(
    rootPath,
    [
      { path: rootPath, markdown: serializeToMarkdown(document) },
      ...others.map((entry) => ({ path: entry.filename, markdown: "" })),
    ],
    {
      frontmatter: {
        [rootPath]: { ...document.frontmatter },
        ...Object.fromEntries(others.map((entry) => [entry.filename, { ...entry.frontmatter }])),
      },
    },
  );
}

/** File name for an exported literature list, e.g. `Review-2024-literatur.bib`. */
export function bibliographyFilename(document: MindMapDocument, extension: "bib" | "md"): string {
  const base = (document.frontmatter.title || "mindmap").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "mindmap";
  return `${base}-literatur.${extension}`;
}

export function downloadTextFile(filename: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
