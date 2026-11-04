import { describe, expect, test } from "bun:test";
import {
  cloudFilenameForRelativePath,
  isSharedFolderPathExcluded,
  planSharedFolderPublication,
  SHARED_FOLDER_MAX_FILE_BYTES,
  type SharedFolderLocalFile,
} from "./shared-folder-publication";

const file = (relativePath: string, sizeBytes = 100): SharedFolderLocalFile => ({ relativePath, sizeBytes });

describe("cloudFilenameForRelativePath", () => {
  test("flattens folders with a fixed separator", () => {
    expect(cloudFilenameForRelativePath("idea.md")).toBe("idea.md");
    expect(cloudFilenameForRelativePath("notes/2026/idea.md")).toBe("notes__2026__idea.md");
    expect(cloudFilenameForRelativePath("Notes/Plan.markdown")).toBe("Notes__Plan.markdown");
  });

  test("returns null for names the cloud would rewrite", () => {
    expect(cloudFilenameForRelativePath("a:b.md")).toBeNull();
    expect(cloudFilenameForRelativePath("what?.md")).toBeNull();
    expect(cloudFilenameForRelativePath(".hidden.md")).toBeNull();
    expect(cloudFilenameForRelativePath("a--b.md")).toBeNull();
    expect(cloudFilenameForRelativePath("two  spaces.md")).toBeNull();
    expect(cloudFilenameForRelativePath("../escape.md")).toBeNull();
    expect(cloudFilenameForRelativePath("/abs.md")).toBeNull();
    expect(cloudFilenameForRelativePath("back\\slash.md")).toBeNull();
    expect(cloudFilenameForRelativePath("no-extension")).toBeNull();
  });
});

describe("isSharedFolderPathExcluded", () => {
  test("matches files and whole folders but not name prefixes", () => {
    expect(isSharedFolderPathExcluded("a/b.md", ["a/b.md"])).toBe(true);
    expect(isSharedFolderPathExcluded("a/b/c.md", ["a/b"])).toBe(true);
    expect(isSharedFolderPathExcluded("a/b/c.md", ["a/b/"])).toBe(true);
    expect(isSharedFolderPathExcluded("a/bc.md", ["a/b"])).toBe(false);
    expect(isSharedFolderPathExcluded("a/b.md", [""])).toBe(false);
  });
});

describe("planSharedFolderPublication", () => {
  test("plans a plain upload and sums the totals deterministically", () => {
    const plan = planSharedFolderPublication({
      files: [file("z.md", 10), file("docs/a.md", 20)],
      existingCloudFilenames: [],
      strategy: "keep-cloud",
    });
    expect(plan.items.map((item) => [item.relativePath, item.status, item.uploadFilename])).toEqual([
      ["docs/a.md", "upload", "docs__a.md"],
      ["z.md", "upload", "z.md"],
    ]);
    expect(plan.totals).toEqual({ fileCount: 2, uploadCount: 2, uploadBytes: 30, conflictCount: 0, excludedCount: 0, blockedCount: 0 });
  });

  test("is independent of the input order", () => {
    const input = { existingCloudFilenames: ["a.md"], strategy: "suffix" as const };
    const first = planSharedFolderPublication({ ...input, files: [file("a.md"), file("b.md")] });
    const second = planSharedFolderPublication({ ...input, files: [file("b.md"), file("a.md")] });
    expect(second).toEqual(first);
  });

  test("keep-cloud reports a conflict and uploads nothing for that file", () => {
    const plan = planSharedFolderPublication({
      files: [file("a.md"), file("b.md")],
      existingCloudFilenames: ["A.MD"],
      strategy: "keep-cloud",
    });
    expect(plan.items.find((item) => item.relativePath === "a.md")).toMatchObject({ status: "conflict", uploadFilename: null });
    expect(plan.totals.conflictCount).toBe(1);
    expect(plan.totals.uploadCount).toBe(1);
  });

  test("suffix strategy uploads under another name and never reuses a taken one", () => {
    const plan = planSharedFolderPublication({
      files: [file("a.md"), file("a-local.md")],
      existingCloudFilenames: ["a.md", "a-local.md", "a-local-2.md"],
      strategy: "suffix",
    });
    expect(plan.items.map((item) => [item.relativePath, item.status, item.uploadFilename, item.renamedByStrategy ?? false])).toEqual([
      ["a-local.md", "upload", "a-local-local.md", true],
      ["a.md", "upload", "a-local-3.md", true],
    ]);
  });

  test("suffix strategy keeps the extension of .markdown files", () => {
    const plan = planSharedFolderPublication({
      files: [file("x/n.markdown")],
      existingCloudFilenames: ["x__n.markdown"],
      strategy: "suffix",
    });
    expect(plan.items[0]).toMatchObject({ status: "upload", uploadFilename: "x__n-local.markdown" });
  });

  test("excluded files and folders are never uploaded", () => {
    const plan = planSharedFolderPublication({
      files: [file("keep.md"), file("drafts/one.md"), file("drafts/deep/two.md"), file("drafts-final.md")],
      excluded: ["drafts"],
      existingCloudFilenames: [],
      strategy: "keep-cloud",
    });
    expect(plan.items.filter((item) => item.status === "excluded").map((item) => item.relativePath)).toEqual(["drafts/deep/two.md", "drafts/one.md"]);
    expect(plan.items.filter((item) => item.status === "upload").map((item) => item.relativePath)).toEqual(["drafts-final.md", "keep.md"]);
  });

  test("blocks names the cloud would rewrite and files that are too large", () => {
    const plan = planSharedFolderPublication({
      files: [file("what?.md"), file("big.md", SHARED_FOLDER_MAX_FILE_BYTES + 1), file("ok.md", SHARED_FOLDER_MAX_FILE_BYTES)],
      existingCloudFilenames: [],
      strategy: "keep-cloud",
    });
    expect(plan.items.map((item) => [item.relativePath, item.status, item.reason])).toEqual([
      ["big.md", "blocked", "too-large"],
      ["ok.md", "upload", undefined],
      ["what?.md", "blocked", "name-not-portable"],
    ]);
    expect(plan.items.find((item) => item.relativePath === "what?.md")?.cloudFilename).toBeNull();
  });

  test("a blocked file stays blocked even when the person excluded it", () => {
    const plan = planSharedFolderPublication({
      files: [file("what?.md")],
      excluded: ["what?.md"],
      existingCloudFilenames: [],
      strategy: "keep-cloud",
    });
    expect(plan.items[0]).toMatchObject({ status: "blocked", reason: "name-not-portable" });
  });

  test("blocks every file whose flattened name collides, case-insensitively", () => {
    const plan = planSharedFolderPublication({
      files: [file("a/b.md"), file("a__b.md"), file("A__B.md"), file("other.md")],
      existingCloudFilenames: [],
      strategy: "suffix",
    });
    expect(plan.items.filter((item) => item.status === "blocked").map((item) => [item.relativePath, item.reason])).toEqual([
      ["A__B.md", "name-collision"],
      ["a/b.md", "name-collision"],
      ["a__b.md", "name-collision"],
    ]);
    expect(plan.totals.uploadCount).toBe(1);
  });

  test("a suffixed upload never takes the flattened name of another local file", () => {
    const plan = planSharedFolderPublication({
      files: [file("a.md"), file("a-local.md")],
      existingCloudFilenames: ["a.md"],
      strategy: "suffix",
    });
    expect(plan.items.find((item) => item.relativePath === "a.md")?.uploadFilename).toBe("a-local-2.md");
    expect(plan.items.find((item) => item.relativePath === "a-local.md")?.uploadFilename).toBe("a-local.md");
  });
});
