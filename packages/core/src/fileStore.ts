import { access, copyFile, mkdir, readdir, readFile, writeFile, unlink  } from "node:fs/promises";
import { basename, join  } from "node:path";
import { assertPathInDirectory, normalizeMarkdownFilename, resolveMarkdownPath, normalizeMarkdownPath, normalizeFolderPath, resolveFolderPath } from "./paths";
import { parseFile, serializeToMarkdown } from "./parser";
import { buildWorkspaceMindMap, WorkspaceDocumentCache } from "./workspace-document";
import type {
  FileStoreConfig,
  MindMapDocument,
  MindMapListEntry,
} from "./types";
import type { WorkspaceFileInput } from "./workspace-graph";

/** Called only by explicitly tolerant readers; strict readers still reject failed entries. */
export type FileReadIssueHandler = (path: string, error: unknown) => void;

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

  private async backupExistingFile(filePath: string): Promise<void> {
    if (!this.backupsEnabled) return;

    try {
      await access(filePath);
    } catch {
      return;
    }

    const backupDir = join(this.baseDir, ".bloommd", "backups");
    await mkdir(backupDir, { recursive: true });

    const filename = basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(backupDir, `${filename}.${timestamp}.bak`);
    try {
      await copyFile(filePath, backupPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}

export { normalizeMarkdownFilename, resolveMarkdownPath };
