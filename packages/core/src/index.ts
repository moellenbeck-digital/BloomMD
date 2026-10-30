export type {
  MindMapFrontmatter,
  MindMapNode,
  MindMapNodeKind,
  MindMapNodeMetadata,
  MindMapNodeRelation,
  MindMapReference,
  MindMapDocument,
  MindMapListEntry,
  FileStoreConfig,
} from "./types";

export { HeadingDepthError, MAX_HEADING_LEVEL } from "./types";
export { parseFile, serializeToMarkdown } from "./parser";
export { collapseUnchanged, diffLines, diffStats, type DiffKind, type DiffLine, type DiffStats } from "./diff";
export { addNode, deleteNode, moveNode, renameNode } from "./operations";
export { FileStore } from "./fileStore";
export { filenameForTitle, filenameForTitleInPath, normalizeMarkdownFilename, normalizeMarkdownPath, normalizeFolderPath, sanitizeMarkdownFilename, resolveMarkdownPath, resolveFolderPath } from "./paths";
export { documentToYDoc, yDocToDocument } from "./yjs-bridge";
export {
  yAddNode,
  yDeleteNode,
  yMoveNode,
  yRenameNode,
  yUpdateNodeMetadata,
  yUpdateContent,
  yUpdateFrontmatter,
} from "./yjs-operations";
export { yUpdateContentDiff } from "./yjs-content-sync";
export { signSyncTicket, verifySyncTicket } from "./sync-ticket";
export type { SyncTicketClaims } from "./sync-ticket";
export {
  SHARED_DOCUMENT_BINDING_SCHEMA_VERSION,
  createLocalSharedDocumentState,
  transitionSharedDocumentState,
  classifySharedDocumentMirrorWrite,
  hashSharedDocumentMarkdown,
  serializeSharedDocumentBinding,
  parseSharedDocumentBinding,
  validateSharedDocumentBinding,
  type SharedDocumentBinding,
  type SharedDocumentConnectionState,
  type SharedDocumentStateKind,
  type SharedDocumentState,
  type SharedDocumentEvent,
  type SharedDocumentMirrorWriteKind,
} from "./shared-document-binding";
export {
  SharedDocumentMirror,
  type SharedDocumentMirrorFileAdapter,
  type SharedDocumentMirrorPublishResult,
  type SharedDocumentMirrorResult,
  type SharedDocumentMirrorOptions,
} from "./shared-document-mirror";
export {
  WorkspaceSyncClient,
  type WorkspaceSyncFetch,
  type WorkspaceSyncClientConfig,
  type WorkspaceSyncWorkspace,
  type WorkspaceSyncContext,
  type WorkspaceSyncCreatedDocument,
  type WorkspaceSyncTicket,
} from "./workspace-sync-client";
export {
  buildWorkspaceGraph,
  extractLinks,
  graphCounts,
  filterWorkspaceGraph,
  matchPreset,
  GRAPH_PRESETS,
  DEFAULT_GRAPH_LAYERS,
  type GraphLayers,
  type GraphPreset,
  fileNodeId,
  folderNodeId,
  FILE_NODE_PREFIX,
  FOLDER_NODE_PREFIX,
  type WorkspaceGraph,
  type WorkspaceNode,
  type WorkspaceNodeKind,
  type WorkspaceEdge,
  type StructureEdge,
  type ReferenceEdge,
  type WorkspaceFileInput,
  type LinkResolution,
  type GraphCounts,
} from "./workspace-graph";
export {
  buildWorkspaceMindMap,
  headingNodeId,
  isWorkspaceMindMap,
  WORKSPACE_ROOT_NODE_ID,
  HEADING_NODE_PREFIX,
  type WorkspaceMindMapOptions,
} from "./workspace-document";
export {
  lintWorkspace,
  checkRoundtrip,
  type LintFinding,
  type LintResult,
  type LintSummary,
  type LintSeverity,
  type LintCode,
  type LintOptions,
} from "./workspace-lint";
export {
  buildWorkspaceIndex,
  type WorkspaceIndex,
  type WorkspaceIndexOptions,
  type WorkspaceIndexSummary,
  type WorkspaceIndexFinding,
  type WorkspaceIndexFindingCode,
  type IndexDocumentNode,
  type IndexHeadingNode,
  type IndexBacklink,
  type IndexBacklinks,
} from "./workspace-index";
export {
  searchWorkspace,
  backlinksFor,
  type WorkspaceSearchQuery,
  type WorkspaceSearchHit,
  type BacklinkEntry,
} from "./workspace-search";
export {
  WORKSPACE_AGENT_TOOLS,
  callWorkspaceAgentTool,
  type WorkspaceAgentToolName,
  type WorkspaceAgentResult,
} from "./workspace-agent";
export {
  DEFAULT_TEMPLATE_FOLDER,
  builtInNoteTemplates,
  customTemplateTitle,
  isoDate,
  listNoteTemplates,
  normalizeTemplateFolder,
  renderNoteTemplate,
  selectTemplatePaths,
  titleFromPath,
  type BuiltInNoteTemplateId,
  type CustomNoteTemplate,
  type NoteTemplate,
  type NoteTemplateLocale,
} from "./note-templates";
