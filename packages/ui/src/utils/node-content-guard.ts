import { restoreWikiLinks } from "./wiki-links-escape";

/**
 * Protects stored node content from the rich-text editor (#394).
 *
 * The editor reports its markdown through `onChange`. Mounting, `setMarkdown` and hiding the editor are
 * no edits by the user, so an empty report that does not come from the user must never replace
 * content that is already stored. Conversely, text the user typed must reach the store even when the
 * editor is hidden before its last `onChange` arrived.
 */

/** True when an empty editor report would wipe stored content without the user having edited it. */
export function isUnintendedClear(input: {
  /** Markdown reported by the editor, already restored for wiki links. */
  next: string;
  /** Content currently stored for the node. */
  stored: string;
  /** The editor flags changes that stem from its own initial import. */
  fromInitialImport: boolean;
  /** The user typed, pasted, cut or dropped something in the editor since it was shown. */
  userEdited: boolean;
}): boolean {
  if (input.next.trim() !== "") return false;
  if (input.stored.trim() === "") return false;
  return input.fromInitialImport || !input.userEdited;
}

/**
 * Content to write when the editor goes away: what the user typed that was not reported yet.
 * Returns null when nothing has to be written (no user edit, nothing typed, already stored).
 * Empty editor content is never flushed; clearing a node is only taken from `onChange`.
 */
export function pendingEditorContent(input: {
  /** `getMarkdown()` of the editor right before it is removed. */
  editorMarkdown: string | undefined;
  stored: string;
  userEdited: boolean;
}): string | null {
  if (!input.userEdited || input.editorMarkdown === undefined) return null;
  const content = restoreWikiLinks(input.editorMarkdown);
  if (content.trim() === "") return null;
  if (content.trim() === input.stored.trim()) return null;
  return content;
}
