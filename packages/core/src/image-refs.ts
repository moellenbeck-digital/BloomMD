import { isImagePath, type ImageRefSyntax } from "./asset-path";
import { maskCode } from "./code-mask";

/** One image reference found in note text. */
export interface ImageRef {
  syntax: ImageRefSyntax;
  /** The path or URL as written in the note, before any decoding. */
  target: string;
  alt: string;
  /** Obsidian size hint (`![[a.png|300]]` or `|300x200`); absent otherwise. */
  width?: number;
  height?: number;
  /** 1-based line in the note. */
  line: number;
}

const MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\n]*?)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const WIKI_EMBED = /!\[\[([^\]\n|]+?)(?:\|([^\]\n]*))?\]\]/g;

function parseEmbedHint(hint: string | undefined): Pick<ImageRef, "alt" | "width" | "height"> {
  const text = (hint ?? "").trim();
  const size = /^(\d+)(?:x(\d+))?$/.exec(text);
  if (!size) return { alt: text };
  return { alt: "", width: Number(size[1]), ...(size[2] ? { height: Number(size[2]) } : {}) };
}

/**
 * Image references in note text, in document order: `![alt](path)` and Obsidian `![[image.png|300]]`.
 * References inside code fences and inline code are examples, not images, and are skipped. Embeds of
 * notes or PDFs (`![[Note]]`) are not images and are skipped too.
 */
export function extractImageRefs(markdown: string): ImageRef[] {
  const lines = markdown.split("\n");
  const masked = maskCode(lines);
  const refs: ImageRef[] = [];
  masked.forEach((maskedLine, index) => {
    const found: Array<{ at: number; ref: ImageRef }> = [];
    for (const match of maskedLine.matchAll(MARKDOWN_IMAGE)) {
      const target = (match[2] ?? "").trim();
      if (target) found.push({ at: match.index ?? 0, ref: { syntax: "markdown", target, alt: match[1] ?? "", line: index + 1 } });
    }
    for (const match of maskedLine.matchAll(WIKI_EMBED)) {
      const target = (match[1] ?? "").trim().split("#")[0]!.trim();
      if (!target || !isImagePath(target)) continue;
      found.push({ at: match.index ?? 0, ref: { syntax: "wiki", target, ...parseEmbedHint(match[2]), line: index + 1 } });
    }
    found.sort((a, b) => a.at - b.at);
    for (const { ref } of found) refs.push(ref);
  });
  return refs;
}
