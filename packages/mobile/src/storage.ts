import { Filesystem, Encoding } from "@capacitor/filesystem";
import { normalizeFolderPath, parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import type { MindMapDocument, MindMapFrontmatter } from "@bloommd/core/browser";
import { isSkippedFolder, normalizeMobileMarkdownPath } from "./mobile-files";
import { APP_DIRECTORY } from "./platform";

const BLOOMMD_DIR = "bloommd";

export interface ListEntry {
  /** Path inside the app folder, "/"-separated: "Notiz.md" or "Schule/Physik.md". */
  filename: string;
  frontmatter: MindMapFrontmatter;
}

export async function ensureDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: BLOOMMD_DIR,
      directory: APP_DIRECTORY,
      recursive: true,
    });
  } catch {
    // Directory already exists
  }
}

/** Creates `folder` (inside the app folder) with its parents; a folder that already exists is fine. */
async function makeFolder(folder: string): Promise<void> {
  const path = `${BLOOMMD_DIR}/${folder}`;
  try {
    await Filesystem.mkdir({ path, directory: APP_DIRECTORY, recursive: true });
  } catch (error) {
    // Some platforms report an existing folder as an error; a file in its place is a real one.
    const found = await Filesystem.stat({ path, directory: APP_DIRECTORY }).catch(() => null);
    if (found?.type !== "directory") throw error;
  }
}

/**
 * Creates a folder in the app folder, also nested ("Schule/Physik"). Path rules come from core
 * (`normalizeFolderPath`). Resolves to the normalized path.
 */
export async function createFolder(path: string): Promise<string> {
  const folder = normalizeFolderPath(path);
  await ensureDir();
  await makeFolder(folder);
  return folder;
}

/** Every note and every folder below the app folder, level by level; `.tmp`/`.bak` files of an interrupted save are no notes. */
async function walk(): Promise<{ files: string[]; folders: string[] }> {
  await ensureDir();
  const files: string[] = [];
  const folders: string[] = [];
  const pending = [""];
  for (let folder = pending.shift(); folder !== undefined; folder = pending.shift()) {
    let listing;
    try {
      listing = await Filesystem.readdir({ path: folder ? `${BLOOMMD_DIR}/${folder}` : BLOOMMD_DIR, directory: APP_DIRECTORY });
    } catch (error) {
      // A subfolder removed while listing is skipped; the app folder itself must be readable.
      if (!folder) throw error;
      continue;
    }
    for (const item of listing.files) {
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (item.type === "directory") {
        if (isSkippedFolder(path)) continue;
        folders.push(path);
        pending.push(path);
      } else if (/\.(md|markdown)$/i.test(item.name)) {
        files.push(path);
      }
    }
  }
  return { files, folders };
}

/** Paths of all notes, without reading them. */
export async function listMarkdownPaths(): Promise<string[]> {
  return (await walk()).files;
}

export async function listMindmaps(): Promise<{ entries: ListEntry[]; folders: string[]; unreadable: string[] }> {
  const { files, folders } = await walk();

  const entries: ListEntry[] = [];
  const unreadable: string[] = [];

  for (const path of files) {
    try {
      const content = await Filesystem.readFile({
        path: `${BLOOMMD_DIR}/${path}`,
        directory: APP_DIRECTORY,
        encoding: Encoding.UTF8,
      });

      const doc = parseFile(path, content.data as string);
      entries.push({
        filename: path,
        frontmatter: doc.frontmatter,
      });
    } catch {
      unreadable.push(path);
    }
  }

  return { entries, folders, unreadable };
}

export async function readMindmap(path: string): Promise<MindMapDocument> {
  const safePath = normalizeMobileMarkdownPath(path);
  const content = await Filesystem.readFile({
    path: `${BLOOMMD_DIR}/${safePath}`,
    directory: APP_DIRECTORY,
    encoding: Encoding.UTF8,
  });

  return parseFile(safePath, content.data as string);
}

export async function writeMindmap(doc: MindMapDocument): Promise<void> {
  await ensureDir();
  const markdown = serializeToMarkdown(doc);
  const path = normalizeMobileMarkdownPath(doc.filePath);
  const slash = path.lastIndexOf("/");
  if (slash > 0) await makeFolder(path.slice(0, slash));
  // Temporary file and backup sit next to the note, in its folder.
  const target = `${BLOOMMD_DIR}/${path}`;
  const temporary = `${target}.tmp`;
  const backup = `${target}.bak`;
  let targetExisted = false;

  await Filesystem.writeFile({
    path: temporary,
    directory: APP_DIRECTORY,
    data: markdown,
    encoding: Encoding.UTF8,
  });

  try {
    await Filesystem.stat({ path: target, directory: APP_DIRECTORY });
    targetExisted = true;
  } catch {
    targetExisted = false;
  }

  try {
    if (targetExisted) {
      await Filesystem.deleteFile({ path: backup, directory: APP_DIRECTORY }).catch(() => undefined);
      await Filesystem.copy({ from: target, to: backup, directory: APP_DIRECTORY });
      await Filesystem.deleteFile({ path: target, directory: APP_DIRECTORY });
    }
    await Filesystem.rename({ from: temporary, to: target, directory: APP_DIRECTORY });
  } catch (error) {
    if (targetExisted) {
      await Filesystem.copy({ from: backup, to: target, directory: APP_DIRECTORY }).catch(() => undefined);
    }
    await Filesystem.deleteFile({ path: temporary, directory: APP_DIRECTORY }).catch(() => undefined);
    throw error;
  }
}

export async function deleteMindmap(path: string): Promise<void> {
  const safePath = normalizeMobileMarkdownPath(path);
  await Filesystem.deleteFile({
    path: `${BLOOMMD_DIR}/${safePath}`,
    directory: APP_DIRECTORY,
  });
}
