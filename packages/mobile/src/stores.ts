/**
 * Where the app keeps maps: its own folder (default), a folder the user opened from the Files app,
 * typically an Obsidian vault in iCloud Drive, or one single Markdown file the Files app handed over
 * ("Open in BloomMD"). Folder and file are edited in place as plain Markdown.
 */
import type { BloomFolderPlugin, FolderFile, OpenedFile } from "@bloommd/capacitor-folder";
import { conflictCopyPath, normalizeFolderPath, parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import type { MindMapDocument, MindMapFrontmatter } from "@bloommd/core/browser";
import { isSkippedFolder, isSkippedPath, normalizeMobileMarkdownPath } from "./mobile-files";
import { createFolder, deleteMindmap, listMarkdownPaths, listMindmaps, readMindmap, writeMindmap } from "./storage";

export interface StoreEntry {
  /** Path inside the store, "/"-separated: a file name at the top, "Schule/Physik.md" in a folder. */
  path: string;
  title: string;
  /** Folder part of the path ("" at the top), shown to tell notes apart. */
  folder: string;
  /** False while iCloud is still downloading the file. */
  local: boolean;
  frontmatter?: MindMapFrontmatter;
}

export interface LoadedDocument {
  document: MindMapDocument;
  /** What saving the document unchanged would write; edits are compared against it. */
  baseline: string;
  /** Modification time of the file when it was read (folder stores), for conflict checks. */
  modified?: number;
}

export interface MobileStore {
  readonly kind: "app" | "folder" | "file";
  readonly name: string;
  /**
   * `folders` are all folders of the store, "/"-separated and including empty ones (without hidden
   * folders and `node_modules`). `truncated`: the folder holds more notes than one listing returns.
   */
  list(): Promise<{ entries: StoreEntry[]; folders: string[]; unreadable: string[]; truncated?: boolean }>;
  /**
   * Creates a folder, also nested, without writing anything into it; one that exists already is
   * fine. Resolves to the normalized folder path. Rejects paths that leave the store with
   * {@link UnsafePathError} and hidden folders (`.obsidian`, …) with {@link SkippedFolderError}.
   */
  createFolder(path: string): Promise<string>;
  read(path: string): Promise<LoadedDocument>;
  /** Saves only real changes; returns the new baseline and modification time. */
  save(loaded: LoadedDocument, document: MindMapDocument): Promise<LoadedDocument | null>;
  remove(path: string): Promise<void>;
  /**
   * Writes the document as a new note next to its file, e.g. "Physik (iPad-Konflikt).md", never
   * replacing an existing file; resolves to the path of the copy.
   */
  saveCopy(document: MindMapDocument, label: string): Promise<string>;
  /** Path for a new map with this file name, inside `folder`. */
  pathFor(filename: string, folder?: string): string;
}

export class StoreConflictError extends Error {
  constructor(readonly path: string) {
    super(`„${path}“ wurde auf einem anderen Gerät geändert oder gelöscht.`);
  }
}

/** A path that would leave the folder: absolute, with `..` or `.` parts, empty parts or control characters. */
export class UnsafePathError extends Error {
  readonly code = "BAD_PATH";
  constructor(readonly path: string) {
    super(`„${path}“ liegt nicht im geöffneten Ordner.`);
  }
}

/** A folder the lists never show (`.obsidian`, `.trash`, dot folders, `node_modules`): a new one there would be invisible. */
export class SkippedFolderError extends Error {
  readonly code = "SKIPPED_FOLDER";
  constructor(readonly path: string) {
    super(`„${path}“ ist ein ausgeblendeter Ordner.`);
  }
}

/** The path inside the open folder, "/"-separated; throws {@link UnsafePathError} for anything that could leave it. */
export function safePath(path: string): string {
  const parts = path.split("/");
  const unsafe = !path
    || path.startsWith("/")
    || /^[A-Za-z]:/.test(path)
    // eslint-disable-next-line no-control-regex
    || /[\u0000-\u001f]/.test(path)
    || parts.some((part) => part === "" || part === "." || part === "..");
  if (unsafe) throw new UnsafePathError(path);
  return path;
}

/** Error code of a rejected plugin call (CONFLICT, EXISTS, …). */
function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** The naming scheme of conflict copies lives in core (`conflictCopyPath`), where every list reads it back. */
export const copyPath = conflictCopyPath;

/** The copy is a note of its own: same content, its own id and file. */
function copyOf(document: MindMapDocument, path: string): MindMapDocument {
  const frontmatter = document.frontmatter.id ? { ...document.frontmatter, id: crypto.randomUUID().slice(0, 8) } : document.frontmatter;
  return { ...document, filePath: path, frontmatter };
}

const COPY_ATTEMPTS = 100;

/** The serializer stamps `updated` with the current time; that alone is not a change. */
function comparable(markdown: string): string {
  return markdown.replace(/^updated:.*$/m, "");
}

/** True when saving would write something different from what was loaded. */
export function hasChanges(loaded: LoadedDocument, document: MindMapDocument): boolean {
  return comparable(serializeToMarkdown(document)) !== comparable(loaded.baseline);
}

function loaded(path: string, markdown: string, modified?: number): LoadedDocument {
  const document = parseFile(path, markdown);
  return { document, baseline: serializeToMarkdown(document), ...(modified !== undefined ? { modified } : {}) };
}

export function createAppStore(): MobileStore {
  return {
    kind: "app",
    name: "Auf diesem Gerät",
    async list() {
      const result = await listMindmaps();
      return {
        entries: result.entries.map((entry) => {
          const slash = entry.filename.lastIndexOf("/");
          return { path: entry.filename, title: entry.frontmatter.title || entry.filename.slice(slash + 1), folder: slash >= 0 ? entry.filename.slice(0, slash) : "", local: true, frontmatter: entry.frontmatter };
        }),
        folders: folderPaths(result.folders),
        unreadable: result.unreadable,
      };
    },
    createFolder: (path) => createCheckedFolder(path, createFolder),
    async read(path) {
      const document = await readMindmap(path);
      return { document, baseline: serializeToMarkdown(document) };
    },
    async save(current, document) {
      if (!hasChanges(current, document)) return null;
      await writeMindmap(document);
      return { document, baseline: serializeToMarkdown(document) };
    },
    remove: (path) => deleteMindmap(path),
    async saveCopy(document, label) {
      // The copy lands next to the note, in its folder, so only the names of that folder matter.
      const taken = new Set((await listMarkdownPaths()).map((path) => path.toLowerCase()));
      for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
        const path = normalizeMobileMarkdownPath(copyPath(document.filePath, label, attempt));
        if (taken.has(path.toLowerCase())) continue;
        await writeMindmap(copyOf(document, path));
        return path;
      }
      throw new Error("No free file name for the copy.");
    },
    pathFor: (filename, folder) => normalizeMobileMarkdownPath(folder ? `${folder.replace(/\/+$/, "")}/${filename}` : filename),
  };
}

export { isSkippedPath };

/** Normalizes a new folder's path with core's rule and refuses folders the lists would hide. */
async function createCheckedFolder(path: string, create: (folder: string) => Promise<string>): Promise<string> {
  const folder = normalizeFolderPath(path);
  if (isSkippedFolder(folder)) throw new SkippedFolderError(folder);
  return create(folder);
}

/** The folders a list shows: without Obsidian's own, dot folders and `node_modules`, sorted like the notes. */
export function folderPaths(folders: string[]): string[] {
  return folders.filter((folder) => !isSkippedFolder(folder)).sort((a, b) => a.localeCompare(b, "de"));
}

export function folderEntries(files: FolderFile[]): StoreEntry[] {
  return files
    .filter((file) => !isSkippedPath(file.path))
    .map((file) => {
      const slash = file.path.lastIndexOf("/");
      return {
        path: file.path,
        title: file.path.slice(slash + 1).replace(/\.(md|markdown)$/i, ""),
        folder: slash >= 0 ? file.path.slice(0, slash) : "",
        local: file.local,
      };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder, "de") || a.title.localeCompare(b.title, "de"));
}

export function createFolderStore(plugin: BloomFolderPlugin, name: string): MobileStore {
  return {
    kind: "folder",
    name,
    async list() {
      const { files, folders = [], truncated } = await plugin.list({ extensions: ["md", "markdown"] });
      return { entries: folderEntries(files), folders: folderPaths(folders), unreadable: [], ...(truncated ? { truncated } : {}) };
    },
    createFolder: (path) => createCheckedFolder(path, async (folder) => {
      // The folder itself is created, never a placeholder file in it (it would show up in Obsidian and git).
      await plugin.mkdir({ path: safePath(folder) });
      return folder;
    }),
    async read(path) {
      const { data, modified } = await plugin.read({ path: safePath(path) });
      return loaded(path, data, modified);
    },
    async save(current, document) {
      // Opening a note must never rewrite it: only real edits are written back.
      if (!hasChanges(current, document)) return null;
      const markdown = serializeToMarkdown(document);
      const path = safePath(current.document.filePath);
      try {
        const { modified } = await plugin.write({ path, data: markdown, ...(current.modified ? { expectedModified: current.modified } : {}) });
        return { document, baseline: markdown, modified };
      } catch (error) {
        if (errorCode(error) === "CONFLICT" || /changed on another device/.test(String((error as Error).message))) throw new StoreConflictError(path);
        throw error;
      }
    },
    remove: async (path) => plugin.remove({ path: safePath(path) }),
    async saveCopy(document, label) {
      for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
        const path = safePath(copyPath(document.filePath, label, attempt));
        try {
          // Exclusive: an existing note, also one iCloud has not downloaded yet, is never replaced.
          await plugin.write({ path, data: serializeToMarkdown(copyOf(document, path)), exclusive: true });
          return path;
        } catch (error) {
          if (errorCode(error) !== "EXISTS") throw error;
        }
      }
      throw new Error("No free file name for the copy.");
    },
    pathFor: (filename, folder) => safePath(folder ? `${folder.replace(/\/+$/, "")}/${filename}` : filename),
  };
}

/**
 * One Markdown file opened in place from the Files app. It is listed as the only note, saved with
 * the same conflict and atomic-write rules as a note of a folder, and never deleted or replaced by
 * another note. A conflict copy of this device's edits goes to `copyTo` (the app folder by default),
 * because only the file itself, not its folder, is reachable.
 */
export function createFileStore(plugin: BloomFolderPlugin, file: Pick<OpenedFile, "token" | "name">, copyTo: MobileStore = createAppStore()): MobileStore {
  const own = (path: string) => {
    if (path !== file.name) throw new UnsafePathError(path);
    return path;
  };
  return {
    kind: "file",
    name: file.name,
    async list() {
      return { entries: [{ path: file.name, title: file.name.replace(/\.(md|markdown)$/i, ""), folder: "", local: true }], folders: [], unreadable: [] };
    },
    async createFolder(path) {
      throw new UnsafePathError(path);
    },
    async read(path) {
      const { data, modified } = await plugin.readFile({ token: file.token });
      return loaded(own(path), data, modified);
    },
    async save(current, document) {
      if (!hasChanges(current, document)) return null;
      const markdown = serializeToMarkdown(document);
      const path = own(current.document.filePath);
      try {
        const { modified } = await plugin.writeFile({ token: file.token, data: markdown, ...(current.modified ? { expectedModified: current.modified } : {}) });
        return { document, baseline: markdown, modified };
      } catch (error) {
        if (errorCode(error) === "CONFLICT" || /changed on another device/.test(String((error as Error).message))) throw new StoreConflictError(path);
        throw error;
      }
    },
    async remove() {
      throw new Error("A file opened from the Files app is not deleted from here.");
    },
    saveCopy: (document, label) => copyTo.saveCopy(document, label),
    pathFor: (filename) => filename,
  };
}
