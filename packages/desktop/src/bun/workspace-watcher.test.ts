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
  const events: string[] = [];
  let onEvent: (() => void) | undefined;
  const watcher = watchWorkspace(root, (file, kind) => { events.push(`${kind}:${file}`); onEvent?.(); });
  const waitFor = (value: string) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${value}: ${events.join(", ")}`)), 5000);
    onEvent = () => { if (events.includes(value)) { clearTimeout(timer); resolve(); } };
    onEvent();
  });
  try {
    await new Promise<void>((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject); });
    const path = join(root, "nested/Note.MARKDOWN");
    await writeFile(path, "# First\n");
    await waitFor("add:nested/Note.MARKDOWN");
    await writeFile(path, "# Changed\n");
    await waitFor("change:nested/Note.MARKDOWN");
    await unlink(path);
    await waitFor("unlink:nested/Note.MARKDOWN");
    expect(events).toEqual(["add:nested/Note.MARKDOWN", "change:nested/Note.MARKDOWN", "unlink:nested/Note.MARKDOWN"]);
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
