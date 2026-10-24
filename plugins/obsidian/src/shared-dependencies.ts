/**
 * Shared-document dependencies behind a local boundary.
 *
 * The monorepo resolves these exports from the canonical browser packages. The public Obsidian
 * release mirror replaces this module with an equivalent, generated browser bundle so its
 * package never depends on private `workspace:*` packages.
 */
export {
  SharedDocumentMirror,
  WorkspaceSyncClient,
  createLocalSharedDocumentState,
  documentToYDoc,
  hashSharedDocumentMarkdown,
  parseFile,
  serializeToMarkdown,
  transitionSharedDocumentState,
  yDocToDocument,
  type SharedDocumentBinding,
  type SharedDocumentConnectionState,
} from "@bloommd/core/browser";
export { SyncProvider } from "@bloommd/ui/sync-provider";
