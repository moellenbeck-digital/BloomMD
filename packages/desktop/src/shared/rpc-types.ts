import type { RPCSchema } from "electrobun/bun";
import type { CustomNoteTemplate, MindMapDocument, MindMapListEntry, MindMapNode, MindMapFrontmatter, SharedDocumentBinding } from "@bloommd/core";

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
}

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
      chooseDirectory: {
        params: Record<string, never>;
        response: { path: string | null; error?: string };
      };
      chooseResourceFile: {
        params: { kind: "file" | "pdf" };
        response: { path: string | null; error?: string };
      };
      importFile: {
        params: Record<string, never>;
        response: SerializedDocument | { filePath: null };
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
    };
  }>;
};
