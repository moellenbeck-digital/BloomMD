import { createContext } from "react";

/**
 * Where an app keeps handwriting. Drawings are SVG files embedded into the node as
 * `![[Name ink.svg]]`, exactly like the Obsidian plugin, so both read and edit the same notes.
 * Apps without a file location for drawings simply do not provide this, and the handwriting
 * section is hidden.
 */
export interface InkAttachments {
  /** SVG text of an embedded drawing, resolved like Obsidian resolves `![[name]]`. */
  read(name: string, notePath: string): Promise<string>;
  /**
   * Saves a drawing. `name` null creates a new file under a free name. Resolves to the embed name,
   * which differs from `name` when the drawing changed elsewhere since it was read and the edit
   * was saved as a new drawing instead.
   */
  write(name: string | null, svg: string, notePath: string): Promise<string>;
  /** Lets the user pick a note to link handwriting to; null when cancelled. */
  pickNote?(): Promise<string | null>;
  /** Opens a note that handwriting links to. */
  openNote?(target: string): void;
}

export const InkAttachmentsContext = createContext<InkAttachments | null>(null);

const EMBED_RE = /!\[\[([^\]|#]+\.svg)(?:[|#][^\]]*)?\]\]/gi;

/** Names of the SVG drawings embedded in node content, in order, without duplicates. */
export function inkEmbedNames(content: string): string[] {
  return [...new Set([...content.matchAll(EMBED_RE)].map((match) => match[1]!.trim()))];
}

/** Content with the embed of a new drawing appended on its own line. */
export function appendInkEmbed(content: string, name: string): string {
  const embed = `![[${name}]]`;
  if (content.includes(embed)) return content;
  return content.trim() ? `${content.trimEnd()}\n\n${embed}\n` : `${embed}\n`;
}
