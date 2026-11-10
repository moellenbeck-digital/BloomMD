import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { DesktopSharedDocumentInfo } from "../shared/rpc-types";
import type { DesktopSettings, DesktopSharedDocumentBinding, DesktopSharedFolderBinding } from "./settings";

export type SharedLocalFileMatch =
  | { kind: "file"; entry: DesktopSharedDocumentBinding }
  | { kind: "folder"; folder: DesktopSharedFolderBinding; file: DesktopSharedFolderBinding["files"][number] };

type BindingSettings = Pick<DesktopSettings, "sharedDocumentBindings" | "sharedFolderBindings">;
type ProfileSettings = Pick<DesktopSettings, "profiles">;

export function sharedDocumentBindingForFilename(settings: BindingSettings, localFilename: string): DesktopSharedDocumentBinding | undefined {
  return settings.sharedDocumentBindings?.find((entry) => entry.localFilename === localFilename);
}

export function sharedDocumentInfo(settings: ProfileSettings, entry: DesktopSharedDocumentBinding): DesktopSharedDocumentInfo {
  const profile = settings.profiles?.find((candidate) => candidate.id === entry.profileId);
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

/**
 * A local file is shared either on its own or as part of a published folder, never both. The
 * single-file registry is keyed relative to the open workspace folder (`workspaceDir`); a
 * published folder keeps its own absolute root, so the open file is compared by its absolute path.
 */
export function findSharedLocalFile(settings: BindingSettings, workspaceDir: string, localFilename: string): SharedLocalFileMatch | undefined {
  const entry = sharedDocumentBindingForFilename(settings, localFilename);
  if (entry) return { kind: "file", entry };
  const absolutePath = resolve(workspaceDir, localFilename);
  for (const folder of settings.sharedFolderBindings ?? []) {
    const relativePath = relative(folder.folderPath, absolutePath);
    if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) continue;
    const portablePath = relativePath.split(sep).join("/");
    const file = folder.files.find((candidate) => candidate.relativePath === portablePath);
    if (file) return { kind: "folder", folder, file };
  }
  return undefined;
}

export function sharedLocalFileInfo(settings: ProfileSettings, match: SharedLocalFileMatch, localFilename: string): DesktopSharedDocumentInfo {
  if (match.kind === "file") return sharedDocumentInfo(settings, match.entry);
  const profile = settings.profiles?.find((candidate) => candidate.id === match.folder.profileId);
  return {
    localFilename,
    profileId: match.folder.profileId,
    profileName: profile?.name ?? "Unavailable profile",
    workspaceId: match.file.binding.workspaceId,
    documentId: match.file.binding.documentId,
    cloudFilename: match.file.binding.cloudFilename,
    lastAcknowledgedMarkdownHash: match.file.binding.lastAcknowledgedMarkdownHash,
    lastKnownCloudVersion: match.file.binding.lastKnownCloudVersion,
    connectionState: match.file.binding.connectionState,
    folderShare: { id: match.folder.id, folderName: basename(match.folder.folderPath) },
  };
}
