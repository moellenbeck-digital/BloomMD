import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, stat, writeFile, unlink  } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { assertPathInDirectory, normalizeMarkdownFilename, resolveMarkdownPath, normalizeMarkdownPath, normalizeFolderPath, resolveFolderPath } from "./paths";
import { parseFile, serializeToMarkdown } from "./parser";
import { NOTE_HISTORY_LIMIT, sortRevisionsNewestFirst, type NoteRevision } from "./note-history";
import { DEFAULT_TEMPLATE_FOLDER, selectTemplatePaths, type CustomNoteTemplate } from "./note-templates";
import { buildWorkspaceMindMap, WorkspaceDocumentCache } from "./workspace-document";
import type {
  FileStoreConfig,
  MindMapDocument,
  MindMapListEntry,
} from "./types";
import type { WorkspaceFileInput } from "./workspace-graph";

/** Called only by explicitly tolerant readers; strict readers still reject failed entries. */
export type FileReadIssueHandler = (path: string, error: unknown) => void;

const BACKUP_SUFFIX = ".bak";
const BACKUP_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/;

/** `2026-11-03T09-15-02-123Z` (the form used in backup file names) → `2026-11-03T09:15:02.123Z`. */
function backupTimestampToIso(stamp: string): string | null {
  const match = BACKUP_TIMESTAMP.exec(stamp);
  if (!match) return null;
  const iso = `${match[1]}:${match[2]}:${match[3]}.${match[4]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export class FileStore {
  private workspaceCache = new WorkspaceDocumentCache();
  private baseDir: string;
  private backupsEnabled: boolean;
  private parsedFiles = new Map<string, { raw: string; result: { document: MindMapDocument } | { error: unknown } }>();

  /** Compare content, not timestamps: external editors may preserve mtime and file size. */
  private async readParsed(filename: string): Promise<MindMapDocument> {
    const filePath = resolveMarkdownPath(this.baseDir, filename);
    const raw = await readFile(filePath, "utf-8");
    const cached = this.parsedFiles.get(filename);
    if (cached?.raw === raw) {
      if ("document" in cached.result) return cached.result.document;
      throw cached.result.error;
    }
    this.parsedFiles.delete(filename);
    try {
      const document = parseFile(filePath, raw);
      this.parsedFiles.set(filename, { raw, result: { document } });
      return document;
    } catch (error) {
      this.parsedFiles.set(filename, { raw, result: { error } });
      throw error;
    }
  }

  private pruneParsedFiles(files: Array<{ name: string }>): void {
    const names = new Set(files.map((file) => file.name));
    for (const name of this.parsedFiles.keys()) {
      if (!names.has(name)) this.parsedFiles.delete(name);
    }
  }

  constructor(config: FileStoreConfig) {
    this.baseDir = config.baseDir;
    this.backupsEnabled = config.backupsEnabled ?? true;
  }

  /**
   * Creates a folder inside the workspace.
   *
   * Folders are plain subdirectories, so the structure survives being opened in Obsidian, committed
   * to git or listed in a terminal. Returns the normalized relative path.
   */
  async createFolder(folderPath: string): Promise<string> {
    const relative = normalizeFolderPath(folderPath);
    await mkdir(resolveFolderPath(this.baseDir, relative), { recursive: true });
    return relative;
  }

  /** Folder paths relative to the workspace, sorted, excluding hidden directories. */
  async listFolders(): Promise<string[]> {
    const walk = async (prefix: string): Promise<string[]> => {
      const entries = await readdir(join(this.baseDir, prefix), { withFileTypes: true }).catch(() => []);
      const found: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        found.push(relative, ...await walk(relative));
      }
      return found;
    };
    return (await walk("")).sort((a, b) => a.localeCompare(b));
  }


  /**
   * The user's own note templates: the `.md` files directly inside `folder` at the workspace root
   * (sub-folders are not searched). A workspace without that folder has no templates, which is not
   * an error; any other read failure is.
   */
  async readTemplates(folder: string = DEFAULT_TEMPLATE_FOLDER): Promise<CustomNoteTemplate[]> {
    const folderName = normalizeFolderPath(folder);
    let entries;
    try {
      entries = await readdir(resolveFolderPath(this.baseDir, folderName), { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return [];
      throw error;
    }
    const paths = selectTemplatePaths(
      entries.filter((entry) => entry.isFile()).map((entry) => `${folderName}/${entry.name}`),
      folderName,
    );
    return Promise.all(paths.map(async (path) => ({
      path,
      content: await readFile(join(this.baseDir, path), "utf-8"),
    })));
  }

  /** Markdown files as workspace-relative paths, so files inside folders are listed too. */
  private async collectMarkdownFiles(prefix: string, onIssue?: FileReadIssueHandler): Promise<Array<{ name: string }>> {
    const entries = await readdir(join(this.baseDir, prefix), { withFileTypes: true }).catch((error: unknown) => {
      // A failed workspace root is never an empty workspace.
      if (!onIssue || !prefix) throw error;
      onIssue(prefix, error);
      return [];
    });
    const found: Array<{ name: string }> = [];
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        found.push(...await this.collectMarkdownFiles(relative, onIssue));
      } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
        found.push({ name: relative });
      }
    }
    return found;
  }

  async list(onIssue?: FileReadIssueHandler): Promise<MindMapListEntry[]> {
    const mdFiles = await this.collectMarkdownFiles("", onIssue);
    this.pruneParsedFiles(mdFiles);

    const results: MindMapListEntry[] = [];

    for (const file of mdFiles) {
      try {
        if (normalizeMarkdownPath(file.name) !== file.name) {
          throw new Error("Existing path cannot be normalized without changing its name");
        }
        const document = await this.readParsed(file.name);
        results.push({ filename: file.name, frontmatter: structuredClone(document.frontmatter) });
      } catch (error) {
        if (!onIssue) throw error;
        onIssue(file.name, error);
      }
    }

    return results;
  }

  async read(filename: string): Promise<MindMapDocument> {
    // Documents returned to editors are mutable; never expose the cached snapshot.
    return structuredClone(await this.readParsed(normalizeMarkdownPath(filename)));
  }

  async readWorkspaceMindMap(title = "Workspace", onIssue?: FileReadIssueHandler): Promise<MindMapDocument> {
    const mdFiles = await this.collectMarkdownFiles("", onIssue);
    this.pruneParsedFiles(mdFiles);
    const files: WorkspaceFileInput[] = [];
    const parsedDocuments = new Map<string, MindMapDocument>();
    for (const file of mdFiles) {
      try {
        if (normalizeMarkdownPath(file.name) !== file.name) {
          throw new Error("Existing path cannot be normalized without changing its name");
        }
        const document = await this.readParsed(file.name);
        parsedDocuments.set(file.name, document);
        files.push({ path: file.name, markdown: document.rawMarkdown });
      } catch (error) {
        if (!onIssue) throw error;
        onIssue(file.name, error);
      }
    }
    return buildWorkspaceMindMap(files, { title, source: this.baseDir, parsedDocuments, cache: this.workspaceCache });
  }

  async write(doc: MindMapDocument): Promise<void> {
    if (doc.derived?.kind === "workspace") {
      throw new Error("Workspace maps are derived views and cannot be saved as one Markdown file.");
    }
    const markdown = serializeToMarkdown(doc);
    const filePath = assertPathInDirectory(this.baseDir, doc.filePath);
    await this.backupExistingFile(filePath);
    await writeFile(filePath, markdown, "utf-8");
  }

  async delete(filename: string): Promise<void> {
    const filePath = resolveMarkdownPath(this.baseDir, filename);
    await unlink(filePath);
  }

  /**
   * The version history of one note: the backups `write()` made before each overwrite, newest
   * first, at most `NOTE_HISTORY_LIMIT` of them. Empty for a note that was never overwritten.
   */
  async listBackups(filename: string): Promise<NoteRevision[]> {
    return this.readBackups(resolveMarkdownPath(this.baseDir, filename));
  }

  /** The Markdown of one backup; null when `id` is none of the note's backups (it never names a path). */
  async readBackup(filename: string, id: string): Promise<string | null> {
    const filePath = resolveMarkdownPath(this.baseDir, filename);
    const entry = (await this.readBackups(filePath)).find((candidate) => candidate.id === id);
    return entry ? readFile(join(this.backupDirFor(filePath), entry.id), "utf-8") : null;
  }

  /**
   * Makes a backup the current version of the note. Restoring is a write like any other: the
   * version it replaces is backed up first (even when automatic backups are off, because restoring
   * must never lose anything), so it shows up in the history and can be restored again.
   * `id` is an entry of `listBackups`; anything else is refused, so it can never name a path.
   */
  async restoreBackup(filename: string, id: string): Promise<MindMapDocument> {
    const normalized = normalizeMarkdownPath(filename);
    const filePath = resolveMarkdownPath(this.baseDir, normalized);
    const markdown = await this.readBackup(normalized, id);
    if (markdown === null) throw new Error("BACKUP_NOT_FOUND");
    // A backup that no longer parses must not replace a note that does.
    parseFile(filePath, markdown);
    await this.backupExistingFile(filePath, true);
    await writeFile(filePath, markdown, "utf-8");
    return this.read(normalized);
  }

  /**
   * Backups live in `.bloommd/backups`, in the same sub-folder as their note, so two notes that
   * share a file name in different folders keep separate histories (and separate retention).
   * Notes at the top keep the flat layout earlier versions used. Backups that earlier versions
   * made for notes inside folders sit in the flat directory under the bare file name; they cannot
   * be told apart from another folder's note and are not part of any history.
   */
  private backupDirFor(filePath: string): string {
    return join(this.baseDir, ".bloommd", "backups", relative(resolve(this.baseDir), dirname(filePath)));
  }

  private async readBackups(filePath: string): Promise<NoteRevision[]> {
    const dir = this.backupDirFor(filePath);
    const prefix = `${basename(filePath)}.`;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const found: NoteRevision[] = [];
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith(BACKUP_SUFFIX)) continue;
      const replacedAt = backupTimestampToIso(name.slice(prefix.length, -BACKUP_SUFFIX.length));
      if (!replacedAt) continue;
      try {
        found.push({ id: name, source: "local", replacedAt, size: (await stat(join(dir, name))).size });
      } catch (error) {
        // Removed while listing (another write pruned it): it is not part of the history any more.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return sortRevisionsNewestFirst(found);
  }

  /**
   * Copies the file that is about to be overwritten to `.bloommd/backups` and keeps the newest
   * `NOTE_HISTORY_LIMIT` backups of that note; older ones are removed here, when a new one is made.
   */
  private async backupExistingFile(filePath: string, force = false): Promise<void> {
    if (!this.backupsEnabled && !force) return;

    try {
      await access(filePath);
    } catch {
      return;
    }

    const backupDir = this.backupDirFor(filePath);
    await mkdir(backupDir, { recursive: true });

    const filename = basename(filePath);
    // Two writes within one millisecond would share a name; the later one moves on to the next free one.
    for (let at = Date.now(); ; at += 1) {
      const timestamp = new Date(at).toISOString().replace(/[:.]/g, "-");
      try {
        await copyFile(filePath, join(backupDir, `${filename}.${timestamp}${BACKUP_SUFFIX}`), constants.COPYFILE_EXCL);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return;
        if (code !== "EEXIST") throw err;
      }
    }
    await this.pruneBackups(filePath);
  }

  /** A backup that cannot be removed must not fail the save it belongs to; the next write retries. */
  private async pruneBackups(filePath: string): Promise<void> {
    const expired = (await this.readBackups(filePath)).slice(NOTE_HISTORY_LIMIT);
    for (const entry of expired) {
      try {
        await unlink(join(this.backupDirFor(filePath), entry.id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        console.warn("[BloomMD] Old backup could not be removed:", entry.id, error instanceof Error ? error.message : error);
      }
    }
  }
}

export { normalizeMarkdownFilename, resolveMarkdownPath };
