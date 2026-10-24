/**
 * The rich-text editor serializes `[[Note]]` and `![[Drawing ink.svg]]` as `\[\[Note]]` and
 * `!\[\[Drawing ink.svg]]`, because `[[` is no CommonMark syntax. Written back, that breaks Obsidian
 * links and handwriting embeds, already when a node is merely opened. Restores them; brackets
 * escaped on their own (`\[x]`) stay escaped.
 */
export function restoreWikiLinks(markdown: string): string {
  return markdown.replace(/(!?)\\\[\\\[([^\]\n]+?)(?:\\\]\\\]|\]\]|\\\]\])/g, (_match, bang: string, inner: string) => `${bang}[[${inner.replace(/\\([|#^_*])/g, "$1")}]]`);
}
