/**
 * `bloommd-wiki watch` — reports which Wiki pages a change in the source folder affects.
 *
 * Read-only towards the bundle and the source folder. The only file it may write is the `--state`
 * file the person named, which holds nothing but the last seen hash, size and modification time per
 * source, so that a restart reports exactly what changed in between.
 *
 * `fs.watch` rather than chokidar: this package ships as one compiled binary and has no runtime
 * dependency beyond core, and chokidar lives only in the desktop package. `fs.watch` with
 * `recursive` is native on macOS, Windows and (Node ≥ 20, Bun) Linux. Its events are only a hint
 * that something happened — which file changed is decided by re-scanning the cited sources against
 * the previous snapshot, so a lost, duplicated or renamed event cannot produce a wrong report.
 */

import { watch, type FSWatcher } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { readWikiBundle } from "@bloommd/core/wiki";
import {
  affectedWikiPages,
  collectWikiSourceResources,
  compareWikiSources,
  parseWikiSourceSnapshot,
  scanWikiSources,
  serializeWikiSourceSnapshot,
  type WikiSourceChange,
  type WikiSourceSnapshot,
} from "@bloommd/core/wiki-sources";

/** Quick successive writes (an editor saving, a tool rewriting a file) arrive as one report. */
export const WATCH_DEBOUNCE_MS = 300;

export interface WatchLine {
  event: WikiSourceChange;
  source: string;
  pages: string[];
}

export interface WikiWatchOptions {
  bundleDir: string;
  sourcesDir: string;
  statePath?: string;
  /** One pass, then return. Deterministic, so it is what tests and CI use. */
  once: boolean;
  format: "text" | "json";
  debounceMs?: number;
  /** Ends the watch loop. Without it the loop runs until the process is stopped. */
  signal?: AbortSignal;
  write?: (line: string) => void;
  writeError?: (line: string) => void;
}

const TEXT_LABEL: Record<WikiSourceChange, string> = { changed: "geändert", added: "neu", removed: "entfernt" };

export function formatWatchLine(line: WatchLine, format: "text" | "json"): string {
  if (format === "json") return JSON.stringify(line);
  return `${TEXT_LABEL[line.event].padEnd(9)} ${line.source} → ${line.pages.length > 0 ? line.pages.join(", ") : "(keine Seite zitiert sie)"}`;
}

async function readState(path: string): Promise<WikiSourceSnapshot | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseWikiSourceSnapshot(text);
}

async function writeState(path: string, snapshot: WikiSourceSnapshot): Promise<void> {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporary, serializeWikiSourceSnapshot(snapshot), "utf8");
  await rename(temporary, path);
}

/** One comparison pass: re-reads the cited sources, reports what changed, remembers the new state. */
export async function wikiWatchPass(
  options: Pick<WikiWatchOptions, "bundleDir" | "sourcesDir" | "statePath">,
  previous: WikiSourceSnapshot | null,
): Promise<{ snapshot: WikiSourceSnapshot; lines: WatchLine[] }> {
  const bundle = await readWikiBundle(options.bundleDir);
  const snapshot = await scanWikiSources(options.sourcesDir, collectWikiSourceResources(bundle.pages), previous);
  const impact = affectedWikiPages(bundle.pages, compareWikiSources(previous, snapshot));
  const lines = impact.sources.map((entry): WatchLine => ({ event: entry.change, source: entry.resource, pages: entry.pages }));
  if (options.statePath) await writeState(options.statePath, snapshot);
  return { snapshot, lines };
}

export async function runWikiWatch(options: WikiWatchOptions): Promise<number> {
  const write = options.write ?? ((line: string) => console.log(line));
  const writeError = options.writeError ?? ((line: string) => console.error(line));
  const debounceMs = options.debounceMs ?? WATCH_DEBOUNCE_MS;
  let snapshot = options.statePath ? await readState(options.statePath) : null;

  const pass = async (): Promise<void> => {
    try {
      const result = await wikiWatchPass(options, snapshot);
      snapshot = result.snapshot;
      for (const line of result.lines) write(formatWatchLine(line, options.format));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failed pass must not end the watch: the next change may well succeed.
      writeError(options.format === "json" ? JSON.stringify({ event: "error", message }) : `Fehler: ${message}`);
      if (options.once) throw error;
    }
  };

  await pass();
  if (options.once) return 0;

  // Passes never overlap: a change that arrives during a pass schedules the next one after it.
  let running: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      running = running.then(pass);
    }, debounceMs);
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(options.sourcesDir, { recursive: true, persistent: true }, schedule);
  } catch (error) {
    throw new Error(`Quellordner kann nicht beobachtet werden: ${error instanceof Error ? error.message : String(error)}`);
  }
  watcher.on("error", (error) => writeError(`Fehler beim Beobachten: ${error.message}`));

  await new Promise<void>((resolveStop) => {
    const signals = ["SIGINT", "SIGTERM"] as const;
    const stop = () => {
      for (const name of signals) process.off(name, stop);
      options.signal?.removeEventListener("abort", stop);
      resolveStop();
    };
    for (const name of signals) process.once(name, stop);
    if (options.signal?.aborted) stop();
    else options.signal?.addEventListener("abort", stop, { once: true });
  });

  watcher.close();
  if (timer) clearTimeout(timer);
  await running;
  return 0;
}
