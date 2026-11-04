import { describe, expect, test } from "bun:test";
import { existingFolder, folderLevel, folderOf, parentFolder, pathSteps, searchEntries } from "./folder-levels";
import { folderEntries } from "./stores";

const entries = folderEntries([
  { path: "Heimsuchung.md", size: 1, modified: 1, local: true },
  { path: "Uni/Notiz.md", size: 1, modified: 1, local: true },
  { path: "Uni/Physik.md", size: 1, modified: 1, local: true },
  { path: "Uni/Physik/Optik/Linsen.md", size: 1, modified: 1, local: true },
  { path: "Uni/Physik/Thermodynamik.md", size: 1, modified: 1, local: false },
  { path: "Arbeit/Teammeeting.md", size: 1, modified: 1, local: true },
  { path: "Physik.md", size: 1, modified: 1, local: true },
  { path: "Physik/Mechanik.md", size: 1, modified: 1, local: true },
  { path: ".obsidian/workspace.md", size: 1, modified: 1, local: true },
  { path: ".trash/Alt.md", size: 1, modified: 1, local: true },
  { path: ".versteckt/Geheim.md", size: 1, modified: 1, local: true },
]);

describe("folder levels", () => {
  test("a nested vault shows folders first, then the notes of the level", () => {
    const top = folderLevel(entries, "");
    expect(top.parent).toBeNull();
    expect(top.folders).toEqual([
      { name: "Arbeit", path: "Arbeit", notes: 1 },
      { name: "Physik", path: "Physik", notes: 1 },
      { name: "Uni", path: "Uni", notes: 4 },
    ]);
    expect(top.notes.map((entry) => entry.path)).toEqual(["Heimsuchung.md", "Physik.md"]);
  });

  test("Obsidian's own folders and dot folders stay hidden at every level", () => {
    const names = folderLevel(entries, "").folders.map((row) => row.name);
    expect(names).not.toContain(".obsidian");
    expect(names).not.toContain(".trash");
    expect(names).not.toContain(".versteckt");
  });

  test("two levels down: sub-folders with their counts, a way up, the notes of the level", () => {
    const uni = folderLevel(entries, "Uni");
    expect(uni.parent).toBe("");
    expect(uni.folders).toEqual([{ name: "Physik", path: "Uni/Physik", notes: 2 }]);
    expect(uni.notes.map((entry) => entry.path)).toEqual(["Uni/Notiz.md", "Uni/Physik.md"]);
    const physik = folderLevel(entries, "Uni/Physik");
    expect(physik.parent).toBe("Uni");
    expect(physik.folders).toEqual([{ name: "Optik", path: "Uni/Physik/Optik", notes: 1 }]);
    expect(physik.notes.map((entry) => entry.path)).toEqual(["Uni/Physik/Thermodynamik.md"]);
    const optik = folderLevel(entries, "Uni/Physik/Optik");
    expect(optik.parent).toBe("Uni/Physik");
    expect(optik.folders).toEqual([]);
    expect(optik.notes.map((entry) => entry.title)).toEqual(["Linsen"]);
  });

  test("a folder and a note with the same name are two separate rows", () => {
    const top = folderLevel(entries, "");
    expect(top.folders.some((row) => row.name === "Physik")).toBe(true);
    expect(top.notes.some((entry) => entry.title === "Physik")).toBe(true);
    // The folder holds its own notes, not the note next to it.
    expect(folderLevel(entries, "Physik").notes.map((entry) => entry.path)).toEqual(["Physik/Mechanik.md"]);
    // Same inside Uni: the note Uni/Physik.md and the folder Uni/Physik/.
    const uni = folderLevel(entries, "Uni");
    expect(uni.folders.map((row) => row.name)).toEqual(["Physik"]);
    expect(uni.notes.map((entry) => entry.title)).toContain("Physik");
  });

  test("a folder name that only starts like another one does not count as its child", () => {
    const flat = folderEntries([
      { path: "Uni/A.md", size: 1, modified: 1, local: true },
      { path: "Uni2/B.md", size: 1, modified: 1, local: true },
    ]);
    expect(folderLevel(flat, "Uni").notes.map((entry) => entry.path)).toEqual(["Uni/A.md"]);
    expect(folderLevel(flat, "Uni").folders).toEqual([]);
  });

  test("notes keep their iCloud state and are sorted by title", () => {
    const uni = folderLevel(entries, "Uni/Physik");
    expect(uni.notes[0]?.local).toBe(false);
    const sorted = folderLevel(
      folderEntries([
        { path: "b.md", size: 1, modified: 1, local: true },
        { path: "Ä.md", size: 1, modified: 1, local: true },
        { path: "a.md", size: 1, modified: 1, local: true },
      ]),
      "",
    );
    expect(sorted.notes.map((entry) => entry.title)).toEqual(["a", "Ä", "b"]);
  });

  test("slashes around the folder are ignored", () => {
    expect(folderLevel(entries, "/Uni/").folder).toBe("Uni");
  });

  test("a flat vault or the app folder has no folder rows", () => {
    const level = folderLevel([{ path: "A.md", title: "A", folder: "", local: true }], "");
    expect(level.folders).toEqual([]);
    expect(level.notes).toHaveLength(1);
  });
});

describe("walking the path", () => {
  test("parent, folder of a note and steps from the top", () => {
    expect(parentFolder("")).toBeNull();
    expect(parentFolder("Uni")).toBe("");
    expect(parentFolder("Uni/Physik/Optik")).toBe("Uni/Physik");
    expect(folderOf("Uni/Physik.md")).toBe("Uni");
    expect(folderOf("Notiz.md")).toBe("");
    expect(pathSteps("")).toEqual([]);
    expect(pathSteps("Uni/Physik")).toEqual([
      { name: "Uni", path: "Uni" },
      { name: "Physik", path: "Uni/Physik" },
    ]);
  });

  test("a folder whose notes are gone falls back to the nearest one that still has notes", () => {
    expect(existingFolder(entries, "Uni/Physik/Optik")).toBe("Uni/Physik/Optik");
    expect(existingFolder(entries, "Uni/Physik/Leer")).toBe("Uni/Physik");
    expect(existingFolder(entries, "Weg/Auch Weg")).toBe("");
    expect(existingFolder(entries, "")).toBe("");
    // A folder that only has sub-folders is still a level to walk through.
    expect(existingFolder(entries, "Uni/Physik")).toBe("Uni/Physik");
  });
});

describe("filter and search", () => {
  test("search is flat across all folders and matches path and title", () => {
    expect(searchEntries(entries, "linsen").map((entry) => entry.path)).toEqual(["Uni/Physik/Optik/Linsen.md"]);
    expect(searchEntries(entries, "uni/physik").map((entry) => entry.path).sort()).toEqual(["Uni/Physik.md", "Uni/Physik/Optik/Linsen.md", "Uni/Physik/Thermodynamik.md"].sort());
    expect(searchEntries(entries, "  ")).toBe(entries);
    expect(searchEntries(entries, "gibtsnicht")).toEqual([]);
  });
});
