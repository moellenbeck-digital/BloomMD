import Electrobun, { Electroview } from "electrobun/view";
import type { BloomMDRPC, DesktopE2EStateUpdate, DesktopFeedbackRequest, DesktopUpdateStatus } from "../shared/rpc-types";

type FileChangedCallback = (filename: string) => void;
type ExternalOpen = { kind: "file" | "folder" | null; filename: string | null; nodeId?: string | null };
type ExternalOpenCallback = (open: ExternalOpen) => void;
type ConnectionModeChangedCallback = (data: { type: "local" | "remote"; profileId?: string; syncUrl?: string }) => void;
type AboutRequestedCallback = () => void;
type UpdateStatusCallback = (status: DesktopUpdateStatus) => void;
let onFileChangedCallback: FileChangedCallback | null = null;
let onConnectionModeChangedCallback: ConnectionModeChangedCallback | null = null;
let onExternalFileOpenedCallback: ExternalOpenCallback | null = null;
let onAboutRequestedCallback: AboutRequestedCallback | null = null;
let onUpdateStatusCallback: UpdateStatusCallback | null = null;

const rpc = Electroview.defineRPC<BloomMDRPC>({
  maxRequestTime: 60000,
  handlers: {
    requests: {},
    messages: {
      filesChanged: ({ filenames }) => {
        for (const filename of filenames) onFileChangedCallback?.(filename);
      },
      fileChanged: ({ filename }) => {
        onFileChangedCallback?.(filename);
      },
      directoryChanged: ({ path }) => {
        console.log("[BloomMD] Directory changed to:", path);
      },
      connectionModeChanged: (data) => {
        onConnectionModeChangedCallback?.(data);
      },
      updateStatus: (status) => {
        onUpdateStatusCallback?.(status);
      },
      externalFileOpened: (open) => {
        onExternalFileOpenedCallback?.(open);
      },
      aboutRequested: () => {
        onAboutRequestedCallback?.();
      },
    },
  },
});

const electrobun = new Electrobun.Electroview({ rpc });

export function onFileChanged(callback: FileChangedCallback) {
  onFileChangedCallback = callback;
}

export function onConnectionModeChanged(callback: ConnectionModeChangedCallback) {
  onConnectionModeChangedCallback = callback;
}

export function onExternalFileOpened(callback: ExternalOpenCallback) {
  onExternalFileOpenedCallback = callback;
}

export function onAboutRequested(callback: AboutRequestedCallback | null) {
  onAboutRequestedCallback = callback;
}

export function onUpdateStatus(callback: UpdateStatusCallback | null) {
  onUpdateStatusCallback = callback;
}

export async function listMindmaps() {
  return electrobun.rpc!.request.listMindmaps({});
}

export async function openMindmap(filename: string) {
  return electrobun.rpc!.request.openMindmap({ filename });
}

export async function openWorkspace() {
  return electrobun.rpc!.request.openWorkspace({});
}

export async function saveMindmap(filePath: string, markdown: string, storage?: import("@bloommd/core/browser").MindMapDocument["storage"]) {
  return electrobun.rpc!.request.saveMindmap({ filePath, markdown, storage });
}

export async function chooseDirectory() {
  return electrobun.rpc!.request.chooseDirectory({});
}

export async function chooseResourceFile(kind: "file" | "pdf") {
  return electrobun.rpc!.request.chooseResourceFile({ kind });
}

export async function importFile() {
  return electrobun.rpc!.request.importFile({});
}

export async function createFolder(folderPath: string) {
  return electrobun.rpc!.request.createFolder({ folderPath });
}

export async function listFolders() {
  return electrobun.rpc!.request.listFolders({});
}

export async function readResource(path: string) {
  return electrobun.rpc!.request.readResource({ path });
}

export async function fetchLinkPreview(url: string) {
  return electrobun.rpc!.request.fetchLinkPreview({ url });
}

export async function openExternalUrl(url: string) {
  return electrobun.rpc!.request.openExternalUrl({ url });
}

export async function createMindmap(filename: string, markdown: string) {
  return electrobun.rpc!.request.createMindmap({ filename, markdown });
}

export async function serializeMindmap(doc: { filePath: string; frontmatter: unknown; nodes: Record<string, unknown>; rootId: string; preamble?: string }) {
  return electrobun.rpc!.request.serializeMindmap(doc as never);
}

export async function renameMindmap(oldFilename: string, newFilename: string) {
  return electrobun.rpc!.request.renameMindmap({ oldFilename, newFilename });
}

export async function deleteMindmap(filename: string) {
  return electrobun.rpc!.request.deleteMindmap({ filename });
}

export async function connectRemote(url: string, accessToken: string) {
  return electrobun.rpc!.request.connectRemote({ url, accessToken });
}

export async function listConnectionProfiles() {
  return electrobun.rpc!.request.listConnectionProfiles({});
}

export async function saveConnectionProfile(input: { id?: string; name: string; url: string; accessToken?: string }) {
  return electrobun.rpc!.request.saveConnectionProfile(input);
}

export async function connectProfile(profileId: string) {
  return electrobun.rpc!.request.connectProfile({ profileId });
}

export async function useLocalConnection() {
  return electrobun.rpc!.request.useLocalConnection({});
}

export async function deleteConnectionProfile(profileId: string) {
  return electrobun.rpc!.request.deleteConnectionProfile({ profileId });
}

export async function setConnectionProfileWorkspace(profileId: string, workspaceId: string) {
  return electrobun.rpc!.request.setConnectionProfileWorkspace({ profileId, workspaceId });
}

export async function listRemoteWorkspaces() {
  return electrobun.rpc!.request.listRemoteWorkspaces({});
}

export async function listProfileWorkspaces(profileId: string) {
  return electrobun.rpc!.request.listProfileWorkspaces({ profileId });
}

export async function selectRemoteWorkspace(workspaceId: string) {
  return electrobun.rpc!.request.selectRemoteWorkspace({ workspaceId });
}

export async function getSyncTicket(filename: string) {
  return electrobun.rpc!.request.getSyncTicket({ filename });
}

export async function getSharedDocument(localFilename: string) {
  return electrobun.rpc!.request.getSharedDocument({ localFilename });
}

export async function shareLocalMindmap(input: { localFilename: string; profileId: string; workspaceId: string; cloudFilename: string }) {
  return electrobun.rpc!.request.shareLocalMindmap(input);
}

export async function unshareLocalMindmap(localFilename: string) {
  return electrobun.rpc!.request.unshareLocalMindmap({ localFilename });
}

export async function getSharedSyncTicket(localFilename: string) {
  return electrobun.rpc!.request.getSharedSyncTicket({ localFilename });
}

export async function updateSharedDocumentBinding(localFilename: string, binding: import("@bloommd/core/browser").SharedDocumentBinding) {
  return electrobun.rpc!.request.updateSharedDocumentBinding({ localFilename, binding });
}

export async function disconnectRemote() {
  return electrobun.rpc!.request.disconnectRemote({});
}

export async function getConnectionMode() {
  return electrobun.rpc!.request.getConnectionMode({});
}

export async function getBuildInfo() {
  return electrobun.rpc!.request.getBuildInfo({});
}

export async function getUpdateState() {
  return electrobun.rpc!.request.getUpdateState({});
}

export async function checkForUpdate() {
  return electrobun.rpc!.request.checkForUpdate({});
}

export async function downloadUpdate() {
  return electrobun.rpc!.request.downloadUpdate({});
}

export async function applyUpdate() {
  return electrobun.rpc!.request.applyUpdate({});
}

export async function consumeExternalFile() {
  return electrobun.rpc!.request.consumeExternalFile({});
}

export async function recordE2EState(state: DesktopE2EStateUpdate) {
  return electrobun.rpc!.request.recordE2EState(state);
}

export async function submitFeedback(input: DesktopFeedbackRequest) {
  return electrobun.rpc!.request.submitFeedback(input);
}

export async function setApplicationLocale(locale: "de" | "en") {
  return electrobun.rpc!.request.setLocale({ locale });
}
