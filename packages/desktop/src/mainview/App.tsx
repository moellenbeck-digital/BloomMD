import { FileChangeQueue } from "./file-change-queue";
import { LatestRequest } from "./latest-request";
import { documentContentKey } from "./document-content";
import { lazy, Suspense, useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CloudUpload, Link2Off, Menu, FolderOpen, Globe, MessageSquare, Send, Pencil, Plus, Server, Trash2, X } from "lucide-react";
import {
  MindMapCanvas,
  ResizableEditor,
  Toolbar,
  HelpModal,
  AboutDialog,
  FileContextMenu,
  CommandPalette,
  SyncStatus,
  useMindMapStore,
  useKeyboardShortcuts,
  useLocale,
  type RootRenameEvent,
  type ToolbarHandle,
  CreateEntryDialog,
  type CreateEntryKind,
  fileEntryIsActive,
  requestNodeFocus,
} from "@bloommd/ui";
import { collapsedAncestors } from "./external-node";
import type { MindMapDocument, MindMapListEntry, SharedDocumentBinding } from "@bloommd/core/browser";
import { documentToYDoc, filenameForTitleInPath, hashSharedDocumentMarkdown, isWorkspaceMindMap, parseFile, serializeToMarkdown, SharedDocumentMirror, yDocToDocument } from "@bloommd/core/browser";
import {
  listMindmaps, openMindmap, openWorkspace, saveMindmap, onFileChanged,
  chooseDirectory, chooseResourceFile, importFile, createMindmap, createFolder, listFolders, listTemplates, serializeMindmap,
  renameMindmap, deleteMindmap,
  listConnectionProfiles, saveConnectionProfile, connectProfile, useLocalConnection, deleteConnectionProfile, setConnectionProfileWorkspace,
  listRemoteWorkspaces, selectRemoteWorkspace,
  getConnectionMode, onConnectionModeChanged, getBuildInfo, onAboutRequested,
  consumeExternalFile, onExternalFileOpened,
  getSyncTicket, getSharedDocument, getSharedSyncTicket, listProfileWorkspaces, shareLocalMindmap, unshareLocalMindmap, updateSharedDocumentBinding, readResource, fetchLinkPreview, openExternalUrl, recordE2EState,
  submitFeedback, getUpdateState, checkForUpdate, downloadUpdate, applyUpdate, onUpdateStatus, setApplicationLocale,
} from "./rpc";
import { isChangedFileActive } from "../shared/file-change";
import type { DesktopBuildInfo, DesktopConnectionProfile, DesktopFeedbackAttachment, DesktopFeedbackType, DesktopSharedDocumentInfo, DesktopUpdateState, DesktopWorkspaceInfo } from "../shared/rpc-types";

interface DesktopFeedbackDraft {
  type: DesktopFeedbackType;
  contactEmail: string;
  message: string;
}

type RenameResult = { success: true; filename: string } | { success: false; message: string };

const RenameMindmapDialog = lazy(async () => {
  const module = await import("@bloommd/ui/rename-dialog");
  return { default: module.RenameMindmapDialog };
});

interface ResourcePreviewRequest {
  kind?: string;
  file?: string;
  respond: (result: { url: string; revokeOnCleanup?: boolean } | { error: string }) => void;
}

interface ResourceChooseRequest {
  kind?: string;
  respond: (result: { path: string } | { canceled: true } | { error: string }) => void;
}

function isMarkdownResource(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function documentWithRootTitle(doc: MindMapDocument, title: string): MindMapDocument {
  const root = doc.nodes.get(doc.rootId);
  if (!root) throw new Error("Mindmap root is missing.");
  const nodes = new Map(doc.nodes);
  nodes.set(doc.rootId, { ...root, title });
  return {
    ...doc,
    nodes,
    frontmatter: { ...doc.frontmatter, title },
  };
}

function workspaceRoleLabel(role: DesktopWorkspaceInfo["role"], t: ReturnType<typeof useLocale>["t"]): string {
  return role === "owner" ? t.ownerRole : role === "editor" ? t.editorRole : t.viewerRole;
}

function sharedBindingFromInfo(sharedDocument: DesktopSharedDocumentInfo): SharedDocumentBinding {
  return {
    schemaVersion: 1,
    workspaceId: sharedDocument.workspaceId,
    documentId: sharedDocument.documentId,
    cloudFilename: sharedDocument.cloudFilename,
    lastAcknowledgedMarkdownHash: sharedDocument.lastAcknowledgedMarkdownHash,
    lastKnownCloudVersion: sharedDocument.lastKnownCloudVersion,
    connectionState: sharedDocument.connectionState,
  };
}

function sharedDocumentStateLabel(state: DesktopSharedDocumentInfo["connectionState"], locale: "de" | "en"): string {
  if (locale === "de") return state === "connected" ? "Verbunden" : state === "offline" ? "Offline" : state === "conflict" ? "Konflikt" : "Zugriff entzogen";
  return state === "connected" ? "Connected" : state === "offline" ? "Offline" : state === "conflict" ? "Conflict" : "Access revoked";
}

const DESKTOP_FEEDBACK_DRAFT_KEY = "bloommd.desktop.feedbackDraft.v1";
const EMPTY_FEEDBACK_DRAFT: DesktopFeedbackDraft = { type: "bug", contactEmail: "", message: "" };
const DESKTOP_LOCAL_FILE_MIRROR_ORIGIN = "desktop-local-file-mirror" as const;

function readFeedbackDraft(): DesktopFeedbackDraft {
  try {
    const raw = localStorage.getItem(DESKTOP_FEEDBACK_DRAFT_KEY);
    if (!raw) return EMPTY_FEEDBACK_DRAFT;
    const parsed = JSON.parse(raw) as Partial<DesktopFeedbackDraft>;
    return {
      type: parsed.type === "bug" || parsed.type === "ux" || parsed.type === "idea" || parsed.type === "question" ? parsed.type : "bug",
      contactEmail: typeof parsed.contactEmail === "string" ? parsed.contactEmail : "",
      message: typeof parsed.message === "string" ? parsed.message : "",
    };
  } catch {
    return EMPTY_FEEDBACK_DRAFT;
  }
}

async function fileToFeedbackAttachment(file: File): Promise<DesktopFeedbackAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return {
    filename: file.name,
    mimeType: file.type,
    base64: btoa(binary),
  };
}


/**
 * Selects and centres the node another app asked for (`bloommd://open?…&node=`), unfolding the
 * branches above it. Unknown ids are ignored: the document may have changed since the link was made.
 */
function revealExternalNode(nodeId: string | null | undefined): string | null {
  if (!nodeId) return null;
  const store = useMindMapStore.getState();
  if (!store.document?.nodes.has(nodeId)) return null;
  for (const ancestor of collapsedAncestors(store.document, store.collapsedIds, nodeId)) {
    useMindMapStore.getState().toggleCollapse(ancestor);
  }
  if (store.focusNodeId) useMindMapStore.getState().setFocusNodeId(null);
  useMindMapStore.getState().setSelectedNodeId(nodeId);
  // The canvas lays out the freshly loaded document over the next frames before it can centre.
  window.setTimeout(() => requestNodeFocus(nodeId), 120);
  return nodeId;
}

export function App() {
  const { t, locale } = useLocale();
  const setDocument = useMindMapStore((s) => s.setDocument);
  const setDocumentFilePath = useMindMapStore((s) => s.setDocumentFilePath);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const document = useMindMapStore((s) => s.document);
  const documentId = useMindMapStore((s) => s.document?.frontmatter.id);
  const yDoc = useMindMapStore((s) => s.yDoc);
  const syncStatus = useMindMapStore((s) => s.syncStatus);
  const readOnly = useMindMapStore((s) => s.readOnly);
  const [files, setFiles] = useState<MindMapListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceNavigationPending, setWorkspaceNavigationPending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFocusIdx, setDrawerFocusIdx] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [buildInfo, setBuildInfo] = useState<DesktopBuildInfo | null>(null);
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStartedAt, setFeedbackStartedAt] = useState(Date.now());
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<DesktopFeedbackDraft>(readFeedbackDraft);
  const feedbackDraftPersistenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const drawerListRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filename: string; title: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ filename: string; title: string } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const drawerRevealFilenameRef = useRef<string | null>(null);
  const toolbarRef = useRef<ToolbarHandle>(null);
  const fileChanges = useRef<FileChangeQueue | null>(null);
  const documentRequests = useRef(new LatestRequest());
  const persistedFileRef = useRef<{ filePath: string; content: string } | null>(null);
  const creatingFileRef = useRef<(() => boolean) | null>(null);
  const listRequests = useRef(new LatestRequest());
  const currentFileRef = useRef<string | null>(null);
  // The ref protects asynchronous file/sync operations from acting on a document
  // that has since changed. The header and sharing dialog additionally need a
  // reactive value so their availability follows local file navigation.
  const [activeLocalFilename, setActiveLocalFilename] = useState<string | null>(null);
  const forwardFileRef = useRef<string | null>(null);
  const [forwardNavigationAvailable, setForwardNavigationAvailable] = useState(false);
  const [sharedDocument, setSharedDocument] = useState<DesktopSharedDocumentInfo | null>(null);
  const [sharedDocumentDialogOpen, setSharedDocumentDialogOpen] = useState(false);
  const sharedMirrorRef = useRef<{ localFilename: string; mirror: SharedDocumentMirror } | null>(null);

  const clearForwardNavigation = useCallback(() => {
    forwardFileRef.current = null;
    setForwardNavigationAvailable(false);
  }, []);

  const connectRemoteFileSync = useCallback(async (filename: string) => {
    if (currentFileRef.current !== filename) return;
    const ticket = await getSyncTicket(filename);
    if (currentFileRef.current !== filename) return;
    const refreshUrl = async () => (await getSyncTicket(filename)).websocketUrl;
    if (currentFileRef.current !== filename) return;
    useMindMapStore.getState().connectSyncUrl(ticket.websocketUrl, refreshUrl, ticket.identity);
  }, []);

  const connectSharedFileSync = useCallback(async (localFilename: string) => {
    if (currentFileRef.current !== localFilename) return;
    const ticket = await getSharedSyncTicket(localFilename);
    if (currentFileRef.current !== localFilename) return;
    const refreshUrl = async () => (await getSharedSyncTicket(localFilename)).websocketUrl;
    if (currentFileRef.current !== localFilename) return;
    useMindMapStore.getState().connectSyncUrl(ticket.websocketUrl, refreshUrl, ticket.identity);
  }, []);

  useEffect(() => {
    void setApplicationLocale(locale).catch((error) => console.error("[BloomMD] Native menu locale unavailable:", error));
  }, [locale]);

  const openAboutLink = useCallback((url: string) => {
    void openExternalUrl(url)
      .then((result) => {
        if (!result.success) console.error("[BloomMD] About link failed:", result.error);
      })
      .catch((error) => console.error("[BloomMD] About link failed:", error));
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    try {
      setUpdateState(await checkForUpdate());
    } catch (error) {
      console.error("[BloomMD] Update check failed:", error);
    }
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    try {
      const result = await downloadUpdate();
      setUpdateState(result.state);
    } catch (error) {
      console.error("[BloomMD] Update download failed:", error);
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    try {
      const result = await applyUpdate();
      if (!result.success) {
        const state = await getUpdateState();
        setUpdateState({ ...state, update: { ...state.update, error: result.error ?? t.updateInstallFailed } });
      }
    } catch (error) {
      console.error("[BloomMD] Update installation failed:", error);
    }
  }, [t.updateInstallFailed]);

  useEffect(() => {
    onAboutRequested(() => setAboutOpen(true));
    void getBuildInfo()
      .then(setBuildInfo)
      .catch((error) => console.error("[BloomMD] Build info unavailable:", error));
    return () => onAboutRequested(null);
  }, []);

  useEffect(() => {
    onUpdateStatus((status) => {
      setUpdateState((current) => current ? { ...current, status } : current);
    });
    void getUpdateState()
      .then((state) => {
        setUpdateState(state);
        if (state.local.channel !== "dev") void checkForUpdate().then(setUpdateState).catch((error) => console.error("[BloomMD] Initial update check failed:", error));
      })
      .catch((error) => console.error("[BloomMD] Update state unavailable:", error));
    return () => onUpdateStatus(null);
  }, []);

  const reportE2EState = useCallback((state: {
    source: string;
    activeFile?: string | null;
    emptyWorkspace?: boolean;
    documentTitle?: string;
    nodeCount?: number;
    referenceEdgeCount?: number;
    workspaceMode?: boolean;
    selectedNodeId?: string | null;
    selectedNodeVisible?: boolean;
  }) => {
    void recordE2EState(state).catch((error) => {
      console.error("[BloomMD] E2E state recording failed:", error);
    });
  }, []);

  /** Selects the node an external open asked for and records it for the native E2E checks. */
  const reportExternalNode = useCallback((nodeId: string | null | undefined) => {
    if (!nodeId) return;
    const selectedNodeId = revealExternalNode(nodeId);
    const state = useMindMapStore.getState();
    reportE2EState({
      source: "externalNode",
      activeFile: currentFileRef.current,
      selectedNodeId: state.selectedNodeId === selectedNodeId ? selectedNodeId : null,
      selectedNodeVisible: Boolean(selectedNodeId && state.nodes.some((node) => node.id === selectedNodeId)),
    });
  }, [reportE2EState]);

  const applyRemoteWorkspaceContext = useCallback((context: {
    workspace: DesktopWorkspaceInfo | null;
    workspaces: DesktopWorkspaceInfo[];
  }) => {
    setActiveRemoteWorkspace(context.workspace);
    setRemoteWorkspaces(context.workspaces);
    setWorkspaceError(null);
  }, []);

  // Connection state
  const [connectionMode, setConnectionMode] = useState<"local" | "remote">("local");
  const [reconnectFailedUrl, setReconnectFailedUrl] = useState<string | null>(null);
  const [reconnectFailedProfileId, setReconnectFailedProfileId] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [connectionProfiles, setConnectionProfiles] = useState<DesktopConnectionProfile[]>([]);
  const [connectionSwitcherOpen, setConnectionSwitcherOpen] = useState(false);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogProfile, setProfileDialogProfile] = useState<DesktopConnectionProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [syncUrl, setSyncUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [remoteWorkspaces, setRemoteWorkspaces] = useState<DesktopWorkspaceInfo[]>([]);
  const [activeRemoteWorkspace, setActiveRemoteWorkspace] = useState<DesktopWorkspaceInfo | null>(null);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [localLoadError, setLocalLoadError] = useState(false);
  const [unreadablePaths, setUnreadablePaths] = useState<string[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const connectionProfileErrorMessage = useCallback((error: string | undefined, fallback: string): string => {
    return error === "SECURE_STORAGE_UNAVAILABLE" ? t.connectionProfileStorageUnavailable : error || fallback;
  }, [t.connectionProfileStorageUnavailable]);

  const openFeedbackDialog = useCallback(() => {
    setFeedbackStartedAt(Date.now());
    setFeedbackResult(null);
    setFeedbackOpen(true);
  }, []);

  useEffect(() => {
    if (feedbackDraftPersistenceTimer.current) {
      clearTimeout(feedbackDraftPersistenceTimer.current);
    }
    feedbackDraftPersistenceTimer.current = setTimeout(() => {
      const isEmpty =
        feedbackDraft.type === EMPTY_FEEDBACK_DRAFT.type &&
        feedbackDraft.contactEmail.length === 0 &&
        feedbackDraft.message.length === 0;
      if (isEmpty) {
        localStorage.removeItem(DESKTOP_FEEDBACK_DRAFT_KEY);
      } else {
        localStorage.setItem(DESKTOP_FEEDBACK_DRAFT_KEY, JSON.stringify(feedbackDraft));
      }
      feedbackDraftPersistenceTimer.current = null;
    }, 200);
    return () => {
      if (feedbackDraftPersistenceTimer.current) {
        clearTimeout(feedbackDraftPersistenceTimer.current);
        feedbackDraftPersistenceTimer.current = null;
      }
    };
  }, [feedbackDraft]);

  const loadFile = useCallback(
    async (filename: string, remoteOverride = false, preserveForwardNavigation = false, fromWatcher = false) => {
      const isCurrent = documentRequests.current.begin();
      if (!preserveForwardNavigation) clearForwardNavigation();
      const previousFilename = currentFileRef.current;
      currentFileRef.current = filename;
      setActiveLocalFilename(filename);
      if (previousFilename !== filename) useMindMapStore.getState().disconnectSync();

      const data = await openMindmap(filename);
      if (!isCurrent()) return;
      const doc: MindMapDocument = {
        ...data,
        nodes: new Map(Object.entries(data.nodes)),
        references: data.references,
        derived: data.derived,
        rawMarkdown: "",
      };
      const incomingContent = documentContentKey(doc);
      if (fromWatcher) {
        const current = useMindMapStore.getState().document;
        const persisted = persistedFileRef.current;
        if (current?.filePath === doc.filePath) {
          const currentContent = documentContentKey(current);
          if (currentContent === incomingContent) {
            persistedFileRef.current = { filePath: doc.filePath, content: incomingContent };
            return;
          }
          // The watcher also reports our own create/save writes. Keep subsequent edits and undo.
          if (persisted?.filePath === doc.filePath && persisted.content === incomingContent) return;
          if (persisted?.filePath !== doc.filePath || currentContent !== persisted.content) {
            useMindMapStore.getState().setStatusMessage(t.documentConflict);
            return;
          }
        }
      }
      persistedFileRef.current = { filePath: doc.filePath, content: incomingContent };
      setDocument(doc);
      let localSharedDocument: DesktopSharedDocumentInfo | null = null;
      if (!remoteOverride) {
        try {
          const result = await getSharedDocument(filename);
          if (!isCurrent()) return;
          localSharedDocument = result.sharedDocument;
          setSharedDocument(result.sharedDocument);
        } catch (error) {
          if (!isCurrent()) return;
          console.error("[BloomMD] Shared document state could not be loaded:", error);
          setSharedDocument(null);
        }
      } else {
        setSharedDocument(null);
      }
      reportE2EState({
        source: "loadFile",
        activeFile: filename,
        emptyWorkspace: false,
        documentTitle: doc.frontmatter.title,
        nodeCount: doc.nodes.size,
      });
      if ((connectionMode === "remote" && syncUrl) || remoteOverride) {
        await connectRemoteFileSync(filename);
      } else if (localSharedDocument && localSharedDocument.connectionState !== "revoked") {
        await connectSharedFileSync(filename);
      }
    },
    [clearForwardNavigation, setDocument, connectionMode, syncUrl, reportE2EState, connectRemoteFileSync, connectSharedFileSync, t.documentConflict],
  );

  const handleSharedDocumentChanged = useCallback(async () => {
    const localFilename = currentFileRef.current;
    if (!localFilename) return;
    const result = await getSharedDocument(localFilename);
    setSharedDocument(result.sharedDocument);
    if (result.sharedDocument && result.sharedDocument.connectionState !== "revoked") {
      await connectSharedFileSync(localFilename);
    } else {
      await useMindMapStore.getState().disconnectSync();
    }
  }, [connectSharedFileSync]);

  const handleShareFromSidebar = useCallback(async (filename: string) => {
    await loadFile(filename);
    setSharedDocumentDialogOpen(true);
  }, [loadFile]);

  const resolveSharedDocumentConflict = useCallback(async (source: "local" | "cloud") => {
    const activeMirror = sharedMirrorRef.current;
    const localFilename = currentFileRef.current;
    if (!activeMirror || !localFilename || activeMirror.localFilename !== localFilename || !yDoc) {
      throw new Error("SHARED_DOCUMENT_CONFLICT_NOT_ACTIVE");
    }

    if (source === "local") {
      const localDocument = await openMindmap(localFilename);
      const localMarkdown = serializeToMarkdown({ ...localDocument, nodes: new Map(Object.entries(localDocument.nodes)), rawMarkdown: "" });
      const result = await activeMirror.mirror.resolveConflictUsingLocalMarkdown(localMarkdown);
      if (result.kind !== "published") throw new Error(`SHARED_DOCUMENT_CONFLICT_${result.kind.toUpperCase()}`);
      return;
    }

    const cloudDocument = yDocToDocument(yDoc);
    if (cloudDocument.nodes.size === 0) throw new Error("SHARED_DOCUMENT_CLOUD_DOCUMENT_EMPTY");
    const cloudMarkdown = serializeToMarkdown(cloudDocument);
    const result = await activeMirror.mirror.resolveConflictUsingRemoteMarkdown(
      cloudMarkdown,
      activeMirror.mirror.getBinding().lastKnownCloudVersion,
    );
    if (result.kind !== "mirrored") throw new Error(`SHARED_DOCUMENT_CONFLICT_${result.kind.toUpperCase()}`);
  }, [yDoc]);

  useEffect(() => {
    if (connectionMode !== "local" || !yDoc || !sharedDocument || sharedDocument.connectionState === "revoked") {
      sharedMirrorRef.current = null;
      return;
    }
    const localFilename = sharedDocument.localFilename;
    if (currentFileRef.current !== localFilename) return;

    const mirror = new SharedDocumentMirror({
      binding: sharedBindingFromInfo(sharedDocument),
      hashMarkdown: hashSharedDocumentMarkdown,
      file: {
        readMarkdown: async () => {
          const data = await openMindmap(localFilename);
          return serializeToMarkdown({
            ...data,
            nodes: new Map(Object.entries(data.nodes)),
            rawMarkdown: "",
          });
        },
        writeMarkdown: async (markdown) => {
          const saved = await saveMindmap(localFilename, markdown);
          if (!saved.success) throw new Error(saved.error || "LOCAL_MIRROR_WRITE_FAILED");
        },
      },
      publishLocalMarkdown: async (markdown, expectedCloudVersion) => {
        if (useMindMapStore.getState().syncStatus !== "connected") throw new Error("SYNC_OFFLINE");
        documentToYDoc(parseFile(localFilename, markdown), yDoc, DESKTOP_LOCAL_FILE_MIRROR_ORIGIN);
        return { kind: "acknowledged", cloudVersion: expectedCloudVersion };
      },
      onBindingChange: (binding) => {
        void updateSharedDocumentBinding(localFilename, binding)
          .then((result) => {
            if (result.success && currentFileRef.current === localFilename) setSharedDocument(result.sharedDocument ?? null);
          })
          .catch((error) => console.error("[BloomMD] Shared document state could not be persisted:", error));
      },
      classifyPublishError: (error) => /(?:401|403|404|access[_ -]?revoked)/i.test(error instanceof Error ? error.message : String(error)) ? "revoked" : "offline",
    });
    sharedMirrorRef.current = { localFilename, mirror };

    const onYDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === DESKTOP_LOCAL_FILE_MIRROR_ORIGIN) return;
      const updatedDocument = yDocToDocument(yDoc);
      if (updatedDocument.nodes.size === 0) return;
      const markdown = serializeToMarkdown(updatedDocument);
      void mirror.applyRemoteMarkdown(markdown, mirror.getBinding().lastKnownCloudVersion)
        .catch((error) => console.error("[BloomMD] Shared document mirror write failed:", error));
    };
    yDoc.on("update", onYDocUpdate);
    return () => {
      yDoc.off("update", onYDocUpdate);
      if (sharedMirrorRef.current?.mirror === mirror) sharedMirrorRef.current = null;
    };
  }, [
    connectionMode,
    sharedDocument?.cloudFilename,
    sharedDocument?.documentId,
    sharedDocument?.localFilename,
    sharedDocument?.workspaceId,
    yDoc,
  ]);

  useEffect(() => {
    const activeSharedMirror = sharedMirrorRef.current;
    if (!activeSharedMirror || currentFileRef.current !== activeSharedMirror.localFilename) return;
    if (readOnly) {
      void activeSharedMirror.mirror.markAccessRevoked()
        .catch((error) => console.error("[BloomMD] Shared document revocation could not be recorded:", error));
      return;
    }
    if (syncStatus !== "connected") return;
    void activeSharedMirror.mirror.markConnectionRestored()
      .then(async () => {
        const data = await openMindmap(activeSharedMirror.localFilename);
        const markdown = serializeToMarkdown({ ...data, nodes: new Map(Object.entries(data.nodes)), rawMarkdown: "" });
        return activeSharedMirror.mirror.handleLocalMarkdown(markdown);
      })
      .catch((error) => console.error("[BloomMD] Shared document reconnect could not synchronize the local file:", error));
  }, [readOnly, sharedDocument?.localFilename, syncStatus]);

  const loadWorkspace = useCallback(
    async (source = "loadWorkspace") => {
      const isCurrent = documentRequests.current.begin();
      const data = await openWorkspace();
      if (!isCurrent()) return;
      setUnreadablePaths(data.unreadablePaths ?? []);
      setLocalLoadError(false);
      // Only leave the active file room after the workspace overview was loaded successfully.
      // This keeps the current document available if a remote workspace read fails.
      useMindMapStore.getState().disconnectSync();
      currentFileRef.current = null;
      setActiveLocalFilename(null);
      const doc: MindMapDocument = {
        ...data,
        nodes: new Map(Object.entries(data.nodes)),
        references: data.references,
        derived: data.derived,
        rawMarkdown: "",
      };
      clearForwardNavigation();
      setDocument(doc);
      setSharedDocument(null);
      reportE2EState({
        source,
        activeFile: null,
        emptyWorkspace: doc.nodes.size <= 1,
        documentTitle: doc.frontmatter.title,
        nodeCount: doc.nodes.size,
        referenceEdgeCount: doc.references?.length ?? 0,
        workspaceMode: true,
      });
    },
    [clearForwardNavigation, setDocument, reportE2EState],
  );

  const focusCanvasAfterNavigation = useCallback(() => {
    const focusCanvas = () => {
      const canvas = window.document.getElementById("mindmap-canvas");
      if (!canvas) return false;
      canvas.focus();
      return true;
    };

    requestAnimationFrame(() => {
      if (!focusCanvas()) setTimeout(focusCanvas, 50);
    });
  }, []);

  const handleReturnToWorkspace = useCallback(async () => {
    const current = useMindMapStore.getState().document;
    if (!current || isWorkspaceMindMap(current) || workspaceNavigationPending) return;
    const currentFilename = currentFileRef.current;
    if (!currentFilename) return;

    setWorkspaceNavigationPending(true);
    try {
      await loadWorkspace("returnToWorkspace");
      forwardFileRef.current = currentFilename;
      setForwardNavigationAvailable(true);
      setDrawerOpen(false);
      focusCanvasAfterNavigation();
    } catch (error) {
      console.error("[BloomMD] Returning to workspace overview failed:", error);
      useMindMapStore.getState().setStatusMessage(t.filesLoadFailed);
    } finally {
      setWorkspaceNavigationPending(false);
    }
  }, [focusCanvasAfterNavigation, loadWorkspace, t.filesLoadFailed, workspaceNavigationPending]);

  const handleForwardToFile = useCallback(async () => {
    const filename = forwardFileRef.current;
    if (!filename || workspaceNavigationPending) return;
    if (!files.some((file) => file.filename === filename)) {
      clearForwardNavigation();
      return;
    }

    setWorkspaceNavigationPending(true);
    try {
      await loadFile(filename, connectionMode === "remote", true);
      setDrawerOpen(false);
      focusCanvasAfterNavigation();
    } catch (error) {
      console.error("[BloomMD] Returning to the previously opened file failed:", error);
      useMindMapStore.getState().setStatusMessage(t.filesLoadFailed);
    } finally {
      setWorkspaceNavigationPending(false);
    }
  }, [clearForwardNavigation, connectionMode, files, focusCanvasAfterNavigation, loadFile, t.filesLoadFailed, workspaceNavigationPending]);

  useEffect(() => {
    const openUrl = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; respond?: (result: { opened: true } | { error: string }) => void }>).detail;
      event.preventDefault();
      if (!detail.url) {
        detail.respond?.({ error: t.noUrl });
        return;
      }
      void openExternalUrl(detail.url)
        .then((result) => {
          if (!result.success) {
            detail.respond?.({ error: result.error || t.urlOpenFailed });
            return;
          }
          detail.respond?.({ opened: true });
        })
        .catch((error) => detail.respond?.({ error: error instanceof Error ? error.message : t.urlOpenFailed }));
    };

    const loadLinkPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; respond?: (result: { preview: { title?: string; description?: string; image?: string } } | { error: string }) => void }>).detail;
      event.preventDefault();
      if (!detail.url || !detail.respond) return;
      void fetchLinkPreview(detail.url)
        .then((result) => {
          if ("error" in result) {
            detail.respond?.({ error: result.error });
            return;
          }
          detail.respond?.({ preview: result.preview });
        })
        .catch((error) => detail.respond?.({ error: error instanceof Error ? error.message : t.previewUnavailable }));
    };

    const listMaps = (event: Event) => {
      const detail = (event as CustomEvent<{ respond?: (result: { files: MindMapListEntry[] } | { error: string }) => void }>).detail;
      event.preventDefault();
      if (!detail.respond) return;
      void listMindmaps()
        .then((result) => detail.respond?.({ files: result.files }))
        .catch((error) => detail.respond?.({ error: error instanceof Error ? error.message : t.mapsUnavailable }));
    };

    const loadMapDocument = (event: Event) => {
      const detail = (event as CustomEvent<{ filename?: string; respond?: (result: { document: Awaited<ReturnType<typeof openMindmap>> } | { error: string }) => void }>).detail;
      event.preventDefault();
      if (!detail.filename || !detail.respond) return;
      void openMindmap(detail.filename)
        .then((documentData) => detail.respond?.({ document: documentData }))
        .catch((error) => detail.respond?.({ error: error instanceof Error ? error.message : t.mapUnavailable }));
    };

    const chooseResource = (event: Event) => {
      const detail = (event as CustomEvent<ResourceChooseRequest>).detail;
      event.preventDefault();
      if (detail.kind !== "file" && detail.kind !== "pdf") {
        detail.respond({ error: t.unsupportedResource });
        return;
      }

      void chooseResourceFile(detail.kind)
        .then((result) => {
          if (result.error) {
            detail.respond({ error: result.error });
            return;
          }
          if (!result.path) {
            detail.respond({ canceled: true });
            return;
          }
          detail.respond({ path: result.path });
        })
        .catch((error) => detail.respond({ error: error instanceof Error ? error.message : t.resourceSelectionFailed }));
    };

    const openResource = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; file?: string; targetNodeId?: string }>).detail;
      if (!detail.file) return;
      if ((detail.kind === "portal" || detail.kind === "file") && isMarkdownResource(detail.file)) {
        void loadFile(detail.file).then(() => {
          if (detail.targetNodeId && useMindMapStore.getState().document?.nodes.has(detail.targetNodeId)) {
            useMindMapStore.getState().setSelectedNodeId(detail.targetNodeId);
          }
        });
        return;
      }
      if (detail.kind !== "file" && detail.kind !== "pdf") return;
      void readResource(detail.file).then((result) => {
        if ("error" in result) {
          console.error("[BloomMD] Resource open failed:", result.error);
          return;
        }
        window.open(result.dataUrl, "_blank", "noopener,noreferrer");
      }).catch((error) => console.error("[BloomMD] Resource open failed:", error));
    };
    window.addEventListener("bloommd:open-url", openUrl);
    window.addEventListener("bloommd:load-link-preview", loadLinkPreview);
    window.addEventListener("bloommd:list-maps", listMaps);
    window.addEventListener("bloommd:load-map-document", loadMapDocument);
    window.addEventListener("bloommd:choose-resource", chooseResource);
    window.addEventListener("bloommd:open-resource", openResource);
    return () => {
      window.removeEventListener("bloommd:open-url", openUrl);
      window.removeEventListener("bloommd:load-link-preview", loadLinkPreview);
      window.removeEventListener("bloommd:list-maps", listMaps);
      window.removeEventListener("bloommd:load-map-document", loadMapDocument);
      window.removeEventListener("bloommd:choose-resource", chooseResource);
      window.removeEventListener("bloommd:open-resource", openResource);
    };
  }, [loadFile, locale]);

  useEffect(() => {
    const previewResource = (event: Event) => {
      const detail = (event as CustomEvent<ResourcePreviewRequest>).detail;
      if (!detail.file || (detail.kind !== "file" && detail.kind !== "pdf")) {
        detail.respond({ error: t.previewUnavailable });
        return;
      }

      void readResource(detail.file)
        .then((result) => {
          if ("error" in result) {
            detail.respond({ error: result.error });
            return;
          }
          detail.respond({ url: result.dataUrl });
        })
        .catch((error) => detail.respond({ error: error instanceof Error ? error.message : t.resourcePreviewFailed }));
    };
    window.addEventListener("bloommd:preview-resource", previewResource);
    return () => window.removeEventListener("bloommd:preview-resource", previewResource);
  }, [locale, t.previewUnavailable, t.resourcePreviewFailed]);
  const reload = useCallback(async () => {
    if (currentFileRef.current) {
      await loadFile(currentFileRef.current);
    } else if (connectionMode === "local") {
      await loadWorkspace("reloadWorkspace");
    }
  }, [connectionMode, loadFile, loadWorkspace]);

  const refreshFileList = useCallback(async () => {
    const isCurrent = listRequests.current.begin();
    const result = await listMindmaps();
    if (!isCurrent()) return result.files;
    setFiles(result.files);
    setUnreadablePaths(result.unreadablePaths ?? []);
    setLocalLoadError(false);
    return result.files;
  }, []);

  const refreshRemoteWorkspaces = useCallback(async () => {
    const context = await listRemoteWorkspaces();
    applyRemoteWorkspaceContext(context);
    return context;
  }, [applyRemoteWorkspaceContext]);

  /**
   * Picks up files other participants created on the server.
   *
   * `onFileChanged` watches the local filesystem, which covers local mode completely and remote
   * mode not at all — the files live on the server there, and nothing tells this client that a
   * collaborator added one. Polling only while connected remotely and with the drawer open keeps
   * it to the situation where a stale list is actually visible.
   */
  useEffect(() => {
    if (connectionMode !== "remote" || !drawerOpen) return;
    const interval = window.setInterval(() => {
      void refreshFileList().catch((error) => {
        console.error("[BloomMD] Remote file list refresh failed:", error);
        setWorkspaceError(error instanceof Error ? error.message : t.filesLoadFailed);
      });
      void refreshRemoteWorkspaces().catch((error) => {
        console.error("[BloomMD] Remote workspace refresh failed:", error);
        setWorkspaceError(error instanceof Error ? error.message : t.workspacesLoadFailed);
      });
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [connectionMode, drawerOpen, refreshFileList, refreshRemoteWorkspaces, locale]);

  const [createKind, setCreateKind] = useState<CreateEntryKind | null>(null);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);

  const assertRemoteWriteAccess = useCallback(() => {
    if (connectionMode === "remote") {
      if (!activeRemoteWorkspace) {
        useMindMapStore.getState().setStatusMessage(t.workspaceAccessLoading);
        return false;
      }
      if (activeRemoteWorkspace.role === "viewer") {
        useMindMapStore.getState().setStatusMessage(t.workspaceReadOnly);
        return false;
      }
    }
    return true;
  }, [activeRemoteWorkspace?.role, connectionMode, t.workspaceAccessLoading, t.workspaceReadOnly]);

  const createAndOpenFile = useCallback(async (filename: string, markdown: string) => {
    const isCurrent = documentRequests.current.begin();
    creatingFileRef.current = isCurrent;
    try {
      const result = await createMindmap(filename, markdown);
      if (!isCurrent()) return null;
      const doc: MindMapDocument = {
        ...result,
        nodes: new Map(Object.entries(result.nodes)),
        references: result.references,
        derived: result.derived,
        rawMarkdown: "",
      };
      useMindMapStore.getState().disconnectSync();
      currentFileRef.current = filename;
      setActiveLocalFilename(filename);
      setSharedDocument(null);
      clearForwardNavigation();
      persistedFileRef.current = { filePath: doc.filePath, content: documentContentKey(doc) };
      setDocument(doc);
      return doc;
    } finally {
      if (creatingFileRef.current === isCurrent) creatingFileRef.current = null;
    }
  }, [clearForwardNavigation, setDocument]);

  /**
   * Creates a folder or a Markdown file in the local workspace.
   *
   * Only the local mode reaches this: a remote workspace stores flat filenames, so the RPC refuses
   * rather than pretending it worked.
   */
  const handleCreateEntry = useCallback(async (kind: CreateEntryKind, path: string, templateContent?: string) => {
    if (!assertRemoteWriteAccess()) return;
    if (kind === "folder") {
      await createFolder(path);
      setKnownFolders((await listFolders()).folders);
      return;
    }
    const name = path.split("/").pop()?.replace(/\.md$/i, "") ?? "Neu";
    const now = new Date().toISOString();
    const body = templateContent ?? `# ${name}\n`;
    // A template that brings its own frontmatter keeps it; otherwise the usual BloomMD header is added.
    const markdown = /^---\r?\n/.test(body)
      ? body
      : `---\ntitle: ${name}\nid: ${crypto.randomUUID().slice(0, 8)}\ncreated: "${now}"\nupdated: "${now}"\n---\n\n${body}`;
    const result = await createAndOpenFile(path, markdown);
    if (!result) return;
    await refreshFileList();
    setTimeout(() => {
      if (currentFileRef.current === path) useMindMapStore.getState().setAutoEditNodeId(result.rootId);
    }, 200);
  }, [assertRemoteWriteAccess, createAndOpenFile, refreshFileList]);

  // Own templates are the .md files in the workspace folder `Vorlagen`; a remote workspace has none.
  const loadCustomTemplates = useCallback(async () => (await listTemplates()).templates, []);

  // Create new mindmap
  const handleCreateNew = useCallback(async () => {
    if (!assertRemoteWriteAccess()) return;
    const title = t.newMindmap;
    const slug = `mindmap-${Date.now()}`;
    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const markdown = `---\ntitle: ${title}\nid: ${id}\ncreated: "${now}"\nupdated: "${now}"\nlayout:\n  direction: LR\n---\n\n# ${title}\n`;
    const filename = `${slug}.md`;

    const doc = await createAndOpenFile(filename, markdown);
    if (!doc) return;
    if (connectionMode === "remote" && syncUrl) {
      await connectRemoteFileSync(filename);
    }
    await refreshFileList();

    setTimeout(() => {
      if (currentFileRef.current !== filename) return;
      const store = useMindMapStore.getState();
      store.setSelectedNodeId(doc.rootId);
      store.setAutoEditNodeId(doc.rootId);
    }, 200);
  }, [assertRemoteWriteAccess, createAndOpenFile, t, connectionMode, syncUrl, refreshFileList, connectRemoteFileSync]);

  const renameFileForTitle = useCallback(async (oldFilename: string, title: string): Promise<RenameResult> => {
    const newFilename = filenameForTitleInPath(oldFilename, title);
    const store = useMindMapStore.getState();
    const isActiveFile = currentFileRef.current === oldFilename;
    const activeDocument = isActiveFile ? store.document : null;
    const reconnectRemote = isActiveFile
      && connectionMode === "remote"
      && Boolean(syncUrl)
      && (store.syncProvider !== null || store.syncStatus !== "disconnected");
    let targetDocument = activeDocument;
    let renamedInactiveDocument: MindMapDocument | null = null;
    let previousTitle: string | undefined;
    let titleChanged = false;
    let titlePersistedBeforeRename = false;

    const persistRenamedDocument = async (documentToPersist: MindMapDocument | null) => {
      if (!documentToPersist || !titleChanged) return;
      const serializedDoc = {
        filePath: documentToPersist.filePath,
        frontmatter: documentToPersist.frontmatter,
        nodes: Object.fromEntries(documentToPersist.nodes),
        rootId: documentToPersist.rootId,
        preamble: documentToPersist.preamble,
      };
      const { markdown } = await serializeMindmap(serializedDoc);
      const persistedContent = documentContentKey(documentToPersist);
      const saved = await saveMindmap(documentToPersist.filePath, markdown, documentToPersist.storage);
      if (!saved.success) throw new Error(saved.error || "SAVE_FAILED");
      if (isActiveFile) persistedFileRef.current = { filePath: documentToPersist.filePath, content: persistedContent };
      if (saved.storage && isActiveFile) useMindMapStore.getState().setStorageMetadata(saved.storage);
      titlePersistedBeforeRename = true;
    };

    try {
      // A sidebar rename may target a file that is not open. Load that document so its root node
      // and frontmatter title are saved together with the filename.
      if (!targetDocument) {
        const data = await openMindmap(oldFilename);
        targetDocument = {
          ...data,
          nodes: new Map(Object.entries(data.nodes)),
          references: data.references,
          derived: data.derived,
          rawMarkdown: "",
        };
      }
      const root = targetDocument.nodes.get(targetDocument.rootId);
      previousTitle = root?.title ?? targetDocument.frontmatter.title;
      titleChanged = Boolean(previousTitle !== title || targetDocument.frontmatter.title !== title);
      if (titleChanged) {
        if (isActiveFile) {
          store.renameNode(targetDocument.rootId, title);
        } else {
          renamedInactiveDocument = documentWithRootTitle(targetDocument, title);
        }
      }

      // A title-only change does not need a file move. A connected remote room will persist it;
      // local mode writes it immediately so the explicit dialog still has transactional semantics.
      if (newFilename === oldFilename) {
        if (!reconnectRemote) {
          await persistRenamedDocument(isActiveFile ? useMindMapStore.getState().document : renamedInactiveDocument);
        }
        return { success: true, filename: oldFilename };
      }

      if (reconnectRemote) await store.disconnectSync();
      else await persistRenamedDocument(isActiveFile ? useMindMapStore.getState().document : renamedInactiveDocument);

      const result = await renameMindmap(oldFilename, newFilename);
      if (!result.success) throw new Error(result.error || "RENAME_FAILED");

      const actualFilename = result.newFilename || newFilename;
      if (forwardFileRef.current === oldFilename) {
        forwardFileRef.current = actualFilename;
        setForwardNavigationAvailable(true);
      }
      if (isActiveFile) {
        currentFileRef.current = actualFilename;
        setDocumentFilePath(result.newFilePath);
        if (persistedFileRef.current) persistedFileRef.current.filePath = result.newFilePath;
        if (result.version != null && store.document?.storage?.mode === "database") {
          store.setStorageMetadata({ ...store.document.storage, version: result.version });
        }
      }
      await refreshFileList().catch((refreshError) => {
        console.error("[BloomMD] File list refresh after rename failed:", refreshError);
      });
      if (reconnectRemote) await connectRemoteFileSync(actualFilename);
      return { success: true, filename: actualFilename };
    } catch (error) {
      console.error("[BloomMD] renameMindmap RPC error:", error);
      if (activeDocument && titleChanged && previousTitle) {
        store.renameNode(activeDocument.rootId, previousTitle);
      }
      if (titlePersistedBeforeRename) {
        try {
          if (isActiveFile && activeDocument) {
            await persistRenamedDocument(useMindMapStore.getState().document);
          } else if (renamedInactiveDocument && previousTitle) {
            await persistRenamedDocument(documentWithRootTitle(renamedInactiveDocument, previousTitle));
          }
        } catch (rollbackError) {
          console.error("[BloomMD] Failed to roll back persisted file title:", rollbackError);
        }
      }
      if (reconnectRemote) {
        try {
          await connectRemoteFileSync(oldFilename);
        } catch (reconnectError) {
          console.error("[BloomMD] Failed to reconnect after rename error:", reconnectError);
        }
      }
      const conflict = error instanceof Error && error.message === "DOCUMENT_NAME_CONFLICT";
      const message = conflict ? t.renameConflict : t.renameFailed;
      store.setStatusMessage(message);
      return { success: false, message };
    }
  }, [connectionMode, connectRemoteFileSync, refreshFileList, setDocumentFilePath, syncUrl, t.renameConflict, t.renameFailed]);

  const handleRootRename = useCallback(async ({ newTitle }: RootRenameEvent) => {
    const store = useMindMapStore.getState();
    const current = store.document;
    const filename = currentFileRef.current;
    if (!current || !filename || isWorkspaceMindMap(current)) {
      if (current) store.renameNode(current.rootId, newTitle);
      return;
    }
    await renameFileForTitle(filename, newTitle);
  }, [renameFileForTitle]);

  // Save
  const handleSaveFile = useCallback(async (doc: MindMapDocument) => {
    if (isWorkspaceMindMap(doc)) {
      useMindMapStore.getState().setStatusMessage(t.derivedWorkspaceSave);
      return;
    }
    if (!assertRemoteWriteAccess()) return;
    // A connected cloud room persists Yjs updates itself. A manual REST save is
    // only a disconnected fallback and therefore must keep optimistic versioning.
    if (connectionMode === "remote" && useMindMapStore.getState().syncStatus === "connected") return;
    const serializedDoc = {
      filePath: doc.filePath,
      frontmatter: doc.frontmatter,
      nodes: Object.fromEntries(doc.nodes),
      rootId: doc.rootId,
      preamble: doc.preamble,
    };
    const persistedContent = documentContentKey(doc);
    const { markdown } = await serializeMindmap(serializedDoc);
    const saved = await saveMindmap(doc.filePath, markdown, doc.storage);
    if (!saved.success) {
      throw new Error(
        saved.error === "VERSION_CONFLICT"
          ? t.documentConflict
          : saved.error === "SYNC_ROOM_ACTIVE" || saved.error === "SYNC_ROOM_PENDING"
              ? t.syncRoomActive
            : saved.error === "SYNC_ROOM_DEGRADED" || saved.error === "SYNC_ROOM_SAVE_FAILED"
              ? t.syncRoomSaveFailed
              : saved.error === "SYNC_MUTATION_UNAVAILABLE"
                ? t.syncRoomSaveFailed
            : t.fileSaveFailed,
      );
    }

    if (useMindMapStore.getState().document?.filePath !== doc.filePath) return;
    persistedFileRef.current = { filePath: doc.filePath, content: persistedContent };
    const oldFilename = currentFileRef.current;
    if (oldFilename && doc.frontmatter.title) {
      await renameFileForTitle(oldFilename, doc.frontmatter.title);
    }
  }, [assertRemoteWriteAccess, connectionMode, renameFileForTitle, t]);

  // Import
  const handleImportFile = useCallback(async () => {
    if (!assertRemoteWriteAccess()) return;
    const result = await importFile();
    if (!("frontmatter" in result)) return;
    const doc: MindMapDocument = {
      ...result,
      nodes: new Map(Object.entries(result.nodes)),
      references: result.references,
      derived: result.derived,
      rawMarkdown: "",
    };
    clearForwardNavigation();
    persistedFileRef.current = { filePath: doc.filePath, content: documentContentKey(doc) };
    setDocument(doc);
    const importedFilename = result.filePath.split("/").pop() || "";
    currentFileRef.current = importedFilename;
    if (connectionMode === "remote" && syncUrl && importedFilename) {
      await connectRemoteFileSync(importedFilename);
    }
    await refreshFileList();
  }, [assertRemoteWriteAccess, clearForwardNavigation, connectionMode, syncUrl, setDocument, refreshFileList, connectRemoteFileSync]);

  // Export
  const handleExportFile = useCallback(async () => {
    const doc = useMindMapStore.getState().document;
    if (!doc) return;
    if (isWorkspaceMindMap(doc)) {
      useMindMapStore.getState().setStatusMessage(t.derivedWorkspaceExport);
      return;
    }
    const serializedDoc = {
      filePath: doc.filePath,
      frontmatter: doc.frontmatter,
      nodes: Object.fromEntries(doc.nodes),
      rootId: doc.rootId,
      preamble: doc.preamble,
    };
    const { markdown } = await serializeMindmap(serializedDoc);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${doc.frontmatter.title || "mindmap"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Delete
  const handleDeleteMindmap = useCallback(async (filename: string) => {
    if (!assertRemoteWriteAccess()) return;

    const store = useMindMapStore.getState();
    const isActiveFile = currentFileRef.current === filename;
    const activeDocument = isActiveFile ? store.document : null;
    const reconnectRemote = Boolean(
      isActiveFile &&
        connectionMode === "remote" &&
        syncUrl &&
        (store.syncProvider !== null || store.syncStatus !== "disconnected"),
    );
    let deleteCompleted = false;

    try {
      if (reconnectRemote) {
        // The sync server rejects document mutations while this client still occupies the room.
        await store.disconnectSync();
      }

      await deleteMindmap(filename);
      deleteCompleted = true;
      const fileList = await refreshFileList();

      if (currentFileRef.current === filename) {
        if (fileList.length > 0) {
          await loadFile(fileList[0]!.filename);
        } else {
          store.setDocument(null);
          currentFileRef.current = null;
          reportE2EState({ source: "deleteMindmap", activeFile: null, emptyWorkspace: true });
        }
      } else if (isWorkspaceMindMap(store.document)) {
        if (fileList.length > 0) {
          await loadWorkspace("deleteMindmap");
        } else {
          store.setDocument(null);
          currentFileRef.current = null;
          reportE2EState({ source: "deleteMindmap", activeFile: null, emptyWorkspace: true, workspaceMode: true });
        }
      }
    } catch (error) {
      console.error("[BloomMD] Delete mindmap failed:", error);
      if (!deleteCompleted && reconnectRemote && activeDocument && currentFileRef.current === filename) {
        try {
          await connectRemoteFileSync(filename);
        } catch (reconnectError) {
          console.error("[BloomMD] Failed to reconnect after delete error:", reconnectError);
        }
      }
      const errorCode = error instanceof Error ? error.message : "";
      const message =
        errorCode === "SYNC_ROOM_ACTIVE" || errorCode === "SYNC_ROOM_PENDING"
          ? t.syncRoomActive
          : errorCode === "VERSION_CONFLICT"
            ? t.documentConflict
            : deleteCompleted
              ? t.filesLoadFailed
              : t.deleteFailed;
      store.setStatusMessage(message);
    }
  }, [assertRemoteWriteAccess, connectRemoteFileSync, connectionMode, deleteMindmap, loadFile, loadWorkspace, refreshFileList, reportE2EState, syncUrl, t.deleteFailed, t.documentConflict, t.filesLoadFailed, t.syncRoomActive]);

  // Rename from sidebar
  const handleRenameFromSidebar = useCallback((filename: string, title: string) => {
    if (!assertRemoteWriteAccess()) return;
    const store = useMindMapStore.getState();
    const currentTitle = currentFileRef.current === filename ? store.document?.frontmatter.title : undefined;
    setRenameError(null);
    setRenameTarget({ filename, title: currentTitle || title });
    setDrawerOpen(false);
  }, [assertRemoteWriteAccess]);

  const submitRename = useCallback(async (title: string) => {
    if (!renameTarget) return false;
    setRenameError(null);
    const result = await renameFileForTitle(renameTarget.filename, title);
    if (!result.success) {
      setRenameError(result.message);
      return false;
    }
    drawerRevealFilenameRef.current = result.filename;
    setRenameTarget(null);
    return true;
  }, [renameFileForTitle, renameTarget]);

  const refreshConnectionProfiles = useCallback(async () => {
    const result = await listConnectionProfiles();
    setConnectionProfiles(result.profiles);
    if (result.storageError) setProfileError(connectionProfileErrorMessage(result.storageError, t.connectionProfileSaveFailed));
    if (result.active.type === "remote") {
      setActiveProfileId(result.active.profileId);
      setRemoteUrl(result.active.url);
    } else {
      setActiveProfileId(null);
      setRemoteUrl("");
    }
    return result;
  }, [connectionProfileErrorMessage, t.connectionProfileSaveFailed]);

  // Validate the target first. The current sync provider is disconnected only after RPC success.
  const handleConnectProfile = useCallback(async (profileId: string) => {
    setConnecting(true);
    setProfileError(null);
    try {
      const result = await connectProfile(profileId);
      if (result.success) {
        useMindMapStore.getState().disconnectSync();
        setConnectionMode("remote");
        setActiveProfileId(profileId);
        setRemoteUrl(result.profile?.url ?? remoteUrl);
        setSyncUrl(result.syncUrl);
        applyRemoteWorkspaceContext({
          workspace: result.workspace ?? null,
          workspaces: result.workspaces ?? [],
        });
        const fileList = result.files ?? await refreshFileList();
        setFiles(fileList);
        if (fileList.length > 0) {
          await loadFile(fileList[0]!.filename, true);
        } else {
          setDocument(null);
          currentFileRef.current = null;
        }
        setReconnectFailedUrl(null);
        setReconnectFailedProfileId(null);
        setProfileDialogOpen(false);
        setConnectionSwitcherOpen(false);
        setProfileManagerOpen(false);
        await refreshConnectionProfiles();
      } else {
        setProfileError(connectionProfileErrorMessage(result.error, t.connectionFailed));
      }
    } catch (err) {
      setProfileError(connectionProfileErrorMessage(err instanceof Error ? err.message : undefined, t.connectionFailed));
    } finally {
      setConnecting(false);
    }
  }, [applyRemoteWorkspaceContext, connectionProfileErrorMessage, loadFile, refreshConnectionProfiles, refreshFileList, remoteUrl, setDocument, t.connectionFailed]);

  const handleSaveProfile = useCallback(async (input: { id?: string; name: string; url: string; accessToken?: string }, connect: boolean) => {
    setConnecting(true);
    setProfileError(null);
    try {
      const result = await saveConnectionProfile(input);
      if (!result.success || !result.profile) {
        setProfileError(connectionProfileErrorMessage(result.error, t.connectionProfileSaveFailed));
        return;
      }
      await refreshConnectionProfiles();
      if (connect) {
        await handleConnectProfile(result.profile.id);
      } else {
        setProfileDialogOpen(false);
      }
    } catch (err) {
      setProfileError(connectionProfileErrorMessage(err instanceof Error ? err.message : undefined, t.connectionProfileSaveFailed));
    } finally {
      setConnecting(false);
    }
  }, [connectionProfileErrorMessage, handleConnectProfile, refreshConnectionProfiles, t.connectionProfileSaveFailed]);

  const handleUseLocal = useCallback(async () => {
    setConnecting(true);
    setProfileError(null);
    try {
      const result = await useLocalConnection();
      if (!result.success) {
        setProfileError(t.connectionSwitchFailed);
        return;
      }
      useMindMapStore.getState().disconnectSync();
      setConnectionMode("local");
      setActiveProfileId(null);
      setRemoteUrl("");
      setSyncUrl("");
      setReconnectFailedUrl(null);
      setReconnectFailedProfileId(null);
      setRemoteWorkspaces([]);
      setActiveRemoteWorkspace(null);
      setWorkspaceError(null);
      setConnectionSwitcherOpen(false);
      const fileList = await refreshFileList();
      if (fileList.length > 0) await loadWorkspace("useLocalConnection");
      else {
        setDocument(null);
        currentFileRef.current = null;
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t.connectionSwitchFailed);
    } finally {
      setConnecting(false);
    }
  }, [loadWorkspace, refreshFileList, t.connectionSwitchFailed]);

  const handleDeleteProfile = useCallback(async (profile: DesktopConnectionProfile) => {
    if (!window.confirm(`${t.connectionProfileDeleteConfirm}\n\n${profile.name}`)) return;
    setProfileError(null);
    try {
      const result = await deleteConnectionProfile(profile.id);
      if (!result.success) {
        setProfileError(connectionProfileErrorMessage(result.error, t.connectionProfileDeleteFailed));
        return;
      }
      if (activeProfileId === profile.id) {
        useMindMapStore.getState().disconnectSync();
        setConnectionMode("local");
        setActiveProfileId(null);
        setRemoteUrl("");
        setSyncUrl("");
        const fileList = await refreshFileList();
        if (fileList.length > 0) await loadWorkspace("deleteConnectionProfile");
        else {
          setDocument(null);
          currentFileRef.current = null;
        }
      }
      await refreshConnectionProfiles();
    } catch (err) {
      setProfileError(connectionProfileErrorMessage(err instanceof Error ? err.message : undefined, t.connectionProfileDeleteFailed));
    }
  }, [activeProfileId, connectionProfileErrorMessage, loadWorkspace, refreshConnectionProfiles, refreshFileList, setDocument, t.connectionProfileDeleteConfirm, t.connectionProfileDeleteFailed]);

  const handleRemoteWorkspaceChange = useCallback(async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeRemoteWorkspace?.id || switchingWorkspace) return;
    const previousFilename = currentFileRef.current;
    setSwitchingWorkspace(true);
    setWorkspaceError(null);
    try {
      // Never keep a document's old room alive while the workspace context changes.
      useMindMapStore.getState().disconnectSync();
      currentFileRef.current = null;
      setDocument(null);

      const result = await selectRemoteWorkspace(workspaceId);
      applyRemoteWorkspaceContext(result);
      if (activeProfileId) {
        void setConnectionProfileWorkspace(activeProfileId, workspaceId).catch((error: unknown) => {
          console.error("[BloomMD] Connection profile workspace preference failed:", error);
        });
      }
      setFiles(result.files);
      const nextFilename = previousFilename && result.files.some((file) => file.filename === previousFilename)
        ? previousFilename
        : result.files[0]?.filename;
      if (nextFilename) {
        await loadFile(nextFilename, true);
      } else {
        setDocument(null);
        currentFileRef.current = null;
        reportE2EState({ source: "switchRemoteWorkspace", activeFile: null, emptyWorkspace: true, workspaceMode: true });
      }
    } catch (error) {
      console.error("[BloomMD] Remote workspace switch failed:", error);
      const switchError = error instanceof Error ? error.message : t.workspaceSwitchFailed;
      try {
        await refreshRemoteWorkspaces();
        const refreshedFiles = await refreshFileList();
        if (previousFilename && refreshedFiles.some((file) => file.filename === previousFilename)) {
          await loadFile(previousFilename, true);
        } else if (refreshedFiles.length > 0) {
          await loadFile(refreshedFiles[0]!.filename, true);
        } else {
          await loadWorkspace("workspaceSwitchFailed");
        }
      } catch (refreshError) {
        console.error("[BloomMD] Remote workspace refresh failed:", refreshError);
      }
      setWorkspaceError(switchError);
    } finally {
      setSwitchingWorkspace(false);
    }
  }, [activeProfileId, activeRemoteWorkspace?.id, applyRemoteWorkspaceContext, loadFile, loadWorkspace, refreshFileList, refreshRemoteWorkspaces, reportE2EState, setDocument, switchingWorkspace, t.workspaceSwitchFailed]);

  const handleChooseDirectory = useCallback(async () => {
    try {
      const result = await chooseDirectory();
      if (!result.path) {
        if (result.error) {
          console.error("[BloomMD] Folder switch failed:", result.error);
          setLocalLoadError(true);
        }
        return;
      }
      documentRequests.current.invalidate();
      listRequests.current.invalidate();
      fileChanges.current?.clear();
      setDocument(null);
      const fileList = await refreshFileList();
      if (fileList.length > 0) {
        await loadWorkspace("chooseDirectory");
      } else {
        setDocument(null);
        currentFileRef.current = null;
        reportE2EState({ source: "chooseDirectory", activeFile: null, emptyWorkspace: true });
      }
    } catch (error) {
      console.error("[BloomMD] Folder switch failed:", error);
      setLocalLoadError(true);
    }
  }, [loadWorkspace, refreshFileList, setDocument, reportE2EState]);

  const handleSubmitFeedback = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const type = feedbackDraft.type;
    const message = feedbackDraft.message.trim();
    const contactEmail = feedbackDraft.contactEmail.trim();
    const screenshotInput = form.elements.namedItem("screenshots") as HTMLInputElement | null;
    const videoInput = form.elements.namedItem("video") as HTMLInputElement | null;
    const screenshotFiles = Array.from(screenshotInput?.files ?? []);
    const videoFile = videoInput?.files?.[0] ?? null;

    if (message.length < 10) {
      setFeedbackResult({ kind: "error", message: t.feedbackMinLength });
      return;
    }
    if (screenshotFiles.length > 3) {
      setFeedbackResult({ kind: "error", message: t.feedbackMaxScreenshots });
      return;
    }
    if (screenshotFiles.some((file) => file.size > 10 * 1024 * 1024)) {
      setFeedbackResult({ kind: "error", message: t.feedbackScreenshotSize });
      return;
    }
    if (videoFile && videoFile.size > 50 * 1024 * 1024) {
      setFeedbackResult({ kind: "error", message: t.feedbackVideoSize });
      return;
    }

    setFeedbackSubmitting(true);
    setFeedbackResult(null);
    try {
      const selectedNode = selectedNodeId ? document?.nodes.get(selectedNodeId) ?? null : null;
      const result = await submitFeedback({
        type,
        message,
        contactEmail: contactEmail || null,
        formStartedAt: feedbackStartedAt,
        website: String(formData.get("website") || ""),
        attachments: await Promise.all(screenshotFiles.map(fileToFeedbackAttachment)),
        video: videoFile ? await fileToFeedbackAttachment(videoFile) : null,
        context: {
          currentFile: currentFileRef.current,
          documentTitle: document?.frontmatter.title ?? null,
          documentId: document?.frontmatter.id ?? null,
          selectedNodeId,
          selectedNodeType: selectedNode?.metadata?.kind ?? "topic",
          editorVisible,
          nodeCount: document?.nodes.size,
          referenceEdgeCount: document?.references?.length ?? 0,
          workspaceMode: Boolean(document && isWorkspaceMindMap(document)),
        },
      });
      if (!result.success) {
        setFeedbackResult({ kind: "error", message: result.error });
        return;
      }
      setFeedbackResult({ kind: "success", message: t.feedbackIssueCreated.replace("%number%", String(result.issueNumber)) });
      setFeedbackDraft(EMPTY_FEEDBACK_DRAFT);
      localStorage.removeItem(DESKTOP_FEEDBACK_DRAFT_KEY);
      form.reset();
    } catch (error) {
      setFeedbackResult({ kind: "error", message: error instanceof Error ? error.message : t.feedbackSendFailed });
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [document, editorVisible, feedbackDraft, feedbackStartedAt, selectedNodeId, t]);

  // Auto-focus sidebar list when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      const revealFilename = drawerRevealFilenameRef.current;
      const revealIdx = revealFilename ? files.findIndex((file) => file.filename === revealFilename) : -1;
      const activeIdx = files.findIndex((file) => fileEntryIsActive(file, document));
      setDrawerFocusIdx(revealIdx >= 0 ? revealIdx : activeIdx >= 0 ? activeIdx : 0);
      if (revealIdx >= 0) drawerRevealFilenameRef.current = null;
      setTimeout(() => drawerListRef.current?.focus(), 50);
    }
  }, [drawerOpen, files, document]);

  useEffect(() => {
    if (!drawerOpen || drawerFocusIdx < 0) return;
    const entries = drawerListRef.current?.querySelectorAll<HTMLElement>("[data-file-drawer-entry]");
    entries?.[drawerFocusIdx]?.scrollIntoView({ block: "nearest" });
  }, [drawerFocusIdx, drawerOpen, files.length]);

  useKeyboardShortcuts({
    onNew: () => toolbarRef.current?.triggerNew(),
    onImport: () => toolbarRef.current?.triggerImport(),
    onExport: () => toolbarRef.current?.triggerExport(),
    onSave: () => toolbarRef.current?.triggerSave(),
    onReload: reload,
    onToggleFileBrowser: () => setDrawerOpen((o) => !o),
    onToggleCommandPalette: () => setCommandPaletteOpen((open) => !open),
    onToggleHelp: () => setHelpOpen((o) => !o),
    onBackToWorkspace: () => {
      const current = useMindMapStore.getState().document;
      if (!current || isWorkspaceMindMap(current) || !currentFileRef.current || workspaceNavigationPending) return false;
      void handleReturnToWorkspace();
      return true;
    },
    onForwardToFile: () => {
      if (!forwardFileRef.current || workspaceNavigationPending || !isWorkspaceMindMap(useMindMapStore.getState().document)) return false;
      if (!files.some((file) => file.filename === forwardFileRef.current)) return false;
      void handleForwardToFile();
      return true;
    },
  });

  useEffect(() => {
    // Fetch initial connection mode from main process
    getConnectionMode().then((modeInfo) => {
      if (modeInfo.type === "remote") {
        setConnectionMode("remote");
        setActiveProfileId(modeInfo.profileId);
        setRemoteUrl(modeInfo.url);
        setSyncUrl(modeInfo.syncUrl);
        void listRemoteWorkspaces()
          .then(applyRemoteWorkspaceContext)
          .catch((error) => {
            console.error("[BloomMD] Remote workspace list failed:", error);
            setWorkspaceError(error instanceof Error ? error.message : t.workspacesLoadFailed);
          });
        return;
      }
      // Starting locally after a remembered server could not be reached looks like BloomMD forgot
      // the connection. Say what happened instead of leaving the user to guess.
      if (modeInfo.reconnectFailed) {
        setReconnectFailedUrl(modeInfo.reconnectFailed.url);
        setReconnectFailedProfileId(modeInfo.reconnectFailed.profileId);
      }
    });
    void refreshConnectionProfiles().catch((error) => console.error("[BloomMD] Connection profiles unavailable:", error));

    Promise.all([refreshFileList(), consumeExternalFile()]).then(async ([fileList, external]) => {
      const initial = external.kind === "file" && external.filename && fileList.some((file) => file.filename === external.filename)
        ? external.filename
        : null;
      if (initial) await loadFile(initial).then(() => reportExternalNode(external.nodeId));
      else if (external.kind === "folder" && fileList.length > 0) await loadWorkspace("initialExternalFolder");
      else if (fileList.length > 0) await loadWorkspace("initialLoad");
      else reportE2EState({ source: "initialLoad", activeFile: null, emptyWorkspace: true, workspaceMode: true });
    }).catch((error) => {
      console.error("[BloomMD] Initial workspace load failed:", error);
      setLocalLoadError(true);
    }).finally(() => setLoading(false));

    fileChanges.current?.clear();
    const queue = new FileChangeQueue(async (changedFiles) => {
      // Creating a file writes to disk before its RPC response reaches the renderer.
      // A watcher refresh during that gap must not reopen the workspace overview.
      if (creatingFileRef.current?.()) return;
      const navigationStillCurrent = documentRequests.current.capture();
      const updatedFiles = await refreshFileList();
      if (!navigationStillCurrent()) return;
      const filename = currentFileRef.current;
      const activeChanged = filename !== null && [...changedFiles].some((changed) => isChangedFileActive(filename, changed));
      if (activeChanged && !updatedFiles.some((file) => file.filename === filename)) {
        await loadWorkspace("activeFileRemoved");
        return;
      }
      if (activeChanged && filename) {
        const activeSharedMirror = sharedMirrorRef.current;
        if (activeSharedMirror?.localFilename === filename) {
          await openMindmap(filename)
            .then((data) => serializeToMarkdown({ ...data, nodes: new Map(Object.entries(data.nodes)), rawMarkdown: "" }))
            .then((markdown) => activeSharedMirror.mirror.handleLocalMarkdown(markdown))
            .then((result) => {
              if (result.kind === "conflict") console.warn("[BloomMD] Shared document needs conflict resolution before this local change can sync.");
              if (result.kind === "revoked") console.warn("[BloomMD] Shared document access was revoked; local changes stay local.");
            })
            .catch((error) => console.error("[BloomMD] Shared local file change could not be mirrored:", error));
          return;
        }
        await loadFile(filename, false, true, true);
      } else if (currentFileRef.current === null && connectionMode === "local") {
        await loadWorkspace("fileChanged");
      }
    }, (error) => {
      console.error("[BloomMD] External file change could not be loaded:", error);
      useMindMapStore.getState().setStatusMessage(t.filesLoadFailed);
    });
    fileChanges.current = queue;
    onFileChanged((filename) => queue.add(filename));

    onConnectionModeChanged((data) => {
      documentRequests.current.invalidate();
      listRequests.current.invalidate();
      fileChanges.current?.clear();
      setConnectionMode(data.type);
      if (data.type === "remote") {
        setActiveProfileId(data.profileId ?? null);
        setSyncUrl(data.syncUrl ?? "");
        void listRemoteWorkspaces()
          .then(applyRemoteWorkspaceContext)
          .catch((error) => console.error("[BloomMD] Remote workspace list failed:", error));
      } else {
        setActiveProfileId(null);
        setRemoteUrl("");
        setSyncUrl("");
        setReconnectFailedUrl(null);
        setReconnectFailedProfileId(null);
        setRemoteWorkspaces([]);
        setActiveRemoteWorkspace(null);
      }
    });

    onExternalFileOpened((external) => {
      documentRequests.current.invalidate();
      listRequests.current.invalidate();
      fileChanges.current?.clear();
      setDocument(null);
      setConnectionMode("local");
      setActiveProfileId(null);
      setRemoteUrl("");
      setSyncUrl("");
      setReconnectFailedUrl(null);
      setReconnectFailedProfileId(null);
      // A folder open has no file to show: reload the list and render the workspace map.
      void refreshFileList().then((files) => {
        if (external.kind === "file" && external.filename) {
          void loadFile(external.filename).then(() => reportExternalNode(external.nodeId));
        } else if (external.kind === "folder" && files.length > 0) {
          loadWorkspace("externalFileOpened");
        } else {
          useMindMapStore.getState().setDocument(null);
          currentFileRef.current = null;
          setActiveLocalFilename(null);
          reportE2EState({ source: "externalFileOpened", activeFile: null, emptyWorkspace: true, workspaceMode: true });
        }
      });
    });
  }, [locale, refreshConnectionProfiles]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50" data-testid="app-loading">
        <div className="text-gray-400 text-lg">{t.loading}</div>
      </div>
    );
  }

  const canReturnToWorkspace = Boolean(document && !isWorkspaceMindMap(document) && files.length > 0);
  // App restoration and external-file handoff can supply a document before the
  // renderer's active-file ref has been populated. The list entry is the same
  // canonical relative filename used by sharing, so it is a safe reactive
  // fallback for the document header.
  const activeDocumentFilename = files.find((entry) => fileEntryIsActive(entry, document))?.filename
    ?? activeLocalFilename
    ?? null;
  const canForwardToFile = Boolean(
    document &&
    isWorkspaceMindMap(document) &&
    forwardNavigationAvailable &&
    forwardFileRef.current &&
    files.some((file) => file.filename === forwardFileRef.current),
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--color-surface)]" data-testid="app-shell">
      {connectionMode === "local" && (localLoadError || unreadablePaths.length > 0) && (
        <div role="alert" data-testid="local-workspace-load-error" className="shrink-0 max-h-36 overflow-auto border-b border-orange-500 p-3 text-sm">
          <p>{localLoadError ? t.filesLoadFailed : t.workspaceEntriesSkipped}</p>
          {unreadablePaths.length > 0 && <ul>{unreadablePaths.map((path) => <li key={path}>{path}</li>)}</ul>}
        </div>
      )}
      {/* Header */}
      <header className="h-13 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center px-4 shrink-0" data-testid="desktop-header">
        <button
          type="button"
          data-testid="file-browser-toggle"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="mr-3 p-2 rounded-lg hover:bg-[var(--color-surface-sunken)] transition-colors text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          title={`${t.openFileBrowser} (Cmd+O)`}
          aria-label={t.openFileBrowser}
        >
          <Menu size={18} />
        </button>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 80" className="h-7">
          <defs>
            <linearGradient id="bloom-logo" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{stopColor:'#FF6B35'}}/>
              <stop offset="100%" style={{stopColor:'#F7931E'}}/>
            </linearGradient>
          </defs>
          <g transform="translate(8, 12)">
            <rect x="14" y="2" width="6" height="50" rx="3" fill="var(--color-ink)"/>
            <rect x="30" y="2" width="6" height="50" rx="3" fill="var(--color-ink)"/>
            <rect x="2" y="14" width="46" height="6" rx="3" fill="url(#bloom-logo)"/>
            <rect x="2" y="32" width="46" height="6" rx="3" fill="url(#bloom-logo)"/>
            <circle cx="48" cy="5" r="4" fill="url(#bloom-logo)" opacity="0.85"/>
          </g>
          <text x="72" y="52" fontFamily="'Outfit', 'Helvetica Neue', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', sans-serif" fontSize="38" fontWeight="700" fill="var(--color-ink)" letterSpacing="-0.5">
            Bloom<tspan fontWeight="400" fill="var(--color-ink-muted)">MD</tspan>
          </text>
        </svg>
        {document && (
          <div className="ml-3 flex items-center gap-2">
            {(canReturnToWorkspace || canForwardToFile) && (
              <div className="inline-flex items-center gap-1" role="group" aria-label={t.workspace}>
                <button
                  type="button"
                  data-testid="back-to-workspace"
                  onClick={() => { void handleReturnToWorkspace(); }}
                  disabled={!canReturnToWorkspace || workspaceNavigationPending}
                  title={`${t.backToWorkspace} (Cmd/Ctrl+←)`}
                  aria-label={t.backToWorkspace}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  type="button"
                  data-testid="forward-to-file"
                  onClick={() => { void handleForwardToFile(); }}
                  disabled={!canForwardToFile || workspaceNavigationPending}
                  title={`${t.forwardToFile} (Cmd/Ctrl+→)`}
                  aria-label={t.forwardToFile}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <span className="text-sm text-[var(--color-ink-faint)] font-[var(--font-display,Outfit,sans-serif)]" data-testid="document-title">
              {document.frontmatter.title}
            </span>
            {connectionMode === "remote" && <SyncStatus />}
            {connectionMode === "local" && activeDocumentFilename && !isWorkspaceMindMap(document) && (
              <button
                type="button"
                data-testid="desktop-share-local-document"
                onClick={() => setSharedDocumentDialogOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                title={sharedDocument ? (locale === "de" ? "Freigabe dieser lokalen Datei verwalten" : "Manage this local file's share") : (locale === "de" ? "Diese lokale Datei teilen" : "Share this local file")}
              >
                {sharedDocument ? <Link2Off size={13} /> : <CloudUpload size={13} />}
                {sharedDocument
                  ? (locale === "de" ? `Geteilt · ${sharedDocumentStateLabel(sharedDocument.connectionState, locale)}` : `Shared · ${sharedDocumentStateLabel(sharedDocument.connectionState, locale)}`)
                  : (locale === "de" ? "Datei teilen" : "Share file")}
              </button>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Toolbar
            ref={toolbarRef}
            onReload={reload}
            onToggleHelp={() => setHelpOpen((o) => !o)}
            onOpenAbout={() => setAboutOpen(true)}
            onToggleCommandPalette={() => setCommandPaletteOpen((open) => !open)}
            onOpenFeedback={openFeedbackDialog}
            feedbackTestId="desktop-open-feedback"
            onCreateFolder={connectionMode !== "remote" ? () => {
              void listFolders().then((result) => setKnownFolders(result.folders));
              setCreateKind("folder");
            } : undefined}
            onCreateFromTemplate={connectionMode !== "remote" ? () => {
              void listFolders().then((result) => setKnownFolders(result.folders));
              setCreateKind("file");
            } : undefined}
            onCreateNew={handleCreateNew}
            onSaveFile={handleSaveFile}
            onImportFile={handleImportFile}
            onExportFile={handleExportFile}
          />
        </div>
      </header>

      {createKind && (
        <CreateEntryDialog
          kind={createKind}
          folders={knownFolders}
          onClose={() => setCreateKind(null)}
          loadCustomTemplates={loadCustomTemplates}
          onCreate={async (path, content) => {
            await handleCreateEntry(createKind, path, content);
            return path;
          }}
        />
      )}

      {/* Help Modal */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} showWorkspaceNavigationShortcut />
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        buildInfo={buildInfo}
        update={updateState ? {
          currentVersion: updateState.local.version,
          availableVersion: updateState.update.version || undefined,
          updateAvailable: updateState.update.updateAvailable,
          updateReady: updateState.update.updateReady,
          status: updateState.status?.status,
          message: updateState.status?.message,
          error: updateState.update.error || updateState.status?.details?.errorMessage,
          progress: updateState.status?.details?.progress,
        } : null}
        onCheckForUpdate={() => { void handleCheckForUpdate(); }}
        onDownloadUpdate={() => { void handleDownloadUpdate(); }}
        onApplyUpdate={() => { void handleApplyUpdate(); }}
        onOpenLink={openAboutLink}
      />
      <DesktopFeedbackDialog
        open={feedbackOpen}
        connectionMode={connectionMode}
        draft={feedbackDraft}
        submitting={feedbackSubmitting}
        result={feedbackResult}
        onDraftChange={setFeedbackDraft}
        onSubmit={handleSubmitFeedback}
        onClose={() => setFeedbackOpen(false)}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNew={() => toolbarRef.current?.triggerNew()}
        onSave={() => void toolbarRef.current?.triggerSave()}
        onImport={() => toolbarRef.current?.triggerImport()}
        onExport={() => toolbarRef.current?.triggerExport()}
        onReload={() => void reload()}
        onOpenMindmap={loadFile}
      />

      {profileDialogOpen && (
        <ConnectionProfileDialog
          profile={profileDialogProfile}
          onSave={(input, connect) => void handleSaveProfile(input, connect)}
          onClose={() => { setProfileDialogOpen(false); setProfileError(null); }}
          error={profileError}
          saving={connecting}
        />
      )}
      {profileManagerOpen && (
        <ConnectionProfileManager
          profiles={connectionProfiles}
          activeProfileId={activeProfileId}
          onAdd={() => { setProfileManagerOpen(false); setProfileDialogProfile(null); setProfileError(null); setProfileDialogOpen(true); }}
          onEdit={(profile) => { setProfileManagerOpen(false); setProfileDialogProfile(profile); setProfileError(null); setProfileDialogOpen(true); }}
          onConnect={(profileId) => void handleConnectProfile(profileId)}
          onDelete={(profile) => void handleDeleteProfile(profile)}
          onClose={() => { setProfileManagerOpen(false); setProfileError(null); }}
          error={profileError}
          connecting={connecting}
        />
      )}
      {sharedDocumentDialogOpen && activeDocumentFilename && document && !isWorkspaceMindMap(document) && (
        <SharedDocumentDialog
          localFilename={activeDocumentFilename}
          title={document.frontmatter.title}
          profiles={connectionProfiles.filter((profile) => profile.hasToken)}
          sharedDocument={sharedDocument}
          locale={locale}
          onClose={() => setSharedDocumentDialogOpen(false)}
          onChanged={() => { void handleSharedDocumentChanged().catch((error) => console.error("[BloomMD] Shared document state could not be refreshed:", error)); }}
          onResolveConflict={resolveSharedDocumentConflict}
        />
      )}

      {/* Main area */}
      {reconnectFailedUrl && (
        <div
          role="status"
          data-testid="reconnect-failed-banner"
          className="flex items-center gap-3 border-b border-[var(--color-bloom-muted)] bg-[var(--color-bloom-light)] px-4 py-2 text-sm text-[var(--color-ink)] shrink-0"
        >
          <span className="flex-1">
            <strong className="font-semibold">{remoteUrl || reconnectFailedUrl}</strong> {t.reconnectFailedMessage}
          </span>
          <button
            type="button"
            onClick={() => {
              if (reconnectFailedProfileId) void handleConnectProfile(reconnectFailedProfileId);
              else setProfileManagerOpen(true);
            }}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
          >
            {t.reconnect}
          </button>
          {profileError && <span role="alert" className="text-xs text-red-700 dark:text-red-300">{profileError}</span>}
          <button
            type="button"
            onClick={() => setReconnectFailedUrl(null)}
            aria-label={t.dismissMessage}
            className="p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0" data-testid="desktop-main">
        {/* File drawer */}
        {drawerOpen && (
          <aside className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0 flex flex-col" data-testid="file-drawer">
            <div
              ref={drawerListRef}
              className="flex-1 overflow-y-auto p-2 outline-none"
              data-testid="file-drawer-list"
              tabIndex={0}
              onKeyDown={(e) => {
                if (files.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setDrawerFocusIdx((i) => Math.min(i + 1, files.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setDrawerFocusIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (drawerFocusIdx >= 0 && drawerFocusIdx < files.length) {
                    loadFile(files[drawerFocusIdx]!.filename);
                    setDrawerOpen(false);
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDrawerOpen(false);
                }
              }}
            >
              <div className="text-[10px] font-bold text-[#FF6B35] uppercase tracking-[0.15em] px-3 py-2">
                {t.mindmaps}
              </div>
              {files.map((entry, index) => {
                const isActive = fileEntryIsActive(entry, document);
                const isFocused = index === drawerFocusIdx;
                return (
                  <button
                    key={entry.filename}
                    type="button"
                    data-testid="file-drawer-item"
                    data-file-drawer-entry
                    onClick={() => {
                      loadFile(entry.filename);
                      setDrawerOpen(false);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, filename: entry.filename, title: entry.frontmatter.title });
                    }}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-xl mb-1 text-sm transition-all duration-150
                      ${isActive
                        ? "bg-[var(--color-bloom-light)] border border-[var(--color-bloom-muted)]"
                        : "hover:bg-[var(--color-surface-sunken)] border border-transparent"}
                      ${isFocused ? "ring-2 ring-[#FF6B35]/40" : ""}
                    `}
                  >
                    <div className={`font-semibold font-[var(--font-display,Outfit,sans-serif)] truncate ${isActive ? "text-[#FF6B35]" : "text-[var(--color-ink)]"}`}>
                      {entry.frontmatter.title}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-faint)] font-[var(--font-mono,monospace)] truncate mt-0.5">{entry.filename}</div>
                  </button>
                );
              })}
            </div>

            {/* Sidebar footer: the active source is always one explicit switcher. */}
            <div className="relative p-2 border-t border-[var(--color-border)] space-y-1">
              <button
                type="button"
                data-testid="connection-switcher"
                aria-expanded={connectionSwitcherOpen}
                onClick={() => setConnectionSwitcherOpen((open) => !open)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] transition-all duration-150"
              >
                {connectionMode === "remote" ? <Globe size={16} className="text-green-500 shrink-0" /> : <FolderOpen size={16} className="text-[#FF6B35] shrink-0" />}
                <span className="min-w-0 flex-1 truncate text-left">
                  {connectionMode === "remote"
                    ? connectionProfiles.find((profile) => profile.id === activeProfileId)?.name || remoteUrl
                    : t.localWorkspace}
                </span>
                <span className="text-[10px] text-[var(--color-ink-faint)]">⌄</span>
              </button>
              {connectionSwitcherOpen && (
                <div className="absolute bottom-full left-2 right-2 z-30 mb-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-xl" data-testid="connection-switcher-menu">
                  <button
                    type="button"
                    onClick={() => void handleUseLocal()}
                    disabled={connectionMode === "local" || connecting}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
                  >
                    <FolderOpen size={15} /> {t.localWorkspace}
                  </button>
                  {connectionProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => void handleConnectProfile(profile.id)}
                      disabled={profile.id === activeProfileId || connecting}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
                    >
                      <Server size={15} className="text-[#FF6B35]" />
                      <span className="min-w-0 flex-1 truncate">{profile.name}</span>
                      {profile.id === activeProfileId && <span className="text-xs text-green-500">●</span>}
                    </button>
                  ))}
                  <div className="my-1 border-t border-[var(--color-border)]" />
                  <button
                    type="button"
                    onClick={() => { setProfileDialogProfile(null); setProfileError(null); setProfileDialogOpen(true); setConnectionSwitcherOpen(false); }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)]"
                  >
                    <Plus size={15} /> {t.connectionProfileAdd}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setProfileManagerOpen(true); setProfileError(null); setConnectionSwitcherOpen(false); }}
                    className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-sunken)]"
                  >
                    <Server size={15} /> {t.connectionProfileManage}
                  </button>
                  {profileError && (
                    <div role="alert" className="mx-2 my-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:bg-red-900/20">
                      {profileError}
                    </div>
                  )}
                </div>
              )}
              {connectionMode === "remote" ? (
                <>
                  <label className="block px-2 py-1.5" data-testid="desktop-workspace-selector-label">
                    <span className="mb-1 block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                      {t.workspace}
                    </span>
                    <select
                      data-testid="desktop-workspace-selector"
                      value={activeRemoteWorkspace?.id ?? ""}
                      disabled={switchingWorkspace || remoteWorkspaces.length === 0}
                      onChange={(event) => void handleRemoteWorkspaceChange(event.target.value)}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-xs text-[var(--color-ink)] disabled:cursor-wait disabled:opacity-60"
                    >
                      {remoteWorkspaces.length === 0 && <option value="">{t.workspacesLoading}</option>}
                      {remoteWorkspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name} · {workspaceRoleLabel(workspace.role, t)}
                        </option>
                      ))}
                    </select>
                    {activeRemoteWorkspace && (
                      <span className="mt-1 block px-1 text-[11px] text-[var(--color-ink-faint)]" data-testid="desktop-workspace-role">
                        {t.role}: {workspaceRoleLabel(activeRemoteWorkspace.role, t)}
                      </span>
                    )}
                    {workspaceError && (
                      <span className="mt-1 block px-1 text-[11px] text-red-600" role="alert" data-testid="desktop-workspace-error">
                        {workspaceError}
                      </span>
                    )}
                  </label>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="change-folder"
                    onClick={handleChooseDirectory}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] transition-all duration-150"
                  >
                    <FolderOpen size={16} />
                    <span>{t.changeFolder}</span>
                  </button>
                </>
              )}
            </div>
          </aside>
        )}

        {/* Canvas + Editor */}
        <div className="flex-1 h-full">
          {document ? (
            <MindMapCanvas onlyRenderVisibleElements onRootRename={handleRootRename} />
          ) : (
            <div className="flex h-full items-center justify-center bg-[var(--color-surface)] px-6" data-testid="empty-workspace">
              <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 text-center shadow-sm">
                <FolderOpen className="mx-auto mb-4 text-[#FF6B35]" size={32} />
                <h2 className="font-[var(--font-display,Outfit,sans-serif)] text-xl font-semibold text-[var(--color-ink)]">
                  {t.noMarkdownFiles}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {t.emptyWorkspace}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    data-testid="empty-create-file"
                    onClick={() => toolbarRef.current?.triggerNew()}
                    className="rounded-md bg-[#FF6B35] px-3 py-2 text-sm font-semibold text-white hover:bg-[#E95A24]"
                  >
                    {t.createMarkdown}
                  </button>
                  <button
                    type="button"
                    data-testid="empty-import-file"
                    onClick={() => toolbarRef.current?.triggerImport()}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                  >
                    {t.importMd}
                  </button>
                  <button
                    type="button"
                    data-testid="empty-change-folder"
                    onClick={handleChooseDirectory}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                  >
                    {t.changeFolder}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {selectedNodeId && editorVisible && <ResizableEditor />}
      </div>

      {/* File context menu */}
      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filename={contextMenu.filename}
          title={contextMenu.title}
          onShare={connectionMode === "local" ? (filename) => { void handleShareFromSidebar(filename); } : undefined}
          onRename={handleRenameFromSidebar}
          onDelete={handleDeleteMindmap}
          onClose={() => setContextMenu(null)}
        />
      )}
      {renameTarget && (
        <Suspense fallback={null}>
          <RenameMindmapDialog
            open
            filename={renameTarget.filename}
            title={renameTarget.title}
            error={renameError}
            onSubmit={submitRename}
            onClose={() => { setRenameTarget(null); setRenameError(null); }}
          />
        </Suspense>
      )}
    </div>
  );
}

function DesktopFeedbackDialog({
  open,
  connectionMode,
  draft,
  submitting,
  result,
  onDraftChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  connectionMode: "local" | "remote";
  draft: DesktopFeedbackDraft;
  submitting: boolean;
  result: { kind: "success" | "error"; message: string } | null;
  onDraftChange: (draft: DesktopFeedbackDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      // A parent render or native webview update may briefly return focus to <body>. Restore it
      // only in that case; deliberate focus changes to another form control remain untouched.
      if (document.activeElement === document.body || document.activeElement === null) {
        messageRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draft, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" data-testid="desktop-feedback-dialog">
      <div className="w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-xl">
        <div className="flex items-start gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div className="rounded-lg bg-[var(--color-bloom-light)] p-2 text-[#FF6B35]">
            <MessageSquare size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-[var(--font-display,Outfit,sans-serif)] text-xl font-semibold text-[var(--color-ink)]">
              {t.feedbackTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
              {t.feedbackDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.feedbackType}</span>
              <select
                name="type"
                value={draft.type}
                onChange={(event) => onDraftChange({ ...draft, type: event.target.value as DesktopFeedbackType })}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"
              >
                <option value="bug">{t.feedbackBug}</option>
                <option value="ux">{t.feedbackUx}</option>
                <option value="idea">{t.feedbackIdea}</option>
                <option value="question">{t.feedbackQuestion}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.feedbackContactOptional}</span>
              <input
                type="email"
                name="contactEmail"
                value={draft.contactEmail}
                onChange={(event) => onDraftChange({ ...draft, contactEmail: event.target.value })}
                placeholder={connectionMode === "remote" ? t.feedbackAccountUsed : t.feedbackEmailPlaceholder}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.feedbackDescriptionLabel}</span>
            <textarea
              ref={messageRef}
              name="message"
              value={draft.message}
              onChange={(event) => onDraftChange({ ...draft, message: event.target.value })}
              autoFocus
              data-testid="desktop-feedback-message"
              required
              minLength={10}
              rows={6}
              placeholder={t.feedbackDescriptionPlaceholder}
              className="mt-1 w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-6 text-[var(--color-ink)]"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.feedbackScreenshotsOptional}</span>
              <input
                type="file"
                name="screenshots"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-muted)]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[var(--color-ink-muted)]">{t.feedbackVideoOptional}</span>
              <input
                type="file"
                name="video"
                accept="video/mp4,video/webm,video/quicktime"
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-muted)]"
              />
            </label>
          </div>
          {connectionMode === "local" && (
            <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-muted)]">
              {t.feedbackLocalNote}
            </p>
          )}
          {result && (
            <p
              role="status"
              className={`rounded-md px-3 py-2 text-sm ${
                result.kind === "success"
                  ? "border border-green-200 bg-green-50 text-green-800"
                  : "border border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {result.message}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              data-testid="desktop-submit-feedback"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-[#FF6B35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E95A24] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} />
              {submitting ? t.feedbackSending : t.feedbackSend}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SharedDocumentDialog({
  localFilename,
  title,
  profiles,
  sharedDocument,
  locale,
  onClose,
  onChanged,
  onResolveConflict,
}: {
  localFilename: string;
  title: string;
  profiles: DesktopConnectionProfile[];
  sharedDocument: DesktopSharedDocumentInfo | null;
  locale: "de" | "en";
  onClose: () => void;
  onChanged: () => void;
  onResolveConflict: (source: "local" | "cloud") => Promise<void>;
}) {
  const de = locale === "de";
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceInfo[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [cloudFilename, setCloudFilename] = useState(localFilename.split("/").pop() ?? localFilename);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sharedDocument || !profileId) return;
    let disposed = false;
    setLoadingWorkspaces(true);
    setError(null);
    void listProfileWorkspaces(profileId)
      .then((context) => {
        if (disposed) return;
        setWorkspaces(context.workspaces);
        setWorkspaceId((current) => context.workspaces.some((workspace) => workspace.id === current)
          ? current
          : context.workspace?.id ?? context.workspaces[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setWorkspaces([]);
          setWorkspaceId("");
          setError(cause instanceof Error ? cause.message : (de ? "Workspaces konnten nicht geladen werden." : "Workspaces could not be loaded."));
        }
      })
      .finally(() => {
        if (!disposed) setLoadingWorkspaces(false);
      });
    return () => { disposed = true; };
  }, [de, profileId, sharedDocument]);

  const submitShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileId || !workspaceId || !cloudFilename.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await shareLocalMindmap({
        localFilename,
        profileId,
        workspaceId,
        cloudFilename: cloudFilename.trim(),
      });
      if (!result.success) throw new Error(result.error || (de ? "Die Datei konnte nicht geteilt werden." : "The file could not be shared."));
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (de ? "Die Datei konnte nicht geteilt werden." : "The file could not be shared."));
    } finally {
      setSubmitting(false);
    }
  };

  const submitUnshare = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await unshareLocalMindmap(localFilename);
      if (!result.success) throw new Error(result.error || (de ? "Die Freigabe konnte nicht getrennt werden." : "The share could not be disconnected."));
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (de ? "Die Freigabe konnte nicht getrennt werden." : "The share could not be disconnected."));
    } finally {
      setSubmitting(false);
    }
  };

  const resolveConflict = async (source: "local" | "cloud") => {
    setSubmitting(true);
    setError(null);
    try {
      await onResolveConflict(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (de ? "Der Konflikt konnte nicht aufgelöst werden." : "The conflict could not be resolved."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label={de ? "Lokale Datei teilen" : "Share local file"}>
      <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-primary)]"><CloudUpload size={18} /><span className="text-xs font-bold uppercase tracking-[0.16em]">{de ? "Bewusst teilen" : "Explicit share"}</span></div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">{de ? "Lokale Datei mit Workspace teilen" : "Share local file with a workspace"}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]" aria-label={de ? "Schließen" : "Close"}><X size={19} /></button>
        </div>

        {sharedDocument ? (
          <div className="space-y-5 px-6 py-5">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-4 text-sm">
              <div className="flex items-center justify-between gap-4"><span className="font-semibold text-[var(--color-ink)]">{de ? "Freigabestatus" : "Share status"}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${sharedDocument.connectionState === "connected" ? "bg-emerald-500/15 text-emerald-500" : sharedDocument.connectionState === "revoked" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"}`}>{sharedDocumentStateLabel(sharedDocument.connectionState, locale)}</span></div>
              <dl className="mt-3 grid gap-2 text-[var(--color-ink-muted)]"><div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Profil: " : "Profile: "}</dt><dd className="inline">{sharedDocument.profileName}</dd></div><div><dt className="inline font-medium text-[var(--color-ink)]">{de ? "Cloud-Datei: " : "Cloud file: "}</dt><dd className="inline font-mono text-xs">{sharedDocument.cloudFilename}</dd></div></dl>
            </div>
            {sharedDocument.connectionState === "conflict" && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-[var(--color-ink-muted)]"><p className="font-semibold text-[var(--color-ink)]">{de ? "Lokale und Cloud-Version unterscheiden sich." : "The local and cloud versions differ."}</p><p className="mt-2 leading-6">{de ? "BloomMD hat nichts automatisch überschrieben. Wähle bewusst, welche Version weitergeführt werden soll." : "BloomMD has not overwritten either version automatically. Choose deliberately which version to continue with."}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={submitting} onClick={() => void resolveConflict("cloud")} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50">{de ? "Cloud-Version verwenden" : "Use cloud version"}</button><button type="button" disabled={submitting} onClick={() => void resolveConflict("local")} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">{submitting ? (de ? "Wird übernommen …" : "Applying …") : (de ? "Lokale Version beibehalten" : "Keep local version")}</button></div><p className="mt-3 text-xs leading-5 text-[var(--color-ink-faint)]">{de ? "Die nicht gewählte Version wird dabei nicht als zusätzliche Kopie angelegt." : "The version you do not choose is not saved as an additional copy."}</p></div>}
            <p className="text-sm leading-6 text-[var(--color-ink-muted)]">{de ? "Beim Trennen bleibt diese lokale Markdown-Datei unverändert erhalten. Das Cloud-Dokument wird nicht gelöscht." : "Disconnecting keeps this local Markdown file unchanged. The cloud document is not deleted."}</p>
            {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]">{de ? "Schließen" : "Close"}</button><button type="button" disabled={submitting} onClick={() => void submitUnshare()} className="inline-flex items-center gap-2 rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"><Link2Off size={15} />{submitting ? (de ? "Trenne …" : "Disconnecting …") : (de ? "Freigabe trennen" : "Disconnect share")}</button></div>
          </div>
        ) : (
          <form className="space-y-5 px-6 py-5" onSubmit={(event) => void submitShare(event)}>
            <p className="text-sm leading-6 text-[var(--color-ink-muted)]">{de ? "Nur diese Datei wird nach deiner Bestätigung in den gewählten Workspace hochgeladen. Der lokale Ordner und andere Dateien bleiben privat." : "Only this file is uploaded to the selected workspace after confirmation. Your local folder and other files remain private."}</p>
            {profiles.length === 0 ? <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">{de ? "Lege zuerst unter Server-Verbindungen ein Profil mit persönlichem Zugriffstoken an." : "First create a server profile with a personal access token."}</p> : <>
              <label className="block text-sm font-medium text-[var(--color-ink)]">{de ? "Server-Profil" : "Server profile"}<select value={profileId} onChange={(event) => setProfileId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-ink)]">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.url}</option>)}</select></label>
              <label className="block text-sm font-medium text-[var(--color-ink)]">{de ? "Workspace" : "Workspace"}<select value={workspaceId} disabled={loadingWorkspaces || workspaces.length === 0} onChange={(event) => setWorkspaceId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-ink)]"><option value="">{loadingWorkspaces ? (de ? "Workspaces werden geladen …" : "Loading workspaces …") : (de ? "Workspace wählen" : "Choose workspace")}</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id} disabled={workspace.role === "viewer"}>{workspace.name} · {workspace.role}</option>)}</select></label>
              <label className="block text-sm font-medium text-[var(--color-ink)]">{de ? "Cloud-Dateiname" : "Cloud filename"}<input value={cloudFilename} onChange={(event) => setCloudFilename(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-sm text-[var(--color-ink)]" /></label>
            </>}
            {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]">{de ? "Abbrechen" : "Cancel"}</button><button type="submit" disabled={profiles.length === 0 || !workspaceId || !cloudFilename.trim() || submitting} className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><CloudUpload size={15} />{submitting ? (de ? "Wird geteilt …" : "Sharing …") : (de ? "Datei jetzt teilen" : "Share file")}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

function ConnectionProfileDialog({
  profile,
  onSave,
  onClose,
  error,
  saving,
}: {
  profile: DesktopConnectionProfile | null;
  onSave: (input: { id?: string; name: string; url: string; accessToken?: string }, connect: boolean) => void;
  onClose: () => void;
  error: string | null;
  saving: boolean;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(profile?.name ?? "");
  const [url, setUrl] = useState(profile?.url ?? "");
  const [accessToken, setAccessToken] = useState("");
  const submit = (connect: boolean) => {
    if (name.trim() && url.trim() && (accessToken.trim() || profile?.hasToken)) {
      onSave({ id: profile?.id, name: name.trim(), url: url.trim(), ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}) }, connect);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose} data-testid="connection-profile-dialog">
      <div className="w-[440px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[var(--color-ink)]">
            {profile ? t.connectionProfileEdit : t.connectionProfileAdd}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <label className="block text-xs font-medium text-[var(--color-ink-faint)]">
            {t.connectionProfileName}
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t.connectionProfileNamePlaceholder} autoFocus className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40" />
          </label>
          <label className="block text-xs font-medium text-[var(--color-ink-faint)]">
            {t.serverUrl}
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://bloommd.example.com" required className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40" />
          </label>
          <label className="block text-xs font-medium text-[var(--color-ink-faint)]">
            {t.accessToken}
            <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder={profile?.hasToken ? t.connectionProfileTokenStored : "bloom_pat_..."} autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/40" />
          </label>
          {error && <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => submit(false)} disabled={saving || !name.trim() || !url.trim() || (!accessToken.trim() && !profile?.hasToken)} className="flex-1 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50">{t.connectionProfileSave}</button>
            <button type="button" onClick={() => submit(true)} disabled={saving || !name.trim() || !url.trim() || (!accessToken.trim() && !profile?.hasToken)} className="flex-1 rounded-xl bg-[#FF6B35] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#e55a25] disabled:opacity-50">{saving ? t.connecting : t.connectionProfileSaveAndConnect}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionProfileManager({
  profiles,
  activeProfileId,
  onAdd,
  onEdit,
  onConnect,
  onDelete,
  onClose,
  error,
  connecting,
}: {
  profiles: DesktopConnectionProfile[];
  activeProfileId: string | null;
  onAdd: () => void;
  onEdit: (profile: DesktopConnectionProfile) => void;
  onConnect: (profileId: string) => void;
  onDelete: (profile: DesktopConnectionProfile) => void;
  onClose: () => void;
  error: string | null;
  connecting: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose} data-testid="connection-profile-manager">
      <div className="w-[500px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[var(--color-ink)]">{t.connectionProfileManage}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]"><X size={18} /></button>
        </div>
        {profiles.length === 0 ? <p className="py-4 text-sm text-[var(--color-ink-faint)]">{t.connectionProfileEmpty}</p> : (
          <div className="space-y-2">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3">
                <Server size={18} className="shrink-0 text-[#FF6B35]" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[var(--color-ink)]">{profile.name}{profile.id === activeProfileId ? " · ●" : ""}</div><div className="truncate text-xs text-[var(--color-ink-faint)]">{profile.url}</div></div>
                <button type="button" title={t.connectionProfileEdit} onClick={() => onEdit(profile)} className="rounded-lg p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)]"><Pencil size={15} /></button>
                <button type="button" title={t.connectionProfileDelete} onClick={() => onDelete(profile)} className="rounded-lg p-1.5 text-[var(--color-ink-faint)] hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                {profile.id !== activeProfileId && <button type="button" onClick={() => onConnect(profile.id)} disabled={connecting || !profile.hasToken} className="rounded-lg bg-[#FF6B35] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t.connect}</button>}
              </div>
            ))}
          </div>
        )}
        {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20">{error}</div>}
        <button type="button" onClick={onAdd} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] px-3 py-2.5 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"><Plus size={16} />{t.connectionProfileAdd}</button>
      </div>
    </div>
  );
}
