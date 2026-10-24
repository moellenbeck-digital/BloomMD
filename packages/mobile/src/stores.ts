/**
 * Where the app keeps maps: its own folder (default) or a folder the user opened from the Files app,
 * typically an Obsidian vault in iCloud Drive. Both are edited in place as plain Markdown.
 */
import type { BloomFolderPlugin, FolderFile } from "@bloommd/capacitor-folder";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import type { MindMapDocument, MindMapFrontmatter } from "@bloommd/core/browser";
import { deleteMindmap, listMindmaps, readMindmap, writeMindmap } from "./storage";

export interface StoreEntry {
  /** Path inside the store, "/"-separated; for the app folder just the file name. */
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
  readonly kind: "app" | "folder";
  readonly name: string;
  /** `truncated`: the folder holds more notes than one listing returns. */
  list(): Promise<{ entries: StoreEntry[]; unreadable: string[]; truncated?: boolean }>;
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

/** Error code of a rejected plugin call (CONFLICT, EXISTS, …). */
function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** "Ordner/Physik.md" → "Ordner/Physik (iPad-Konflikt).md", then "… (iPad-Konflikt 2).md", … */
export function copyPath(path: string, label: string, attempt: number): string {
  const match = /^(.*?)(\.(?:md|markdown))?$/i.exec(path)!;
  return `${match[1]} (${label}${attempt > 1 ? ` ${attempt}` : ""})${match[2] ?? ".md"}`;
}

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
        entries: result.entries.map((entry) => ({ path: entry.filename, title: entry.frontmatter.title || entry.filename, folder: "", local: true, frontmatter: entry.frontmatter })),
        unreadable: result.unreadable,
      };
    },
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
      const taken = new Set((await listMindmaps()).entries.map((entry) => entry.filename.toLowerCase()));
      for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
        const path = copyPath(document.filePath.split("/").pop() || "mindmap.md", label, attempt);
        if (taken.has(path.toLowerCase())) continue;
        await writeMindmap(copyOf(document, path));
        return path;
      }
      throw new Error("No free file name for the copy.");
    },
    pathFor: (filename) => filename,
  };
}

const SKIPPED_FOLDERS = /(^|\/)(\.|node_modules\/|\.obsidian\/|\.trash\/)/;

export function folderEntries(files: FolderFile[]): StoreEntry[] {
  return files
    .filter((file) => !SKIPPED_FOLDERS.test(file.path))
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
      const { files, truncated } = await plugin.list({ extensions: ["md", "markdown"] });
      return { entries: folderEntries(files), unreadable: [], ...(truncated ? { truncated } : {}) };
    },
    async read(path) {
      const { data, modified } = await plugin.read({ path });
      return loaded(path, data, modified);
    },
    async save(current, document) {
      // Opening a note must never rewrite it: only real edits are written back.
      if (!hasChanges(current, document)) return null;
      const markdown = serializeToMarkdown(document);
      const path = current.document.filePath;
      try {
        const { modified } = await plugin.write({ path, data: markdown, ...(current.modified ? { expectedModified: current.modified } : {}) });
        return { document, baseline: markdown, modified };
      } catch (error) {
        if (errorCode(error) === "CONFLICT" || /changed on another device/.test(String((error as Error).message))) throw new StoreConflictError(path);
        throw error;
      }
    },
    remove: (path) => plugin.remove({ path }),
    async saveCopy(document, label) {
      for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
        const path = copyPath(document.filePath, label, attempt);
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
    pathFor: (filename, folder) => (folder ? `${folder.replace(/\/+$/, "")}/${filename}` : filename),
  };
}
