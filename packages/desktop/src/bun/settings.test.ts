import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSettings, migrateLegacyRemote, rememberConnectionProfileWorkspace, removeConnectionProfile, replaceConnectionProfile, saveSettings, updateSettings, type ConnectionProfile } from "./settings";
import type { SecureStorage } from "./secure-storage";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function settingsPath() {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-settings-"));
  directories.push(directory);
  return join(directory, "settings.json");
}

describe("desktop settings", () => {
  test("writes profiles atomically with owner-only permissions", async () => {
    const path = await settingsPath();
    const profile: ConnectionProfile = { id: "server-1", name: "Team", url: "https://bloommd.app", tokenRef: "connection-profile:server-1" };
    await saveSettings({ localDir: "/tmp/maps", profiles: [profile], activeConnection: { type: "remote", profileId: profile.id } }, path);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ localDir: "/tmp/maps", profiles: [profile], activeConnection: { type: "remote", profileId: profile.id } });
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  test("does not restore legacy shared API keys", async () => {
    const path = await settingsPath();
    await writeFile(path, JSON.stringify({ localDir: "/tmp/maps", remote: { url: "https://bloommd.app", apiKey: "legacy" } }));
    expect(await loadSettings(path)).toEqual({ localDir: "/tmp/maps" });
  });

  test("keeps only valid local shared-document bindings", async () => {
    const path = await settingsPath();
    await writeFile(path, JSON.stringify({
      sharedDocumentBindings: [
        {
          localFilename: "private/notes.md",
          profileId: "server-1",
          binding: {
            schemaVersion: 1,
            workspaceId: "workspace-1",
            documentId: "document-1",
            cloudFilename: "notes.md",
            lastAcknowledgedMarkdownHash: "hash-1",
            lastKnownCloudVersion: 2,
            connectionState: "connected",
          },
        },
        { localFilename: "/absolute/path.md", profileId: "server-1", binding: { schemaVersion: 0 } },
      ],
    }));

    expect((await loadSettings(path)).sharedDocumentBindings).toEqual([{
      localFilename: "private/notes.md",
      profileId: "server-1",
      binding: {
        schemaVersion: 1,
        workspaceId: "workspace-1",
        documentId: "document-1",
        cloudFilename: "notes.md",
        lastAcknowledgedMarkdownHash: "hash-1",
        lastKnownCloudVersion: 2,
        connectionState: "connected",
      },
    }]);
  });

  test("returns empty settings for malformed JSON", async () => {
    const path = await settingsPath();
    await writeFile(path, "not json");
    expect(await loadSettings(path)).toEqual({});
  });
});

describe("profile persistence", () => {
  test("replaces, remembers and removes profiles without affecting other profiles", () => {
    const first: ConnectionProfile = { id: "server-1", name: "Team", url: "https://team.example", tokenRef: "connection-profile:server-1" };
    const second: ConnectionProfile = { id: "server-2", name: "Staging", url: "https://staging.example", tokenRef: "connection-profile:server-2" };
    const renamed = { ...first, name: "Production" };
    const profiles = replaceConnectionProfile([first], second);
    const remembered = rememberConnectionProfileWorkspace(profiles, first.id, "workspace-1");

    expect(replaceConnectionProfile(remembered, renamed)).toEqual([renamed, second]);
    expect(removeConnectionProfile(remembered, first.id)).toEqual([second]);
  });

  test("keeps saved profiles when only the local folder changes", async () => {
    const path = await settingsPath();
    const profile: ConnectionProfile = { id: "server-1", name: "Team", url: "https://bloommd.app", tokenRef: "connection-profile:server-1" };
    await saveSettings({ localDir: "/tmp/maps", profiles: [profile], activeConnection: { type: "remote", profileId: profile.id } }, path);
    await updateSettings({ localDir: "/tmp/other" }, path);
    const stored = await loadSettings(path);
    expect(stored.localDir).toBe("/tmp/other");
    expect(stored.profiles).toEqual([profile]);
    expect(stored.activeConnection).toEqual({ type: "remote", profileId: profile.id });
  });

  test("does not write legacy plaintext credentials", async () => {
    const path = await settingsPath();
    await saveSettings({ localDir: "/tmp/maps", remote: { url: "https://bloommd.app", accessToken: "bloom_pat_test" } }, path);
    expect(await readFile(path, "utf8")).not.toContain("bloom_pat_test");
  });

  test("works when no settings file exists yet", async () => {
    const path = `${await settingsPath()}.missing`;
    expect(await updateSettings({ localDir: "/tmp/fresh" }, path)).toEqual({ localDir: "/tmp/fresh" });
  });
});

describe("legacy connection migration", () => {
  test("moves the token to secure storage and creates a reconnectable profile", async () => {
    const values = new Map<string, string>();
    const storage: SecureStorage = {
      async get(key) { return values.get(key) ?? null; },
      async set(key, value) { values.set(key, value); },
      async delete(key) { values.delete(key); },
    };
    const result = await migrateLegacyRemote(
      { localDir: "/tmp/maps", remote: { url: "https://bloommd.app", accessToken: "bloom_pat_test" } },
      storage,
      new Date("2026-08-28T10:00:00.000Z"),
    );
    expect(result.migrated).toBe(true);
    expect(result.settings.remote).toBeUndefined();
    expect(result.settings.activeConnection?.type).toBe("remote");
    const profile = result.settings.profiles?.[0];
    expect(profile?.name).toBe("bloommd.app");
    expect(profile?.lastConnectedAt).toBe("2026-08-28T10:00:00.000Z");
    expect(profile && await storage.get(profile.tokenRef)).toBe("bloom_pat_test");
  });
});
