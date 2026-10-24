import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { WorkspaceFileInput } from "@bloommd/core";

/**
 * Reads a folder of Markdown into the shape the analysis functions expect.
 *
 * Deliberately does not follow symlinks out of the directory and skips dot-directories: a linter
 * that wanders into `.git` reports on objects nobody wrote, and one that follows a symlink out of
 * the workspace reports on files the user did not ask about.
 */

const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".obsidian", ".trash", "dist", "build", ".next"]);

export interface ReadWorkspaceResult {
  root: string;
  files: WorkspaceFileInput[];
  /** Files that could not be read, with the reason. */
  unreadable: Array<{ path: string; reason: string }>;
}

export async function readWorkspace(inputPath: string): Promise<ReadWorkspaceResult> {
  const root = resolve(inputPath);
  const info = await stat(root).catch(() => null);
  if (!info) throw new Error(`Pfad existiert nicht: ${inputPath}`);

  if (info.isFile()) {
    if (!/\.(md|markdown)$/i.test(root)) throw new Error(`Keine Markdown-Datei: ${inputPath}`);
    return {
      root: root.slice(0, root.lastIndexOf(sep)),
      files: [{ path: root.slice(root.lastIndexOf(sep) + 1), markdown: await readFile(root, "utf8") }],
      unreadable: [],
    };
  }

  const files: WorkspaceFileInput[] = [];
  const unreadable: Array<{ path: string; reason: string }> = [];
  // Compared against the *real* root, so a workspace that is itself reached through a symlink
  // still recognises its own contents.
  const realRoot = await realpath(root).catch(() => root);

  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);

      // A symlink is only followed when it genuinely lands inside the workspace. `resolve` is not
      // enough here: it normalises a path without following links, so `docs/escape -> /etc` still
      // looks like it starts with the workspace root. `realpath` is what actually answers the
      // question, and getting it wrong means `bloommd lint ./docs` can read anything on the machine.
      if (entry.isSymbolicLink()) {
        const target = await stat(absolute).catch(() => null);
        if (!target) continue;
        const real = await realpath(absolute).catch(() => null);
        if (!real || (real !== realRoot && !real.startsWith(`${realRoot}${sep}`))) continue;
        if (target.isDirectory()) {
          await walk(absolute);
          continue;
        }
      } else if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!/\.(md|markdown)$/i.test(entry.name)) continue;
      const relativePath = relative(root, absolute).split(sep).join("/");
      try {
        files.push({ path: relativePath, markdown: await readFile(absolute, "utf8") });
      } catch (error) {
        unreadable.push({ path: relativePath, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { root, files, unreadable };
}
