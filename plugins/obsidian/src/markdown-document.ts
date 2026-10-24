/**
 * Obsidian's Markdown adapter is intentionally kept as a compatibility boundary.
 * The parser and lossless structural operations live in @bloommd/core so the Obsidian plugin
 * cannot silently drift from the shared Markdown contract. The narrow `obsidian-markdown` entry
 * keeps the rest of Core (YAML, Yjs sync, agents) out of the plugin bundle.
 */
export {
  addChildHeading,
  addSiblingHeading,
  copyHeadingBranch,
  deleteHeadingBranch,
  editHeading,
  ensureHeadingIds,
  findHeading,
  findHeadingParent,
  flattenHeadings,
  metadataEquals,
  moveHeadingBranch,
  parseHeadingTree,
  renameHeading,
  updateHeadingContent,
  updateHeadingMetadata,
  type MarkdownHeadingNode,
  type MarkdownNodeKind,
  type MarkdownNodeMetadata,
} from "@bloommd/core/obsidian-markdown";
