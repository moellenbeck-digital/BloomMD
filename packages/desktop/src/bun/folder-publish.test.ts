import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planSharedFolderPublication, SHARED_FOLDER_MAX_FILE_BYTES } from "@bloommd/core";
import { prepareFolderPublication, publishFolderPlan, scanFolderForPublication, singleFileSharesInsideFolder, type FolderPublishCloud } from "./folder-publish";

const temporaryDirectories: string[] = [];

async function folder(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-folder-publish-"));
  temporaryDirectories.push(directory);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), content);
  }
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("scanFolderForPublication", () => {
  test("lists only Markdown files, as relative POSIX paths with sizes", async () => {
    const directory = await folder({
      "a.md": "# A",
      "notes/b.markdown": "# Bee",
      "notes/deep/c.MD": "# C",
      "image.png": "binary",
      "data.json": "{}",
      "readme.txt": "text",
    });
    const files = await scanFolderForPublication(directory);
    expect(files.map((file) => file.relativePath).sort()).toEqual(["a.md", "notes/b.markdown", "notes/deep/c.MD"]);
    expect(files.find((file) => file.relativePath === "a.md")?.sizeBytes).toBe(3);
  });

  test("skips dot folders and node_modules and never follows symbolic links", async () => {
    const outside = await folder({ "secret.md": "# Secret" });
    const directory = await folder({
      "ok.md": "# Ok",
      ".obsidian/hidden.md": "# Hidden",
      ".git/note.md": "# Git",
      "node_modules/pkg/readme.md": "# Pkg",
    });
    await symlink(join(outside, "secret.md"), join(directory, "linked.md"));
    await symlink(outside, join(directory, "linked-folder"));
    expect((await scanFolderForPublication(directory)).map((file) => file.relativePath)).toEqual(["ok.md"]);
  });
});

function fakeCloud(options: { failCreate?: string; failAudit?: boolean; failDelete?: boolean; noDocumentId?: boolean } = {}) {
  const calls = { created: [] as Array<{ filename: string; markdown: string }>, deleted: [] as string[], audited: [] as string[][] };
  const cloud: FolderPublishCloud = {
    async create(filename, markdown) {
      if (options.failCreate === filename) throw new Error("API create failed: 500");
      calls.created.push({ filename, markdown });
      return { filePath: filename, storage: options.noDocumentId ? {} : { documentId: `doc-${calls.created.length}`, version: 1 } };
    },
    async delete(filename) {
      calls.deleted.push(filename);
      if (options.failDelete) throw new Error("delete failed");
    },
    async recordFolderBinding(documentIds) {
      if (options.failAudit) throw new Error("audit failed");
      calls.audited.push(documentIds);
    },
  };
  return { cloud, calls };
}

const planOf = (files: Array<[string, number]>, existing: string[] = [], strategy: "keep-cloud" | "suffix" = "keep-cloud") =>
  planSharedFolderPublication({ files: files.map(([relativePath, sizeBytes]) => ({ relativePath, sizeBytes })), existingCloudFilenames: existing, strategy });

describe("prepareFolderPublication", () => {
  const files = [{ relativePath: "a.md", sizeBytes: 3 }, { relativePath: "b.md", sizeBytes: 3 }, { relativePath: "c.md", sizeBytes: 3 }];

  test("leaves out files that are already published or shared one by one and counts them", () => {
    const prepared = prepareFolderPublication({
      files,
      excluded: [],
      strategy: "keep-cloud",
      existingCloudFilenames: ["a.md", "b.md"],
      alreadyPublished: new Set(["a.md"]),
      alreadyShared: new Set(["b.md", "a.md"]),
    });
    expect(prepared.plan.items.map((item) => [item.relativePath, item.status])).toEqual([["c.md", "upload"]]);
    expect(prepared.alreadyPublished).toBe(1);
    expect(prepared.alreadyShared).toBe(1);
  });
});

describe("singleFileSharesInsideFolder", () => {
  test("maps single-file shares to paths relative to the chosen folder", () => {
    const inside = singleFileSharesInsideFolder("/Users/me/Notes", "/Users/me/Notes/Projects", ["Projects/a.md", "Projects/deep/b.md", "top.md", "../Other/c.md"]);
    expect([...inside].sort()).toEqual(["a.md", "deep/b.md"]);
  });

  test("returns every share when the folder is the open workspace", () => {
    const inside = singleFileSharesInsideFolder("/Users/me/Notes", "/Users/me/Notes", ["top.md", "sub/x.md"]);
    expect([...inside].sort()).toEqual(["sub/x.md", "top.md"]);
  });
});

describe("publishFolderPlan", () => {
  test("uploads only confirmed files, audits ids once and returns one binding per file", async () => {
    const { cloud, calls } = fakeCloud();
    const result = await publishFolderPlan({
      plan: planOf([["a.md", 3], ["docs/b.md", 3], ["new.md", 3]]),
      confirmed: ["a.md", "docs/b.md"],
      workspaceId: "ws-1",
      readMarkdown: async (path) => `# ${path}`,
      cloud,
    });
    expect(calls.created.map((entry) => entry.filename)).toEqual(["a.md", "docs__b.md"]);
    expect(calls.audited).toEqual([["doc-1", "doc-2"]]);
    expect(result.skipped).toEqual([{ relativePath: "new.md", reason: "not-confirmed" }]);
    expect(result.published.map((entry) => [entry.relativePath, entry.binding.cloudFilename, entry.binding.documentId, entry.binding.workspaceId, entry.binding.connectionState])).toEqual([
      ["a.md", "a.md", "doc-1", "ws-1", "connected"],
      ["docs/b.md", "docs__b.md", "doc-2", "ws-1", "connected"],
    ]);
  });

  test("never uploads conflicts, excluded or blocked files", async () => {
    const { cloud, calls } = fakeCloud();
    const plan = planSharedFolderPublication({
      files: [{ relativePath: "taken.md", sizeBytes: 3 }, { relativePath: "skip/x.md", sizeBytes: 3 }, { relativePath: "bad?.md", sizeBytes: 3 }, { relativePath: "ok.md", sizeBytes: 3 }],
      excluded: ["skip"],
      existingCloudFilenames: ["taken.md"],
      strategy: "keep-cloud",
    });
    await publishFolderPlan({ plan, confirmed: ["taken.md", "skip/x.md", "bad?.md", "ok.md"], workspaceId: "ws-1", readMarkdown: async () => "# X", cloud });
    expect(calls.created.map((entry) => entry.filename)).toEqual(["ok.md"]);
  });

  test("uploads under the suffixed name and binds the name the cloud actually used", async () => {
    const { cloud, calls } = fakeCloud();
    const result = await publishFolderPlan({
      plan: planOf([["a.md", 3]], ["a.md"], "suffix"),
      confirmed: ["a.md"],
      workspaceId: "ws-1",
      readMarkdown: async () => "# A",
      cloud,
    });
    expect(calls.created.map((entry) => entry.filename)).toEqual(["a-local.md"]);
    expect(result.published[0]?.binding.cloudFilename).toBe("a-local.md");
  });

  test("skips a file that grew past the size limit after the preview", async () => {
    const { cloud, calls } = fakeCloud();
    const result = await publishFolderPlan({
      plan: planOf([["grown.md", 3]]),
      confirmed: ["grown.md"],
      workspaceId: "ws-1",
      readMarkdown: async () => "x".repeat(SHARED_FOLDER_MAX_FILE_BYTES + 1),
      cloud,
    });
    expect(calls.created).toEqual([]);
    expect(result.skipped).toEqual([{ relativePath: "grown.md", reason: "too-large" }]);
  });

  test("reports an unreadable file and continues with the others", async () => {
    const { cloud, calls } = fakeCloud();
    const result = await publishFolderPlan({
      plan: planOf([["a.md", 3], ["b.md", 3]]),
      confirmed: ["a.md", "b.md"],
      workspaceId: "ws-1",
      readMarkdown: async (path) => { if (path === "a.md") throw new Error("EACCES"); return "# B"; },
      cloud,
    });
    expect(result.skipped).toEqual([{ relativePath: "a.md", reason: "unreadable" }]);
    expect(calls.created.map((entry) => entry.filename)).toEqual(["b.md"]);
    expect(result.published).toHaveLength(1);
  });

  test("a failed upload is reported per file and does not stop the run", async () => {
    const { cloud, calls } = fakeCloud({ failCreate: "a.md" });
    const result = await publishFolderPlan({
      plan: planOf([["a.md", 3], ["b.md", 3]]),
      confirmed: ["a.md", "b.md"],
      workspaceId: "ws-1",
      readMarkdown: async () => "# X",
      cloud,
    });
    expect(result.failed).toEqual([{ relativePath: "a.md", error: "API create failed: 500" }]);
    expect(result.published.map((entry) => entry.relativePath)).toEqual(["b.md"]);
    expect(calls.audited).toEqual([["doc-1"]]);
  });

  test("removes a document the server created without an id", async () => {
    const { cloud, calls } = fakeCloud({ noDocumentId: true });
    const result = await publishFolderPlan({ plan: planOf([["a.md", 3]]), confirmed: ["a.md"], workspaceId: "ws-1", readMarkdown: async () => "# A", cloud });
    expect(calls.deleted).toEqual(["a.md"]);
    expect(result.failed).toEqual([{ relativePath: "a.md", error: "CLOUD_DOCUMENT_ID_MISSING" }]);
    expect(result.published).toEqual([]);
  });

  test("audits in chunks of 200 documents", async () => {
    const { cloud, calls } = fakeCloud();
    const files: Array<[string, number]> = Array.from({ length: 205 }, (_, index) => [`n${String(index).padStart(3, "0")}.md`, 3]);
    await publishFolderPlan({ plan: planOf(files), confirmed: files.map(([path]) => path), workspaceId: "ws-1", readMarkdown: async () => "# N", cloud });
    expect(calls.audited.map((chunk) => chunk.length)).toEqual([200, 5]);
  });

  test("a failed audit removes every document of the run and publishes nothing", async () => {
    const { cloud, calls } = fakeCloud({ failAudit: true });
    const result = await publishFolderPlan({ plan: planOf([["a.md", 3], ["b.md", 3]]), confirmed: ["a.md", "b.md"], workspaceId: "ws-1", readMarkdown: async () => "# X", cloud });
    expect(result.auditError).toBe("audit failed");
    expect(calls.deleted).toEqual(["a.md", "b.md"]);
    expect(result.published).toEqual([]);
    expect(result.rollbackFailures).toEqual([]);
  });

  test("reports documents that could not be removed after a failed audit", async () => {
    const { cloud } = fakeCloud({ failAudit: true, failDelete: true });
    const result = await publishFolderPlan({ plan: planOf([["a.md", 3]]), confirmed: ["a.md"], workspaceId: "ws-1", readMarkdown: async () => "# X", cloud });
    expect(result.rollbackFailures).toEqual(["a.md"]);
    expect(result.published).toEqual([]);
  });
});
