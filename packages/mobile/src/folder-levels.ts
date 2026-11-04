/**
 * The notes of an opened folder as levels to walk through: subfolders first, then the notes of the
 * folder shown, a way up and the path so far. The listing stays flat (`StoreEntry.folder` holds the
 * path of each note); the levels are derived from it. Folders without notes come from the store's
 * folder list (`folders`) and are levels like any other.
 */
import type { StoreEntry } from "./stores";

export interface FolderRow {
  /** Name of the subfolder, one path segment. */
  name: string;
  /** Path of the subfolder from the top, "/"-separated. */
  path: string;
  /** Notes in the subfolder and everything below it; 0 for an empty folder. */
  notes: number;
}

export interface FolderLevel {
  /** The folder shown ("" at the top). */
  folder: string;
  /** The folder one level up, or null at the top. */
  parent: string | null;
  /** Subfolders, empty ones included, sorted by name. */
  folders: FolderRow[];
  /** Notes directly in this folder, sorted by title. */
  notes: StoreEntry[];
}

const compare = (a: string, b: string) => a.localeCompare(b, "de");

function clean(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, "");
}

export function parentFolder(folder: string): string | null {
  const path = clean(folder);
  if (!path) return null;
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** Folder part of a note path ("Schule/Physik.md" gives "Schule", "Notiz.md" gives ""). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/** The path as steps from the top: "A/B" gives A, then A/B. */
export function pathSteps(folder: string): Array<{ name: string; path: string }> {
  const parts = clean(folder).split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }));
}

/**
 * `folder` itself when it still exists (it holds notes or is in `folders`, the store's folder list
 * with empty folders), else its nearest ancestor that does ("" at worst).
 */
export function existingFolder(entries: StoreEntry[], folder: string, folders: string[] = []): string {
  let path: string | null = clean(folder);
  while (path) {
    const prefix = `${path}/`;
    if (entries.some((entry) => entry.folder === path || entry.folder.startsWith(prefix)) || folders.some((known) => known === path || known.startsWith(prefix))) return path;
    path = parentFolder(path);
  }
  return "";
}

export function folderLevel(entries: StoreEntry[], folder: string, folders: string[] = []): FolderLevel {
  const here = clean(folder);
  const prefix = here ? `${here}/` : "";
  const counts = new Map<string, number>();
  const notes: StoreEntry[] = [];
  for (const entry of entries) {
    if (entry.folder === here) {
      notes.push(entry);
    } else if (entry.folder.startsWith(prefix)) {
      const name = entry.folder.slice(prefix.length).split("/")[0] ?? "";
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  // A folder without notes is still a folder: it is listed with 0 notes, so it can be opened and filled.
  for (const known of folders) {
    if (!known.startsWith(prefix)) continue;
    const name = known.slice(prefix.length).split("/")[0] ?? "";
    if (name && !counts.has(name)) counts.set(name, 0);
  }
  const rows = [...counts].map(([name, count]): FolderRow => ({ name, path: `${prefix}${name}`, notes: count })).sort((a, b) => compare(a.name, b.name));
  return { folder: here, parent: parentFolder(here), folders: rows, notes: notes.sort((a, b) => compare(a.title, b.title)) };
}

/** Notes whose path or title contains the query, across all folders (the list is flat while searching). */
export function searchEntries(entries: StoreEntry[], query: string): StoreEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => `${entry.folder}/${entry.title}`.toLowerCase().includes(needle));
}
