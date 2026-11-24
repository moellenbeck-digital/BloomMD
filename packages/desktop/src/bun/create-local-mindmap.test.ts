import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalMindmap } from "./create-local-mindmap";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

test("creates a note in its selected folder, including new nested folders", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-create-local-"));
  directories.push(directory);
  const doc = await createLocalMindmap(directory, "Team/Ideen/Neue Notiz.md", "# Neue Notiz\n\n## Idee\n");
  expect(doc.filePath).toBe(join(directory, "Team/Ideen/Neue Notiz.md"));
  expect(await readFile(doc.filePath, "utf8")).toContain("## Idee");
  expect(await readdir(directory)).toEqual(["Team"]);
  await expect(createLocalMindmap(directory, "Team/Ideen/Neue Notiz.md", "# Replacement\n")).rejects.toThrow();
  expect(await readFile(doc.filePath, "utf8")).not.toContain("Replacement");
});

test("rejects paths outside the workspace without creating files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bloommd-create-local-"));
  directories.push(directory);
  for (const filename of ["../escape.md", "/absolute.md", "Team/../../escape.md"]) {
    await expect(createLocalMindmap(directory, filename, "# Nope\n")).rejects.toThrow();
  }
  expect(await readdir(directory)).toEqual([]);
});
