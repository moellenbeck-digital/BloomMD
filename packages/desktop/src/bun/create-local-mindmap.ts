import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseFile, resolveMarkdownPath, serializeToMarkdown } from "@bloommd/core";

/** Preserve the selected folder and refuse to replace an existing note. */
export async function createLocalMindmap(baseDir: string, filename: string, markdown: string) {
  const fullPath = resolveMarkdownPath(baseDir, filename);
  const doc = parseFile(fullPath, markdown);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, serializeToMarkdown(doc), { encoding: "utf8", flag: "wx" });
  return doc;
}
