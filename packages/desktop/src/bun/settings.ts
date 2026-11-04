import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { homedir } from "node:os";
import { validateSharedDocumentBinding, type SharedDocumentBinding } from "@bloommd/core/shared-document-binding";
import type { SharedFolderConflictStrategy } from "@bloommd/core/shared-folder-publication";
import type { SecureStorage } from "./secure-storage";

/** Explicit test isolation keeps native smoke runs away from the user's saved connections. */
export function desktopSettingsPath(env: Record<string, string | undefined>, userHome: string): string {
  const testPath = env.BLOOMMD_E2E_SETTINGS_PATH?.trim();
  if (env.BLOOMMD_E2E === "1" && testPath) {
    if (!isAbsolute(testPath)) throw new Error("BLOOMMD_E2E_SETTINGS_PATH must be absolute");
    return testPath;
  }
  return join(userHome, ".bloommd-desktop.json");
}

const SETTINGS_PATH = desktopSettingsPath(process.env, homedir());

export interface ConnectionProfile {
  id: string;
  name: string;
  url: string;
  tokenRef: string;
  lastWorkspaceId?: string;
  lastConnectedAt?: string;
}

export type ActiveConnection =
  | { type: "local" }
  | { type: "remote"; profileId: string };

/**
 * Desktop-only mapping for an explicitly shared local Markdown file.
 *
 * `localFilename` deliberately never leaves the native process. The cloud only knows the
 * workspace document identified by the binding itself.
 */
export interface DesktopSharedDocumentBinding {
  localFilename: string;
  profileId: string;
  binding: SharedDocumentBinding;
}

/**
 * Desktop-only record of one deliberately published local folder.
 *
 * `folderPath` and every `relativePath` stay in this file; the cloud only knows the documents.
 * Single-file shares keep their own list (`sharedDocumentBindings`) and are never merged into it.
 */
export interface DesktopSharedFolderBinding {
  id: string;
  folderPath: string;
  profileId: string;
  workspaceId: string;
  strategy: SharedFolderConflictStrategy;
  /** Relative files or folders the person left out at publication time. */
  excluded: string[];
  publishedAt: string;
  files: Array<{ relativePath: string; binding: SharedDocumentBinding }>;
  /**
   * `revoked` once the server ended the access (or the role became viewer). The share then stops
   * syncing; local files stay as they are. Only disconnecting the folder share leaves this state.
   */
  state: "connected" | "revoked";
  /** Every relative path the person has seen: published, excluded, blocked, conflicting or dismissed. */
  knownPaths: string[];
  /** New paths that must not be matched as a rename of a removed file. */
  splitRenames: string[];
}

/** `remote` is a migration-only field and is never written back by saveSettings. */
export interface DesktopSettings {
  profiles?: ConnectionProfile[];
  activeConnection?: ActiveConnection;
  sharedDocumentBindings?: DesktopSharedDocumentBinding[];
  sharedFolderBindings?: DesktopSharedFolderBinding[];
  remote?: { url: string; accessToken: string };
  localDir?: string;
  feedbackInstallationId?: string;
}

export function replaceConnectionProfile(profiles: readonly ConnectionProfile[], profile: ConnectionProfile): ConnectionProfile[] {
  return profiles.some((entry) => entry.id === profile.id)
    ? profiles.map((entry) => entry.id === profile.id ? profile : entry)
    : [...profiles, profile];
}

export function removeConnectionProfile(profiles: readonly ConnectionProfile[], profileId: string): ConnectionProfile[] {
  return profiles.filter((entry) => entry.id !== profileId);
}

export function rememberConnectionProfileWorkspace(
  profiles: readonly ConnectionProfile[],
  profileId: string,
  workspaceId: string,
): ConnectionProfile[] {
  return profiles.map((entry) => entry.id === profileId ? { ...entry, lastWorkspaceId: workspaceId } : entry);
}

function isConnectionProfile(value: unknown): value is ConnectionProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<ConnectionProfile>;
  return typeof profile.id === "string" && profile.id.length > 0
    && typeof profile.name === "string" && profile.name.length > 0
    && typeof profile.url === "string" && profile.url.length > 0
    && typeof profile.tokenRef === "string" && profile.tokenRef.length > 0
    && (profile.lastWorkspaceId === undefined || typeof profile.lastWorkspaceId === "string")
    && (profile.lastConnectedAt === undefined || typeof profile.lastConnectedAt === "string");
}

function isDesktopSharedDocumentBinding(value: unknown): value is DesktopSharedDocumentBinding {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DesktopSharedDocumentBinding>;
  if (typeof entry.localFilename !== "string" || entry.localFilename.length === 0) return false;
  const normalizedFilename = normalize(entry.localFilename);
  const portableFilename = entry.localFilename.replace(/\\/g, "/");
  if (isAbsolute(normalizedFilename) || /^[A-Za-z]:\//.test(portableFilename) || portableFilename.split("/").includes("..")) return false;
  if (typeof entry.profileId !== "string" || entry.profileId.length === 0) return false;
  try {
    validateSharedDocumentBinding(entry.binding);
    return true;
  } catch {
    return false;
  }
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const portable = value.replace(/\\/g, "/");
  return !isAbsolute(normalize(value)) && !/^[A-Za-z]:\//.test(portable) && !portable.split("/").includes("..");
}

function sanitizeSharedFolderBinding(value: unknown): DesktopSharedFolderBinding | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<DesktopSharedFolderBinding>;
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  if (typeof entry.folderPath !== "string" || !isAbsolute(entry.folderPath)) return null;
  if (typeof entry.profileId !== "string" || entry.profileId.length === 0) return null;
  if (typeof entry.workspaceId !== "string" || entry.workspaceId.length === 0) return null;
  if (entry.strategy !== "keep-cloud" && entry.strategy !== "suffix") return null;
  if (typeof entry.publishedAt !== "string") return null;
  if (!Array.isArray(entry.excluded) || !entry.excluded.every((path) => typeof path === "string")) return null;
  if (!Array.isArray(entry.files)) return null;
  const files: DesktopSharedFolderBinding["files"] = [];
  for (const file of entry.files as unknown[]) {
    if (!file || typeof file !== "object") continue;
    const candidate = file as { relativePath?: unknown; binding?: unknown };
    if (!isSafeRelativePath(candidate.relativePath)) continue;
    try {
      files.push({ relativePath: candidate.relativePath, binding: validateSharedDocumentBinding(candidate.binding) });
    } catch (error) {
      console.warn("[BloomMD] Ignoring an invalid shared folder file binding:", error instanceof Error ? error.message : error);
    }
  }
  const stringList = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((path) => typeof path === "string") ? [...value as string[]] : null;
  // Entries written before the activity list existed know only what they published and excluded.
  const knownPaths = stringList(entry.knownPaths) ?? [...files.map((file) => file.relativePath), ...entry.excluded];
  return {
    id: entry.id,
    folderPath: entry.folderPath,
    profileId: entry.profileId,
    workspaceId: entry.workspaceId,
    strategy: entry.strategy,
    excluded: [...entry.excluded],
    publishedAt: entry.publishedAt,
    files,
    state: entry.state === "revoked" ? "revoked" : "connected",
    knownPaths,
    splitRenames: stringList(entry.splitRenames) ?? [],
  };
}

function sanitizeSettings(value: unknown): DesktopSettings {
  if (!value || typeof value !== "object") return {};
  const parsed = value as {
    profiles?: unknown;
    activeConnection?: unknown;
    sharedDocumentBindings?: unknown;
    sharedFolderBindings?: unknown;
    remote?: { url?: unknown; accessToken?: unknown; apiKey?: unknown };
    localDir?: unknown;
    feedbackInstallationId?: unknown;
  };
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter(isConnectionProfile) : undefined;
  const sharedDocumentBindings = Array.isArray(parsed.sharedDocumentBindings)
    ? parsed.sharedDocumentBindings.filter(isDesktopSharedDocumentBinding)
    : undefined;
  const sharedFolderBindings = Array.isArray(parsed.sharedFolderBindings)
    ? parsed.sharedFolderBindings.map(sanitizeSharedFolderBinding).filter((entry): entry is DesktopSharedFolderBinding => entry !== null)
    : undefined;
  const active = parsed.activeConnection as { type?: unknown; profileId?: unknown } | undefined;
  const activeConnection: ActiveConnection | undefined = active?.type === "local"
    ? { type: "local" }
    : active?.type === "remote" && typeof active.profileId === "string"
      ? { type: "remote", profileId: active.profileId }
      : undefined;
  const remote = parsed.remote && typeof parsed.remote.url === "string"
    && typeof parsed.remote.accessToken === "string"
    && parsed.remote.accessToken.startsWith("bloom_pat_")
    ? { url: parsed.remote.url, accessToken: parsed.remote.accessToken }
    : undefined;
  return {
    ...(profiles && profiles.length > 0 ? { profiles } : {}),
    ...(activeConnection ? { activeConnection } : {}),
    ...(sharedDocumentBindings && sharedDocumentBindings.length > 0 ? { sharedDocumentBindings } : {}),
    ...(sharedFolderBindings && sharedFolderBindings.length > 0 ? { sharedFolderBindings } : {}),
    ...(remote ? { remote } : {}),
    ...(typeof parsed.localDir === "string" ? { localDir: parsed.localDir } : {}),
    ...(typeof parsed.feedbackInstallationId === "string" ? { feedbackInstallationId: parsed.feedbackInstallationId } : {}),
  };
}

export async function loadSettings(path = SETTINGS_PATH): Promise<DesktopSettings> {
  try {
    return sanitizeSettings(JSON.parse(await readFile(path, "utf-8")) as unknown);
  } catch {
    return {};
  }
}

/** Move the old single-server setting into a named profile and the platform secure store. */
export async function migrateLegacyRemote(
  settings: DesktopSettings,
  secureStorage: SecureStorage,
  now = new Date(),
): Promise<{ settings: DesktopSettings; migrated: boolean }> {
  if (!settings.remote) return { settings, migrated: false };

  const legacy = settings.remote;
  const existing = settings.profiles?.find((profile) => profile.url === legacy.url);
  if (existing) {
    await secureStorage.set(existing.tokenRef, legacy.accessToken);
    const migratedSettings: DesktopSettings = {
      ...settings,
      activeConnection: settings.activeConnection ?? { type: "remote", profileId: existing.id },
    };
    delete migratedSettings.remote;
    return { settings: migratedSettings, migrated: true };
  }

  const id = `server-${crypto.randomUUID()}`;
  const tokenRef = `connection-profile:${id}`;
  await secureStorage.set(tokenRef, legacy.accessToken);
  const hostname = (() => {
    try { return new URL(legacy.url).hostname; } catch { return "Server"; }
  })();
  const profile: ConnectionProfile = {
    id,
    name: hostname || "Server",
    url: legacy.url,
    tokenRef,
    lastConnectedAt: now.toISOString(),
  };
  const migratedSettings: DesktopSettings = {
    ...settings,
    profiles: [...(settings.profiles ?? []), profile],
    activeConnection: { type: "remote", profileId: id },
  };
  delete migratedSettings.remote;
  return { settings: migratedSettings, migrated: true };
}

export async function updateSettings(patch: Partial<DesktopSettings>, path = SETTINGS_PATH): Promise<DesktopSettings> {
  const merged = { ...await loadSettings(path), ...patch };
  await saveSettings(merged, path);
  return merged;
}

export async function saveSettings(settings: DesktopSettings, path = SETTINGS_PATH): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const { remote: _legacyRemote, ...persistedSettings } = settings;
  await writeFile(temporaryPath, JSON.stringify(persistedSettings, null, 2), { encoding: "utf-8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}
