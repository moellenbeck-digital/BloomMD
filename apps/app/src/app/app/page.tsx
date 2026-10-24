"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Cloud,
  FolderOpen,
  HelpCircle,
  Info,
  Keyboard,
  Menu,
  MousePointer2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  MindMapCanvas,
  ResizableEditor,
  Toolbar,
  FileBrowser,
  WorkspaceMap,
  WorkspaceHealth,
  CreateEntryDialog,
  type CreateEntryKind,
  CommandPalette,
  HelpModal,
  AboutDialog,
  RenameMindmapDialog,
  SyncStatus,
  useMindMapStore,
  useKeyboardShortcuts,
  useLocale,
  type RootRenameEvent,
  useTheme,
  requestNodeFocus,
  type ToolbarHandle,
  type AboutBuildInfo,
  ConflictDialog,
} from "@bloommd/ui";
import {
  buildWorkspaceMindMap,
  filenameForTitleInPath,
  isWorkspaceMindMap,
  parseFile,
  serializeToMarkdown,
  type MindMapDocument,
  type MindMapListEntry,
  type MindMapNode,
  type WorkspaceFileInput,
} from "@bloommd/core/browser";
import {
  openBrowserWorkspace,
  supportsBrowserWorkspaces,
  type BrowserWorkspace,
  type BrowserWorkspaceEntry,
} from "@/lib/browser-workspace";
import { getBuildInfo, type BloomMDBuildInfo } from "@/lib/build-info";
import { createStarterMarkdown } from "@/lib/starter-markdown";
import { publicMarketingUrl } from "@/lib/deployment";
import { WorkspaceManager } from "./WorkspaceManager";
import { WorkspaceAgentPanel } from "./WorkspaceAgentPanel";
import { ShareLinksDialog } from "./ShareLinksDialog";

const ONBOARDING_STORAGE_KEY = "bloommd_onboarding_seen";
const OPEN_TABS_STORAGE_KEY = "bloommd_open_tabs";
const ACTIVE_WORKSPACE_STORAGE_KEY = "bloommd_active_workspace";
const docsUrl = `${publicMarketingUrl()}/docs`;
const appBuildInfo = getBuildInfo("app", { publicOnly: true });

function toAboutBuildInfo(buildInfo: BloomMDBuildInfo): AboutBuildInfo {
  return {
    product: buildInfo.product,
    package: buildInfo.packageName,
    deployment: buildInfo.deployment,
    version: buildInfo.version,
    sha: buildInfo.gitSha ?? "—",
    shortSha: buildInfo.shortSha ?? "—",
    tag: buildInfo.gitTag ?? "—",
    buildTime: buildInfo.buildTime ?? "—",
    channel: "hosted",
    displayVersion: buildInfo.displayVersion,
  };
}

const appCopy = {
  de: {
    noMindmaps: "Keine Mindmaps verfügbar.",
    readDenied:
      "Schreibzugriff auf diesen Ordner wurde abgelehnt. Änderungen können nicht gespeichert werden.",
    noFolder: "Es ist kein Ordner geöffnet.",
    derived:
      "Workspace-Ansichten sind abgeleitet. Öffne einen Datei-Node, um die Markdown-Datei zu bearbeiten und zu speichern.",
    syncActive:
      "Dieses Dokument ist gerade in einer Sync-Sitzung aktiv. Änderungen werden über die Verbindung gespeichert.",
    syncFailed:
      "Dieses Dokument konnte nicht über die aktive Sync-Sitzung gespeichert werden. Bitte Verbindung prüfen und erneut versuchen.",
    noUrl: "Keine URL hinterlegt.",
    previewUnavailable: "Für diese Ressource ist keine Vorschau verfügbar.",
    openWorkspaceFirst:
      "Öffne zuerst einen lokalen Workspace, um diese Datei als Vorschau anzuzeigen.",
    noFile:
      "Für diesen Knoten ist keine Datei hinterlegt. Öffne den Knoten-Editor und trage unter „Datei“ einen Pfad ein, der im Workspace liegt.",
    localPreview:
      "Diese Datei liegt in einem lokalen Ordner. Öffne zuerst einen Ordner, dann lässt sie sich anzeigen.",
    renameFailed: "Workspace konnte nicht umbenannt werden.",
    fileRenameFailed: "Datei konnte nicht umbenannt werden.",
    fileRenameConflict: "Eine Mindmap mit diesem Dateinamen existiert bereits.",
    feedbackFailed: "Feedback konnte nicht gesendet werden.",
    feedbackThanks: "Danke, dein Feedback ist im Beta-Board angekommen.",
    fileBrowser: "Datei-Browser öffnen (Cmd+O)",
    backToWorkspace: "Zur Workspace-Übersicht",
    forwardToFile: "Zur zuletzt geöffneten Datei",
    mapView: "Kartenansicht",
    documentView: "Dokument",
    workspaceView: "Workspace",
    createFolder: "+ Ordner",
    createFile: "+ Datei",
    check: "Prüfen",
    local: "Lokal",
    readOnly: "Nur Lesen",
    shortcuts: "Shortcuts",
    documentation: "Dokumentation",
    feedback: "Feedback senden",
    account: "Account und Abrechnung",
    firstSteps: "Erste Schritte",
    save: "Speichern",
    feedbackDialog: "Beta-Feedback senden",
    close: "Schließen",
    cancel: "Abbrechen",
    send: "Feedback senden",
    sending: "Sende…",
    onboarding: "Erste Schritte",
    understood: "Verstanden",
    showShortcuts: "Shortcuts anzeigen",
    showNode: "Node anzeigen",
    closeNotice: "Hinweis schließen",
  },
  en: {
    noMindmaps: "No mindmaps available.",
    readDenied:
      "Write access to this folder was denied. Changes cannot be saved.",
    noFolder: "No folder is open.",
    derived:
      "Workspace views are derived. Open a file node to edit and save the Markdown file.",
    syncActive:
      "This document is active in a sync session. Changes are saved through the connection.",
    syncFailed:
      "This document could not be saved through the active sync session. Check the connection and try again.",
    noUrl: "No URL is configured.",
    previewUnavailable: "No preview is available for this resource.",
    openWorkspaceFirst: "Open a local workspace first to preview this file.",
    noFile:
      "This node has no file configured. Open the node editor and add a path under File that exists in the workspace.",
    localPreview:
      "This file is in a local folder. Open a folder first to view it.",
    renameFailed: "Could not rename workspace.",
    fileRenameFailed: "Could not rename the file.",
    fileRenameConflict: "A mindmap with this filename already exists.",
    feedbackFailed: "Could not send feedback.",
    feedbackThanks: "Thanks, your feedback reached the beta board.",
    fileBrowser: "Open file browser (Cmd+O)",
    backToWorkspace: "Back to workspace overview",
    forwardToFile: "Forward to the previously opened file",
    mapView: "Map view",
    documentView: "Document",
    workspaceView: "Workspace",
    createFolder: "+ Folder",
    createFile: "+ File",
    check: "Check",
    local: "Local",
    readOnly: "Read only",
    shortcuts: "Shortcuts",
    documentation: "Documentation",
    feedback: "Send feedback",
    account: "Account and billing",
    firstSteps: "Getting started",
    save: "Save",
    feedbackDialog: "Send beta feedback",
    close: "Close",
    cancel: "Cancel",
    send: "Send feedback",
    sending: "Sending…",
    onboarding: "Getting started",
    understood: "Got it",
    showShortcuts: "Show shortcuts",
    showNode: "Show node",
    closeNotice: "Close notice",
  },
} as const;

function setActiveWorkspaceCookie(workspaceId: string) {
  document.cookie = `bloommd_workspace=${encodeURIComponent(workspaceId)}; Path=/; SameSite=Lax`;
}

function clearActiveWorkspaceContext() {
  window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  document.cookie = "bloommd_workspace=; Max-Age=0; Path=/; SameSite=Lax";
}

interface ApiResponse {
  filePath: string;
  frontmatter: MindMapDocument["frontmatter"];
  nodes: Record<string, MindMapNode>;
  rootId: string;
  preamble?: string;
  storage?: MindMapDocument["storage"];
}

interface ApiListResponse {
  files: Array<{
    filename: string;
    frontmatter: MindMapDocument["frontmatter"];
  }>;
  storageMode?: "filesystem" | "database";
  workspace?: WorkspaceInfo | null;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  kind: "personal" | "team";
  role: "owner" | "editor" | "viewer";
}

interface WorkspaceAgentActivityTask {
  nodeId: string | null;
  status: "queued" | "running" | "proposed" | "completed" | "failed";
  proposals: Array<{ status: "pending" | "rejected" | "applied" | "stale" }>;
}

interface WorkspaceAgentActivity {
  activeAgentCount: number;
  tasks: WorkspaceAgentActivityTask[];
}

interface OpenTab {
  filename: string;
  title: string;
}

type RenameResult =
  { success: true; filename: string } | { success: false; message: string };

interface ResourcePreviewRequest {
  kind?: string;
  file?: string;
  respond: (
    result: { url: string; revokeOnCleanup?: boolean } | { error: string },
  ) => void;
}

interface AppNotice {
  message: string;
  nodeId?: string;
  nodeTitle?: string;
}

function workspaceQuery(workspaceId?: string | null) {
  return workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
}

function loadMindmap(
  filename: string,
  workspaceId?: string | null,
): Promise<MindMapDocument> {
  return fetch(
    `/api/mindmaps/${encodeURIComponent(filename)}${workspaceQuery(workspaceId)}`,
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    })
    .then((data: ApiResponse) => ({
      ...data,
      nodes: new Map(Object.entries(data.nodes)),
      rawMarkdown: "",
    }));
}

function documentWithRootTitle(
  doc: MindMapDocument,
  title: string,
): MindMapDocument {
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

async function loadInitialMindmap(
  preferredFilename: string,
  workspaceId?: string | null,
): Promise<{
  document: MindMapDocument;
  filename: string;
  workspace: WorkspaceInfo | null;
}> {
  const res = await fetch(`/api/mindmaps${workspaceQuery(workspaceId)}`);
  if (!res.ok) throw new Error(await res.text());

  const data = (await res.json()) as ApiListResponse;
  if (data.files.length === 0) {
    const created = await fetch(`/api/mindmaps${workspaceQuery(workspaceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "welcome.md",
        markdown: createStarterMarkdown(),
      }),
    });
    if (!created.ok) throw new Error(await created.text());
    return {
      document: await loadMindmap("welcome.md", workspaceId),
      filename: "welcome.md",
      workspace: data.workspace ?? null,
    };
  }
  const preferred = data.files.find(
    (file) => file.filename === preferredFilename,
  );
  const filename = preferred?.filename ?? data.files[0]?.filename;

  if (!filename) {
    throw new Error("No mindmaps available.");
  }

  return {
    document: await loadMindmap(filename, workspaceId),
    filename,
    workspace: data.workspace ?? null,
  };
}

export default function Home() {
  const { t, locale } = useLocale();
  const copy = appCopy[locale];
  const localizedDocsUrl = `${docsUrl}${locale === "en" ? "?lang=en" : "?lang=de"}`;
  const { theme } = useTheme();
  const setDocument = useMindMapStore((s) => s.setDocument);
  const setDocumentFilePath = useMindMapStore((s) => s.setDocumentFilePath);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const setEditorVisible = useMindMapStore((s) => s.setEditorVisible);
  const document = useMindMapStore((s) => s.document);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Recoverable messages.
   *
   * Kept apart from `error`, which replaces the entire app with a red line — correct for "the
   * document could not be loaded", catastrophic for "this node has no file attached". The user
   * should be told what went wrong and keep working.
   */
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutBuildInfo, setAboutBuildInfo] = useState<AboutBuildInfo>(() =>
    toAboutBuildInfo(appBuildInfo),
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStartedAt, setFeedbackStartedAt] = useState(() => Date.now());
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<{
    kind: "success" | "error";
    message: string;
    issueUrl?: string;
  } | null>(null);
  const [conflict, setConflict] = useState<{
    filename: string;
    mine: string;
    theirs: string;
    theirVersion: number | null;
  } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    filename: string;
    title: string;
  } | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameRevealFilename, setRenameRevealFilename] = useState<
    string | null
  >(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const toolbarRef = useRef<ToolbarHandle>(null);
  const initialLoadStartedRef = useRef(false);
  const currentFileRef = useRef("typescript-basics.md");
  const [workspaceNavigationPending, setWorkspaceNavigationPending] =
    useState(false);
  const forwardLocalFileRef = useRef<string | null>(null);
  const [forwardLocalFileAvailable, setForwardLocalFileAvailable] =
    useState(false);
  const syncDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const browserWorkspaceRef = useRef<BrowserWorkspace | null>(null);
  const [browserWorkspaceName, setBrowserWorkspaceName] = useState<
    string | null
  >(null);
  const [browserWorkspaceFiles, setBrowserWorkspaceFiles] = useState<
    BrowserWorkspaceEntry[]
  >([]);
  const [browserWorkspaceSupported, setBrowserWorkspaceSupported] =
    useState(false);
  const [workspacePermission, setWorkspacePermission] = useState<
    "readwrite" | "read" | "denied"
  >("readwrite");
  const [cloudWorkspace, setCloudWorkspace] = useState<WorkspaceInfo | null>(
    null,
  );
  const [workspaceRenameOpen, setWorkspaceRenameOpen] = useState(false);
  const [workspaceAgentOpen, setWorkspaceAgentOpen] = useState(false);
  const [nodeAgentOpen, setNodeAgentOpen] = useState(false);
  const [agentActivity, setAgentActivity] = useState<WorkspaceAgentActivity>({
    activeAgentCount: 0,
    tasks: [],
  });
  const selectedAgentNode = (() => {
    if (!document || !selectedNodeId) return null;
    const node = document.nodes.get(selectedNodeId);
    if (!node) return null;
    const titles: string[] = [];
    let current: MindMapNode | undefined = node;
    while (current) {
      titles.unshift(current.title);
      current = current.parentId
        ? document.nodes.get(current.parentId)
        : undefined;
    }
    return {
      id: node.id,
      title: node.title,
      path: titles.join(" → "),
      content: node.content,
    };
  })();
  const localWorkspaceActive = Boolean(
    browserWorkspaceName &&
    document &&
    (isWorkspaceMindMap(document) ||
      browserWorkspaceFiles.some((entry) => entry.path === document.filePath)),
  );

  const refreshAgentActivity = useCallback(async () => {
    if (
      !cloudWorkspace ||
      localWorkspaceActive ||
      document?.storage?.mode !== "database" ||
      document.storage.workspaceId !== cloudWorkspace.id
    ) {
      setAgentActivity({ activeAgentCount: 0, tasks: [] });
      return;
    }
    try {
      const [agentsResponse, tasksResponse] = await Promise.all([
        fetch(
          `/api/workspaces/${encodeURIComponent(cloudWorkspace.id)}/agents`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/workspaces/${encodeURIComponent(cloudWorkspace.id)}/agent-tasks`,
          { cache: "no-store" },
        ),
      ]);
      if (!agentsResponse.ok || !tasksResponse.ok)
        throw new Error("Workspace agents could not be loaded.");
      const agents = (await agentsResponse.json()) as {
        agents?: Array<{ status: "active" | "revoked" }>;
      };
      const tasks = (await tasksResponse.json()) as {
        tasks?: WorkspaceAgentActivityTask[];
      };
      setAgentActivity({
        activeAgentCount:
          agents.agents?.filter((agent) => agent.status === "active").length ??
          0,
        tasks: tasks.tasks ?? [],
      });
    } catch (error) {
      console.error("[BloomMD] Workspace agent activity unavailable:", error);
      setAgentActivity({ activeAgentCount: 0, tasks: [] });
    }
  }, [
    cloudWorkspace,
    document?.storage?.mode,
    document?.storage?.workspaceId,
    localWorkspaceActive,
  ]);

  useEffect(() => {
    void refreshAgentActivity();
    if (
      !cloudWorkspace ||
      localWorkspaceActive ||
      document?.storage?.mode !== "database" ||
      document.storage.workspaceId !== cloudWorkspace.id
    )
      return;
    const events = new EventSource(
      `/api/workspaces/${encodeURIComponent(cloudWorkspace.id)}/agent-events`,
    );
    events.addEventListener(
      "workspace-agent",
      () => void refreshAgentActivity(),
    );
    const timer = window.setInterval(() => void refreshAgentActivity(), 60_000);
    return () => {
      events.close();
      window.clearInterval(timer);
    };
  }, [refreshAgentActivity]);

  const selectedAgentActivity = selectedNodeId
    ? agentActivity.tasks
        .filter((task) => task.nodeId === selectedNodeId)
        .reduce(
          (summary, task) => ({
            queuedOrRunning:
              summary.queuedOrRunning +
              (task.status === "queued" || task.status === "running" ? 1 : 0),
            pendingProposals:
              summary.pendingProposals +
              task.proposals.filter((proposal) => proposal.status === "pending")
                .length,
          }),
          { queuedOrRunning: 0, pendingProposals: 0 },
        )
    : { queuedOrRunning: 0, pendingProposals: 0 };

  useEffect(() => {
    if (!aboutOpen) return;

    let cancelled = false;
    void fetch("/api/version", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Build info request failed with ${response.status}`);
        return response.json() as Promise<BloomMDBuildInfo>;
      })
      .then((buildInfo) => {
        if (!cancelled) setAboutBuildInfo(toAboutBuildInfo(buildInfo));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          console.error("[BloomMD] Web build info unavailable:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [aboutOpen]);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [workspaceRenaming, setWorkspaceRenaming] = useState(false);

  const [mapView, setMapView] = useState<"document" | "workspace">("document");
  const [healthOpen, setHealthOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateEntryKind | null>(null);
  const [workspaceGraphFiles, setWorkspaceGraphFiles] = useState<
    WorkspaceFileInput[]
  >([]);
  const [workspaceMapError, setWorkspaceMapError] = useState<string | null>(
    null,
  );
  const [syncUrl, setSyncUrl] = useState("");

  const showNotice = useCallback((message: string, nodeId?: string | null) => {
    const state = useMindMapStore.getState();
    const affectedNodeId = nodeId ?? state.selectedNodeId;
    const affectedNode = affectedNodeId
      ? state.document?.nodes.get(affectedNodeId)
      : undefined;
    setNotice({
      message,
      nodeId: affectedNode?.id ?? affectedNodeId ?? undefined,
      nodeTitle: affectedNode?.title,
    });
  }, []);

  /** A read-only link to the open cloud map, copied for sending to colleagues. */
  const [shareLinksTarget, setShareLinksTarget] = useState<{ filename: string; workspaceId: string | null } | null>(null);
  const shareReadOnlyLink = useCallback(() => {
    const current = useMindMapStore.getState().document;
    if (current?.storage?.mode !== "database") return;
    setShareLinksTarget({ filename: currentFileRef.current || current.filePath, workspaceId: current.storage.workspaceId ?? null });
  }, []);

  const focusNoticeNode = useCallback((nodeId: string) => {
    const doc = useMindMapStore.getState().document;
    if (!doc?.nodes.has(nodeId)) return;
    setMapView("document");
    setHealthOpen(false);
    useMindMapStore.getState().setSelectedNodeId(nodeId);
    setNotice(null);
  }, []);

  const clearLocalForwardNavigation = useCallback(() => {
    forwardLocalFileRef.current = null;
    setForwardLocalFileAvailable(false);
  }, []);

  const openLocalFile = useCallback(
    async (path: string, preserveForwardNavigation = false) => {
      const workspace = browserWorkspaceRef.current;
      if (!workspace) return;
      if (!preserveForwardNavigation) clearLocalForwardNavigation();
      const doc = parseFile(path, await workspace.read(path));
      currentFileRef.current = path;
      setDocument(doc);
      setMapView("document");
    },
    [clearLocalForwardNavigation, setDocument],
  );

  const loadBrowserWorkspaceDocument = useCallback(
    async (
      workspace: BrowserWorkspace,
      files: BrowserWorkspaceEntry[],
      source = "browser-workspace",
    ) => {
      clearLocalForwardNavigation();
      const MAX_FILES = 500;
      const entries = files.slice(0, MAX_FILES);
      setWorkspaceMapError(
        files.length > MAX_FILES
          ? locale === "en"
            ? `Large workspace: the map shows the first ${MAX_FILES} of ${files.length} files.`
            : `Sehr großer Workspace: die Karte zeigt die ersten ${MAX_FILES} von ${files.length} Dateien.`
          : null,
      );

      const loaded: WorkspaceFileInput[] = [];
      for (const entry of entries) {
        try {
          loaded.push({
            path: entry.path,
            markdown: await workspace.read(entry.path),
          });
        } catch {
          loaded.push({ path: entry.path, markdown: "" });
        }
      }
      setWorkspaceGraphFiles(loaded);
      currentFileRef.current = source;
      setDocument(
        buildWorkspaceMindMap(loaded, {
          title: workspace.name,
          source: workspace.name,
        }),
      );
      setMapView("document");
    },
    [clearLocalForwardNavigation, setDocument],
  );

  const chooseBrowserWorkspace = useCallback(async () => {
    try {
      const workspace = await openBrowserWorkspace();
      const files = await workspace.refresh();
      browserWorkspaceRef.current = workspace;
      clearLocalForwardNavigation();
      setBrowserWorkspaceName(workspace.name);
      setBrowserWorkspaceFiles(files);
      setWorkspaceRenameOpen(false);
      setWorkspacePermission(await workspace.permissionState());
      if (files[0]) await loadBrowserWorkspaceDocument(workspace, files);
    } catch (workspaceError) {
      if ((workspaceError as DOMException).name !== "AbortError")
        setError(String(workspaceError));
    }
  }, [clearLocalForwardNavigation, loadBrowserWorkspaceDocument]);

  /**
   * Asks for write access to a folder that was opened read-only.
   *
   * Must run from a click. Browsers reject a permission request that no user gesture triggered,
   * which is also why this is not attempted automatically on load.
   */
  const requestWorkspaceWriteAccess = useCallback(async () => {
    const workspace = browserWorkspaceRef.current;
    if (!workspace) return;
    const granted = await workspace.requestWriteAccess();
    setWorkspacePermission(
      granted ? "readwrite" : await workspace.permissionState(),
    );
    if (!granted) setError(copy.readDenied);
  }, []);

  /**
   * Creates a folder or a Markdown file in the opened folder.
   *
   * Refreshes the listing afterwards rather than guessing what changed: the workspace is a real
   * directory that other programs can touch, so the filesystem stays the source of truth.
   */
  const createEntry = useCallback(
    async (kind: CreateEntryKind, path: string) => {
      const workspace = browserWorkspaceRef.current;
      if (!workspace) throw new Error(copy.noFolder);

      if (kind === "folder") {
        await workspace.createFolder(path);
        // A folder holds no Markdown yet, so the file listing is unchanged; the map derives folders
        // from file paths and will show it once something lives in it.
        showNotice(
          `Ordner „${path}" angelegt. Er erscheint in der Karte, sobald eine Datei darin liegt.`,
          null,
        );
        return;
      }

      const created = await workspace.createFile(
        path,
        `# ${path.split("/").pop()?.replace(/\.md$/i, "") ?? "Neu"}\n\n`,
      );
      setBrowserWorkspaceFiles(await workspace.refresh());
      await openLocalFile(created);
    },
    [locale, openLocalFile],
  );

  /**
   * Reads the whole workspace so cross-file links can be extracted.
   *
   * The graph is derived from file contents rather than an index, which keeps a BloomMD workspace an
   * ordinary folder — but it does mean reading every file. Capped so that opening the map on a very
   * large vault degrades to a partial map with a visible notice instead of freezing the tab.
   */
  const loadWorkspaceGraph = useCallback(async () => {
    const workspace = browserWorkspaceRef.current;
    if (!workspace) {
      setWorkspaceGraphFiles([]);
      return;
    }
    const MAX_FILES = 500;
    const entries = browserWorkspaceFiles.slice(0, MAX_FILES);
    setWorkspaceMapError(
      browserWorkspaceFiles.length > MAX_FILES
        ? locale === "en"
          ? `Large workspace: the map shows the first ${MAX_FILES} of ${browserWorkspaceFiles.length} files.`
          : `Sehr großer Workspace: die Karte zeigt die ersten ${MAX_FILES} von ${browserWorkspaceFiles.length} Dateien.`
        : null,
    );

    const loaded: WorkspaceFileInput[] = [];
    for (const entry of entries) {
      try {
        loaded.push({
          path: entry.path,
          markdown: await workspace.read(entry.path),
        });
      } catch {
        // A single unreadable file must not cost the whole map; it simply has no links to offer.
        loaded.push({ path: entry.path, markdown: "" });
      }
    }
    setWorkspaceGraphFiles(loaded);
  }, [browserWorkspaceFiles, locale]);

  useEffect(() => {
    if (mapView === "workspace" || healthOpen) void loadWorkspaceGraph();
  }, [mapView, healthOpen, loadWorkspaceGraph]);

  const saveDocument = useCallback(
    async (doc: MindMapDocument) => {
      if (isWorkspaceMindMap(doc)) {
        showNotice(copy.derived, null);
        return;
      }
      const workspace = browserWorkspaceRef.current;
      if (
        workspace &&
        browserWorkspaceFiles.some((entry) => entry.path === doc.filePath)
      ) {
        await workspace.write(doc.filePath, serializeToMarkdown(doc));
        return;
      }
      // Yjs room persistence is authoritative while connected. When disconnected, the API sends a
      // version-checked snapshot to the sync server; it never writes a cloud document directly.
      if (useMindMapStore.getState().syncStatus === "connected") return;
      const filename = currentFileRef.current || doc.filePath;
      const response = await fetch(
        `/api/mindmaps/${encodeURIComponent(filename)}${workspaceQuery(doc.storage?.mode === "database" ? doc.storage.workspaceId : null)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            markdown: serializeToMarkdown(doc),
            expectedVersion: doc.storage?.version,
          }),
        },
      );
      if (response.status === 409 || response.status === 503) {
        // Someone else saved first. Hand the user the other version instead of an error string —
        // "reload before saving again" throws away their work without showing what they would lose.
        const payload = (await response.json()) as {
          code?: string;
          conflict?: { markdown: string; version: number | null };
        };
        if (
          payload.code === "SYNC_ROOM_ACTIVE" ||
          payload.code === "SYNC_ROOM_PENDING"
        ) {
          showNotice(copy.syncActive, doc.rootId);
          return;
        }
        if (
          payload.code === "SYNC_ROOM_DEGRADED" ||
          payload.code === "SYNC_ROOM_SAVE_FAILED" ||
          payload.code === "SYNC_MUTATION_UNAVAILABLE"
        ) {
          showNotice(copy.syncFailed, doc.rootId);
          return;
        }
        if (payload.conflict) {
          setConflict({
            filename,
            mine: serializeToMarkdown(doc),
            theirs: payload.conflict.markdown,
            theirVersion: payload.conflict.version,
          });
          return;
        }
      }
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as {
        storage?: MindMapDocument["storage"];
      };
      if (result.storage)
        useMindMapStore.getState().setStorageMetadata(result.storage);
    },
    [browserWorkspaceFiles],
  );

  const reload = useCallback(async () => {
    // Use the currently loaded document's filename, not the initial default
    const current = useMindMapStore.getState().document;
    const filename = currentFileRef.current || current?.filePath;
    if (!filename) return;
    if (current && isWorkspaceMindMap(current) && browserWorkspaceRef.current) {
      const files = await browserWorkspaceRef.current.refresh();
      setBrowserWorkspaceFiles(files);
      await loadBrowserWorkspaceDocument(
        browserWorkspaceRef.current,
        files,
        "reload-browser-workspace",
      );
      return;
    }
    if (
      current &&
      browserWorkspaceRef.current &&
      browserWorkspaceFiles.some((entry) => entry.path === current.filePath)
    ) {
      await openLocalFile(current.filePath);
      return;
    }
    const doc = await loadMindmap(filename, cloudWorkspace?.id);
    setDocument(doc);
  }, [
    browserWorkspaceFiles,
    cloudWorkspace?.id,
    loadBrowserWorkspaceDocument,
    openLocalFile,
    setDocument,
  ]);

  const openMindmap = useCallback(
    async (filename: string) => {
      clearLocalForwardNavigation();
      const doc = await loadMindmap(filename, cloudWorkspace?.id);
      currentFileRef.current = filename;
      setDocument(doc);
    },
    [clearLocalForwardNavigation, cloudWorkspace?.id, setDocument],
  );

  const handleBackToWorkspace = useCallback(() => {
    const workspace = browserWorkspaceRef.current;
    const current = useMindMapStore.getState().document;
    if (
      workspaceNavigationPending ||
      mapView !== "document" ||
      !workspace ||
      !current ||
      isWorkspaceMindMap(current) ||
      !browserWorkspaceFiles.some((entry) => entry.path === current.filePath)
    ) {
      return false;
    }

    forwardLocalFileRef.current = current.filePath;
    setForwardLocalFileAvailable(true);
    setHealthOpen(false);
    setMapView("workspace");
    return true;
  }, [browserWorkspaceFiles, mapView, workspaceNavigationPending]);

  const handleForwardToFile = useCallback(() => {
    const workspace = browserWorkspaceRef.current;
    const path = forwardLocalFileRef.current;
    if (
      workspaceNavigationPending ||
      mapView !== "workspace" ||
      !workspace ||
      !path ||
      !browserWorkspaceFiles.some((entry) => entry.path === path)
    ) {
      if (path && !browserWorkspaceFiles.some((entry) => entry.path === path))
        clearLocalForwardNavigation();
      return false;
    }

    setWorkspaceNavigationPending(true);
    void openLocalFile(path, true)
      .catch((error: unknown) => {
        console.error(
          "[BloomMD] Returning to the previously opened local file failed:",
          error,
        );
        showNotice(
          error instanceof Error
            ? error.message
            : "Die Datei konnte nicht geöffnet werden.",
          null,
        );
      })
      .finally(() => setWorkspaceNavigationPending(false));
    return true;
  }, [
    browserWorkspaceFiles,
    clearLocalForwardNavigation,
    mapView,
    openLocalFile,
    showNotice,
    workspaceNavigationPending,
  ]);

  useEffect(() => {
    const openUrl = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          url?: string;
          respond?: (result: { opened: true } | { error: string }) => void;
        }>
      ).detail;
      event.preventDefault();
      if (!detail.url) {
        detail.respond?.({ error: copy.noUrl });
        return;
      }
      window.open(detail.url, "_blank", "noopener,noreferrer");
      detail.respond?.({ opened: true });
    };

    const loadLinkPreview = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          url?: string;
          respond?: (
            result:
              | {
                  preview: {
                    title?: string;
                    description?: string;
                    image?: string;
                  };
                }
              | { error: string },
          ) => void;
        }>
      ).detail;
      event.preventDefault();
      if (!detail.url || !detail.respond) return;
      void fetch(`/api/link-preview?url=${encodeURIComponent(detail.url)}`)
        .then(async (response) => {
          const data = (await response.json()) as {
            preview?: { title?: string; description?: string; image?: string };
            error?: string;
          };
          if (!response.ok || !data.preview)
            throw new Error(data.error || "Preview unavailable.");
          detail.respond?.({ preview: data.preview });
        })
        .catch((error) =>
          detail.respond?.({
            error:
              error instanceof Error ? error.message : "Preview unavailable.",
          }),
        );
    };

    const listMaps = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          respond?: (
            result: { files: MindMapListEntry[] } | { error: string },
          ) => void;
        }>
      ).detail;
      event.preventDefault();
      if (!detail.respond) return;
      void fetch(`/api/mindmaps${workspaceQuery(cloudWorkspace?.id)}`)
        .then(async (response) => {
          const data = (await response.json()) as {
            files?: MindMapListEntry[];
            error?: string;
          };
          if (!response.ok || !data.files)
            throw new Error(data.error || "Maps unavailable.");
          detail.respond?.({ files: data.files });
        })
        .catch((error) =>
          detail.respond?.({
            error: error instanceof Error ? error.message : "Maps unavailable.",
          }),
        );
    };

    const loadMapDocument = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          filename?: string;
          respond?: (
            result: { document: ApiResponse } | { error: string },
          ) => void;
        }>
      ).detail;
      event.preventDefault();
      if (!detail.filename || !detail.respond) return;
      void fetch(
        `/api/mindmaps/${encodeURIComponent(detail.filename)}${workspaceQuery(cloudWorkspace?.id)}`,
      )
        .then(async (response) => {
          const data = (await response.json()) as
            ApiResponse | { error?: string };
          if (!response.ok || !("nodes" in data))
            throw new Error(
              "error" in data && data.error ? data.error : "Map unavailable.",
            );
          detail.respond?.({ document: data });
        })
        .catch((error) =>
          detail.respond?.({
            error: error instanceof Error ? error.message : "Map unavailable.",
          }),
        );
    };

    const openResource = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          nodeId?: string;
          kind?: string;
          file?: string;
          targetNodeId?: string;
        }>
      ).detail;
      const workspace = browserWorkspaceRef.current;

      // Every branch below used to `return` without a word when something was missing, so the
      // button simply did nothing and gave the user no way to find out why. A control that looks
      // enabled has to either work or explain itself.
      if (!detail.file) {
        showNotice(copy.noFile, detail.nodeId);
        return;
      }

      const resolvedPath = workspace?.resolvePath(detail.file) ?? null;

      if (detail.kind === "file" || detail.kind === "pdf") {
        if (!workspace) {
          showNotice(copy.localPreview, detail.nodeId);
          return;
        }
        if (!resolvedPath) {
          showNotice(
            `„${detail.file}“ wurde im geöffneten Ordner nicht gefunden — oder der Name kommt mehrfach vor.`,
            detail.nodeId,
          );
          return;
        }
        if (
          detail.kind === "file" &&
          browserWorkspaceFiles.some((entry) => entry.path === resolvedPath)
        ) {
          void openLocalFile(resolvedPath).catch((openError) =>
            showNotice(String(openError), detail.nodeId),
          );
          return;
        }
        void workspace
          .openResource(resolvedPath)
          .catch((openError) => showNotice(String(openError), detail.nodeId));
        return;
      }

      if (detail.kind !== "portal") {
        showNotice(
          `Für den Knotentyp „${detail.kind ?? "unbekannt"}“ gibt es nichts zu öffnen.`,
          detail.nodeId,
        );
        return;
      }
      const localMapPath =
        resolvedPath &&
        browserWorkspaceFiles.some((entry) => entry.path === resolvedPath)
          ? resolvedPath
          : null;
      const openTarget = localMapPath
        ? openLocalFile(localMapPath)
        : openMindmap(detail.file);
      void openTarget
        .then(() => {
          if (
            detail.targetNodeId &&
            useMindMapStore.getState().document?.nodes.has(detail.targetNodeId)
          ) {
            useMindMapStore.getState().setSelectedNodeId(detail.targetNodeId);
          }
        })
        .catch((openError) => showNotice(String(openError), detail.nodeId));
    };
    window.addEventListener("bloommd:open-url", openUrl);
    window.addEventListener("bloommd:load-link-preview", loadLinkPreview);
    window.addEventListener("bloommd:list-maps", listMaps);
    window.addEventListener("bloommd:load-map-document", loadMapDocument);
    window.addEventListener("bloommd:open-resource", openResource);
    return () => {
      window.removeEventListener("bloommd:open-url", openUrl);
      window.removeEventListener("bloommd:load-link-preview", loadLinkPreview);
      window.removeEventListener("bloommd:list-maps", listMaps);
      window.removeEventListener("bloommd:load-map-document", loadMapDocument);
      window.removeEventListener("bloommd:open-resource", openResource);
    };
  }, [
    browserWorkspaceFiles,
    cloudWorkspace?.id,
    locale,
    openLocalFile,
    openMindmap,
    showNotice,
  ]);

  useEffect(() => {
    const previewResource = (event: Event) => {
      const detail = (event as CustomEvent<ResourcePreviewRequest>).detail;
      const workspace = browserWorkspaceRef.current;
      if (!detail.file || (detail.kind !== "file" && detail.kind !== "pdf")) {
        detail.respond({
          error: "Für diese Ressource ist keine Vorschau verfügbar.",
        });
        return;
      }
      if (!workspace) {
        detail.respond({
          error:
            "Öffne zuerst einen lokalen Workspace, um diese Datei als Vorschau anzuzeigen.",
        });
        return;
      }

      const resolvedPath = workspace.resolvePath(detail.file);
      if (!resolvedPath) {
        detail.respond({
          error: `„${detail.file}“ wurde im geöffneten Ordner nicht gefunden — oder der Name kommt mehrfach vor.`,
        });
        return;
      }

      void workspace
        .resourceObjectUrl(resolvedPath)
        .then((url) => detail.respond({ url, revokeOnCleanup: true }))
        .catch((previewError) =>
          detail.respond({ error: String(previewError) }),
        );
    };
    window.addEventListener("bloommd:preview-resource", previewResource);
    return () =>
      window.removeEventListener("bloommd:preview-resource", previewResource);
  }, []);

  useEffect(() => {
    setBrowserWorkspaceSupported(supportsBrowserWorkspaces());
    try {
      const stored = window.localStorage.getItem(OPEN_TABS_STORAGE_KEY);
      if (stored) setOpenTabs(JSON.parse(stored) as OpenTab[]);
    } catch {
      setOpenTabs([]);
    }
  }, []);

  useEffect(() => {
    if (!document) return;
    if (
      browserWorkspaceRef.current &&
      browserWorkspaceFiles.some((entry) => entry.path === document.filePath)
    )
      return;
    const filename = document.filePath.split("/").pop() || document.filePath;
    setOpenTabs((tabs) => {
      const next = [
        { filename, title: document.frontmatter.title },
        ...tabs.filter((tab) => tab.filename !== filename),
      ].slice(0, 5);
      window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [browserWorkspaceFiles, document?.filePath, document?.frontmatter.title]);

  useKeyboardShortcuts({
    onNew: () => toolbarRef.current?.triggerNew(),
    onImport: () => toolbarRef.current?.triggerImport(),
    onExport: () => toolbarRef.current?.triggerExport(),
    onSave: () => toolbarRef.current?.triggerSave(),
    onReload: reload,
    onToggleFileBrowser: () => setFileBrowserOpen((o) => !o),
    onToggleCommandPalette: () => setCommandPaletteOpen((o) => !o),
    onToggleHelp: () => setHelpOpen((o) => !o),
    onBackToWorkspace: handleBackToWorkspace,
    onForwardToFile: handleForwardToFile,
  });

  const documentId = useMindMapStore(
    (s) => s.document?.storage?.documentId ?? s.document?.frontmatter.id,
  );

  const connectDocumentSync = useCallback(
    async (current: MindMapDocument, isCurrent: () => boolean = () => true) => {
      if (!syncUrl || isWorkspaceMindMap(current)) return;

      if (current.storage?.mode === "database") {
        const filename = currentFileRef.current || current.filePath;
        const requestTicket = async () =>
          fetch("/api/sync-ticket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename,
              workspaceId: current.storage?.workspaceId,
            }),
          }).then(async (response) => {
            if (!response.ok) throw new Error(await response.text());
            return response.json() as Promise<{
              websocketUrl: string;
              identity?: { name?: string | null; email?: string | null };
            }>;
          });
        const { websocketUrl, identity } = await requestTicket();
        if (!isCurrent()) return;
        useMindMapStore
          .getState()
          .connectSyncUrl(
            websocketUrl,
            async () => (await requestTicket()).websocketUrl,
            identity,
          );
        return;
      }

      if (isCurrent()) useMindMapStore.getState().connectSync(syncUrl);
    },
    [syncUrl],
  );

  const persistDocumentBeforeRename = useCallback(
    async (doc: MindMapDocument, filename: string) => {
      const response = await fetch(
        `/api/mindmaps/${encodeURIComponent(filename)}${workspaceQuery(doc.storage?.mode === "database" ? doc.storage.workspaceId : null)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            markdown: serializeToMarkdown(doc),
            expectedVersion: doc.storage?.version,
          }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        storage?: MindMapDocument["storage"];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || copy.fileRenameFailed);
      // Renaming an inactive file must not overwrite the storage metadata of the file currently
      // open in the canvas.
      if (payload.storage && currentFileRef.current === filename)
        useMindMapStore.getState().setStorageMetadata(payload.storage);
    },
    [copy.fileRenameFailed],
  );

  const renameFileForTitle = useCallback(
    async (oldFilename: string, title: string): Promise<RenameResult> => {
      const newFilename = filenameForTitleInPath(oldFilename, title);
      const store = useMindMapStore.getState();
      const isActiveFile = currentFileRef.current === oldFilename;
      const activeDocument = isActiveFile ? store.document : null;
      const reconnectRemote =
        isActiveFile &&
        activeDocument?.storage?.mode === "database" &&
        Boolean(syncUrl) &&
        (store.syncProvider !== null || store.syncStatus !== "disconnected");
      let targetDocument = activeDocument;
      let renamedInactiveDocument: MindMapDocument | null = null;
      let previousTitle: string | undefined;
      let titleChanged = false;
      let titlePersistedBeforeRename = false;

      const persistRenamedDocument = async () => {
        const documentToPersist = isActiveFile
          ? useMindMapStore.getState().document
          : renamedInactiveDocument;
        if (!documentToPersist || !titleChanged) return;
        await persistDocumentBeforeRename(documentToPersist, oldFilename);
        titlePersistedBeforeRename = true;
      };

      try {
        // A sidebar rename may target a file that is not open. Load that document so its root node
        // and frontmatter title are updated together with the filename.
        if (!targetDocument)
          targetDocument = await loadMindmap(oldFilename, cloudWorkspace?.id);
        const root = targetDocument.nodes.get(targetDocument.rootId);
        previousTitle = root?.title ?? targetDocument.frontmatter.title;
        titleChanged = Boolean(
          previousTitle !== title || targetDocument.frontmatter.title !== title,
        );
        if (titleChanged) {
          if (isActiveFile) {
            store.renameNode(targetDocument.rootId, title);
          } else {
            renamedInactiveDocument = documentWithRootTitle(
              targetDocument,
              title,
            );
          }
        }

        if (newFilename === oldFilename) {
          if (!reconnectRemote) await persistRenamedDocument();
          return { success: true, filename: oldFilename };
        }

        if (reconnectRemote) {
          // Closing the room first lets the sync server flush the title change before the filename
          // mutation. Refresh only the storage metadata afterwards; the local Y.Doc remains active.
          await store.disconnectSync();
          const latest = await loadMindmap(
            oldFilename,
            activeDocument?.storage?.workspaceId ?? cloudWorkspace?.id,
          );
          if (latest.storage)
            useMindMapStore.getState().setStorageMetadata(latest.storage);
        } else {
          await persistRenamedDocument();
        }

        const response = await fetch(
          `/api/mindmaps/${encodeURIComponent(oldFilename)}${workspaceQuery(activeDocument?.storage?.mode === "database" ? activeDocument.storage.workspaceId : cloudWorkspace?.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newFilename }),
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          newFilePath?: string;
          newFilename?: string;
          version?: number;
          code?: string;
          error?: string;
        };
        if (!response.ok || !payload.success || !payload.newFilePath) {
          const error = new Error(payload.error || copy.fileRenameFailed);
          error.name = payload.code || "FILE_RENAME_FAILED";
          throw error;
        }

        const actualFilename =
          payload.newFilename ||
          payload.newFilePath.split("/").pop() ||
          newFilename;
        if (isActiveFile) {
          currentFileRef.current = actualFilename;
          setDocumentFilePath(payload.newFilePath);
          const currentStorage = useMindMapStore.getState().document?.storage;
          if (payload.version != null && currentStorage?.mode === "database") {
            useMindMapStore
              .getState()
              .setStorageMetadata({
                ...currentStorage,
                version: payload.version,
              });
          }
        }
        if (isActiveFile && reconnectRemote) {
          await connectDocumentSync(
            useMindMapStore.getState().document!,
            () => currentFileRef.current === actualFilename,
          );
        }
        return { success: true, filename: actualFilename };
      } catch (error) {
        console.error("[BloomMD] File rename failed:", error);
        const current = useMindMapStore.getState();
        if (activeDocument && titleChanged && previousTitle) {
          current.renameNode(activeDocument.rootId, previousTitle);
        }
        if (titlePersistedBeforeRename) {
          try {
            if (isActiveFile && activeDocument) {
              await persistRenamedDocument();
            } else if (renamedInactiveDocument && previousTitle) {
              await persistDocumentBeforeRename(
                documentWithRootTitle(renamedInactiveDocument, previousTitle),
                oldFilename,
              );
            }
          } catch (rollbackError) {
            console.error(
              "[BloomMD] Failed to roll back persisted file title:",
              rollbackError,
            );
          }
        }
        const conflict =
          error instanceof Error &&
          (error.name === "DOCUMENT_NAME_CONFLICT" ||
            error.name === "DOCUMENT_FILENAME_CONFLICT");
        const message = conflict
          ? copy.fileRenameConflict
          : copy.fileRenameFailed;
        showNotice(message, activeDocument?.rootId);
        if (reconnectRemote && activeDocument) {
          try {
            await connectDocumentSync(
              activeDocument,
              () => currentFileRef.current === oldFilename,
            );
          } catch (reconnectError) {
            console.error(
              "[BloomMD] Failed to reconnect after rename error:",
              reconnectError,
            );
          }
        }
        return { success: false, message };
      }
    },
    [
      cloudWorkspace?.id,
      connectDocumentSync,
      copy.fileRenameConflict,
      copy.fileRenameFailed,
      persistDocumentBeforeRename,
      setDocumentFilePath,
      showNotice,
      syncUrl,
    ],
  );

  const handleRootRename = useCallback(
    async ({ newTitle }: RootRenameEvent) => {
      const store = useMindMapStore.getState();
      const current = store.document;
      const filename = currentFileRef.current;
      if (!current || !filename || isWorkspaceMindMap(current)) {
        if (current) store.renameNode(current.rootId, newTitle);
        return;
      }
      await renameFileForTitle(filename, newTitle);
    },
    [renameFileForTitle],
  );

  const handleRenameFromSidebar = useCallback(
    (filename: string, title: string) => {
      if (cloudWorkspace?.role === "viewer") {
        showNotice(copy.readDenied);
        return;
      }
      const store = useMindMapStore.getState();
      const currentTitle =
        currentFileRef.current === filename
          ? store.document?.frontmatter.title
          : undefined;
      setRenameError(null);
      setRenameTarget({ filename, title: currentTitle || title });
      setFileBrowserOpen(false);
    },
    [cloudWorkspace?.role, copy.readDenied, showNotice],
  );

  const handleDeleteMindmap = useCallback(
    async (filename: string) => {
      if (cloudWorkspace?.role === "viewer") {
        showNotice(copy.readDenied);
        return;
      }

      const store = useMindMapStore.getState();
      const isActiveFile = currentFileRef.current === filename;
      const activeDocument = isActiveFile ? store.document : null;
      const activeStorage =
        activeDocument?.storage?.mode === "database"
          ? activeDocument.storage
          : null;
      const reconnectRemote = Boolean(
        isActiveFile &&
        activeStorage &&
        syncUrl &&
        (store.syncProvider !== null || store.syncStatus !== "disconnected"),
      );
      let deleteCompleted = false;
      const workspaceId = activeStorage?.workspaceId ?? cloudWorkspace?.id;
      const query = workspaceQuery(workspaceId);

      try {
        if (reconnectRemote) {
          // The sync server rejects document mutations while this client still occupies the room.
          await store.disconnectSync();
        }

        const response = await fetch(
          `/api/mindmaps/${encodeURIComponent(filename)}${query}`,
          { method: "DELETE" },
        );
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        if (!response.ok) {
          const error = new Error(payload?.error ?? t.deleteFailed);
          error.name = payload?.code ?? "DELETE_FAILED";
          throw error;
        }
        deleteCompleted = true;

        if (!isActiveFile) return;

        currentFileRef.current = "";
        setDocument(null);
        const filesResponse = await fetch(`/api/mindmaps${query}`);
        if (!filesResponse.ok) throw new Error(t.filesLoadFailed);
        const filesPayload = (await filesResponse.json()) as {
          files?: Array<{ filename: string }>;
        };
        const nextFile = filesPayload.files?.[0];
        if (nextFile) await openMindmap(nextFile.filename);
      } catch (error) {
        console.error("[BloomMD] Delete mindmap failed:", error);
        if (
          !deleteCompleted &&
          reconnectRemote &&
          activeDocument &&
          currentFileRef.current === filename
        ) {
          try {
            await connectDocumentSync(
              activeDocument,
              () => currentFileRef.current === filename,
            );
          } catch (reconnectError) {
            console.error(
              "[BloomMD] Failed to reconnect after delete error:",
              reconnectError,
            );
          }
        }
        const errorCode = error instanceof Error ? error.name : "";
        const message =
          errorCode === "SYNC_ROOM_ACTIVE" || errorCode === "SYNC_ROOM_PENDING"
            ? t.syncRoomActive
            : errorCode === "VERSION_CONFLICT"
              ? t.documentConflict
              : deleteCompleted
                ? t.filesLoadFailed
                : t.deleteFailed;
        showNotice(message);
      }
    },
    [
      cloudWorkspace?.id,
      cloudWorkspace?.role,
      connectDocumentSync,
      copy.readDenied,
      openMindmap,
      setDocument,
      showNotice,
      syncUrl,
      t.deleteFailed,
      t.documentConflict,
      t.filesLoadFailed,
      t.syncRoomActive,
    ],
  );

  const submitRename = useCallback(
    async (title: string) => {
      if (!renameTarget) return false;
      const renameStore = useMindMapStore.getState();
      const wasActiveFile = currentFileRef.current === renameTarget.filename;
      const focusNodeId = wasActiveFile
        ? (renameStore.selectedNodeId ?? renameStore.document?.rootId ?? null)
        : null;
      setRenameError(null);
      const result = await renameFileForTitle(renameTarget.filename, title);
      if (!result.success) {
        setRenameError(result.message);
        return false;
      }
      setRenameRevealFilename(result.filename);
      setRenameTarget(null);
      if (focusNodeId) requestNodeFocus(focusNodeId);
      return true;
    },
    [renameFileForTitle, renameTarget],
  );

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    const loadWorkspace = async () => {
      const params = new URLSearchParams(window.location.search);
      let requestedWorkspaceId =
        params.get("workspace") ||
        window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      const invitationToken = params.get("workspaceInvite");
      if (invitationToken) {
        const language = params.get("lang");
        const inviteQuery = language
          ? `?lang=${encodeURIComponent(language)}`
          : "";
        window.location.replace(
          `/invite/${encodeURIComponent(invitationToken)}${inviteQuery}`,
        );
        return null;
      }
      try {
        return await loadInitialMindmap(
          currentFileRef.current,
          requestedWorkspaceId,
        );
      } catch (error) {
        // A workspace can disappear while a tab is open (for example after an
        // invitation is revoked). Do not strand the user on a global Error page:
        // clear the stale context and retry the personal workspace once. If the
        // personal workspace is also unavailable, the original error still reaches
        // the visible recovery state below.
        if (!requestedWorkspaceId) throw error;
        clearActiveWorkspaceContext();
        params.delete("workspace");
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`,
        );
        requestedWorkspaceId = null;
        return loadInitialMindmap(currentFileRef.current);
      }
    };
    loadWorkspace()
      .then((result) => {
        if (!result) return;
        const { document: doc, filename, workspace } = result;
        currentFileRef.current = filename;
        setCloudWorkspace(workspace);
        if (workspace) {
          window.localStorage.setItem(
            ACTIVE_WORKSPACE_STORAGE_KEY,
            workspace.id,
          );
          setActiveWorkspaceCookie(workspace.id);
        }
        setWorkspaceNameDraft(workspace?.name ?? "");
        setDocument(doc);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [setDocument]);

  useEffect(() => {
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "1") {
      setOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ syncUrl?: string }>;
      })
      .then((config) => {
        if (!cancelled) setSyncUrl(config.syncUrl ?? "");
      })
      .catch((configError) => {
        console.warn(
          "[BloomMD] Runtime config could not be loaded:",
          configError,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setOnboardingOpen(false);
  }, []);

  const openFeedbackDialog = useCallback(() => {
    setFeedbackStartedAt(Date.now());
    setFeedbackResult(null);
    setFeedbackOpen(true);
  }, []);

  const startWorkspaceRename = useCallback(() => {
    if (!cloudWorkspace) return;
    setWorkspaceNameDraft(cloudWorkspace.name);
    setWorkspaceRenameOpen(true);
  }, [cloudWorkspace]);

  const cancelWorkspaceRename = useCallback(() => {
    setWorkspaceNameDraft(cloudWorkspace?.name ?? "");
    setWorkspaceRenameOpen(false);
  }, [cloudWorkspace]);

  const submitWorkspaceRename = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!cloudWorkspace) return;
      setWorkspaceRenaming(true);
      try {
        const response = await fetch("/api/workspaces", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: cloudWorkspace.id,
            name: workspaceNameDraft,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          workspace?: WorkspaceInfo;
          error?: string;
        };
        if (!response.ok || !payload.workspace)
          throw new Error(payload.error || copy.renameFailed);
        setCloudWorkspace(payload.workspace);
        setWorkspaceNameDraft(payload.workspace.name);
        setWorkspaceRenameOpen(false);
      } catch (renameError) {
        showNotice(
          renameError instanceof Error
            ? renameError.message
            : copy.renameFailed,
          null,
        );
      } finally {
        setWorkspaceRenaming(false);
      }
    },
    [cloudWorkspace, showNotice, workspaceNameDraft],
  );

  const switchCloudWorkspace = useCallback((workspace: WorkspaceInfo) => {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspace.id);
    setActiveWorkspaceCookie(workspace.id);
    window.location.assign(
      `/app?workspace=${encodeURIComponent(workspace.id)}`,
    );
  }, []);

  const submitFeedback = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFeedbackSubmitting(true);
      setFeedbackResult(null);
      const targetForm = event.currentTarget;
      const formData = new FormData(targetForm);
      formData.set(
        "route",
        `${window.location.pathname}${window.location.search}`,
      );
      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          issueUrl?: string;
        };
        if (!response.ok) throw new Error(payload.error || copy.feedbackFailed);
        setFeedbackResult({
          kind: "success",
          message: copy.feedbackThanks,
          issueUrl: payload.issueUrl,
        });
        targetForm.reset();
        setFeedbackStartedAt(Date.now());
      } catch (feedbackError) {
        setFeedbackResult({
          kind: "error",
          message:
            feedbackError instanceof Error
              ? feedbackError.message
              : copy.feedbackFailed,
        });
      } finally {
        setFeedbackSubmitting(false);
      }
    },
    [],
  );

  // Auto-connect to sync server when document changes
  useEffect(() => {
    if (!documentId || !syncUrl) return;
    if (syncDisconnectTimerRef.current) {
      clearTimeout(syncDisconnectTimerRef.current);
      syncDisconnectTimerRef.current = null;
    }
    let cancelled = false;
    const current = useMindMapStore.getState().document;
    if (!current) return;
    if (
      browserWorkspaceRef.current &&
      browserWorkspaceFiles.some((entry) => entry.path === current.filePath)
    )
      return;

    void connectDocumentSync(current, () => !cancelled).catch((syncError) => {
      if (!cancelled)
        console.warn("[BloomMD] Cloud sync is unavailable:", syncError);
    });

    return () => {
      cancelled = true;
      syncDisconnectTimerRef.current = setTimeout(() => {
        syncDisconnectTimerRef.current = null;
        useMindMapStore.getState().disconnectSync();
      }, 250);
    };
  }, [
    browserWorkspaceFiles,
    connectDocumentSync,
    document?.filePath,
    documentId,
    syncUrl,
  ]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div
          suppressHydrationWarning
          className="text-[var(--color-ink-faint)] text-lg font-[var(--font-display,Outfit,sans-serif)]"
        >
          {t.loading}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  const localFileOpen = Boolean(
    browserWorkspaceName &&
    document &&
    !isWorkspaceMindMap(document) &&
    browserWorkspaceFiles.some((entry) => entry.path === document.filePath),
  );
  const canNavigateBack =
    localFileOpen && mapView === "document" && !workspaceNavigationPending;
  const canNavigateForward =
    Boolean(
      browserWorkspaceName &&
      mapView === "workspace" &&
      forwardLocalFileAvailable &&
      forwardLocalFileRef.current &&
      browserWorkspaceFiles.some(
        (entry) => entry.path === forwardLocalFileRef.current,
      ),
    ) && !workspaceNavigationPending;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-surface)]">
      {/* Header */}
      <header className="relative z-40 h-13 shrink-0 overflow-visible border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center px-2 sm:px-4">
        <button
          onClick={() => setFileBrowserOpen(true)}
          className="mr-3 p-2 rounded-lg hover:bg-[var(--color-surface-sunken)] transition-colors text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          title={copy.fileBrowser}
        >
          <Menu size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"}
          alt="BloomMD"
          className="h-7"
        />
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="ml-2 flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] sm:hidden"
          title={t.aboutTitle}
          aria-label={t.aboutTitle}
          data-testid="mobile-about"
        >
          <Info size={18} aria-hidden="true" />
        </button>
        {cloudWorkspace && !localWorkspaceActive && (
          <div
            className="hidden items-center gap-1 md:flex"
            data-testid="cloud-workspace-chip"
          >
            {workspaceRenameOpen ? (
              <form
                onSubmit={(event) => void submitWorkspaceRename(event)}
                className="ml-3 flex min-w-0 items-center gap-1"
              >
                <Cloud
                  size={15}
                  className="shrink-0 text-[#FF6B35]"
                  aria-hidden="true"
                />
                <input
                  value={workspaceNameDraft}
                  onChange={(event) =>
                    setWorkspaceNameDraft(event.target.value)
                  }
                  className="h-8 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-semibold text-[var(--color-ink)] outline-none focus:border-[#FF6B35]"
                  aria-label={
                    locale === "en"
                      ? "Cloud workspace name"
                      : "Cloud-Workspace-Name"
                  }
                  data-testid="workspace-name-input"
                  disabled={workspaceRenaming}
                />
                <button
                  type="submit"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50"
                  aria-label={
                    locale === "en"
                      ? "Save workspace name"
                      : "Workspace-Namen speichern"
                  }
                  title={
                    locale === "en"
                      ? "Save workspace name"
                      : "Workspace-Namen speichern"
                  }
                  disabled={workspaceRenaming}
                  data-testid="save-workspace-name"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)]"
                  aria-label={
                    locale === "en" ? "Cancel rename" : "Umbenennen abbrechen"
                  }
                  title={
                    locale === "en" ? "Cancel rename" : "Umbenennen abbrechen"
                  }
                  onClick={cancelWorkspaceRename}
                  disabled={workspaceRenaming}
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              <WorkspaceManager
                activeWorkspace={cloudWorkspace}
                onWorkspaceChange={switchCloudWorkspace}
                onRename={startWorkspaceRename}
                onManageAgents={() => setWorkspaceAgentOpen(true)}
              />
            )}
            <button
              type="button"
              onClick={() => setWorkspaceAgentOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[#FF6B35]"
              title={
                locale === "en" ? "Assign OpenClaw" : "OpenClaw beauftragen"
              }
              aria-label={
                locale === "en" ? "Assign OpenClaw" : "OpenClaw beauftragen"
              }
              data-testid="open-workspace-agent"
            >
              <Bot size={16} />
            </button>
          </div>
        )}
        {cloudWorkspace?.role === "viewer" && !localWorkspaceActive && (
          <span
            className="ml-2 hidden rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 md:inline dark:text-amber-300"
            data-testid="workspace-read-only"
          >
            Nur Lesen
          </span>
        )}
        {browserWorkspaceName && (
          <div
            className="ml-3 flex items-center gap-1 rounded-md bg-[var(--color-surface-sunken)] p-0.5"
            role="group"
            aria-label={copy.mapView}
          >
            <button
              type="button"
              data-testid="workspace-navigation-back"
              onClick={handleBackToWorkspace}
              disabled={!canNavigateBack}
              title={`${copy.backToWorkspace} (Cmd/Ctrl+←)`}
              aria-label={copy.backToWorkspace}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-ink-faint)] transition hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="workspace-navigation-forward"
              onClick={handleForwardToFile}
              disabled={!canNavigateForward}
              title={`${copy.forwardToFile} (Cmd/Ctrl+→)`}
              aria-label={copy.forwardToFile}
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-ink-faint)] transition hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="map-view-document"
              aria-pressed={mapView === "document"}
              onClick={() => setMapView("document")}
              title={copy.documentView}
              className={`h-7 rounded px-2 text-xs font-semibold transition ${
                mapView === "document"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink-faint)]"
              }`}
            >
              {copy.documentView}
            </button>
            <button
              type="button"
              data-testid="map-view-workspace"
              aria-pressed={mapView === "workspace"}
              onClick={() => {
                if (!handleBackToWorkspace()) setMapView("workspace");
              }}
              title={copy.workspaceView}
              className={`h-7 rounded px-2 text-xs font-semibold transition ${
                mapView === "workspace"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink-faint)]"
              }`}
            >
              {copy.workspaceView}
            </button>
            <button
              type="button"
              data-testid="create-folder"
              onClick={() => setCreateKind("folder")}
              title={copy.createFolder}
              className="h-7 rounded px-2 text-xs font-semibold text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              {copy.createFolder}
            </button>
            <button
              type="button"
              data-testid="create-file"
              onClick={() => setCreateKind("file")}
              title={copy.createFile}
              className="h-7 rounded px-2 text-xs font-semibold text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              {copy.createFile}
            </button>
            <button
              type="button"
              data-testid="open-workspace-health"
              aria-pressed={healthOpen}
              onClick={() => setHealthOpen((open) => !open)}
              title={copy.check}
              className={`h-7 rounded px-2 text-xs font-semibold transition ${
                healthOpen
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink-faint)]"
              }`}
            >
              {copy.check}
            </button>
          </div>
        )}
        {localWorkspaceActive && (
          <div
            className="ml-2 hidden min-w-0 items-center gap-1.5 rounded-md border border-emerald-600/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 2xl:flex dark:text-emerald-300"
            data-testid="local-workspace-chip"
          >
            <ShieldCheck
              size={15}
              className="shrink-0"
              aria-label="Local workspace"
            />
            <span className="shrink-0 font-semibold">{copy.local}</span>
            <span className="max-w-40 truncate font-semibold">
              {browserWorkspaceName}
            </span>
          </div>
        )}
        {document && (
          <div className="ml-3 hidden items-center gap-2 2xl:flex">
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <span className="text-sm text-[var(--color-ink-faint)] font-[var(--font-display,Outfit,sans-serif)]">
              {document.frontmatter.title}
            </span>
            <SyncStatus />
          </div>
        )}
        {openTabs.length > 1 && (
          <div className="ml-3 hidden min-w-0 max-w-[42vw] items-center gap-1 overflow-x-auto lg:flex">
            {openTabs.map((tab) => {
              const active = document?.filePath.endsWith(tab.filename);
              return (
                <button
                  key={tab.filename}
                  type="button"
                  onClick={() => void openMindmap(tab.filename)}
                  className={`max-w-40 truncate rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-[#FF6B35]/40 bg-[var(--color-bloom-light)] text-[#FF6B35]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
                  }`}
                  title={tab.filename}
                  data-testid="mindmap-tab"
                  data-filename={tab.filename}
                >
                  {tab.title}
                </button>
              );
            })}
          </div>
        )}
        {browserWorkspaceSupported && (
          <div className="ml-2 hidden min-w-0 items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => void chooseBrowserWorkspace()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
              title="Open local Markdown folder"
              aria-label="Open local Markdown folder"
              data-testid="open-browser-workspace"
            >
              <FolderOpen size={18} />
            </button>
            {browserWorkspaceName && (
              <>
                <ShieldCheck
                  size={15}
                  className="shrink-0 text-emerald-600"
                  aria-label="Local workspace"
                />
                {workspacePermission === "read" && (
                  // Finding this out from a failed save is too late. The prompt has to come from a
                  // click: browsers reject a permission request that no gesture triggered.
                  <button
                    type="button"
                    data-testid="workspace-readonly"
                    onClick={() => void requestWorkspaceWriteAccess()}
                    title={
                      locale === "en"
                        ? "This folder is read-only. Click to request write access."
                        : "Dieser Ordner ist nur zum Lesen freigegeben. Klicken, um Schreibzugriff anzufragen."
                    }
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    {copy.readOnly}
                  </button>
                )}
                <select
                  value={
                    browserWorkspaceFiles.some(
                      (entry) => entry.path === document?.filePath,
                    )
                      ? document?.filePath
                      : ""
                  }
                  onChange={(event) => void openLocalFile(event.target.value)}
                  className="hidden h-8 max-w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 text-xs text-[var(--color-ink)] md:block"
                  title={browserWorkspaceName}
                  aria-label="Local workspace file"
                >
                  <option value="" disabled>
                    {browserWorkspaceName}
                  </option>
                  {browserWorkspaceFiles.map((entry) => (
                    <option key={entry.path} value={entry.path}>
                      {entry.path}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
        <div className="ml-4 hidden items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-ink-muted)] 2xl:flex">
          <Keyboard size={14} className="text-[#FF6B35]" />
          <span>{copy.shortcuts}</span>
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 font-[var(--font-mono,monospace)] text-[10px] text-[var(--color-ink)]">
            ?
          </kbd>
        </div>
        <div
          className="pointer-events-none ml-2 hidden shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-[var(--font-mono,monospace)] text-[11px] text-[var(--color-ink-muted)] 2xl:block"
          title={appBuildInfo.gitSha ?? appBuildInfo.displayVersion}
          data-testid="app-build-version"
        >
          {appBuildInfo.version}
          {appBuildInfo.shortSha ? ` · ${appBuildInfo.shortSha}` : ""}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toolbarRef.current?.triggerSave()}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] sm:hidden"
            title={copy.save}
            aria-label={copy.save}
          >
            <Save size={18} />
          </button>
          <div className="hidden items-center sm:flex">
            <Toolbar
              ref={toolbarRef}
              onReload={reload}
              onSaveFile={saveDocument}
              onToggleHelp={() => setHelpOpen((o) => !o)}
              onOpenAbout={() => setAboutOpen(true)}
              onToggleCommandPalette={() => setCommandPaletteOpen(true)}
              onOpenFeedback={openFeedbackDialog}
              onOpenOnboarding={() => setOnboardingOpen(true)}
              docsHref={localizedDocsUrl}
              accountHref={`/account?lang=${locale}`}
              onShareLink={document?.storage?.mode === "database" && !localWorkspaceActive ? shareReadOnlyLink : undefined}
            />
          </div>
        </div>
      </header>

      {/* Modals */}
      {shareLinksTarget && (
        <ShareLinksDialog
          filename={shareLinksTarget.filename}
          workspaceId={shareLinksTarget.workspaceId}
          locale={locale === "de" ? "de" : "en"}
          onClose={() => setShareLinksTarget(null)}
        />
      )}
      <FileBrowser
        open={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        onOpen={openMindmap}
        onRename={handleRenameFromSidebar}
        onDelete={handleDeleteMindmap}
        revealFilename={renameRevealFilename}
      />
      {cloudWorkspace && !localWorkspaceActive && (
        <>
          <WorkspaceAgentPanel
            open={workspaceAgentOpen}
            onClose={() => setWorkspaceAgentOpen(false)}
            workspace={cloudWorkspace}
            document={
              document?.storage?.mode === "database" &&
              document.storage.workspaceId === cloudWorkspace.id
                ? {
                    id: document.storage.documentId,
                    filename: document.filePath,
                    workspaceId: document.storage.workspaceId,
                  }
                : null
            }
            locale={locale}
            onApplied={reload}
          />
        </>
      )}
      {renameTarget && (
        <RenameMindmapDialog
          open
          filename={renameTarget.filename}
          title={renameTarget.title}
          error={renameError}
          onSubmit={submitRename}
          onClose={() => {
            setRenameTarget(null);
            setRenameError(null);
          }}
        />
      )}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNew={() => toolbarRef.current?.triggerNew()}
        onSave={() => void toolbarRef.current?.triggerSave()}
        onImport={() => toolbarRef.current?.triggerImport()}
        onExport={() => toolbarRef.current?.triggerExport()}
        onReload={() => void reload()}
        onOpenMindmap={openMindmap}
      />
      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        versionLabel={appBuildInfo.displayVersion}
        showWorkspaceNavigationShortcut
      />
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        buildInfo={aboutBuildInfo}
        platform="web"
      />
      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/25 p-4 backdrop-blur-sm sm:items-center">
          <section
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
            aria-label={copy.feedbackDialog}
            data-testid="feedback-dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                  {copy.feedbackDialog}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {locale === "en"
                    ? "Screenshots help with triage. Do not upload private Markdown content, credentials or personal data belonging to third parties."
                    : "Screenshots helfen bei der Triage. Bitte keine privaten Markdown-Inhalte, Zugangsdaten oder personenbezogenen Daten Dritter hochladen."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="rounded-md p-2 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
                aria-label={copy.close}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(event) => void submitFeedback(event)}
              className="grid gap-4 px-5 py-5"
            >
              <input
                type="hidden"
                name="formStartedAt"
                value={feedbackStartedAt}
              />
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />
              <input type="hidden" name="route" value="" />
              <p
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-[var(--font-mono,monospace)] text-xs text-[var(--color-ink-muted)]"
                data-testid="feedback-build-version"
              >
                {locale === "en" ? "Version" : "Version"}:{" "}
                {appBuildInfo.displayVersion}{" "}
                {locale === "en"
                  ? "is included automatically."
                  : "wird automatisch mitgesendet."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                  {locale === "en" ? "Type" : "Typ"}
                  <select
                    name="type"
                    defaultValue="bug"
                    className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-normal text-[var(--color-ink)]"
                  >
                    <option value="bug">Bug</option>
                    <option value="idea">
                      {locale === "en" ? "Idea" : "Idee"}
                    </option>
                    <option value="question">
                      {locale === "en" ? "Question" : "Frage"}
                    </option>
                    <option value="ux">UX</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                  {locale === "en" ? "Area" : "Bereich"}
                  <select
                    name="area"
                    defaultValue="web"
                    className="h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-normal text-[var(--color-ink)]"
                  >
                    <option value="web">Web</option>
                    <option value="desktop">Desktop</option>
                    <option value="sync">Sync</option>
                    <option value="docs">Docs</option>
                    <option value="other">
                      {locale === "en" ? "Other" : "Sonstiges"}
                    </option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                {locale === "en" ? "Description" : "Beschreibung"}
                <textarea
                  name="message"
                  required
                  minLength={10}
                  maxLength={5_000}
                  rows={6}
                  placeholder={
                    locale === "en"
                      ? "What happened, what did you expect, and which file or folder action was involved?"
                      : "Was ist passiert, was hast du erwartet, und welche Datei-/Ordneraktion war beteiligt?"
                  }
                  className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal leading-6 text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                  {locale === "en"
                    ? "Screenshot (optional)"
                    : "Screenshot (optional)"}
                  <input
                    name="screenshots"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--color-ink)]"
                  />
                  <span className="text-xs font-normal text-[var(--color-ink-faint)]">
                    {locale === "en"
                      ? "PNG, JPEG or WebP, max. 10 MB per file."
                      : "PNG, JPEG oder WebP, max. 10 MB je Datei."}
                  </span>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                  {locale === "en" ? "Video optional" : "Video optional"}
                  <input
                    name="video"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-normal text-[var(--color-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-surface-sunken)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--color-ink)]"
                  />
                  <span className="text-xs font-normal text-[var(--color-ink-faint)]">
                    {locale === "en"
                      ? "Max. 50 MB. Short recordings are enough."
                      : "Max. 50 MB. Kurze Aufnahmen reichen."}
                  </span>
                </label>
              </div>
              {feedbackResult && (
                <div
                  role="status"
                  className={`rounded-md border px-3 py-2 text-sm ${
                    feedbackResult.kind === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                  }`}
                  data-testid="feedback-result"
                >
                  {feedbackResult.message}
                  {feedbackResult.issueUrl && (
                    <a
                      href={feedbackResult.issueUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 font-semibold underline"
                    >
                      {locale === "en" ? "Open issue" : "Issue öffnen"}
                    </a>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F] disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="submit-feedback"
                >
                  {feedbackSubmitting ? <Save size={16} /> : <Send size={16} />}
                  {feedbackSubmitting ? copy.sending : copy.send}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {conflict && (
        <ConflictDialog
          filename={conflict.filename}
          mine={conflict.mine}
          theirs={conflict.theirs}
          onDismiss={() => setConflict(null)}
          onResolve={async (resolution) => {
            const pending = conflict;
            setConflict(null);
            if (resolution === "reload") {
              await reload();
              return;
            }
            if (resolution === "keep-mine") {
              // The user saw the diff and chose: save against the current version instead of the
              // stale one they started from.
              await fetch(
                `/api/mindmaps/${encodeURIComponent(pending.filename)}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    markdown: pending.mine,
                    overwrite: true,
                  }),
                },
              );
              await reload();
              return;
            }
            // Save copy: keep both versions instead of making the user pick a loser.
            const copyName =
              pending.filename.replace(/\.md$/i, "") +
              `-kopie-${Date.now()}.md`;
            await fetch("/api/mindmaps", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: copyName,
                markdown: pending.mine,
              }),
            });
            await reload();
          }}
        />
      )}

      {onboardingOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#1A1A1A]/20 p-4 backdrop-blur-sm sm:items-center">
          <section
            data-testid="onboarding-panel"
            // Scrollable: the panel grew past the viewport once the beta scope was added, which put
            // the footer buttons out of reach on short screens.
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-2xl"
            aria-label={`BloomMD ${copy.onboarding}`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                  {copy.onboarding}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {locale === "en"
                    ? "BloomMD is faster when you know the canvas actions and shortcuts."
                    : "BloomMD ist schneller, wenn du die Canvas-Aktionen und Shortcuts kennst."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOnboarding}
                data-testid="close-onboarding"
                className="rounded-md p-2 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
                aria-label={copy.close}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 px-5 py-5">
              {(locale === "en"
                ? [
                    {
                      icon: MousePointer2,
                      title: "Select a node",
                      detail:
                        "Click a node. The selection controls all structure shortcuts.",
                    },
                    {
                      icon: Plus,
                      title: "Extend the structure",
                      detail: "Press Tab for a child or Enter for a sibling.",
                    },
                    {
                      icon: Keyboard,
                      title: "Navigate",
                      detail:
                        "Use the arrow keys: right child, left parent, up/down siblings.",
                    },
                    {
                      icon: Save,
                      title: "Save",
                      detail: "Cmd+S writes the current Markdown file back.",
                    },
                    {
                      icon: HelpCircle,
                      title: "Open help",
                      detail: "Press ? or F1 for the complete shortcut list.",
                    },
                  ]
                : [
                    {
                      icon: MousePointer2,
                      title: "Node auswählen",
                      detail:
                        "Klicke eine Node an. Die Auswahl steuert alle Struktur-Shortcuts.",
                    },
                    {
                      icon: Plus,
                      title: "Struktur erweitern",
                      detail:
                        "Drücke Tab für ein Kind oder Enter für einen Sibling.",
                    },
                    {
                      icon: Keyboard,
                      title: "Navigieren",
                      detail:
                        "Nutze Pfeiltasten: rechts Kind, links Parent, hoch/runter Siblings.",
                    },
                    {
                      icon: Save,
                      title: "Speichern",
                      detail:
                        "Cmd+S schreibt die aktuelle Markdown-Datei zurück.",
                    },
                    {
                      icon: HelpCircle,
                      title: "Hilfe öffnen",
                      detail:
                        "Drücke ? oder F1 für die komplette Shortcut-Liste.",
                    },
                  ]
              ).map((item) => (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-bloom-light)] text-[#FF6B35]">
                    <item.icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-sm leading-5 text-[var(--color-ink-muted)]">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="border-t border-[var(--color-border)] px-5 py-4"
              data-testid="onboarding-beta-scope"
            >
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                {locale === "en"
                  ? "What this beta includes"
                  : "Was in dieser Beta enthalten ist"}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--color-ink-muted)]">
                {locale === "en" ? (
                  <>
                    Web and desktop are the core. Team collaboration runs as a
                    beta through shared cloud workspaces.{" "}
                    <strong className="font-semibold text-[var(--color-ink)]">
                      Mobile is not available.
                    </strong>
                  </>
                ) : (
                  <>
                    Web und Desktop sind der Kern. Team-Kollaboration läuft als
                    Beta über gemeinsame Cloud-Workspaces.{" "}
                    <strong className="font-semibold text-[var(--color-ink)]">
                      Mobile ist nicht verfügbar.
                    </strong>
                  </>
                )}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                {locale === "en"
                  ? "During the beta, do not upload anything whose loss would be a problem — no credentials or personal data of third parties. Work locally for real work."
                  : "Lade während der Beta nichts hoch, dessen Verlust ein Problem wäre — keine Zugangsdaten, keine personenbezogenen Daten Dritter. Für echte Arbeit lokal arbeiten."}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <button
                  type="button"
                  onClick={openFeedbackDialog}
                  data-testid="onboarding-feedback-link"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#C94D20] hover:underline"
                >
                  {locale === "en"
                    ? "Report feedback or a bug"
                    : "Feedback oder Bug melden"}
                </button>
                <a
                  href={localizedDocsUrl}
                  data-testid="onboarding-docs-link"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#C94D20] hover:underline"
                >
                  {copy.documentation}
                </a>
                <a
                  href={`/beta?lang=${locale}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-[#C94D20] hover:underline"
                >
                  {locale === "en" ? "View beta scope" : "Beta-Umfang ansehen"}
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                data-testid="show-shortcuts-from-onboarding"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
              >
                <Keyboard size={16} />
                {copy.showShortcuts}
              </button>
              <button
                type="button"
                onClick={closeOnboarding}
                data-testid="accept-onboarding"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#FF6B35] px-4 text-sm font-semibold text-white hover:bg-[#E95F2F]"
              >
                <CheckCircle2 size={16} />
                {copy.understood}
              </button>
            </div>
          </section>
        </div>
      )}

      {createKind && (
        <CreateEntryDialog
          kind={createKind}
          folders={browserWorkspaceRef.current?.folders() ?? []}
          onClose={() => setCreateKind(null)}
          onCreate={async (path) => {
            await createEntry(createKind, path);
            return path;
          }}
        />
      )}

      {notice && (
        <div
          role="status"
          data-testid="app-notice"
          className="fixed right-4 top-16 z-50 flex w-[min(32rem,calc(100vw-2rem))] items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900 shadow-lg"
        >
          <span className="min-w-0 flex-1">
            <span className="block">{notice.message}</span>
            {notice.nodeId && (
              <button
                type="button"
                onClick={() => focusNoticeNode(notice.nodeId!)}
                className="mt-1 inline-flex max-w-full items-center rounded text-xs font-semibold text-amber-950 underline underline-offset-2 hover:text-[#C94D20]"
                data-testid="app-notice-node-link"
              >
                <span className="truncate">
                  {copy.showNode}: {notice.nodeTitle || notice.nodeId}
                </span>
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={copy.closeNotice}
            className="shrink-0 rounded p-0.5 hover:bg-amber-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 h-full">
          {mapView === "workspace" ? (
            <div className="relative h-full w-full">
              {workspaceMapError && (
                <p
                  data-testid="workspace-map-notice"
                  className="absolute inset-x-0 top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2 text-center text-xs text-[var(--color-ink-muted)]"
                >
                  {workspaceMapError}
                </p>
              )}
              <WorkspaceMap
                files={workspaceGraphFiles}
                workspaceKey={browserWorkspaceName ?? "cloud"}
                onOpenFile={(path) => {
                  setMapView("document");
                  void openLocalFile(path);
                }}
              />
            </div>
          ) : (
            <MindMapCanvas
              onRootRename={handleRootRename}
              onAskAgent={
                cloudWorkspace &&
                !localWorkspaceActive &&
                document?.storage?.mode === "database" &&
                selectedAgentNode &&
                agentActivity.activeAgentCount > 0
                  ? () => {
                      setEditorVisible(true);
                      setNodeAgentOpen(true);
                    }
                  : undefined
              }
              agentActivity={selectedAgentActivity}
            />
          )}
        </div>
        {healthOpen && (
          <div className="w-80 shrink-0">
            <WorkspaceHealth
              files={workspaceGraphFiles}
              onClose={() => setHealthOpen(false)}
              onOpenFile={(path) => {
                setMapView("document");
                void openLocalFile(path);
              }}
            />
          </div>
        )}
        {mapView === "document" &&
          !healthOpen &&
          selectedNodeId &&
          (editorVisible || nodeAgentOpen) && (
            <ResizableEditor
              agentOpen={nodeAgentOpen}
              agentBadge={
                selectedAgentActivity.queuedOrRunning +
                selectedAgentActivity.pendingProposals
              }
              onAgentOpenChange={setNodeAgentOpen}
              agentPanel={
                cloudWorkspace &&
                !localWorkspaceActive &&
                document?.storage?.mode === "database" &&
                selectedAgentNode ? (
                  <WorkspaceAgentPanel
                    open={nodeAgentOpen}
                    onClose={() => setNodeAgentOpen(false)}
                    workspace={cloudWorkspace}
                    document={
                      document.storage.workspaceId === cloudWorkspace.id
                        ? {
                            id: document.storage.documentId,
                            filename: document.filePath,
                            workspaceId: document.storage.workspaceId,
                          }
                        : null
                    }
                    locale={locale}
                    onApplied={async () => {
                      await reload();
                      await refreshAgentActivity();
                    }}
                    mode="node"
                    node={selectedAgentNode}
                    variant="sidebar"
                  />
                ) : undefined
              }
            />
          )}
      </div>
    </div>
  );
}
