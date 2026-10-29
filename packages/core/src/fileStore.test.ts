import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as parser from "./parser";
import { FileStore } from "./fileStore";
import { headingNodeId } from "./workspace-document";
import {
  normalizeMarkdownFilename,
  resolveMarkdownPath,
  sanitizeMarkdownFilename,
} from "./paths";

const SAMPLE_MD = `---
title: File Store Test
id: file-store-test
created: "2026-04-01T00:00:00Z"
updated: "2026-04-01T00:00:00Z"
---

# File Store Test

Root content.
`;

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "bloommd-file-store-test-"));
  await writeFile(join(tempDir, "test.md"), SAMPLE_MD, "utf-8");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("markdown filename safety", () => {
  test("keeps existing .md extension intact", () => {
    expect(normalizeMarkdownFilename("roadmap.md")).toBe("roadmap.md");
  });

  test("keeps existing .markdown extension intact", () => {
    expect(normalizeMarkdownFilename("roadmap.markdown")).toBe("roadmap.markdown");
  });

  test("adds .md extension when missing", () => {
    expect(normalizeMarkdownFilename("roadmap")).toBe("roadmap.md");
  });

  test("sanitizes unsafe creation filenames without corrupting .md extension", () => {
    expect(sanitizeMarkdownFilename("Project Plan.md")).toBe("Project Plan.md");
    expect(sanitizeMarkdownFilename("../Project:Plan.md")).toBe("Project-Plan.md");
  });

  test("rejects path traversal and path separators", () => {
    expect(() => normalizeMarkdownFilename("../secret.md")).toThrow("path separators");
    expect(() => normalizeMarkdownFilename("nested/file.md")).toThrow("path separators");
    expect(() => normalizeMarkdownFilename("..secret.md")).toThrow("traverse");
  });

  test("resolves files inside the base directory", () => {
    expect(resolveMarkdownPath(tempDir, "test")).toBe(resolve(tempDir, "test.md"));
    expect(() => resolveMarkdownPath(tempDir, "../test.md")).toThrow();
  });
});

describe("FileStore", () => {
  test("lists markdown files", async () => {
    const store = new FileStore({ baseDir: tempDir });

    const files = await store.list();

    expect(files.map((f) => f.filename)).toEqual(["test.md"]);
    expect(files[0]!.frontmatter.title).toBe("File Store Test");
  });

  test("reads files with or without .md extension", async () => {
    const store = new FileStore({ baseDir: tempDir });

    const doc = await store.read("test");

    expect(doc.frontmatter.id).toBe("file-store-test");
    expect(doc.filePath).toBe(resolve(tempDir, "test.md"));
  });

  test("writes only inside the configured base directory", async () => {
    const store = new FileStore({ baseDir: tempDir });
    const doc = await store.read("test.md");
    const root = doc.nodes.get(doc.rootId)!;
    root.title = "Updated Store Test";

    await store.write(doc);

    const written = await readFile(join(tempDir, "test.md"), "utf-8");
    expect(written).toContain("# Updated Store Test");

    doc.filePath = resolve(tempDir, "../escape.md");
    await expect(store.write(doc)).rejects.toThrow("escapes base directory");
  });

  test("creates a timestamped backup before overwriting an existing file", async () => {
    const store = new FileStore({ baseDir: tempDir });
    const doc = await store.read("test.md");
    const root = doc.nodes.get(doc.rootId)!;
    root.title = "Backed Up Store Test";

    await store.write(doc);

    const backupDir = join(tempDir, ".bloommd", "backups");
    const backups = await readdir(backupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]!.startsWith("test.md.")).toBe(true);
    expect(backups[0]!.endsWith(".bak")).toBe(true);

    const backup = await readFile(join(backupDir, backups[0]!), "utf-8");
    expect(backup).toContain("# File Store Test");
    expect(backup).not.toContain("# Backed Up Store Test");
  });

  test("does not create a backup when writing a new file", async () => {
    const store = new FileStore({ baseDir: tempDir });
    const doc = await store.read("test.md");
    doc.filePath = resolve(tempDir, "new-file.md");

    await store.write(doc);

    await expect(stat(join(tempDir, ".bloommd", "backups"))).rejects.toThrow();
  });

  test("can disable automatic backups", async () => {
    const store = new FileStore({ baseDir: tempDir, backupsEnabled: false });
    const doc = await store.read("test.md");
    const root = doc.nodes.get(doc.rootId)!;
    root.title = "No Backup Store Test";

    await store.write(doc);

    await expect(stat(join(tempDir, ".bloommd", "backups"))).rejects.toThrow();
  });

  test("rejects traversal reads and deletes", async () => {
    const store = new FileStore({ baseDir: tempDir });

    await expect(store.read("../test.md")).rejects.toThrow();
    await expect(store.delete("../test.md")).rejects.toThrow();
  });
});

describe("folders", () => {
  test("creates a folder as a real subdirectory", async () => {
    // Folders are plain directories so the structure survives Obsidian, git and ls (#5).
    const dir = await mkdtemp(join(tmpdir(), "bloommd-folders-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });

    expect(await store.createFolder("Projekt")).toBe("Projekt");
    expect((await stat(join(dir, "Projekt"))).isDirectory()).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  test("creates nested folders in one call", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-folders-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });

    expect(await store.createFolder("Projekt/Recherche")).toBe("Projekt/Recherche");
    expect((await stat(join(dir, "Projekt", "Recherche"))).isDirectory()).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  test("refuses to create a folder outside the workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-folders-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });

    for (const attempt of ["../escape", "/tmp/escape", "Projekt/../../escape"]) {
      await expect(store.createFolder(attempt)).rejects.toThrow();
    }

    await rm(dir, { recursive: true, force: true });
  });

  test("reads and writes a document inside a folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-folders-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });
    await store.createFolder("Projekt");
    await writeFile(join(dir, "Projekt", "plan.md"), "# Plan\n\n## Alpha\n", "utf8");

    const doc = await store.read("Projekt/plan.md");
    expect(doc.nodes.size).toBe(2);

    doc.nodes.get(doc.rootId)!.title = "Plan v2";
    await store.write(doc);
    expect(await readFile(join(dir, "Projekt", "plan.md"), "utf8")).toContain("# Plan v2");

    await rm(dir, { recursive: true, force: true });
  });

  test("lists files inside folders with their relative path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-folders-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });
    await store.createFolder("Projekt");
    await writeFile(join(dir, "root.markdown"), "# Root\n", "utf8");
    await writeFile(join(dir, "Projekt", "plan.md"), "# Plan\n", "utf8");

    const names = (await store.list()).map((entry) => entry.filename).sort();
    expect(names).toEqual(["Projekt/plan.md", "root.markdown"]);
    expect(await store.listFolders()).toEqual(["Projekt"]);

    await rm(dir, { recursive: true, force: true });
  });

  test("reads a whole folder as a derived workspace mindmap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bloommd-workspace-map-"));
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });
    await store.createFolder("Book");
    await writeFile(join(dir, "overview.md"), "# Overview\n\n[[Chapter]]\n", "utf8");
    await writeFile(join(dir, "Book", "Chapter.md"), "# Chapter\n\n## Scene\n", "utf8");

    const doc = await store.readWorkspaceMindMap("Workspace");

    expect(doc.derived).toMatchObject({ kind: "workspace", writable: false, source: dir });
    expect(doc.nodes.get("workspace:root")?.children).toContain("file:overview.md");
    expect(doc.nodes.get("folder:Book")?.children).toContain("file:Book/Chapter.md");
    expect(doc.references?.[0]).toMatchObject({
      sourceId: headingNodeId("overview.md", 0, "Overview"),
      targetId: "file:Book/Chapter.md",
      sourceFileId: "file:overview.md",
      targetFileId: "file:Book/Chapter.md",
      raw: "[[Chapter]]",
      line: 3,
    });
    await expect(store.write(doc)).rejects.toThrow(/derived views/);

    await rm(dir, { recursive: true, force: true });
  });
});


describe("existing vault compatibility", () => {
  test.skipIf(process.platform === "win32")("lists, opens, edits and maps POSIX punctuation without renaming", async () => {
    const folder = 'Questions? "quotes" *';
    const filename = `${folder}/What now?.md`;
    await mkdir(join(tempDir, folder));
    await writeFile(join(tempDir, filename), "# Original\n");
    const store = new FileStore({ baseDir: tempDir });
    expect((await store.list()).map((file) => file.filename)).toContain(filename);
    const doc = await store.read(filename);
    doc.nodes.get(doc.rootId)!.title = "Changed";
    await store.write(doc);
    expect(await readFile(join(tempDir, filename), "utf8")).toContain("# Changed");
    const workspace = await store.readWorkspaceMindMap();
    expect(workspace.nodes.has(`file:${filename}`)).toBe(true);
  });

  test("tolerant reads report broken frontmatter and retain good files", async () => {
    await writeFile(join(tempDir, "broken.md"), "---\ntitle: [unterminated\n---\n# Broken\n");
    const store = new FileStore({ baseDir: tempDir });
    await expect(store.list()).rejects.toThrow();
    const listIssues: string[] = [];
    expect((await store.list((path) => listIssues.push(path))).map((file) => file.filename)).toEqual(["test.md"]);
    expect(listIssues).toEqual(["broken.md"]);
    const mapIssues: string[] = [];
    const doc = await store.readWorkspaceMindMap("Workspace", (path) => mapIssues.push(path));
    expect(doc.nodes.has("file:test.md")).toBe(true);
    expect(doc.nodes.has("file:broken.md")).toBe(false);
    expect(mapIssues).toEqual(["broken.md"]);
  });

  test("an unavailable root rejects instead of looking empty", async () => {
    const store = new FileStore({ baseDir: join(tempDir, "missing") });
    await expect(store.list(() => { throw new Error("root must reject directly"); })).rejects.toThrow("ENOENT");
  });

  test("new filenames avoid Windows devices, trailing dots and spaces", () => {
    for (const name of ["CON", "nul.md", "COM1.notes.md", "LPT9.md", "COM¹.md"]) {
      expect(sanitizeMarkdownFilename(name)).toStartWith("_");
    }
    expect(sanitizeMarkdownFilename("notes. ")).toBe("notes.md");
  });
});


describe("parsed file snapshots", () => {
  test("list, workspace and read reuse parsing without exposing mutable cache state", async () => {
    const parse = spyOn(parser, "parseFile");
    try {
      const store = new FileStore({ baseDir: tempDir });
      const listed = await store.list();
      listed[0]!.frontmatter.title = "Changed by caller";
      await store.readWorkspaceMindMap();
      const doc = await store.read("test.md");
      doc.nodes.get(doc.rootId)!.title = "Changed by editor";
      const reread = await store.read("test.md");
      expect(reread.frontmatter.title).toBe("File Store Test");
      expect(reread.nodes.get(reread.rootId)!.title).toBe("File Store Test");
      expect(parse).toHaveBeenCalledTimes(1);
    } finally { parse.mockRestore(); }
  });

  test("invalidates changed content even when size and mtime are unchanged", async () => {
    const path = join(tempDir, "test.md");
    const store = new FileStore({ baseDir: tempDir });
    await store.read("test.md");
    const before = await stat(path);
    await writeFile(path, SAMPLE_MD.replaceAll("File Store Test", "File Store Next"));
    await utimes(path, before.atime, before.mtime);
    expect((await store.read("test.md")).frontmatter.title).toBe("File Store Next");
  });

  test("a broken replacement never returns an old successful snapshot and recovers", async () => {
    const path = join(tempDir, "test.md");
    const store = new FileStore({ baseDir: tempDir });
    await store.read("test.md");
    await writeFile(path, "---\ntitle: [broken\n---\n");
    const issues: string[] = [];
    expect(await store.list((name) => issues.push(name))).toEqual([]);
    expect(issues).toEqual(["test.md"]);
    await expect(store.read("test.md")).rejects.toThrow();
    await writeFile(path, SAMPLE_MD);
    expect((await store.read("test.md")).frontmatter.title).toBe("File Store Test");
  });

  test("removes deleted entries and detects recreated files", async () => {
    const store = new FileStore({ baseDir: tempDir });
    await store.list();
    await store.delete("test.md");
    expect(await store.list()).toEqual([]);
    await writeFile(join(tempDir, "test.md"), "# Recreated\n");
    expect((await store.read("test.md")).nodes.size).toBe(1);
    expect((await store.readWorkspaceMindMap()).nodes.has("file:test.md")).toBe(true);
  });
});

describe("readTemplates", () => {
  test("a workspace without the template folder has no templates and raises no error", async () => {
    const store = new FileStore({ baseDir: tempDir });
    expect(await store.readTemplates()).toEqual([]);
  });

  test("a file named like the template folder is not a folder of templates", async () => {
    await writeFile(join(tempDir, "Vorlagen"), "not a folder");
    expect(await new FileStore({ baseDir: tempDir }).readTemplates()).toEqual([]);
  });

  test("reads the .md files directly inside Vorlagen, sorted, without sub-folders", async () => {
    await mkdir(join(tempDir, "Vorlagen", "Archiv"), { recursive: true });
    await mkdir(join(tempDir, "Uni", "Vorlagen"), { recursive: true });
    await writeFile(join(tempDir, "Vorlagen", "Wochenplan.md"), "# {{title}}\n{{date}}\n");
    await writeFile(join(tempDir, "Vorlagen", "Brief.md"), "# {{title}}\n{{name}}\n");
    await writeFile(join(tempDir, "Vorlagen", "notizen.txt"), "ignored");
    await writeFile(join(tempDir, "Vorlagen", "Archiv", "Alt.md"), "# old");
    await writeFile(join(tempDir, "Uni", "Vorlagen", "Falsch.md"), "# wrong place");
    const templates = await new FileStore({ baseDir: tempDir }).readTemplates();
    expect(templates).toEqual([
      { path: "Vorlagen/Brief.md", content: "# {{title}}\n{{name}}\n" },
      { path: "Vorlagen/Wochenplan.md", content: "# {{title}}\n{{date}}\n" },
    ]);
  });

  test("honours another folder name", async () => {
    await mkdir(join(tempDir, "Templates"));
    await writeFile(join(tempDir, "Templates", "A.md"), "# A");
    expect(await new FileStore({ baseDir: tempDir }).readTemplates("Templates")).toEqual([{ path: "Templates/A.md", content: "# A" }]);
  });

  test("refuses a folder outside the workspace", async () => {
    await expect(new FileStore({ baseDir: tempDir }).readTemplates("../outside")).rejects.toThrow();
  });
});
