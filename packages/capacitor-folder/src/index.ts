import { registerPlugin } from "@capacitor/core";

export interface FolderFile {
  /** Path relative to the folder, with "/" separators. */
  path: string;
  size: number;
  /** Modification time in ms since epoch. */
  modified: number;
  /** False while iCloud keeps the file only in the cloud; it is being downloaded. */
  local: boolean;
}

/** A single Markdown file the Files app handed to BloomMD ("Open in…"), opened in place. */
export interface OpenedFile {
  /** Handle for `readFile` and `writeFile`; valid until another file is opened or the app quits. */
  token: string;
  /** File name, e.g. "Notiz.md". */
  name: string;
  /** Path inside the open folder when the file lies in it (then it is that folder's note), else null. */
  folderPath: string | null;
}

export interface BloomFolderPlugin {
  /** Opens the Files picker; resolves with the folder name, or `cancelled`. */
  pick(): Promise<{ name?: string; cancelled?: boolean }>;
  /** The folder opened earlier (kept across app restarts), or null. */
  current(): Promise<{ name: string | null }>;
  forget(): Promise<void>;
  /** `truncated` is true when the folder holds more files than one listing returns (5000). */
  list(options?: { extensions?: string[] }): Promise<{ files: FolderFile[]; truncated?: boolean }>;
  /** Fails with code CONFLICT while iCloud holds unresolved conflicting versions of the file. */
  read(options: { path: string }): Promise<{ data: string; modified: number }>;
  /**
   * Fails with code CONFLICT when `expectedModified` no longer matches the file, the file was
   * deleted meanwhile, or iCloud holds unresolved conflicting versions of it. With `exclusive`
   * it only creates a new file and fails with code EXISTS when the name is taken (also by a file
   * that is not downloaded from iCloud yet).
   */
  write(options: { path: string; data: string; expectedModified?: number; exclusive?: boolean }): Promise<{ modified: number }>;
  remove(options: { path: string }): Promise<void>;
  /**
   * Opens a file URL the system passed to the app (`file://…`, a Markdown file) and keeps access to
   * it through the URL's security scope. Nothing is copied: `readFile` and `writeFile` work on the
   * original file. Fails with code BAD_PATH for anything but a `.md`/`.markdown` file URL.
   */
  openFile(options: { url: string }): Promise<OpenedFile>;
  /** Fails with code CONFLICT while iCloud holds unresolved conflicting versions of the file. */
  readFile(options: { token: string }): Promise<{ data: string; modified: number }>;
  /**
   * Replaces the file atomically. Fails with code CONFLICT when `expectedModified` no longer
   * matches the file, the file was deleted meanwhile, or iCloud holds unresolved conflicting versions.
   */
  writeFile(options: { token: string; data: string; expectedModified?: number }): Promise<{ modified: number }>;
  /** Debug builds only: open a folder by absolute path (simulator tests). */
  useTestFolder(options: { path: string }): Promise<{ name: string }>;
}

export const BloomFolder = registerPlugin<BloomFolderPlugin>("BloomFolder");
