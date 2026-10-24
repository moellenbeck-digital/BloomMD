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
  /** Debug builds only: open a folder by absolute path (simulator tests). */
  useTestFolder(options: { path: string }): Promise<{ name: string }>;
}

export const BloomFolder = registerPlugin<BloomFolderPlugin>("BloomFolder");
