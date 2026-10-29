import Electrobun, { BrowserWindow, BrowserView, Updater, Utils } from "electrobun/bun";
import {
  FileStore,
  buildWorkspaceMindMap,
  normalizeMarkdownFilename,
  normalizeMarkdownPath,
  parseFile,
  resolveMarkdownPath,
  sanitizeMarkdownFilename,
  serializeToMarkdown,
} from "@bloommd/core";
import { watchWorkspace } from "./workspace-watcher";
import { copyFile, mkdir, readFile, rename, access, stat } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { arch, homedir, platform, release, tmpdir, userInfo } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  BloomMDRPC,
  DesktopConnectionProfile,
  DesktopBuildInfo,
  DesktopFeedbackAttachment,
  DesktopFeedbackRequest,
  DesktopUpdateResult,
  DesktopUpdateState,
  DesktopUpdateStatus,
} from "../shared/rpc-types";
import {
  createLocalSharedDocumentState,
  hashSharedDocumentMarkdown,
  transitionSharedDocumentState,
  validateSharedDocumentBinding,
  type MindMapNode,
} from "@bloommd/core";
import { ApiFileStore } from "./api-file-store";
import { installApplicationMenu, setApplicationMenuLocale } from "./menu";
import {
  loadSettings,
  migrateLegacyRemote,
  rememberConnectionProfileWorkspace,
  removeConnectionProfile,
  replaceConnectionProfile,
  updateSettings,
  type ConnectionProfile,
  type DesktopSettings,
  type DesktopSharedDocumentBinding,
} from "./settings";
import { createSecureStorage, SecureStorageUnavailableError, type SecureStorage } from "./secure-storage";
import { validateAndActivateConnection } from "./connection-profile-flow";
import { isMarkdownPath, parseCliPath, parseExternalNodeId, parseExternalTarget } from "./external-file";
import { firstSelectedPath } from "./dialog-selection";
import { startNativeDialog } from "./native-dialog";
import { RPC_MAX_REQUEST_TIME_MS } from "../shared/native-dialog";
import { appendDesktopE2EEvent, parseDesktopArgs, writeDesktopE2EState } from "./e2e-mode";
import { createDesktopInstanceHandoff, type DesktopInstanceHandoff } from "./instance-handoff";
import { desktopHandoffPath, handoffPrivateDir, type HandoffPathInput } from "./handoff-path";
import { StartupTargets, type StartupTarget } from "./startup-targets";
import packageJson from "../../package.json";

// A link that launches the app (e.g. "Open app" in Obsidian) arrives while startup is still
// awaiting settings and the instance lock. Electrobun does not buffer the event, so it is caught
// here, before the first await. Until startup has settled, links and handoffs only record the
// cold-start target; startup opens it on the same awaited path as a command-line target, before
// the remembered folder or server could replace it.
const earlyOpenUrls: string[] = [];
let handleOpenUrl: ((url: string) => void) | null = null;
const startupTargets = new StartupTargets();
Electrobun.events.on("open-url", (event) => {
  const url = (event as { data?: { url?: string } }).data?.url ?? "";
  if (handleOpenUrl) handleOpenUrl(url);
  else earlyOpenUrls.push(url);
});

// Default data directory
let bloommdDir = join(homedir(), "bloommd");
let localStore = new FileStore({ baseDir: bloommdDir });
let remoteStore: ApiFileStore | null = null;
let watcher: ReturnType<typeof watchWorkspace> | null = null;

// Connection mode: local (filesystem) or remote (API)
type ConnectionMode =
  | { type: "local"; dir: string }
  | { type: "remote"; profileId: string; name: string; url: string; accessToken: string; syncUrl: string };

let mode: ConnectionMode = { type: "local", dir: bloommdDir };
/** Set when a remembered server could not be reached at startup, so the UI can explain the fallback. */
let reconnectFailedProfile: { profileId: string; name: string; url: string } | null = null;
const secureStorage: SecureStorage = createSecureStorage();
let desktopSettings: DesktopSettings = {};
let mainWindow: BrowserWindow | null = null;
let pendingExternalFilename: string | null = null;
let pendingExternalKind: "file" | "folder" | null = null;
let pendingExternalNodeId: string | null = null;
let openedExternalTarget = false;
const desktopArgs = parseDesktopArgs(Bun.argv.slice(2), process.env, process.cwd());
/** True once the renderer has mounted and registered its handlers (it asked for the pending file). */
let rendererReady = false;
const handoffPathInput: HandoffPathInput = {
  platform: process.platform,
  env: process.env,
  tmpdir: tmpdir(),
  uid: typeof process.getuid === "function" ? process.getuid() : -1,
  username: (() => {
    try {
      return userInfo().username;
    } catch {
      return process.env.USERNAME ?? process.env.USER ?? "";
    }
  })(),
};
const desktopInstanceHandoff: DesktopInstanceHandoff = await createDesktopInstanceHandoff(
  desktopHandoffPath(handoffPathInput),
  (target, nodeId) => {
    void appendDesktopE2EEvent(desktopArgs.e2e, "instanceHandoffReceived", {});
    if (!startupTargets.offer({ path: target, nodeId })) void openExternalTarget(target, nodeId);
  },
  { privateDir: handoffPrivateDir(handoffPathInput) },
).catch((error: unknown) => {
  // Without a private channel BloomMD still works; only handing notes to it from outside does not.
  console.error("[BloomMD] Instance handoff unavailable:", error instanceof Error ? error.message : "unknown error");
  return { isPrimary: true, forward: async () => false, close: async () => undefined };
});
void appendDesktopE2EEvent(desktopArgs.e2e, "instanceHandoffReady", { primary: desktopInstanceHandoff.isPrimary });
const MAX_RESOURCE_PREVIEW_BYTES = 20 * 1024 * 1024;
const MAX_LINK_PREVIEW_HTML_BYTES = 1_000_000;
const MAX_LINK_PREVIEW_REDIRECTS = 2;
const RESOURCE_MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function isRemote(): boolean {
  return mode.type === "remote";
}

function resourceMimeType(path: string): string | null {
  const lower = path.toLowerCase();
  const extension = Object.keys(RESOURCE_MIME_TYPES).find((candidate) => lower.endsWith(candidate));
  return extension ? RESOURCE_MIME_TYPES[extension]! : null;
}

function resolveResourcePath(baseDir: string, path: string): string {
  const resolvedBase = resolve(baseDir);
  const resolvedPath = path.startsWith("/") ? resolve(path) : resolve(resolvedBase, path.replace(/^\.\//, ""));
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${sep}`)) {
    throw new Error("Resource path escapes workspace");
  }
  return resolvedPath;
}

function blockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = -1, b = -1] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%", 1)[0] ?? address;
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password || !url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    throw new Error("This URL is not allowed.");
  }
  const ipVersion = isIP(url.hostname);
  if (ipVersion === 4 && blockedIpv4(url.hostname)) throw new Error("Private network URLs are not allowed.");
  if (ipVersion === 6 && blockedIpv6(url.hostname)) throw new Error("Private network URLs are not allowed.");
  if (!ipVersion) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => entry.family === 4 ? blockedIpv4(entry.address) : blockedIpv6(entry.address))) {
      throw new Error("This URL resolves to a private network.");
    }
  }
  return url;
}

function cleanPreviewText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[entity] ?? entity))
    .replace(/\s+/g, " ")
    .trim();
}

function parseLinkPreviewHtml(html: string, finalUrl: URL) {
  const meta: Record<string, string> = {};
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const raw = tag[0] ?? "";
    const key = raw.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = raw.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (key && content) meta[key] = cleanPreviewText(content);
  }
  const title = cleanPreviewText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const image = meta["og:image"] || meta["twitter:image"];
  let resolvedImage: string | undefined;
  if (image) {
    try {
      const candidate = new URL(image, finalUrl);
      if (candidate.protocol === "http:" || candidate.protocol === "https:") resolvedImage = candidate.toString();
    } catch {
      // Ignore malformed image metadata.
    }
  }
  return {
    ...(meta["og:title"] || meta["twitter:title"] || title ? { title: meta["og:title"] || meta["twitter:title"] || title } : {}),
    ...(meta.description || meta["og:description"] || meta["twitter:description"] ? { description: meta.description || meta["og:description"] || meta["twitter:description"] } : {}),
    ...(resolvedImage ? { image: resolvedImage } : {}),
  };
}

async function fetchLinkPreviewForDesktop(value: string) {
  let current = await assertPublicHttpUrl(value);
  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_LINK_PREVIEW_REDIRECTS; redirects += 1) {
    response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "BloomMD-LinkPreview/1.0" },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirects === MAX_LINK_PREVIEW_REDIRECTS) throw new Error("Too many redirects.");
    current = await assertPublicHttpUrl(new URL(location, current).toString());
  }
  if (!response || !response.ok) throw new Error(`Website returned HTTP ${response?.status ?? 0}.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("The URL did not return an HTML page.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_LINK_PREVIEW_HTML_BYTES) throw new Error("The HTML page is too large for a preview.");
  return { url: value, finalUrl: current.toString(), ...parseLinkPreviewHtml(new TextDecoder().decode(bytes), current) };
}

async function openExternalUrlWithOs(value: string): Promise<void> {
  const url = (await assertPublicHttpUrl(value)).toString();
  const command = process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];
  const processResult = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" });
  const exitCode = await processResult.exited;
  if (exitCode !== 0) {
    const errorOutput = await new Response(processResult.stderr).text().catch(() => "");
    throw new Error(errorOutput.trim() || `Open command exited with ${exitCode}.`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function uniqueWorkspaceResourcePath(filename: string): Promise<string> {
  const attachmentsDir = join(bloommdDir, "anhaenge");
  await mkdir(attachmentsDir, { recursive: true });

  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : "";
  let candidate = join(attachmentsDir, filename);
  let suffix = 1;

  while (await pathExists(candidate)) {
    candidate = join(attachmentsDir, `${stem}-${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
}

async function importResourceIntoWorkspace(selectedPath: string): Promise<string> {
  const fullSelectedPath = resolve(selectedPath);
  const fullWorkspacePath = resolve(bloommdDir);
  if (fullSelectedPath.startsWith(`${fullWorkspacePath}${sep}`)) {
    return relative(fullWorkspacePath, fullSelectedPath);
  }

  const targetPath = await uniqueWorkspaceResourcePath(basename(fullSelectedPath));
  await copyFile(fullSelectedPath, targetPath);
  return relative(fullWorkspacePath, targetPath);
}

function serializeNodes(nodes: Map<string, MindMapNode>) {
  return Object.fromEntries(nodes);
}

function serializeDocument(doc: Awaited<ReturnType<FileStore["read"]>>) {
  return {
    filePath: doc.filePath,
    frontmatter: doc.frontmatter,
    nodes: serializeNodes(doc.nodes),
    rootId: doc.rootId,
    preamble: doc.preamble,
    references: doc.references,
    derived: doc.derived,
    storage: doc.storage,
  };
}

function desktopFeedbackEndpoint() {
  const fromEnv = process.env.BLOOMMD_FEEDBACK_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const baseUrl = mode.type === "remote" ? mode.url : fromEnv || "https://bloommd.app";
  return `${baseUrl.replace(/\/+$/, "")}/api/feedback`;
}

function desktopDisplayVersion() {
  const version = process.env.BLOOMMD_RELEASE_VERSION || packageJson.version;
  const sha = process.env.BLOOMMD_BUILD_SHA || "";
  return sha ? `BloomMD ${version} (${sha.slice(0, 7)})` : `BloomMD ${version}`;
}

async function desktopBuildInfo(): Promise<DesktopBuildInfo> {
  const version = process.env.BLOOMMD_RELEASE_VERSION || packageJson.version;
  const sha = process.env.BLOOMMD_BUILD_SHA || "";
  const shortSha = sha.slice(0, 7);
  let channel = process.env.BLOOMMD_BUILD_CHANNEL || process.env.ELECTROBUN_BUILD_ENV || "development";

  try {
    const updaterChannel = await Updater.localInfo.channel();
    if (updaterChannel) channel = updaterChannel;
  } catch (error) {
    console.warn("[BloomMD] Build channel unavailable:", error instanceof Error ? error.message : String(error));
  }

  return {
    product: "BloomMD",
    package: packageJson.name,
    deployment: "desktop",
    version,
    sha: sha || "unknown",
    shortSha: shortSha || "unknown",
    tag: process.env.BLOOMMD_BUILD_TAG || "unknown",
    buildTime: process.env.BLOOMMD_BUILD_TIME || "unknown",
    channel,
    displayVersion: shortSha ? `BloomMD ${version} (${shortSha})` : `BloomMD ${version}`,
  };
}

let latestUpdateStatus: DesktopUpdateStatus | null = null;

function emptyUpdateResult(error = ""): DesktopUpdateResult {
  return { version: "", hash: "", updateAvailable: false, updateReady: false, error };
}

function serializeUpdateStatus(entry: {
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
}): DesktopUpdateStatus {
  return {
    status: entry.status,
    message: entry.message,
    timestamp: entry.timestamp,
    details: entry.details,
  };
}

async function desktopUpdateState(updateOverride?: DesktopUpdateResult): Promise<DesktopUpdateState> {
  const local = await Updater.getLocalInfo();
  const currentUpdate = Updater.updateInfo() as DesktopUpdateResult | undefined;
  return {
    local: { version: local.version, hash: local.hash, channel: local.channel },
    update: updateOverride ?? currentUpdate ?? emptyUpdateResult(),
    status: latestUpdateStatus,
  };
}

function updateErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeFeedbackLine(value: string | null | undefined, fallback = "unknown") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : fallback;
}

async function feedbackInstallationId() {
  const settings = await loadSettings();
  if (settings.feedbackInstallationId) return settings.feedbackInstallationId;
  const installationId = crypto.randomUUID();
  await updateSettings({ feedbackInstallationId: installationId });
  return installationId;
}

function appendFeedbackAttachment(form: FormData, field: "screenshots" | "video", attachment: DesktopFeedbackAttachment) {
  const bytes = Uint8Array.from(atob(attachment.base64), (char) => char.charCodeAt(0));
  form.append(field, new File([bytes], attachment.filename, { type: attachment.mimeType }));
}

function desktopFeedbackErrorMessage(status: number, serverError?: string) {
  if (status === 401 || status === 403) {
    if (mode.type === "local") {
      return "Der Feedback-Server hat lokales Desktop-Feedback noch nicht angenommen. Dein Text bleibt erhalten; bitte sende es nach dem Server-Rollout erneut.";
    }
    return "Der Feedback-Server hat den Remote-Zugriff abgelehnt. Bitte verbinde die App erneut und sende das Feedback danach noch einmal.";
  }
  if (status === 413) return "Die Anhänge sind zu groß. Bitte entferne große Dateien und sende das Feedback erneut.";
  if (status >= 500) return "Der Feedback-Server ist gerade nicht erreichbar. Dein Text bleibt erhalten; bitte versuche es später erneut.";
  return serverError || `Feedback konnte nicht gesendet werden (HTTP ${status}).`;
}

function desktopDiagnostics(input: DesktopFeedbackRequest) {
  return [
    `Desktop-Version: ${desktopDisplayVersion()}`,
    `Package-Version: ${packageJson.version}`,
    `Build-SHA: ${process.env.BLOOMMD_BUILD_SHA || "unknown"}`,
    `Build-Tag: ${process.env.BLOOMMD_BUILD_TAG || "unknown"}`,
    `Build-Zeitpunkt: ${process.env.BLOOMMD_BUILD_TIME || "unknown"}`,
    `OS: ${platform()} ${release()} ${arch()}`,
    `App-Modus: ${mode.type}`,
    `Remote-Host: ${mode.type === "remote" ? new URL(mode.url).host : "none"}`,
    `Workspace-Typ: ${mode.type === "remote" ? "remote" : "local"}`,
    `View: ${input.context.workspaceMode ? "workspace" : "mindmap"}`,
    `Aktive Datei: ${sanitizeFeedbackLine(input.context.currentFile, "none")}`,
    `Dokument-ID: ${sanitizeFeedbackLine(input.context.documentId, "none")}`,
    `Ausgewählter Node: ${sanitizeFeedbackLine(input.context.selectedNodeId, "none")}`,
    `Ausgewählter Node-Typ: ${sanitizeFeedbackLine(input.context.selectedNodeType, "unknown")}`,
    `Editor offen: ${input.context.editorVisible ? "yes" : "no"}`,
    `Node-Anzahl: ${input.context.nodeCount ?? "unknown"}`,
    `Referenz-Anzahl: ${input.context.referenceEdgeCount ?? "unknown"}`,
    `Gemeldet: ${new Date().toISOString()}`,
  ].join("\n");
}

async function submitDesktopFeedback(input: DesktopFeedbackRequest) {
  const form = new FormData();
  form.set("desktopFeedback", "1");
  form.set("desktopInstallationId", await feedbackInstallationId());
  form.set("type", input.type);
  form.set("area", "desktop");
  form.set("message", input.message);
  form.set("contactEmail", input.contactEmail ?? "");
  form.set("route", `desktop://${mode.type}/${input.context.workspaceMode ? "workspace" : "mindmap"}`);
  form.set("diagnostics", desktopDiagnostics(input));
  form.set("formStartedAt", String(input.formStartedAt));
  form.set("website", input.website);
  for (const attachment of input.attachments) appendFeedbackAttachment(form, "screenshots", attachment);
  if (input.video) appendFeedbackAttachment(form, "video", input.video);

  const headers: HeadersInit = { "User-Agent": `${desktopDisplayVersion()} Desktop/${platform()}` };
  if (mode.type === "remote") headers.Authorization = `Bearer ${mode.accessToken}`;

  const response = await fetch(desktopFeedbackEndpoint(), {
    method: "POST",
    headers,
    body: form,
  });
  const body = await response.json().catch(() => ({})) as { error?: string; issueNumber?: number; issueUrl?: string };
  if (!response.ok) {
    throw new Error(desktopFeedbackErrorMessage(response.status, body.error));
  }
  if (!body.issueNumber || !body.issueUrl) throw new Error("Feedback response did not include a GitHub issue.");
  return { success: true as const, issueNumber: body.issueNumber, issueUrl: body.issueUrl };
}

function startWatching(mainWindow: BrowserWindow) {
  if (watcher) {
    void watcher.close().catch((error) => console.error("[BloomMD] Previous workspace watcher could not close:", error));
  }

  const pendingFiles = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const nextWatcher = watchWorkspace(bloommdDir, (filename, kind) => {
    if (watcher !== nextWatcher) return;
    void appendDesktopE2EEvent(desktopArgs.e2e, "fileChanged", { filename, kind });
    pendingFiles.add(filename);
    if (flushTimer === null) flushTimer = setTimeout(() => {
      flushTimer = null;
      const filenames = [...pendingFiles];
      pendingFiles.clear();
      if (watcher === nextWatcher) {
        void appendDesktopE2EEvent(desktopArgs.e2e, "fileChangeBatchSent", { count: filenames.length });
        mainRPC.send.filesChanged({ filenames });
      }
    }, 50);
  });
  nextWatcher.on("error", (error) => console.error("[BloomMD] Workspace watcher failed:", error));
  watcher = nextWatcher;
}

function normalizeConnectionUrl(value: string): string {
  const parsedUrl = new URL(value);
  if (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
    throw new Error("Cloud connections require HTTPS.");
  }
  return parsedUrl.origin;
}

function profileById(profileId: string): ConnectionProfile {
  const profile = desktopSettings.profiles?.find((entry) => entry.id === profileId);
  if (!profile) throw new Error("Connection profile not found.");
  return profile;
}

async function desktopConnectionProfile(profile: ConnectionProfile): Promise<DesktopConnectionProfile> {
  return profileSummary(profile, Boolean(await secureStorage.get(profile.tokenRef)));
}

function profileSummary(profile: ConnectionProfile, hasToken: boolean): DesktopConnectionProfile {
  return {
    id: profile.id,
    name: profile.name,
    url: profile.url,
    ...(profile.lastWorkspaceId ? { lastWorkspaceId: profile.lastWorkspaceId } : {}),
    ...(profile.lastConnectedAt ? { lastConnectedAt: profile.lastConnectedAt } : {}),
    hasToken,
  };
}

function connectionProfileError(error: unknown, fallback: string): string {
  return error instanceof SecureStorageUnavailableError ? error.code : error instanceof Error ? error.message : fallback;
}

function sharedDocumentBindingForFilename(localFilename: string): DesktopSharedDocumentBinding | undefined {
  return desktopSettings.sharedDocumentBindings?.find((entry) => entry.localFilename === localFilename);
}

function sharedDocumentInfo(entry: DesktopSharedDocumentBinding): import("../shared/rpc-types").DesktopSharedDocumentInfo {
  const profile = desktopSettings.profiles?.find((candidate) => candidate.id === entry.profileId);
  return {
    localFilename: entry.localFilename,
    profileId: entry.profileId,
    profileName: profile?.name ?? "Unavailable profile",
    workspaceId: entry.binding.workspaceId,
    documentId: entry.binding.documentId,
    cloudFilename: entry.binding.cloudFilename,
    lastAcknowledgedMarkdownHash: entry.binding.lastAcknowledgedMarkdownHash,
    lastKnownCloudVersion: entry.binding.lastKnownCloudVersion,
    connectionState: entry.binding.connectionState,
  };
}

async function replaceSharedDocumentBinding(entry: DesktopSharedDocumentBinding): Promise<void> {
  const bindings = desktopSettings.sharedDocumentBindings ?? [];
  await persistDesktopSettings({
    sharedDocumentBindings: bindings.some((candidate) => candidate.localFilename === entry.localFilename)
      ? bindings.map((candidate) => candidate.localFilename === entry.localFilename ? entry : candidate)
      : [...bindings, entry],
  });
}

async function markSharedDocumentUnavailable(entry: DesktopSharedDocumentBinding, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const event = /(?:^|\s)(?:401|403|404)(?:\s|$)/.test(message)
    ? { type: "access_revoked" as const }
    : entry.binding.connectionState === "connected"
      ? { type: "connection_lost" as const }
      : null;
  if (!event) return;
  const next = transitionSharedDocumentState({ kind: entry.binding.connectionState, binding: entry.binding }, event);
  if (next.kind === "connected" || next.kind === "offline" || next.kind === "conflict" || next.kind === "revoked") {
    await replaceSharedDocumentBinding({ ...entry, binding: next.binding });
  }
}

async function connectionModeInfo(): Promise<import("../shared/rpc-types").ConnectionModeInfo> {
  if (mode.type === "remote") {
    return { type: "remote", profileId: mode.profileId, name: mode.name, url: mode.url, syncUrl: mode.syncUrl };
  }
  return {
    type: "local",
    dir: mode.dir,
    ...(reconnectFailedProfile ? { reconnectFailed: reconnectFailedProfile } : {}),
  };
}

async function persistDesktopSettings(patch: Partial<DesktopSettings>): Promise<void> {
  const persistedSettings = await updateSettings(patch);
  desktopSettings = persistedSettings;
}

async function validateRemoteProfile(profile: ConnectionProfile): Promise<{
  apiStore: ApiFileStore;
  accessToken: string;
  syncUrl: string;
  workspace: import("../shared/rpc-types").DesktopWorkspaceInfo | null;
  workspaces: import("../shared/rpc-types").DesktopWorkspaceInfo[];
  files: import("@bloommd/core").MindMapListEntry[];
}> {
  const accessToken = await secureStorage.get(profile.tokenRef);
  if (!accessToken) throw new Error("No access token is stored for this profile.");
  const apiStore = new ApiFileStore({ baseUrl: profile.url, accessToken });
  let workspaceContext = await apiStore.listWorkspaces();
  if (profile.lastWorkspaceId && workspaceContext.workspaces.some((entry) => entry.id === profile.lastWorkspaceId)) {
    workspaceContext = await apiStore.selectWorkspace(profile.lastWorkspaceId);
  }
  const files = await apiStore.list();
  let syncUrl = "";
  try {
    syncUrl = await apiStore.fetchSyncUrl();
  } catch {
    console.warn("[BloomMD] Remote sync endpoint is unavailable; live collaboration will stay disabled.");
  }
  return { apiStore, accessToken, syncUrl, workspace: workspaceContext.workspace, workspaces: workspaceContext.workspaces, files };
}

async function activateRemoteProfile(profile: ConnectionProfile, validated: Awaited<ReturnType<typeof validateRemoteProfile>>) {
  const updatedProfile: ConnectionProfile = { ...profile, lastConnectedAt: new Date().toISOString() };
  const profiles = replaceConnectionProfile(desktopSettings.profiles ?? [], updatedProfile);
  await persistDesktopSettings({ profiles, activeConnection: { type: "remote", profileId: updatedProfile.id } });
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  remoteStore = validated.apiStore;
  mode = {
    type: "remote",
    profileId: updatedProfile.id,
    name: updatedProfile.name,
    url: updatedProfile.url,
    accessToken: validated.accessToken,
    syncUrl: validated.syncUrl,
  };
  reconnectFailedProfile = null;
  if (mainWindow) mainRPC.send.connectionModeChanged({ type: "remote", profileId: updatedProfile.id, syncUrl: validated.syncUrl });
  return {
    syncUrl: validated.syncUrl,
    workspace: validated.workspace,
    workspaces: validated.workspaces,
    files: validated.files,
    profile: await desktopConnectionProfile(updatedProfile),
  };
}

async function switchToLocalConnection() {
  await persistDesktopSettings({ localDir: bloommdDir, activeConnection: { type: "local" } });
  if (mainWindow) startWatching(mainWindow);
  reconnectFailedProfile = null;
  mode = { type: "local", dir: bloommdDir };
  remoteStore = null;
  if (mainWindow) mainRPC.send.connectionModeChanged({ type: "local" });
}

// --- Splash Screen ---
const splashWindow = new BrowserWindow({
  title: "BloomMD",
  url: "views://splash/index.html",
  titleBarStyle: "hidden",
  frame: {
    width: 420,
    height: 360,
    x: 500,
    y: 300,
  },
});

// --- Native dialogs ---
// They wait for a person, so they run outside the RPC request (see ../shared/native-dialog.ts).
async function runChooseDirectory() {
  if (isRemote()) {
    return { path: null };
  }

  try {
    const paths = await Utils.openFileDialog({
      startingFolder: bloommdDir,
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false,
    });

    const selected = firstSelectedPath(paths);
    if (!selected) {
      return { path: null };
    }

    const info = await stat(selected);
    if (!info.isDirectory()) {
      return { path: null, error: "Selected path is not a directory." };
    }

    bloommdDir = selected;
    mode = { type: "local", dir: bloommdDir };
    localStore = new FileStore({ baseDir: bloommdDir });

    await updateSettings({ localDir: bloommdDir });
    await appendDesktopE2EEvent(desktopArgs.e2e, "chooseDirectory", { localDir: bloommdDir });
    await writeDesktopE2EState(desktopArgs.e2e, {
      source: "chooseDirectory",
      localDir: bloommdDir,
      activeFile: null,
      emptyWorkspace: false,
      mode: "local",
    });

    if (mainWindow) {
      startWatching(mainWindow);
      mainRPC.send.connectionModeChanged({ type: "local" });
    }

    console.log(`[BloomMD] Switched local directory to: ${selected}`);
    return { path: selected };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BloomMD] chooseDirectory error:", message);
    return { path: null, error: message };
  }
}

async function runChooseResourceFile(kind: "file" | "pdf") {
  if (isRemote()) {
    return { path: null, error: "Resource files can currently only be selected for local workspaces." };
  }

  try {
    const paths = await Utils.openFileDialog({
      startingFolder: bloommdDir,
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: false,
      allowedFileTypes: kind === "pdf" ? "pdf" : "*",
    });

    const selected = firstSelectedPath(paths);
    if (!selected) {
      return { path: null };
    }

    const info = await stat(selected);
    if (!info.isFile()) {
      return { path: null, error: "Selected path is not a file." };
    }

    if (kind === "pdf" && resourceMimeType(selected) !== "application/pdf") {
      return { path: null, error: "Selected file is not a PDF." };
    }

    return { path: await importResourceIntoWorkspace(selected) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[BloomMD] chooseResourceFile error:", message);
    return { path: null, error: message };
  }
}

async function runImportFile() {
  try {
    const paths = await Utils.openFileDialog({
      startingFolder: bloommdDir,
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: false,
      allowedFileTypes: "*",
    });

    const srcPath = paths[0];
    if (!srcPath || srcPath === "") {
      return { filePath: null };
    }

    const content = await readFile(srcPath, "utf-8");
    const filename = sanitizeMarkdownFilename(srcPath.split("/").pop() || "imported.md");

    if (isRemote()) {
      // Upload to remote server
      const doc = await remoteStore!.create(filename, content);
      return {
        filePath: doc.filePath,
        frontmatter: doc.frontmatter,
        nodes: serializeNodes(doc.nodes),
        rootId: doc.rootId,
        preamble: doc.preamble,
        storage: doc.storage,
      };
    }

    const destPath = resolveMarkdownPath(bloommdDir, filename);
    const doc = parseFile(destPath, content);
    await localStore.write(doc);
    return {
      filePath: doc.filePath,
      frontmatter: doc.frontmatter,
      nodes: serializeNodes(doc.nodes),
      rootId: doc.rootId,
      preamble: doc.preamble,
      storage: doc.storage,
    };
  } catch (err) {
    console.error("[BloomMD] importFile error:", err);
    return { filePath: null };
  }
}

// --- Main Window Setup ---
const mainRPC = BrowserView.defineRPC<BloomMDRPC>({
  maxRequestTime: RPC_MAX_REQUEST_TIME_MS,
  handlers: {
    requests: {
      listMindmaps: async () => {
        if (isRemote()) {
          const files = await remoteStore!.list();
          return { files };
        }
        const unreadablePaths: string[] = [];
        const files = await localStore.list((path, error) => {
          console.error("[BloomMD] Could not list workspace entry:", path, error);
          unreadablePaths.push(path);
        });
        return { files, unreadablePaths };
      },

      openMindmap: async ({ filename }) => {
        if (isRemote()) {
          const doc = await remoteStore!.read(filename);
          return serializeDocument(doc);
        }
        const doc = await localStore.read(filename);
        return serializeDocument(doc);
      },

      openWorkspace: async () => {
        if (isRemote()) {
          const listed = await remoteStore!.list();
          const docs = await Promise.all(listed.map((entry) => remoteStore!.read(entry.filename)));
          const doc = buildWorkspaceMindMap(
            docs.map((entry) => ({
              path: entry.filePath.split("/").pop() ?? entry.filePath,
              markdown: serializeToMarkdown(entry),
            })),
            { title: "Workspace", source: mode.type === "remote" ? mode.url : undefined },
          );
          return serializeDocument(doc);
        }
        const unreadablePaths: string[] = [];
        const doc = await localStore.readWorkspaceMindMap(basename(bloommdDir), (path, error) => {
          console.error("[BloomMD] Could not read workspace entry:", path, error);
          unreadablePaths.push(path);
        });
        return { ...serializeDocument(doc), unreadablePaths };
      },

      saveMindmap: async ({ filePath, markdown, storage }) => {
        if (isRemote()) {
          try {
            const filename = filePath.split("/").pop() ?? "";
            const doc = parseFile(filename, markdown);
            doc.storage = storage;
            await remoteStore!.write(doc);
            console.log("[BloomMD] saveMindmap (remote): saved successfully");
            return { success: true, storage: doc.storage };
          } catch (err) {
            console.error("[BloomMD] saveMindmap (remote) error:", err);
            const message = err instanceof Error ? err.message : "";
            const error = message === "VERSION_CONFLICT" || message === "SYNC_ROOM_ACTIVE" || message === "SYNC_ROOM_PENDING" || message === "SYNC_ROOM_DEGRADED" || message === "SYNC_ROOM_SAVE_FAILED" || message === "SYNC_MUTATION_UNAVAILABLE" ? message : "SAVE_FAILED";
            return { success: false, error };
          }
        }
        const fullPath = filePath.startsWith("/") ? filePath : join(bloommdDir, filePath);
        console.log("[BloomMD] saveMindmap:", fullPath);
        try {
          const doc = parseFile(fullPath, markdown);
          await localStore.write(doc);
          console.log("[BloomMD] saveMindmap: written successfully");
          return { success: true };
        } catch (err) {
          console.error("[BloomMD] saveMindmap error:", err);
          return { success: false };
        }
      },

      deleteMindmap: async ({ filename }) => {
        if (isRemote()) {
          await remoteStore!.delete(filename);
        } else {
          await localStore.delete(filename);
        }
        return { success: true };
      },

      chooseDirectory: ({ dialogId }) =>
        startNativeDialog(dialogId, "chooseDirectory", runChooseDirectory, (message) => mainRPC.send.nativeDialogResult(message)),

      chooseResourceFile: ({ dialogId, kind }) =>
        startNativeDialog(dialogId, "chooseResourceFile", () => runChooseResourceFile(kind), (message) => mainRPC.send.nativeDialogResult(message)),

      importFile: ({ dialogId }) =>
        startNativeDialog(dialogId, "importFile", runImportFile, (message) => mainRPC.send.nativeDialogResult(message)),

      /**
       * Creates a folder in the local workspace.
       *
       * Local mode only. A remote workspace stores flat filenames in the database, so a folder
       * there needs a schema decision rather than a silent no-op that looks like it worked.
       */
      createFolder: async ({ folderPath }) => {
        if (isRemote()) throw new Error("Ordner lassen sich derzeit nur im lokalen Modus anlegen.");
        return { folderPath: await localStore.createFolder(folderPath) };
      },

      listFolders: async () => {
        if (isRemote()) return { folders: [] };
        return { folders: await localStore.listFolders() };
      },

      listTemplates: async () => {
        // A remote workspace stores flat filenames, so it has no template folder.
        if (isRemote()) return { templates: [] };
        return { templates: await localStore.readTemplates() };
      },

      readResource: async ({ path }) => {
        if (isRemote()) return { error: "Resource previews are only available for local workspaces." };
        const mimeType = resourceMimeType(path);
        if (!mimeType) return { error: "Unsupported resource preview type." };
        try {
          const fullPath = resolveResourcePath(bloommdDir, path);
          const info = await stat(fullPath);
          if (!info.isFile()) return { error: "Resource is not a file." };
          if (info.size > MAX_RESOURCE_PREVIEW_BYTES) return { error: "Resource is too large for inline preview." };

          const bytes = await readFile(fullPath);
          return { dataUrl: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`, mimeType };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Resource preview failed." };
        }
      },

      fetchLinkPreview: async ({ url }) => {
        try {
          return { preview: await fetchLinkPreviewForDesktop(url) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[BloomMD] fetchLinkPreview error:", message);
          return { error: message };
        }
      },

      openExternalUrl: async ({ url }) => {
        try {
          await openExternalUrlWithOs(url);
          return { success: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[BloomMD] openExternalUrl error:", message);
          return { success: false, error: message };
        }
      },

      createMindmap: async ({ filename, markdown }) => {
        if (isRemote()) {
          const doc = await remoteStore!.create(filename, markdown);
          return {
            filePath: doc.filePath,
            frontmatter: doc.frontmatter,
            nodes: serializeNodes(doc.nodes),
            rootId: doc.rootId,
            preamble: doc.preamble,
            storage: doc.storage,
          };
        }
        const fullPath = resolveMarkdownPath(bloommdDir, sanitizeMarkdownFilename(filename));
        const doc = parseFile(fullPath, markdown);
        await localStore.write(doc);
        return {
          filePath: doc.filePath,
          frontmatter: doc.frontmatter,
          nodes: serializeNodes(doc.nodes),
          rootId: doc.rootId,
          preamble: doc.preamble,
        };
      },

      serializeMindmap: async (data) => {
        const doc = {
          filePath: data.filePath,
          frontmatter: data.frontmatter,
          nodes: new Map(Object.entries(data.nodes)) as Map<string, MindMapNode>,
          rootId: data.rootId,
          preamble: data.preamble,
          rawMarkdown: "",
        };
        const markdown = serializeToMarkdown(doc);
        return { markdown };
      },

      renameMindmap: async ({ oldFilename, newFilename }) => {
        if (isRemote()) {
          return remoteStore!.rename(oldFilename, newFilename);
        }

        const safeOldFilename = normalizeMarkdownPath(oldFilename);
        const safeNewFilename = normalizeMarkdownPath(newFilename);

        if (safeOldFilename === safeNewFilename) {
          return { success: true, newFilePath: resolveMarkdownPath(bloommdDir, safeOldFilename), newFilename: safeOldFilename };
        }

        const oldPath = resolveMarkdownPath(bloommdDir, safeOldFilename);
        const newPath = resolveMarkdownPath(bloommdDir, safeNewFilename);

        try {
          // An explicit rename should never silently choose a different filename. The user can
          // change the title and retry when the desired target already exists.
          try {
            await access(newPath);
            return { success: false, newFilePath: oldPath, newFilename: safeOldFilename, error: "DOCUMENT_NAME_CONFLICT" };
          } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }

          await rename(oldPath, newPath);
          console.log(`[BloomMD] renameMindmap: ${safeOldFilename} → ${safeNewFilename}`);
          return { success: true, newFilePath: newPath, newFilename: safeNewFilename };
        } catch (err) {
          console.error("[BloomMD] renameMindmap error:", err);
          return { success: false, newFilePath: oldPath, newFilename: safeOldFilename, error: err instanceof Error ? err.message : "RENAME_FAILED" };
        }
      },

      connectRemote: async ({ url, accessToken }) => {
        try {
          const normalizedUrl = normalizeConnectionUrl(url);
          if (!accessToken.startsWith("bloom_pat_")) throw new Error("A personal BloomMD access token is required.");
          const existing = desktopSettings.profiles?.find((profile) => profile.url === normalizedUrl);
          const profile: ConnectionProfile = existing ?? {
            id: `server-${crypto.randomUUID()}`,
            name: new URL(normalizedUrl).hostname || "Server",
            url: normalizedUrl,
            tokenRef: `connection-profile:${crypto.randomUUID()}`,
          };
          await secureStorage.set(profile.tokenRef, accessToken);
          const profiles = replaceConnectionProfile(desktopSettings.profiles ?? [], profile);
          const profileToConnect = { ...profile, url: normalizedUrl };
          await persistDesktopSettings({ profiles });
          const activated = await validateAndActivateConnection(profileToConnect, validateRemoteProfile, activateRemoteProfile);
          console.log(`[BloomMD] Connected to remote profile: ${profileToConnect.name}`);
          return { success: true, ...activated };
        } catch (err) {
          const error = connectionProfileError(err, "Remote connection failed.");
          console.error("[BloomMD] Remote connection failed:", error);
          return { success: false, syncUrl: "", error };
        }
      },

      listConnectionProfiles: async () => {
        let storageError: "SECURE_STORAGE_UNAVAILABLE" | undefined;
        const profiles = await Promise.all((desktopSettings.profiles ?? []).map(async (profile) => {
          try {
            return await desktopConnectionProfile(profile);
          } catch (err) {
            if (!(err instanceof SecureStorageUnavailableError)) throw err;
            storageError = err.code;
            return profileSummary(profile, false);
          }
        }));
        return {
          profiles,
          active: await connectionModeInfo(),
          ...(storageError ? { storageError } : {}),
        };
      },

      saveConnectionProfile: async ({ id, name, url, accessToken }) => {
        try {
          const normalizedUrl = normalizeConnectionUrl(url);
          const existing = id ? profileById(id) : undefined;
          if (!existing && !accessToken) throw new Error("A personal BloomMD access token is required for a new profile.");
          const profile: ConnectionProfile = {
            id: existing?.id ?? `server-${crypto.randomUUID()}`,
            name: name.trim() || new URL(normalizedUrl).hostname || "Server",
            url: normalizedUrl,
            tokenRef: existing?.tokenRef ?? `connection-profile:${crypto.randomUUID()}`,
            ...(existing?.lastWorkspaceId ? { lastWorkspaceId: existing.lastWorkspaceId } : {}),
            ...(existing?.lastConnectedAt ? { lastConnectedAt: existing.lastConnectedAt } : {}),
          };
          if (accessToken) {
            if (!accessToken.startsWith("bloom_pat_")) throw new Error("A personal BloomMD access token is required.");
            await secureStorage.set(profile.tokenRef, accessToken);
          }
          const profiles = replaceConnectionProfile(desktopSettings.profiles ?? [], profile);
          await persistDesktopSettings({ profiles });
          return { success: true, profile: await desktopConnectionProfile(profile) };
        } catch (err) {
          const error = connectionProfileError(err, "Profile could not be saved.");
          console.error("[BloomMD] Connection profile save failed:", error);
          return { success: false, error };
        }
      },

      connectProfile: async ({ profileId }) => {
        try {
          const profile = profileById(profileId);
          const activated = await validateAndActivateConnection(profile, validateRemoteProfile, activateRemoteProfile);
          return { success: true, ...activated };
        } catch (err) {
          const error = connectionProfileError(err, "Remote connection failed.");
          console.error("[BloomMD] Saved profile connection failed:", error);
          return { success: false, syncUrl: "", error };
        }
      },

      useLocalConnection: async () => {
        try {
          await switchToLocalConnection();
          console.log("[BloomMD] Switched to local workspace");
          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Local workspace could not be selected.";
          console.error("[BloomMD] Local connection switch failed:", error);
          return { success: false };
        }
      },

      listRemoteWorkspaces: async () => {
        if (!isRemote() || !remoteStore) throw new Error("Cloud connection is not active.");
        return remoteStore.listWorkspaces();
      },

      listProfileWorkspaces: async ({ profileId }) => {
        const profile = profileById(profileId);
        const accessToken = await secureStorage.get(profile.tokenRef);
        if (!accessToken) throw new Error("No access token is stored for this profile.");
        const apiStore = new ApiFileStore({ baseUrl: profile.url, accessToken });
        return apiStore.listWorkspaces();
      },

      selectRemoteWorkspace: async ({ workspaceId }) => {
        if (!isRemote() || !remoteStore) throw new Error("Cloud connection is not active.");
        const workspaceContext = await remoteStore.selectWorkspace(workspaceId);
        const files = await remoteStore.list();
        return { ...workspaceContext, files };
      },

      getSyncTicket: async ({ filename }) => {
        if (!isRemote() || !remoteStore) throw new Error("Cloud connection is not active.");
        return remoteStore.fetchSyncTicket(filename);
      },

      getSharedDocument: async ({ localFilename }) => {
        const safeLocalFilename = normalizeMarkdownPath(localFilename);
        const entry = sharedDocumentBindingForFilename(safeLocalFilename);
        return { sharedDocument: entry ? sharedDocumentInfo(entry) : null };
      },

      shareLocalMindmap: async ({ localFilename, profileId, workspaceId, cloudFilename }) => {
        try {
          const safeLocalFilename = normalizeMarkdownPath(localFilename);
          const safeCloudFilename = sanitizeMarkdownFilename(cloudFilename);
          if (sharedDocumentBindingForFilename(safeLocalFilename)) {
            throw new Error("LOCAL_DOCUMENT_ALREADY_SHARED");
          }

          const profile = profileById(profileId);
          const accessToken = await secureStorage.get(profile.tokenRef);
          if (!accessToken) throw new Error("No access token is stored for this profile.");

          const apiStore = new ApiFileStore({ baseUrl: profile.url, accessToken });
          await apiStore.listWorkspaces();
          const workspaceContext = await apiStore.selectWorkspace(workspaceId);
          if (workspaceContext.workspace?.role === "viewer") throw new Error("WORKSPACE_READ_ONLY");

          const localDocument = await localStore.read(safeLocalFilename);
          const markdown = serializeToMarkdown(localDocument);
          const cloudDocument = await apiStore.create(safeCloudFilename, markdown);
          const documentId = cloudDocument.storage?.documentId;
          if (!documentId) {
            await apiStore.delete(cloudDocument.filePath);
            throw new Error("CLOUD_DOCUMENT_ID_MISSING");
          }
          try {
            await apiStore.recordSharedDocumentBinding("bound", documentId);
          } catch (error) {
            try {
              await apiStore.delete(cloudDocument.filePath);
            } catch (rollbackError) {
              console.error("[BloomMD] Could not remove cloud document after failed share audit:", rollbackError);
              throw new Error("SHARE_AUDIT_FAILED_CLOUD_DOCUMENT_CREATED");
            }
            throw error;
          }

          const localState = createLocalSharedDocumentState(hashSharedDocumentMarkdown(markdown));
          const sharingState = transitionSharedDocumentState(localState, {
            type: "share_requested",
            workspaceId,
            cloudFilename: safeCloudFilename,
          });
          const connectedState = transitionSharedDocumentState(sharingState, {
            type: "share_confirmed",
            documentId,
            cloudVersion: cloudDocument.storage?.version ?? 0,
            markdownHash: hashSharedDocumentMarkdown(markdown),
          });
          if (connectedState.kind !== "connected") throw new Error("SHARED_DOCUMENT_BINDING_FAILED");

          const entry: DesktopSharedDocumentBinding = {
            localFilename: safeLocalFilename,
            profileId,
            binding: connectedState.binding,
          };
          await replaceSharedDocumentBinding(entry);
          return { success: true, sharedDocument: sharedDocumentInfo(entry) };
        } catch (error) {
          const message = connectionProfileError(error, "Local document could not be shared.");
          console.error("[BloomMD] Explicit local document share failed:", message);
          return { success: false, error: message };
        }
      },

      unshareLocalMindmap: async ({ localFilename }) => {
        try {
          const safeLocalFilename = normalizeMarkdownPath(localFilename);
          const bindings = desktopSettings.sharedDocumentBindings ?? [];
          const entry = bindings.find((candidate) => candidate.localFilename === safeLocalFilename);
          if (!entry) {
            return { success: true };
          }
          await persistDesktopSettings({
            sharedDocumentBindings: bindings.filter((entry) => entry.localFilename !== safeLocalFilename),
          });
          const profile = profileById(entry.profileId);
          const accessToken = await secureStorage.get(profile.tokenRef);
          if (accessToken) {
            try {
              const apiStore = new ApiFileStore({ baseUrl: profile.url, accessToken });
              await apiStore.selectWorkspace(entry.binding.workspaceId);
              await apiStore.recordSharedDocumentBinding("unbound", entry.binding.documentId);
            } catch (auditError) {
              console.warn("[BloomMD] Local unshare was completed but could not be audited:", auditError);
            }
          }
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Local document could not be unshared.";
          console.error("[BloomMD] Explicit local document unshare failed:", message);
          return { success: false, error: message };
        }
      },

      getSharedSyncTicket: async ({ localFilename }) => {
        const safeLocalFilename = normalizeMarkdownPath(localFilename);
        const entry = sharedDocumentBindingForFilename(safeLocalFilename);
        if (!entry) throw new Error("LOCAL_DOCUMENT_NOT_SHARED");
        try {
          const profile = profileById(entry.profileId);
          const accessToken = await secureStorage.get(profile.tokenRef);
          if (!accessToken) throw new Error("No access token is stored for this profile.");
          const apiStore = new ApiFileStore({ baseUrl: profile.url, accessToken });
          await apiStore.listWorkspaces();
          await apiStore.selectWorkspace(entry.binding.workspaceId);
          const ticket = await apiStore.fetchSyncTicket(entry.binding.cloudFilename);
          return { ...ticket, sharedDocument: sharedDocumentInfo(entry) };
        } catch (error) {
          await markSharedDocumentUnavailable(entry, error);
          throw error;
        }
      },

      updateSharedDocumentBinding: async ({ localFilename, binding }) => {
        try {
          const safeLocalFilename = normalizeMarkdownPath(localFilename);
          const existing = sharedDocumentBindingForFilename(safeLocalFilename);
          if (!existing) throw new Error("LOCAL_DOCUMENT_NOT_SHARED");
          const validBinding = validateSharedDocumentBinding(binding);
          if (validBinding.workspaceId !== existing.binding.workspaceId
            || validBinding.documentId !== existing.binding.documentId
            || validBinding.cloudFilename !== existing.binding.cloudFilename) {
            throw new Error("SHARED_DOCUMENT_IDENTITY_MISMATCH");
          }
          const updated: DesktopSharedDocumentBinding = { ...existing, binding: validBinding };
          await replaceSharedDocumentBinding(updated);
          return { success: true, sharedDocument: sharedDocumentInfo(updated) };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Shared document state could not be updated.";
          console.error("[BloomMD] Shared document binding update failed:", message);
          return { success: false, error: message };
        }
      },

      disconnectRemote: async () => {
        await switchToLocalConnection();
        return { success: true };
      },

      deleteConnectionProfile: async ({ profileId }) => {
        try {
          const profile = profileById(profileId);
          if (mode.type === "remote" && mode.profileId === profileId) await switchToLocalConnection();
          await secureStorage.delete(profile.tokenRef);
          await persistDesktopSettings({ profiles: removeConnectionProfile(desktopSettings.profiles ?? [], profileId) });
          return { success: true };
        } catch (err) {
          const error = connectionProfileError(err, "Profile could not be deleted.");
          console.error("[BloomMD] Connection profile deletion failed:", error);
          return { success: false, error };
        }
      },

      setConnectionProfileWorkspace: async ({ profileId, workspaceId }) => {
        try {
          const profile = profileById(profileId);
          const profiles = rememberConnectionProfileWorkspace(desktopSettings.profiles ?? [], profileId, workspaceId);
          await persistDesktopSettings({ profiles });
          return { success: true };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Workspace preference could not be saved.";
          console.error("[BloomMD] Workspace preference save failed:", error);
          return { success: false };
        }
      },

      getConnectionMode: async () => {
        return connectionModeInfo();
      },
      getBuildInfo: async () => desktopBuildInfo(),
      getUpdateState: async () => desktopUpdateState(),
      checkForUpdate: async () => {
        try {
          const update = await Updater.checkForUpdate();
          return desktopUpdateState(update);
        } catch (error) {
          const message = updateErrorMessage(error);
          latestUpdateStatus = {
            status: "error",
            message,
            timestamp: Date.now(),
            details: { errorMessage: message },
          };
          if (mainWindow) mainRPC.send.updateStatus(latestUpdateStatus);
          return desktopUpdateState(emptyUpdateResult(message));
        }
      },
      downloadUpdate: async () => {
        try {
          await Updater.downloadUpdate();
          const state = await desktopUpdateState();
          return { success: !state.update.error, state, ...(state.update.error ? { error: state.update.error } : {}) };
        } catch (error) {
          const message = updateErrorMessage(error);
          latestUpdateStatus = {
            status: "error",
            message,
            timestamp: Date.now(),
            details: { errorMessage: message },
          };
          if (mainWindow) mainRPC.send.updateStatus(latestUpdateStatus);
          return { success: false, state: await desktopUpdateState(emptyUpdateResult(message)), error: message };
        }
      },
      applyUpdate: async () => {
        try {
          const state = await desktopUpdateState();
          if (!state.update.updateReady) return { success: false, error: "Es ist kein vorbereitetes Update vorhanden." };
          await Updater.applyUpdate();
          return { success: true };
        } catch (error) {
          const message = updateErrorMessage(error);
          latestUpdateStatus = {
            status: "error",
            message,
            timestamp: Date.now(),
            details: { errorMessage: message },
          };
          if (mainWindow) mainRPC.send.updateStatus(latestUpdateStatus);
          return { success: false, error: message };
        }
      },
      consumeExternalFile: async () => {
        // The renderer registers its external-file handler in the same tick as this request.
        rendererReady = true;
        const filename = pendingExternalFilename;
        const kind = pendingExternalKind;
        const nodeId = pendingExternalNodeId;
        pendingExternalFilename = null;
        pendingExternalKind = null;
        pendingExternalNodeId = null;
        return { filename, kind, nodeId };
      },
      recordE2EState: async (state) => {
        if (!desktopArgs.e2e.enabled) return { recorded: false };
        await appendDesktopE2EEvent(desktopArgs.e2e, "rendererState", {
          source: state.source,
          performance: state.performance,
          activeFile: state.activeFile,
          emptyWorkspace: state.emptyWorkspace,
          documentTitle: state.documentTitle,
          nodeCount: state.nodeCount,
          referenceEdgeCount: state.referenceEdgeCount,
          workspaceMode: state.workspaceMode,
          selectedNodeId: state.selectedNodeId,
          selectedNodeVisible: state.selectedNodeVisible,
        });
        // layoutReady reports only a node count. Keep the last complete renderer snapshot.
        if (state.source !== "layoutReady") {
          await writeDesktopE2EState(desktopArgs.e2e, {
            ...state,
            localDir: mode.type === "local" ? bloommdDir : undefined,
            mode: mode.type,
          });
        }
        return { recorded: true };
      },
      submitFeedback: async (input) => {
        try {
          return await submitDesktopFeedback(input);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Feedback could not be submitted.";
          console.error("[BloomMD] submitFeedback error:", message);
          return { success: false, error: message };
        }
      },
      setLocale: async ({ locale }) => {
        setApplicationMenuLocale(locale);
        return { success: true };
      },
    },
    messages: {},
  },
});

Updater.onStatusChange((entry) => {
  latestUpdateStatus = serializeUpdateStatus(entry);
  if (mainWindow) mainRPC.send.updateStatus(latestUpdateStatus);
});

/**
 * Opens a local path as the active workspace.
 *
 * A file switches the workspace to its parent folder and opens the file; a folder becomes the
 * workspace directly. Both keep the files where they are — no import, no copy into `~/bloommd`.
 */
async function openExternalTarget(filePath: string | null, nodeId: string | null = null): Promise<boolean> {
  if (!filePath) return false;
  if (!desktopInstanceHandoff.isPrimary && await desktopInstanceHandoff.forward(filePath, nodeId)) {
    await appendDesktopE2EEvent(desktopArgs.e2e, "instanceHandoffForwarded", {});
    console.log("[BloomMD] Forwarded external target to the running desktop instance.");
    return true;
  }
  let isDirectory = false;
  try {
    const info = await stat(filePath);
    isDirectory = info.isDirectory();
    // Files are only opened when they are Markdown; a folder has no extension to check.
    if (!isDirectory && !(info.isFile() && isMarkdownPath(filePath))) return false;
  } catch {
    return false;
  }

  openedExternalTarget = true;
  bloommdDir = isDirectory ? filePath : dirname(filePath);
  localStore = new FileStore({ baseDir: bloommdDir });
  remoteStore = null;
  mode = { type: "local", dir: bloommdDir };
  const externalKind: "file" | "folder" = isDirectory ? "folder" : "file";
  const externalFilename = isDirectory ? null : basename(filePath);
  const externalNodeId = isDirectory ? null : nodeId;
  pendingExternalFilename = externalFilename;
  pendingExternalKind = externalKind;
  pendingExternalNodeId = externalNodeId;
  const externalDirectoryFiles = isDirectory ? await localStore.list().catch(() => []) : [];
  const emptyWorkspace = isDirectory ? externalDirectoryFiles.length === 0 : false;
  // Merge: opening a file must not forget which remote server the user was connected to.
  await updateSettings({ localDir: bloommdDir });
  await appendDesktopE2EEvent(desktopArgs.e2e, "openExternalTarget", {
    target: filePath,
    localDir: bloommdDir,
    activeFile: externalFilename,
    externalKind,
    nodeId: externalNodeId,
    isDirectory,
    emptyWorkspace,
  });
  await writeDesktopE2EState(desktopArgs.e2e, {
    source: "openExternalTarget",
    localDir: bloommdDir,
    activeFile: externalFilename,
    emptyWorkspace,
    mode: "local",
  });

  if (watcher) await watcher.close();
  watcher = null;
  if (mainWindow) {
    startWatching(mainWindow);
    mainRPC.send.connectionModeChanged({ type: "local" });
    // Before the renderer is ready the message would be lost; it takes the pending file on mount.
    if (rendererReady) {
      pendingExternalFilename = null;
      pendingExternalKind = null;
      pendingExternalNodeId = null;
      mainRPC.send.externalFileOpened({ kind: externalKind, filename: externalFilename, nodeId: externalNodeId });
    }
    // Opened from another app (e.g. Obsidian): the document is only useful if BloomMD comes forward.
    mainWindow.show();
    mainWindow.activate();
  }
  return true;
}

handleOpenUrl = (url) => {
  const target = parseExternalTarget(url);
  if (!target || startupTargets.offer({ path: target.path, nodeId: target.nodeId })) return;
  void openExternalTarget(target.path, target.nodeId).then((handled) => {
    if (handled && !desktopInstanceHandoff.isPrimary) process.exit(0);
  });
};
for (const url of earlyOpenUrls.splice(0)) handleOpenUrl(url);

// `bloommd .` and `bloommd notes/plan.md`: the first non-flag argument after the executable opens
// that path as the workspace, so BloomMD behaves like any other terminal tool.
const cliTarget = parseCliPath(desktopArgs.cliTargetArg, process.cwd());
/** Whether startup opens an outside target (link, handoff, command line) instead of the remembered workspace. */
const hasColdStartTarget = () => startupTargets.hasPending || Boolean(cliTarget);

// Detect dev mode for HMR
const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return DEV_SERVER_URL;
    } catch {
      // Vite not running, fall back to built files
    }
  }
  return "views://mainview/index.html";
}

const url = await getUrl();

// Auto-reconnect BEFORE creating the main window
// so getConnectionMode() returns the correct state when the webview mounts
const settings = await loadSettings();
desktopSettings = settings;
if (settings.remote) {
  try {
    const migrated = await migrateLegacyRemote(settings, secureStorage);
    desktopSettings = migrated.settings;
    await updateSettings({
      profiles: migrated.settings.profiles,
      activeConnection: migrated.settings.activeConnection,
      localDir: migrated.settings.localDir,
      feedbackInstallationId: migrated.settings.feedbackInstallationId,
    });
  } catch (error) {
    // Do not rewrite the legacy file if a platform has no secure credential backend yet.
    console.error("[BloomMD] Connection profile migration failed:", error instanceof Error ? error.message : "unknown error");
  }
}
// The cold-start target: a launching link or handoff, else the command line (`bloommd note.md`, or
// BLOOMMD_OPEN_TARGET from Obsidian). It opens before the remembered folder or server is restored,
// so neither can replace it.
async function openStartupTarget(target: StartupTarget): Promise<void> {
  const handled = await openExternalTarget(target.path, target.nodeId);
  if (handled && !desktopInstanceHandoff.isPrimary) process.exit(0);
}
await startupTargets.drain(openStartupTarget, cliTarget ? { path: cliTarget, nodeId: parseExternalNodeId(desktopArgs.cliTargetArg ?? "") } : null);
if (!openedExternalTarget && !hasColdStartTarget() && desktopArgs.e2e.localDir) {
  bloommdDir = desktopArgs.e2e.localDir;
  localStore = new FileStore({ baseDir: bloommdDir });
  mode = { type: "local", dir: bloommdDir };
  await updateSettings({ localDir: bloommdDir });
} else if (!openedExternalTarget && !hasColdStartTarget() && desktopSettings.localDir) {
  bloommdDir = desktopSettings.localDir;
  localStore = new FileStore({ baseDir: bloommdDir });
}
if (!openedExternalTarget && !hasColdStartTarget() && !desktopArgs.e2e.enabled && desktopSettings.activeConnection?.type === "remote") {
  try {
    const profile = profileById(desktopSettings.activeConnection.profileId);
    await validateAndActivateConnection(profile, validateRemoteProfile, activateRemoteProfile);
    console.log(`[BloomMD] Auto-reconnected to remote profile: ${profile.name}`);
  } catch (error) {
    const profileId = desktopSettings.activeConnection.profileId;
    const profile = desktopSettings.profiles?.find((entry) => entry.id === profileId);
    if (profile) reconnectFailedProfile = { profileId: profile.id, name: profile.name, url: profile.url };
    console.log("[BloomMD] Auto-reconnect failed, using local folder:", error instanceof Error ? error.message : "unknown error");
  }
}

// Whatever arrived while the remembered server was being reconnected opens now, in turn; from here
// on, links and handoffs open directly.
await startupTargets.settle(openStartupTarget);

// Before the first window: the menu is what makes the OS deliver clipboard shortcuts at all.
installApplicationMenu("BloomMD", () => {
  if (mainWindow) mainRPC.send.aboutRequested({});
});

mainWindow = new BrowserWindow({
  title: "BloomMD",
  url,
  rpc: mainRPC,
  hidden: true,
  frame: {
    width: 1200,
    height: 800,
    x: 100,
    y: 100,
  },
});

let mainWindowShown = false;
const showMainWindow = () => {
  if (mainWindowShown || !mainWindow) return;
  mainWindowShown = true;
  console.log("[BloomMD] Showing main window");
  mainWindow.show();
  splashWindow.close();
};

mainWindow.webview.on("dom-ready", showMainWindow);
// Avoid trapping the user on the splash screen if a platform fails to emit dom-ready.
setTimeout(showMainWindow, 5000);

// Start file watcher only in local mode
if (!isRemote()) {
  startWatching(mainWindow);
}

console.log(`[BloomMD] Desktop app started, mode: ${mode.type}`);
await appendDesktopE2EEvent(desktopArgs.e2e, "desktopStarted", {
  mode: mode.type,
  localDir: mode.type === "local" ? bloommdDir : undefined,
});
await writeDesktopE2EState(desktopArgs.e2e, {
  source: "desktopStarted",
  mode: mode.type,
  localDir: mode.type === "local" ? bloommdDir : undefined,
});
