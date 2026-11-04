import { describe, expect, test } from "bun:test";
import type { SharedDocumentBinding } from "@bloommd/core";
import { applyFolderDecision, classifyAccessFailure, computeFolderActivity, markFolderRevoked, type FolderShareCloud } from "./folder-share";
import type { DesktopSharedFolderBinding } from "./settings";

const binding = (relativePath: string, patch: Partial<SharedDocumentBinding> = {}): SharedDocumentBinding => ({
  schemaVersion: 1,
  workspaceId: "ws-1",
  documentId: `doc-${relativePath}`,
  cloudFilename: relativePath.split("/").join("__"),
  lastAcknowledgedMarkdownHash: `hash-${relativePath}`,
  lastKnownCloudVersion: 1,
  connectionState: "connected",
  ...patch,
});

const folderOf = (paths: string[], patch: Partial<DesktopSharedFolderBinding> = {}): DesktopSharedFolderBinding => ({
  id: "folder-1",
  folderPath: "/Users/me/Notes",
  profileId: "server-1",
  workspaceId: "ws-1",
  strategy: "keep-cloud",
  excluded: [],
  publishedAt: "2026-11-04T10:00:00.000Z",
  files: paths.map((relativePath) => ({ relativePath, binding: binding(relativePath) })),
  state: "connected",
  knownPaths: [...paths],
  splitRenames: [],
  ...patch,
});

const local = (...paths: string[]) => paths.map((relativePath) => ({ relativePath, sizeBytes: 10 }));

function fakeCloud(options: { failUnbind?: boolean; failDelete?: boolean; failCreate?: boolean } = {}) {
  const calls = { created: [] as string[], deleted: [] as string[], bound: [] as string[][], unbound: [] as string[][] };
  const cloud: FolderShareCloud = {
    async create(filename) {
      if (options.failCreate) throw new Error("API create failed: 500");
      calls.created.push(filename);
      return { filePath: filename, storage: { documentId: `doc-${filename}`, version: 1 } };
    },
    async delete(filename) {
      if (options.failDelete) throw new Error("delete failed");
      calls.deleted.push(filename);
    },
    async recordFolderBinding(ids) { calls.bound.push(ids); },
    async recordFolderUnbinding(ids) {
      if (options.failUnbind) throw new Error("audit failed");
      calls.unbound.push(ids);
    },
  };
  return { cloud, calls };
}

const decide = (folder: DesktopSharedFolderBinding, decision: Parameters<typeof applyFolderDecision>[0]["decision"], extra: { local?: string[]; cloudFilenames?: string[]; cloud?: FolderShareCloud } = {}) =>
  applyFolderDecision({
    folder,
    decision,
    local: local(...(extra.local ?? [])),
    cloudFilenames: extra.cloudFilenames ?? [],
    readMarkdown: async (path) => `# ${path}`,
    cloud: extra.cloud ?? fakeCloud().cloud,
  });

describe("classifyAccessFailure", () => {
  test("treats 401, 403 and 404 as revoked and everything else as unreachable", () => {
    expect(classifyAccessFailure(new Error("API workspace selection failed: 403 Forbidden"))).toBe("revoked");
    expect(classifyAccessFailure(new Error("API workspaces failed: 401 Unauthorized"))).toBe("revoked");
    expect(classifyAccessFailure(new Error("API workspace selection failed: 404 Not Found"))).toBe("revoked");
    expect(classifyAccessFailure(new Error("API workspaces failed: 503 Service Unavailable"))).toBe("unreachable");
    expect(classifyAccessFailure(new TypeError("fetch failed"))).toBe("unreachable");
  });
});

describe("markFolderRevoked", () => {
  test("stops the share and every file binding without removing anything", () => {
    const revoked = markFolderRevoked(folderOf(["a.md", "b.md"]));
    expect(revoked.state).toBe("revoked");
    expect(revoked.files.map((file) => [file.relativePath, file.binding.connectionState])).toEqual([["a.md", "revoked"], ["b.md", "revoked"]]);
    expect(revoked.knownPaths).toEqual(["a.md", "b.md"]);
  });

  test("is repeatable", () => {
    const once = markFolderRevoked(folderOf(["a.md"]));
    expect(markFolderRevoked(once)).toEqual(once);
  });
});

describe("computeFolderActivity", () => {
  test("lists new, removed and renamed files with the plan for the new ones", async () => {
    const folder = folderOf(["gone.md", "old.md", "taken-name.md"], { knownPaths: ["gone.md", "old.md", "taken-name.md", "excluded.md"] });
    const entries = await computeFolderActivity({
      folder,
      local: local("taken-name.md", "renamed.md", "fresh.md", "bad?.md", "excluded.md"),
      hashOf: async (path) => path === "renamed.md" ? "hash-old.md" : null,
      cloudFilenames: ["taken-name.md"],
    });
    expect(entries).toEqual([
      { kind: "removed", relativePath: "gone.md", cloudFilename: "gone.md" },
      { kind: "renamed", from: "old.md", to: "renamed.md", sizeBytes: 10, cloudFilename: "old.md" },
      { kind: "new", relativePath: "bad?.md", sizeBytes: 10, status: "blocked", cloudFilename: null, uploadFilename: null, reason: "name-not-portable" },
      { kind: "new", relativePath: "fresh.md", sizeBytes: 10, status: "upload", cloudFilename: "fresh.md", uploadFilename: "fresh.md" },
    ]);
  });

  test("marks a new file whose cloud name exists as a conflict under keep-cloud", async () => {
    const entries = await computeFolderActivity({ folder: folderOf([]), local: local("same.md"), hashOf: async () => null, cloudFilenames: ["same.md"] });
    expect(entries).toEqual([{ kind: "new", relativePath: "same.md", sizeBytes: 10, status: "conflict", cloudFilename: "same.md", uploadFilename: null }]);
  });
});

describe("applyFolderDecision: new files", () => {
  test("uploads a new file only on the explicit upload decision and binds it", async () => {
    const { cloud, calls } = fakeCloud();
    const next = await decide(folderOf(["a.md"]), { kind: "new", relativePath: "docs/new.md", action: "upload" }, { local: ["a.md", "docs/new.md"], cloud });
    expect(calls.created).toEqual(["docs__new.md"]);
    expect(calls.bound).toEqual([["doc-docs__new.md"]]);
    expect(next.files.map((file) => file.relativePath)).toEqual(["a.md", "docs/new.md"]);
    expect(next.knownPaths).toContain("docs/new.md");
  });

  test("uses the suffix strategy of the share when the name is taken", async () => {
    const { cloud, calls } = fakeCloud();
    await decide(folderOf([], { strategy: "suffix" }), { kind: "new", relativePath: "a.md", action: "upload" }, { local: ["a.md"], cloudFilenames: ["a.md"], cloud });
    expect(calls.created).toEqual(["a-local.md"]);
  });

  test("refuses to upload a conflicting or blocked file", async () => {
    const { cloud, calls } = fakeCloud();
    await expect(decide(folderOf([]), { kind: "new", relativePath: "a.md", action: "upload" }, { local: ["a.md"], cloudFilenames: ["a.md"], cloud })).rejects.toThrow("FOLDER_FILE_NOT_UPLOADABLE:conflict");
    await expect(decide(folderOf([]), { kind: "new", relativePath: "bad?.md", action: "upload" }, { local: ["bad?.md"], cloud })).rejects.toThrow("FOLDER_FILE_NOT_UPLOADABLE:name-not-portable");
    expect(calls.created).toEqual([]);
  });

  test("ignoring a new file uploads nothing and stops listing it", async () => {
    const { cloud, calls } = fakeCloud();
    const next = await decide(folderOf([]), { kind: "new", relativePath: "a.md", action: "ignore" }, { local: ["a.md"], cloud });
    expect(next.knownPaths).toEqual(["a.md"]);
    expect(next.files).toEqual([]);
    expect(calls).toEqual({ created: [], deleted: [], bound: [], unbound: [] });
  });

  test("a failed upload leaves the share unchanged and surfaces the error", async () => {
    const { cloud } = fakeCloud({ failCreate: true });
    await expect(decide(folderOf([]), { kind: "new", relativePath: "a.md", action: "upload" }, { local: ["a.md"], cloud })).rejects.toThrow("API create failed: 500");
  });

  test("rejects a file that is gone or already published", async () => {
    await expect(decide(folderOf([]), { kind: "new", relativePath: "gone.md", action: "upload" }, { local: [] })).rejects.toThrow("FOLDER_FILE_NOT_FOUND");
    await expect(decide(folderOf(["a.md"]), { kind: "new", relativePath: "a.md", action: "upload" }, { local: ["a.md"] })).rejects.toThrow("FOLDER_FILE_ALREADY_PUBLISHED");
  });
});

describe("applyFolderDecision: removed files", () => {
  test("keep-cloud only forgets the file locally and audits the unbinding", async () => {
    const { cloud, calls } = fakeCloud();
    const next = await decide(folderOf(["a.md", "b.md"]), { kind: "removed", relativePath: "b.md", action: "keep-cloud" }, { local: ["a.md"], cloud });
    expect(next.files.map((file) => file.relativePath)).toEqual(["a.md"]);
    expect(calls.deleted).toEqual([]);
    expect(calls.unbound).toEqual([["doc-b.md"]]);
  });

  test("keep-cloud still completes when the audit cannot be written", async () => {
    const { cloud, calls } = fakeCloud({ failUnbind: true });
    const next = await decide(folderOf(["b.md"]), { kind: "removed", relativePath: "b.md", action: "keep-cloud" }, { local: [], cloud });
    expect(next.files).toEqual([]);
    expect(calls.deleted).toEqual([]);
  });

  test("remove-cloud deletes exactly the named document after the audit", async () => {
    const { cloud, calls } = fakeCloud();
    const next = await decide(folderOf(["a.md", "docs/b.md"]), { kind: "removed", relativePath: "docs/b.md", action: "remove-cloud" }, { local: ["a.md"], cloud });
    expect(calls.unbound).toEqual([["doc-docs/b.md"]]);
    expect(calls.deleted).toEqual(["docs__b.md"]);
    expect(next.files.map((file) => file.relativePath)).toEqual(["a.md"]);
  });

  test("remove-cloud deletes nothing when the audit fails or the delete fails", async () => {
    const auditFails = fakeCloud({ failUnbind: true });
    await expect(decide(folderOf(["b.md"]), { kind: "removed", relativePath: "b.md", action: "remove-cloud" }, { local: [], cloud: auditFails.cloud })).rejects.toThrow("audit failed");
    expect(auditFails.calls.deleted).toEqual([]);

    const deleteFails = fakeCloud({ failDelete: true });
    await expect(decide(folderOf(["b.md"]), { kind: "removed", relativePath: "b.md", action: "remove-cloud" }, { local: [], cloud: deleteFails.cloud })).rejects.toThrow("delete failed");
  });

  test("never removes the cloud copy of a file that is back on disk", async () => {
    const { cloud, calls } = fakeCloud();
    await expect(decide(folderOf(["a.md"]), { kind: "removed", relativePath: "a.md", action: "remove-cloud" }, { local: ["a.md"], cloud })).rejects.toThrow("FOLDER_FILE_STILL_PRESENT");
    expect(calls.deleted).toEqual([]);
  });
});

describe("applyFolderDecision: renamed files", () => {
  test("reassign keeps the cloud document and its name and points it at the new path", async () => {
    const { cloud, calls } = fakeCloud();
    const next = await decide(folderOf(["old.md"], { splitRenames: ["new.md"] }), { kind: "renamed", from: "old.md", to: "moved/new.md", action: "reassign" }, { local: ["moved/new.md"], cloud });
    expect(next.files).toEqual([{ relativePath: "moved/new.md", binding: binding("old.md") }]);
    expect(next.knownPaths).toContain("moved/new.md");
    expect(calls).toEqual({ created: [], deleted: [], bound: [], unbound: [] });
  });

  test("split remembers that the new path is not a rename and changes nothing else", async () => {
    const folder = folderOf(["old.md"]);
    const next = await decide(folder, { kind: "renamed", from: "old.md", to: "new.md", action: "split" }, { local: ["new.md"] });
    expect(next).toEqual({ ...folder, splitRenames: ["new.md"] });
  });
});

describe("applyFolderDecision: revoked share", () => {
  test("refuses every decision and touches nothing", async () => {
    const { cloud, calls } = fakeCloud();
    const revoked = markFolderRevoked(folderOf(["a.md"]));
    await expect(decide(revoked, { kind: "new", relativePath: "n.md", action: "upload" }, { local: ["a.md", "n.md"], cloud })).rejects.toThrow("FOLDER_ACCESS_REVOKED");
    await expect(decide(revoked, { kind: "removed", relativePath: "a.md", action: "remove-cloud" }, { local: [], cloud })).rejects.toThrow("FOLDER_ACCESS_REVOKED");
    expect(calls).toEqual({ created: [], deleted: [], bound: [], unbound: [] });
  });
});
