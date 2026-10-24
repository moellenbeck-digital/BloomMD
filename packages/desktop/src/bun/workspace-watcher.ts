import { watch } from "chokidar";
import { relative, sep } from "node:path";
import type { Stats } from "node:fs";

export function ignoreWorkspaceWatchPath(root: string, path: string, stats?: Stats): boolean {
  const parts = relative(root, path).split(sep);
  if (parts.some((part) => part.startsWith(".") || part === "node_modules")) return true;
  return Boolean(stats?.isFile() && !/\.(md|markdown)$/i.test(path));
}

/** Chokidar 5 observes directories recursively; it no longer accepts glob patterns. */
export function watchWorkspace(root: string, onChange: (filename: string, kind: "add" | "change" | "unlink") => void) {
  const watcher = watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignored: (path, stats) => ignoreWorkspaceWatchPath(root, path, stats),
    awaitWriteFinish: { stabilityThreshold: 500 },
  });
  for (const kind of ["add", "change", "unlink"] as const) {
    watcher.on(kind, (path) => {
      if (/\.(md|markdown)$/i.test(path)) onChange(relative(root, path).split(sep).join("/"), kind);
    });
  }
  return watcher;
}
