import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "./fileStore";
import { NOTE_HISTORY_LIMIT, sortRevisionsNewestFirst } from "./note-history";

const note = (body: string) => `---
title: History Test
id: history-test
created: "2026-04-01T00:00:00Z"
updated: "2026-04-01T00:00:00Z"
---

# History Test

${body}
`;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "bloommd-note-history-"));
  await writeFile(join(dir, "test.md"), note("Version 0"), "utf-8");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Saves `count` different versions in a row, so the note ends with "Version <count>". */
async function saveVersions(store: FileStore, filename: string, count: number) {
  for (let version = 1; version <= count; version += 1) {
    const doc = await store.read(filename);
    doc.nodes.get(doc.rootId)!.content = `Version ${version}`;
    await store.write(doc);
  }
}

describe("local note history", () => {
  test("a note that was never overwritten has an empty history", async () => {
    const store = new FileStore({ baseDir: dir });

    expect(await store.listBackups("test.md")).toEqual([]);
  });

  test("lists the replaced versions newest first with time and size", async () => {
    const store = new FileStore({ baseDir: dir });
    await saveVersions(store, "test.md", 3);

    const history = await store.listBackups("test.md");

    expect(history).toHaveLength(3);
    expect(history.map((entry) => entry.source)).toEqual(["local", "local", "local"]);
    const times = history.map((entry) => entry.replacedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(Number.isNaN(Date.parse(times[0]!))).toBe(false);
    expect(history[0]!.size).toBeGreaterThan(0);
    const newest = await readFile(join(dir, ".bloommd", "backups", history[0]!.id), "utf-8");
    expect(newest).toContain("Version 2");
    const oldest = await readFile(join(dir, ".bloommd", "backups", history[2]!.id), "utf-8");
    expect(oldest).toContain("Version 0");
  });

  test("keeps only the last 20 versions and removes older ones when writing", async () => {
    const store = new FileStore({ baseDir: dir });
    await saveVersions(store, "test.md", NOTE_HISTORY_LIMIT + 5);

    const history = await store.listBackups("test.md");

    expect(history).toHaveLength(NOTE_HISTORY_LIMIT);
    expect(await readdir(join(dir, ".bloommd", "backups"))).toHaveLength(NOTE_HISTORY_LIMIT);
    // 25 saves replaced Version 0…24; the 20 newest are Version 5…24, so Version 0…4 are gone.
    const contents = await Promise.all(history.map((entry) => readFile(join(dir, ".bloommd", "backups", entry.id), "utf-8")));
    expect(contents[0]).toContain("Version 24");
    expect(contents[NOTE_HISTORY_LIMIT - 1]).toContain("Version 5");
    expect(contents.some((content) => content.includes("Version 4"))).toBe(false);
  });

  test("restoring writes the chosen version and backs up the one it replaces", async () => {
    const store = new FileStore({ baseDir: dir });
    await saveVersions(store, "test.md", 2); // current: Version 2, history: Version 0, 1
    const history = await store.listBackups("test.md");
    const versionOne = history[0]!;

    const restored = await store.restoreBackup("test.md", versionOne.id);

    expect(restored.nodes.get(restored.rootId)!.content).toContain("Version 1");
    expect(await readFile(join(dir, "test.md"), "utf-8")).toContain("Version 1");
    const after = await store.listBackups("test.md");
    expect(after).toHaveLength(3);
    const contents = await Promise.all(after.map((entry) => readFile(join(dir, ".bloommd", "backups", entry.id), "utf-8")));
    // Nothing was lost: the version that was current before the restore is the newest entry.
    expect(contents[0]).toContain("Version 2");
  });

  test("restoring works with automatic backups switched off and still backs up the current version", async () => {
    const store = new FileStore({ baseDir: dir, backupsEnabled: false });
    const backupDir = join(dir, ".bloommd", "backups");
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, "test.md.2026-05-01T10-00-00-000Z.bak"), note("Old version"), "utf-8");

    await store.restoreBackup("test.md", "test.md.2026-05-01T10-00-00-000Z.bak");

    const history = await store.listBackups("test.md");
    expect(history).toHaveLength(2);
    expect(await readFile(join(dir, "test.md"), "utf-8")).toContain("Old version");
  });

  test("reads the Markdown of a backup, and nothing that is not one of the note's backups", async () => {
    const store = new FileStore({ baseDir: dir });
    await saveVersions(store, "test.md", 1);
    const [entry] = await store.listBackups("test.md");

    expect(await store.readBackup("test.md", entry!.id)).toContain("Version 0");
    expect(await store.readBackup("test.md", "../../test.md")).toBeNull();
    expect(await store.readBackup("other.md", entry!.id)).toBeNull();
  });

  test("restoring accepts only entries of the note's own history", async () => {
    const store = new FileStore({ baseDir: dir });
    await saveVersions(store, "test.md", 1);
    await writeFile(join(dir, "other.md"), note("Other"), "utf-8");
    await saveVersions(store, "other.md", 1);
    const [other] = await store.listBackups("other.md");

    await expect(store.restoreBackup("test.md", other!.id)).rejects.toThrow("BACKUP_NOT_FOUND");
    await expect(store.restoreBackup("test.md", "../../test.md")).rejects.toThrow("BACKUP_NOT_FOUND");
    await expect(store.restoreBackup("test.md", "test.md.nonsense.bak")).rejects.toThrow("BACKUP_NOT_FOUND");
    expect(await readFile(join(dir, "test.md"), "utf-8")).toContain("Version 1");
  });

  test("refuses to restore a backup that cannot be parsed and leaves the note alone", async () => {
    const store = new FileStore({ baseDir: dir });
    const backupDir = join(dir, ".bloommd", "backups");
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, "test.md.2026-05-01T10-00-00-000Z.bak"), "---\ntitle: [unclosed\n---\n# X\n", "utf-8");

    await expect(store.restoreBackup("test.md", "test.md.2026-05-01T10-00-00-000Z.bak")).rejects.toThrow();

    expect(await readFile(join(dir, "test.md"), "utf-8")).toContain("Version 0");
    expect(await store.listBackups("test.md")).toHaveLength(1);
  });

  test("notes with the same file name in different folders keep separate histories", async () => {
    const store = new FileStore({ baseDir: dir });
    await mkdir(join(dir, "a"), { recursive: true });
    await mkdir(join(dir, "b"), { recursive: true });
    await writeFile(join(dir, "a", "same.md"), note("A"), "utf-8");
    await writeFile(join(dir, "b", "same.md"), note("B"), "utf-8");
    await saveVersions(store, "a/same.md", NOTE_HISTORY_LIMIT + 2);
    await saveVersions(store, "b/same.md", 1);

    expect(await store.listBackups("a/same.md")).toHaveLength(NOTE_HISTORY_LIMIT);
    const b = await store.listBackups("b/same.md");
    expect(b).toHaveLength(1);
    expect(await readFile(join(dir, ".bloommd", "backups", "b", b[0]!.id), "utf-8")).toContain("B");
    expect(await store.listBackups("same.md")).toEqual([]);
  });

  test("a backup of another note whose name merely starts the same is not listed", async () => {
    const store = new FileStore({ baseDir: dir });
    const backupDir = join(dir, ".bloommd", "backups");
    await mkdir(backupDir, { recursive: true });
    await writeFile(join(backupDir, "test.md.old.md.2026-05-01T10-00-00-000Z.bak"), note("Other"), "utf-8");
    await writeFile(join(backupDir, "test.md.2026-05-01T10-00-00-000Z.bak"), note("Mine"), "utf-8");
    await utimes(join(backupDir, "test.md.2026-05-01T10-00-00-000Z.bak"), new Date(), new Date());

    const history = await store.listBackups("test.md");

    expect(history.map((entry) => entry.id)).toEqual(["test.md.2026-05-01T10-00-00-000Z.bak"]);
    expect(history[0]!.replacedAt).toBe("2026-05-01T10:00:00.000Z");
  });

  test("two writes within the same millisecond keep both versions", async () => {
    const store = new FileStore({ baseDir: dir });
    const realNow = Date.now;
    Date.now = () => 1_800_000_000_000;
    try {
      await saveVersions(store, "test.md", 3);
    } finally {
      Date.now = realNow;
    }

    expect(await store.listBackups("test.md")).toHaveLength(3);
  });
});

describe("sortRevisionsNewestFirst", () => {
  test("orders by time, newest first, without changing the input", () => {
    const input = [{ replacedAt: "2026-01-01T00:00:00.000Z" }, { replacedAt: "2026-03-01T00:00:00.000Z" }, { replacedAt: "2026-02-01T00:00:00.000Z" }];

    expect(sortRevisionsNewestFirst(input).map((entry) => entry.replacedAt)).toEqual([
      "2026-03-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
    expect(input[0]!.replacedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
