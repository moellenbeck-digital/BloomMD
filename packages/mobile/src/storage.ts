import { Filesystem, Encoding } from "@capacitor/filesystem";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import type { MindMapDocument, MindMapFrontmatter } from "@bloommd/core/browser";
import { normalizeMobileMarkdownFilename } from "./mobile-files";
import { APP_DIRECTORY } from "./platform";

const BLOOMMD_DIR = "bloommd";

export interface ListEntry {
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

export async function listMindmaps(): Promise<{ entries: ListEntry[]; unreadable: string[] }> {
  await ensureDir();

  const result = await Filesystem.readdir({
    path: BLOOMMD_DIR,
    directory: APP_DIRECTORY,
  });

  const entries: ListEntry[] = [];
  const unreadable: string[] = [];

  for (const file of result.files) {
    if (!/\.(md|markdown)$/i.test(file.name)) continue;

    try {
      const content = await Filesystem.readFile({
        path: `${BLOOMMD_DIR}/${file.name}`,
        directory: APP_DIRECTORY,
        encoding: Encoding.UTF8,
      });

      const doc = parseFile(file.name, content.data as string);
      entries.push({
        filename: file.name,
        frontmatter: doc.frontmatter,
      });
    } catch {
      unreadable.push(file.name);
    }
  }

  return { entries, unreadable };
}

export async function readMindmap(filename: string): Promise<MindMapDocument> {
  const safeFilename = normalizeMobileMarkdownFilename(filename);
  const content = await Filesystem.readFile({
    path: `${BLOOMMD_DIR}/${safeFilename}`,
    directory: APP_DIRECTORY,
    encoding: Encoding.UTF8,
  });

  return parseFile(safeFilename, content.data as string);
}

export async function writeMindmap(doc: MindMapDocument): Promise<void> {
  await ensureDir();
  const markdown = serializeToMarkdown(doc);
  const filename = normalizeMobileMarkdownFilename(doc.filePath.split("/").pop() || "mindmap.md");
  const target = `${BLOOMMD_DIR}/${filename}`;
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

export async function deleteMindmap(filename: string): Promise<void> {
  const safeFilename = normalizeMobileMarkdownFilename(filename);
  await Filesystem.deleteFile({
    path: `${BLOOMMD_DIR}/${safeFilename}`,
    directory: APP_DIRECTORY,
  });
}
