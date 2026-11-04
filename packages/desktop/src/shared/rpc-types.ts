import type { RPCSchema } from "electrobun/bun";
import type { CustomNoteTemplate, MindMapDocument, MindMapListEntry, MindMapNode, MindMapFrontmatter, NoteRevision, SharedDocumentBinding, SharedFolderBlockReason, SharedFolderConflictStrategy, SharedFolderPlanItem, SharedFolderPlanTotals } from "@bloommd/core";

export interface SerializedDocument {
  filePath: string;
  frontmatter: MindMapFrontmatter;
  nodes: Record<string, MindMapNode>;
  rootId: string;
  references?: MindMapDocument["references"];
  derived?: MindMapDocument["derived"];
  preamble?: string;
  storage?: MindMapDocument["storage"];
}

export type ConnectionModeInfo =
  /**
   * `reconnectFailed` carries the server BloomMD tried and could not reach at startup. Falling back
   * to the local folder silently looks like the app forgot the connection; the webview uses this to
   * say what happened and offer a retry.
   */
  | { type: "local"; dir: string; reconnectFailed?: { profileId: string; name: string; url: string } }
  | { type: "remote"; profileId: string; name: string; url: string; syncUrl: string };

export interface DesktopConnectionProfile {
  id: string;
  name: string;
  url: string;
  lastWorkspaceId?: string;
  lastConnectedAt?: string;
  hasToken: boolean;
}

export interface DesktopConnectionProfiles {
  profiles: DesktopConnectionProfile[];
  active: ConnectionModeInfo;
  storageError?: "SECURE_STORAGE_UNAVAILABLE";
}

export interface DesktopWorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

export interface DesktopWorkspaceContext {
  workspace: DesktopWorkspaceInfo | null;
  workspaces: DesktopWorkspaceInfo[];
}

export interface DesktopSharedDocumentInfo {
  localFilename: string;
  profileId: string;
  profileName: string;
  workspaceId: string;
  documentId: string;
  cloudFilename: string;
  lastAcknowledgedMarkdownHash: string;
  lastKnownCloudVersion: number;
  connectionState: "connected" | "offline" | "conflict" | "revoked";
  /** Set when the file belongs to a published folder; such a file is released with the folder share only. */
  folderShare?: { id: string; folderName: string };
}

/**
 * Preview of publishing one local folder as a shared workspace. It lives only in the desktop
 * process and the webview: local paths in it never reach the server.
 */
export interface DesktopFolderPublicationPreview {
  /** Absolute path as chosen in the native dialog; shown to the person, never sent anywhere. */
  folderPath: string;
  workspace: DesktopWorkspaceInfo;
  strategy: SharedFolderConflictStrategy;
  items: SharedFolderPlanItem[];
  totals: SharedFolderPlanTotals;
  /** Files of this folder already published to this workspace; not offered again. */
  alreadyPublished: number;
  /** Files of this folder already shared one by one; not offered again. */
  alreadyShared: number;
}

export interface DesktopFolderPublicationResult {
  success: boolean;
  error?: string;
  published: number;
  skipped: Array<{ relativePath: string; reason: "not-confirmed" | "too-large" | "unreadable" }>;
  failed: Array<{ relativePath: string; error: string }>;
  /** Files whose cloud document could not be removed again after a failed audit. */
  rollbackFailures: string[];
}

/** One published folder as the sidebar and the folder-share dialog show it. */
export interface DesktopFolderShareInfo {
  id: string;
  /** Absolute path, shown to the person only; it never leaves the desktop. */
  folderPath: string;
  folderName: string;
  profileId: string;
  profileName: string;
  workspaceId: string;
  strategy: SharedFolderConflictStrategy;
  /** `revoked` = the server ended the access or the role became viewer: sync stopped. */
  state: "connected" | "revoked";
  fileCount: number;
  publishedAt: string;
  /** Open changes; null when the folder could not be read. */
  pendingCount: number | null;
  folderAvailable: boolean;
}

/** A change in a published folder that waits for the decision of the person. */
export type DesktopFolderActivityEntry =
  | {
      kind: "new";
      relativePath: string;
      sizeBytes: number;
      /** `upload` can be confirmed; `conflict` and `blocked` can only be dismissed. */
      status: "upload" | "conflict" | "blocked";
      cloudFilename: string | null;
      uploadFilename: string | null;
      reason?: SharedFolderBlockReason;
    }
  | { kind: "removed"; relativePath: string; cloudFilename: string }
  | { kind: "renamed"; from: string; to: string; sizeBytes: number; cloudFilename: string };

export type DesktopFolderDecision =
  | { kind: "new"; relativePath: string; action: "upload" | "ignore" }
  | { kind: "removed"; relativePath: string; action: "keep-cloud" | "remove-cloud" }
  | { kind: "renamed"; from: string; to: string; action: "reassign" | "split" };

export interface DesktopBuildInfo {
  product: string;
  package: string;
  deployment: string;
  version: string;
  sha: string;
  shortSha: string;
  tag: string;
  buildTime: string;
  channel: string;
  displayVersion: string;
}

export interface DesktopUpdateStatus {
  status: string;
  message: string;
  timestamp: number;
  details?: {
    currentHash?: string;
    latestHash?: string;
    progress?: number;
    bytesDownloaded?: number;
    totalBytes?: number;
    errorMessage?: string;
  };
}

export interface DesktopUpdateResult {
  version: string;
  hash: string;
  updateAvailable: boolean;
  updateReady: boolean;
  error: string;
}

export interface DesktopUpdateState {
  local: {
    version: string;
    hash: string;
    channel: string;
  };
  update: DesktopUpdateResult;
  status: DesktopUpdateStatus | null;
}

export interface DesktopE2EStateUpdate {
  performance?: {
    /** Native performance.now() at the first animation frame containing a mounted map node. */
    timeToFirstNodesMs: number | null;
    visibilityState: DocumentVisibilityState;
    samplingMs: number;
    maxFrameGapMs: number;
    frames: number;
    mountedNodeCount: number;
    graphNodeCount: number;
    documentNodeCount: number;
    interactionKind?: string;
    interactionEvents?: number;
  };
  source: string;
  activeFile?: string | null;
  emptyWorkspace?: boolean;
  documentTitle?: string;
  nodeCount?: number;
  referenceEdgeCount?: number;
  workspaceMode?: boolean;
  /** Node selected after an external open at a node (`bloommd://open?…&node=`). */
  selectedNodeId?: string | null;
  /** Whether that node is laid out on the canvas, i.e. no folded branch hides it. */
  selectedNodeVisible?: boolean;
}

export type DesktopFeedbackType = "bug" | "idea" | "question" | "ux";

export interface DesktopFeedbackAttachment {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface DesktopFeedbackContext {
  currentFile?: string | null;
  documentTitle?: string | null;
  documentId?: string | null;
  selectedNodeId?: string | null;
  selectedNodeType?: string | null;
  editorVisible: boolean;
  nodeCount?: number;
  referenceEdgeCount?: number;
  workspaceMode: boolean;
}

export interface DesktopFeedbackRequest {
  type: DesktopFeedbackType;
  message: string;
  contactEmail?: string | null;
  formStartedAt: number;
  website: string;
  attachments: DesktopFeedbackAttachment[];
  video?: DesktopFeedbackAttachment | null;
  context: DesktopFeedbackContext;
}

export interface LinkPreviewResult {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface NativeDialogResults {
  chooseDirectory: { path: string | null; error?: string };
  chooseResourceFile: { path: string | null; error?: string };
  /** Picks the folder to publish as a shared workspace; unlike `chooseDirectory` it switches nothing. */
  choosePublicationFolder: { path: string | null; error?: string };
  importFile: SerializedDocument | { filePath: null; error?: string };
}

export type NativeDialogMethod = keyof NativeDialogResults;

/**
 * Answer of a native dialog request: the dialog was started. The outcome follows as the
 * `nativeDialogResult` message, so a dialog that waits for a person is not bound by the RPC timeout.
 */
export interface NativeDialogStarted {
  started: true;
}

export type NativeDialogResultMessage =
  | { dialogId: string; method: NativeDialogMethod; result: NativeDialogResults[NativeDialogMethod]; error?: undefined }
  | { dialogId: string; method: NativeDialogMethod; error: string; result?: undefined };

export type BloomMDRPC = {
  bun: RPCSchema<{
    requests: {
      listMindmaps: {
        params: Record<string, never>;
        response: { files: MindMapListEntry[]; unreadablePaths?: string[] };
      };
      openMindmap: {
        params: { filename: string };
        response: SerializedDocument;
      };
      openWorkspace: {
        params: Record<string, never>;
        response: SerializedDocument & { unreadablePaths?: string[] };
      };
      saveMindmap: {
        params: { filePath: string; markdown: string; storage?: MindMapDocument["storage"] };
        response: { success: boolean; storage?: MindMapDocument["storage"]; error?: string };
      };
      deleteMindmap: {
        params: { filename: string };
        response: { success: boolean };
      };
      /** Version history of the open note: backups in the local folder, revisions in a cloud workspace. */
      listNoteHistory: {
        params: { filePath: string };
        response: { revisions: NoteRevision[]; canRestore: boolean; error?: string };
      };
      /** Makes one entry of `listNoteHistory` the current version; the replaced one stays in the history. */
      restoreNoteVersion: {
        params: { filePath: string; revisionId: string };
        response: { success: boolean; error?: string };
      };
      chooseDirectory: {
        params: { dialogId: string };
        response: NativeDialogStarted;
      };
      chooseResourceFile: {
        params: { dialogId: string; kind: "file" | "pdf" };
        response: NativeDialogStarted;
      };
      importFile: {
        params: { dialogId: string };
        response: NativeDialogStarted;
      };
      choosePublicationFolder: {
        params: { dialogId: string };
        response: NativeDialogStarted;
      };
      /** Proposes the open workspace folder for publication. Only remembers the choice; nothing is read or sent. */
      selectOpenFolderForPublication: {
        params: Record<string, never>;
        response: { path: string | null; error?: string };
      };
      /** Reads the chosen folder and the target workspace's file names; uploads nothing. */
      previewFolderPublication: {
        params: { profileId: string; workspaceId: string; strategy: SharedFolderConflictStrategy; excluded: string[] };
        response: { success: boolean; preview?: DesktopFolderPublicationPreview; error?: string };
      };
      /** The published folders from local settings; with `withActivity` also the number of open changes and a check of the access (a refusal by the server stops the share). */
      listFolderShares: {
        params: { withActivity: boolean };
        response: { shares: DesktopFolderShareInfo[] };
      };
      /** Checks the access (network) and lists what changed in the folder. Changes nothing except marking a revoked share. */
      getFolderActivity: {
        params: { folderId: string };
        response: { success: boolean; share?: DesktopFolderShareInfo; entries?: DesktopFolderActivityEntry[]; unreachable?: boolean; error?: string };
      };
      /** Applies the decision for one entry. Nothing is uploaded or removed without it. */
      resolveFolderActivity: {
        params: { folderId: string; decision: DesktopFolderDecision };
        response: { success: boolean; error?: string };
      };
      /** Ends the local binding only; no local file and no cloud document is deleted. Audited. */
      disconnectFolderShare: {
        params: { folderId: string };
        response: { success: boolean; error?: string };
      };
      /** Uploads exactly `confirmedUploads`, the files the preview showed as uploadable. */
      publishFolderAsWorkspace: {
        params: { profileId: string; workspaceId: string; strategy: SharedFolderConflictStrategy; excluded: string[]; confirmedUploads: string[] };
        response: DesktopFolderPublicationResult;
      };
      createMindmap: {
        params: { filename: string; markdown: string };
        response: SerializedDocument;
      };
      createFolder: {
        params: { folderPath: string };
        response: { folderPath: string };
      };
      listFolders: {
        params: Record<string, never>;
        response: { folders: string[] };
      };
      listTemplates: {
        params: Record<string, never>;
        response: { templates: CustomNoteTemplate[] };
      };
      readResource: {
        params: { path: string };
        response: { dataUrl: string; mimeType: string } | { error: string };
      };
      fetchLinkPreview: {
        params: { url: string };
        response: { preview: LinkPreviewResult } | { error: string };
      };
      openExternalUrl: {
        params: { url: string };
        response: { success: boolean; error?: string };
      };
      serializeMindmap: {
        params: SerializedDocument;
        response: { markdown: string };
      };
      /** Saves an exported file (base64) into the Downloads folder and shows it in the file manager. */
      saveExport: {
        params: { filename: string; dataBase64: string };
        response: { path: string } | { error: string };
      };
      renameMindmap: {
        params: { oldFilename: string; newFilename: string };
        response: { success: boolean; newFilePath: string; newFilename?: string; version?: number; error?: string };
      };
      connectRemote: {
        params: { url: string; accessToken: string };
        response: { success: boolean; syncUrl: string; workspace?: DesktopWorkspaceInfo | null; workspaces?: DesktopWorkspaceInfo[]; error?: string };
      };
      listConnectionProfiles: {
        params: Record<string, never>;
        response: DesktopConnectionProfiles;
      };
      saveConnectionProfile: {
        params: { id?: string; name: string; url: string; accessToken?: string };
        response: { success: boolean; profile?: DesktopConnectionProfile; error?: string };
      };
      connectProfile: {
        params: { profileId: string };
        response: { success: boolean; syncUrl: string; profile?: DesktopConnectionProfile; workspace?: DesktopWorkspaceInfo | null; workspaces?: DesktopWorkspaceInfo[]; files?: MindMapListEntry[]; error?: string };
      };
      useLocalConnection: {
        params: Record<string, never>;
        response: { success: boolean };
      };
      deleteConnectionProfile: {
        params: { profileId: string };
        response: { success: boolean; error?: string };
      };
      setConnectionProfileWorkspace: {
        params: { profileId: string; workspaceId: string };
        response: { success: boolean };
      };
      listRemoteWorkspaces: {
        params: Record<string, never>;
        response: DesktopWorkspaceContext;
      };
      listProfileWorkspaces: {
        params: { profileId: string };
        response: DesktopWorkspaceContext;
      };
      selectRemoteWorkspace: {
        params: { workspaceId: string };
        response: DesktopWorkspaceContext & { files: MindMapListEntry[] };
      };
      getSyncTicket: {
        params: { filename: string };
        response: {
          websocketUrl: string;
          expiresAt: string;
          permission: "read" | "write";
          identity?: { name?: string | null; email?: string | null };
        };
      };
      getSharedDocument: {
        params: { localFilename: string };
        response: { sharedDocument: DesktopSharedDocumentInfo | null };
      };
      shareLocalMindmap: {
        params: { localFilename: string; profileId: string; workspaceId: string; cloudFilename: string };
        response: { success: boolean; sharedDocument?: DesktopSharedDocumentInfo; error?: string };
      };
      unshareLocalMindmap: {
        params: { localFilename: string };
        response: { success: boolean; error?: string };
      };
      getSharedSyncTicket: {
        params: { localFilename: string };
        response: {
          websocketUrl: string;
          expiresAt: string;
          permission: "read" | "write";
          identity?: { name?: string | null; email?: string | null };
          sharedDocument: DesktopSharedDocumentInfo;
        };
      };
      updateSharedDocumentBinding: {
        params: { localFilename: string; binding: SharedDocumentBinding };
        response: { success: boolean; sharedDocument?: DesktopSharedDocumentInfo; error?: string };
      };
      disconnectRemote: {
        params: Record<string, never>;
        response: { success: boolean };
      };
      getConnectionMode: {
        params: Record<string, never>;
        response: ConnectionModeInfo;
      };
      getBuildInfo: {
        params: Record<string, never>;
        response: DesktopBuildInfo;
      };
      getUpdateState: {
        params: Record<string, never>;
        response: DesktopUpdateState;
      };
      checkForUpdate: {
        params: Record<string, never>;
        response: DesktopUpdateState;
      };
      downloadUpdate: {
        params: Record<string, never>;
        response: { success: boolean; state: DesktopUpdateState; error?: string };
      };
      applyUpdate: {
        params: Record<string, never>;
        response: { success: boolean; error?: string };
      };
      consumeExternalFile: {
        params: Record<string, never>;
        response: { kind: "file" | "folder" | null; filename: string | null; nodeId?: string | null };
      };
      recordE2EState: {
        params: DesktopE2EStateUpdate;
        response: { recorded: boolean };
      };
      submitFeedback: {
        params: DesktopFeedbackRequest;
        response: { success: true; issueNumber: number; issueUrl: string } | { success: false; error: string };
      };
      setLocale: {
        params: { locale: "de" | "en" };
        response: { success: true };
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      fileChanged: { filename: string };
      filesChanged: { filenames: string[] };
      directoryChanged: { path: string };
      connectionModeChanged: { type: "local" | "remote"; profileId?: string; syncUrl?: string };
      updateStatus: DesktopUpdateStatus;
      /**
       * The workspace switched to a file or folder opened from the OS or the command line.
       * Folder opens are explicit instead of inferred from `filename: null`, because they mean
       * "render the workspace map", not "pick any file from the refreshed list".
       */
      externalFileOpened: { kind: "file" | "folder"; filename: string | null; nodeId?: string | null };
      aboutRequested: Record<string, never>;
      /** Outcome of a `chooseDirectory`, `chooseResourceFile` or `importFile` request started earlier. */
      nativeDialogResult: NativeDialogResultMessage;
    };
  }>;
};
