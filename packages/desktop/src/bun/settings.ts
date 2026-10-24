import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import { homedir } from "node:os";
import { validateSharedDocumentBinding, type SharedDocumentBinding } from "@bloommd/core/shared-document-binding";
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

/** `remote` is a migration-only field and is never written back by saveSettings. */
export interface DesktopSettings {
  profiles?: ConnectionProfile[];
  activeConnection?: ActiveConnection;
  sharedDocumentBindings?: DesktopSharedDocumentBinding[];
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

function sanitizeSettings(value: unknown): DesktopSettings {
  if (!value || typeof value !== "object") return {};
  const parsed = value as {
    profiles?: unknown;
    activeConnection?: unknown;
    sharedDocumentBindings?: unknown;
    remote?: { url?: unknown; accessToken?: unknown; apiKey?: unknown };
    localDir?: unknown;
    feedbackInstallationId?: unknown;
  };
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter(isConnectionProfile) : undefined;
  const sharedDocumentBindings = Array.isArray(parsed.sharedDocumentBindings)
    ? parsed.sharedDocumentBindings.filter(isDesktopSharedDocumentBinding)
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
