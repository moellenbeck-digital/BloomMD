"use client";

import { normalizeFolderPath, normalizeMarkdownPath } from "@bloommd/core/browser";

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string;
}

interface PermissionCapableHandle {
  queryPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries: () => AsyncIterable<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }
}

export interface BrowserWorkspaceEntry {
  path: string;
  name: string;
}

async function ensurePermission(handle: FileSystemHandle, mode: "read" | "readwrite"): Promise<boolean> {
  const permissionHandle = handle as FileSystemHandle & PermissionCapableHandle;
  if (!permissionHandle.queryPermission || !permissionHandle.requestPermission) return true;
  if (await permissionHandle.queryPermission({ mode }) === "granted") return true;
  return (await permissionHandle.requestPermission({ mode })) === "granted";
}

export class BrowserWorkspace {
  readonly name: string;
  private readonly files = new Map<string, FileSystemFileHandle>();
  private readonly resources = new Map<string, FileSystemFileHandle>();

  constructor(private readonly root: FileSystemDirectoryHandle) {
    this.name = root.name;
  }

  async refresh(): Promise<BrowserWorkspaceEntry[]> {
    this.files.clear();
    this.resources.clear();
    if (!(await ensurePermission(this.root, "read"))) throw new Error("Read access to the selected folder was denied.");

    const scan = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, handle] of (directory as IterableDirectoryHandle).entries()) {
        if (name.startsWith(".")) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") await scan(handle as FileSystemDirectoryHandle, path);
        else {
          this.resources.set(path, handle as FileSystemFileHandle);
          if (/\.(md|markdown)$/i.test(name)) this.files.set(path, handle as FileSystemFileHandle);
        }
      }
    };

    await scan(this.root, "");
    return [...this.files.keys()].sort((a, b) => a.localeCompare(b)).map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
    }));
  }

  /**
   * Reports what this workspace is currently allowed to do.
   *
   * Without this the UI can only find out by trying: the first failed save is a poor moment to
   * learn that the folder was opened read-only. `queryPermission` deliberately does not prompt —
   * asking on load would train people to click through a dialog they did not trigger.
   */
  async permissionState(): Promise<"readwrite" | "read" | "denied"> {
    const handle = this.root as FileSystemHandle & PermissionCapableHandle;
    // Browsers without the Permissions API on handles grant whatever the picker returned.
    if (!handle.queryPermission) return "readwrite";
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return "readwrite";
    if ((await handle.queryPermission({ mode: "read" })) === "granted") return "read";
    return "denied";
  }

  /** Prompts for write access. Must be called from a user gesture or the browser refuses. */
  async requestWriteAccess(): Promise<boolean> {
    return ensurePermission(this.root, "readwrite");
  }

  async read(path: string): Promise<string> {
    const handle = this.files.get(path);
    if (!handle) throw new Error(`Markdown file is not part of this workspace: ${path}`);
    return (await handle.getFile()).text();
  }

  resolvePath(path: string): string | null {
    if (this.resources.has(path)) return path;
    const normalized = path.replace(/^\.\//, "");
    if (this.resources.has(normalized)) return normalized;
    const matches = [...this.resources.keys()].filter((entry) => entry.endsWith(`/${normalized}`) || entry === normalized);
    return matches.length === 1 ? matches[0]! : null;
  }

  /**
   * Opens an attachment from the workspace.
   *
   * The file is handed to the browser as an object URL built from the local handle. Nothing is
   * uploaded and no request leaves the machine — the bytes never go anywhere the user did not put
   * them. That property is the whole point of local handoff, so it is asserted by a test rather
   * than left as an implementation detail someone could quietly change.
   */
  async openResource(path: string): Promise<void> {
    const resolved = this.resolvePath(path);
    const handle = resolved ? this.resources.get(resolved) : null;
    if (!handle) throw new Error(`File is not part of this workspace: ${path}`);
    const url = URL.createObjectURL(await handle.getFile());
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /**
   * Walks to a folder, optionally creating the segments on the way.
   *
   * The path is validated with the same rule the file store uses, so a browser workspace cannot be
   * talked into `../` any more than a local one can — the File System Access API would happily
   * accept a segment named `..` as a literal directory name otherwise.
   */
  private async directoryFor(folderPath: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const normalized = normalizeFolderPath(folderPath);
    let directory = this.root;
    for (const segment of normalized.split("/")) {
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return directory;
  }

  /**
   * Creates a folder in the workspace.
   *
   * A real subdirectory, not metadata — the structure has to survive being opened in Obsidian or
   * committed to git, which is the whole reason folders are folders here.
   */
  async createFolder(folderPath: string): Promise<string> {
    if (!(await ensurePermission(this.root, "readwrite"))) {
      throw new Error("Schreibzugriff auf diesen Ordner wurde abgelehnt.");
    }
    const normalized = normalizeFolderPath(folderPath);
    await this.directoryFor(normalized, true);
    return normalized;
  }

  /**
   * Creates an empty Markdown file, optionally inside a folder.
   *
   * Refuses to overwrite: a "new file" action that silently replaces an existing one is how people
   * lose work they cannot get back, since the browser has no trash.
   */
  async createFile(path: string, markdown: string): Promise<string> {
    if (!(await ensurePermission(this.root, "readwrite"))) {
      throw new Error("Schreibzugriff auf diesen Ordner wurde abgelehnt.");
    }
    const normalized = normalizeMarkdownPath(path);
    if (this.files.has(normalized)) throw new Error(`Diese Datei gibt es bereits: ${normalized}`);

    const slash = normalized.lastIndexOf("/");
    const directory = slash === -1 ? this.root : await this.directoryFor(normalized.slice(0, slash), true);
    const name = normalized.slice(slash + 1);

    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(markdown);
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }
    this.files.set(normalized, handle);
    this.resources.set(normalized, handle);
    return normalized;
  }

  /** Folder paths in the workspace, derived from the files found during the last refresh. */
  folders(): string[] {
    const found = new Set<string>();
    for (const path of this.files.keys()) {
      const parts = path.split("/");
      for (let index = 1; index < parts.length; index += 1) found.add(parts.slice(0, index).join("/"));
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }

  async write(path: string, markdown: string): Promise<void> {
    const handle = this.files.get(path);
    if (!handle) throw new Error(`Markdown file is not part of this workspace: ${path}`);
    if (!(await ensurePermission(handle, "readwrite"))) throw new Error("Write access to this Markdown file was denied.");
    const writable = await handle.createWritable();
    try {
      await writable.write(markdown);
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }
  }
}

export function supportsBrowserWorkspaces(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function openBrowserWorkspace(): Promise<BrowserWorkspace> {
  if (!window.showDirectoryPicker) throw new Error("This browser does not support local folder workspaces.");
  const handle = await window.showDirectoryPicker({ id: "bloommd-workspace", mode: "readwrite" });
  const workspace = new BrowserWorkspace(handle);
  await workspace.refresh();
  return workspace;
}
