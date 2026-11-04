/**
 * A Markdown file the Files app hands to the app ("Open in BloomMD"). The file is opened where it
 * lies, never copied: as a note of the open folder when it lies in that folder, else as a single file.
 */
import type { BloomFolderPlugin } from "@bloommd/capacitor-folder";
import { createFileStore, createFolderStore, isSkippedPath, safePath, type MobileStore } from "./stores";

export interface OpenedNote {
  /** The store to read and save the note with; `active` itself when the note belongs to it. */
  store: MobileStore;
  /** Path of the note inside that store. */
  path: string;
}

/**
 * Resolves a `file://` URL the system passed to the app. A file inside the open folder (outside
 * Obsidian's own and hidden folders) is that folder's note, with the folder's conflict checks and
 * its place in the list; any other file becomes a store of its own.
 */
export async function openFileUrl(plugin: BloomFolderPlugin, url: string, active: MobileStore): Promise<OpenedNote> {
  const opened = await plugin.openFile({ url });
  const path = opened.folderPath === null ? null : safePath(opened.folderPath);
  if (path !== null && !isSkippedPath(path)) {
    if (active.kind === "folder") return { store: active, path };
    const { name } = await plugin.current();
    return { store: createFolderStore(plugin, name ?? ""), path };
  }
  return { store: createFileStore(plugin, opened), path: opened.name };
}
