import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ignoreWorkspaceWatchPath, watchWorkspace } from "./workspace-watcher";

test("watcher excludes hidden directories and dependency trees", () => {
  expect(ignoreWorkspaceWatchPath("/vault", "/vault/.obsidian/config.json")).toBe(true);
  expect(ignoreWorkspaceWatchPath("/vault", "/vault/node_modules/a.md")).toBe(true);
  expect(ignoreWorkspaceWatchPath("/vault", "/vault")).toBe(false);
  expect(ignoreWorkspaceWatchPath("/vault", "/vault/notes")).toBe(false);
});

test("recursive watcher delivers Markdown additions, changes and removals", async () => {
  const root = await mkdtemp(join(tmpdir(), "bloommd-watch-"));
  await mkdir(join(root, "nested"));
  const started = performance.now();
  const elapsed = () => `${Math.round(performance.now() - started)}ms`;
  // Event log with timestamps; it is part of every failure message (Ticket #284).
  const log: string[] = [];
  const listeners = new Set<() => void>();
  const watcher = watchWorkspace(root, (file, kind) => { log.push(`${elapsed()} ${kind}:${file}`); listeners.forEach((listener) => listener()); });
  const seen = (value: string) => log.some((entry) => entry.endsWith(` ${value}`));
  const until = (done: () => boolean, timeoutMs: number) => new Promise<boolean>((resolve) => {
    const finish = (result: boolean) => { clearTimeout(timer); listeners.delete(check); resolve(result); };
    const check = () => { if (done()) finish(true); };
    const timer = setTimeout(() => finish(false), timeoutMs);
    listeners.add(check);
    check();
  });
  const waitFor = async (value: string) => {
    if (!(await until(() => seen(value), 5000))) throw new Error(`Missing ${value} at ${elapsed()}; event log: ${log.join(", ") || "(empty)"}`);
  };
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    log.push(`${elapsed()} ready`);
    // chokidar emits `ready` once fs.watch() has been called, but on macOS libuv arms the FSEvents stream asynchronously:
    // a file written right after `ready` can be lost for good (Ticket #284). Probe files, written until the first Add
    // arrives, prove the watch on nested/ is live instead of sleeping for a guessed time. One probe at a time, so a lost
    // probe never registers a per-file watch that could disturb the next write.
    let live = false;
    for (let attempt = 1; attempt <= 6 && !live; attempt++) {
      await writeFile(join(root, `nested/Probe-${attempt}.md`), "# Probe\n");
      live = await until(() => log.some((entry) => /add:nested\/Probe-\d+\.md$/.test(entry)), 1500);
    }
    if (!live) throw new Error(`Watch on nested/ never became active; event log: ${log.join(", ")}`);
    const path = join(root, "nested/Note.MARKDOWN");
    await writeFile(path, "# First\n");
    await waitFor("add:nested/Note.MARKDOWN");
    await writeFile(path, "# Changed\n");
    await waitFor("change:nested/Note.MARKDOWN");
    await unlink(path);
    await waitFor("unlink:nested/Note.MARKDOWN");
    const note = log.filter((entry) => entry.includes("Note.MARKDOWN")).map((entry) => entry.replace(/^\d+ms /, ""));
    expect(note, `event log: ${log.join(", ")}`).toEqual(["add:nested/Note.MARKDOWN", "change:nested/Note.MARKDOWN", "unlink:nested/Note.MARKDOWN"]);
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
