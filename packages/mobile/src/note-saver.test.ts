import { describe, expect, test } from "bun:test";
import type { BloomFolderPlugin } from "@bloommd/capacitor-folder";
import type { MindMapDocument } from "@bloommd/core/browser";
import { NoteSaver } from "./note-saver";
import { copyPath, createFolderStore } from "./stores";

/** Folder whose writes can be held back, to switch notes while a save is still running. */
function slowFolder(files: Record<string, { data: string; modified: number }>) {
  const writes: Array<{ path: string; data: string }> = [];
  let hold: Promise<void> | null = null;
  let release = () => undefined as void;
  const plugin = {
    list: async () => ({ files: [] }),
    read: async ({ path }: { path: string }) => {
      if (!files[path]) throw Object.assign(new Error("missing"), { code: "NOT_FOUND" });
      return { ...files[path]! };
    },
    write: async ({ path, data, expectedModified, exclusive }: { path: string; data: string; expectedModified?: number; exclusive?: boolean }) => {
      if (hold) await hold;
      if (exclusive && files[path]) throw Object.assign(new Error("A file with this name already exists."), { code: "EXISTS" });
      if (expectedModified !== undefined && (!files[path] || files[path]!.modified !== expectedModified)) throw Object.assign(new Error("The file changed on another device."), { code: "CONFLICT" });
      const modified = (files[path]?.modified ?? 0) + 1000;
      files[path] = { data, modified };
      writes.push({ path, data });
      return { modified };
    },
    remove: async () => undefined,
  } as unknown as BloomFolderPlugin;
  return {
    plugin,
    writes,
    files,
    holdWrites() {
      hold = new Promise((resolve) => { release = resolve; });
    },
    releaseWrites() {
      hold = null;
      release();
    },
  };
}

function edit(document: MindMapDocument, content: string): MindMapDocument {
  const nodes = new Map(document.nodes);
  nodes.set(document.rootId, { ...nodes.get(document.rootId)!, content });
  return { ...document, nodes };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("note saver", () => {
  test("a save still running when another note opens never writes that note into the first file", async () => {
    const folder = slowFolder({
      "A.md": { data: "# A\n\nAlpha.\n", modified: 1 },
      "B.md": { data: "# B\n\nBeta.\n", modified: 1 },
    });
    const store = createFolderStore(folder.plugin, "Vault");
    const saver = new NoteSaver({}, 60_000);
    const a = await store.read("A.md");
    saver.open(store, a);
    folder.holdWrites();
    saver.change(edit(a.document, "Alpha bearbeitet."));
    const savingA = saver.flush();
    await tick();
    // The user opens B while A is still being written.
    const b = await store.read("B.md");
    saver.open(store, b);
    folder.releaseWrites();
    await savingA;
    expect(saver.loaded?.document.filePath).toBe("B.md");
    saver.change(edit(b.document, "Beta bearbeitet."));
    await saver.flush();
    expect(folder.files["A.md"]!.data).toContain("Alpha bearbeitet.");
    expect(folder.files["A.md"]!.data).not.toContain("Beta");
    expect(folder.files["B.md"]!.data).toContain("Beta bearbeitet.");
    expect(folder.writes.map((write) => write.path)).toEqual(["A.md", "B.md"]);
  });

  test("a late edit of a note that is no longer open is not written into the open note", async () => {
    const folder = slowFolder({
      "A.md": { data: "# A\n", modified: 1 },
      "B.md": { data: "# B\n", modified: 1 },
    });
    const store = createFolderStore(folder.plugin, "Vault");
    const saver = new NoteSaver({}, 60_000);
    const a = await store.read("A.md");
    saver.open(store, await store.read("B.md"));
    saver.change(edit(a.document, "Von A."));
    await saver.flush();
    expect(folder.writes).toEqual([]);
  });

  test("pending edits are saved on flush before the quiet period ends, e.g. when switching notes", async () => {
    const folder = slowFolder({ "A.md": { data: "# A\n\nAlpha.\n", modified: 1 } });
    const store = createFolderStore(folder.plugin, "Vault");
    const saved: string[] = [];
    const saver = new NoteSaver({ onSaved: (path) => saved.push(path) }, 60_000);
    const a = await store.read("A.md");
    saver.open(store, a);
    saver.change(edit(a.document, "Erste Änderung."));
    saver.change(edit(a.document, "Zweite Änderung."));
    expect(folder.writes).toEqual([]);
    await saver.flush();
    expect(folder.writes).toHaveLength(1);
    expect(folder.files["A.md"]!.data).toContain("Zweite Änderung.");
    expect(saved).toEqual(["A.md"]);
  });

  test("flush takes the latest document, saves of one note run in order against the previous one", async () => {
    const folder = slowFolder({ "A.md": { data: "# A\n", modified: 1 } });
    const store = createFolderStore(folder.plugin, "Vault");
    const errors: unknown[] = [];
    const saver = new NoteSaver({ onError: (error) => errors.push(error), onConflict: (conflict) => errors.push(conflict) }, 60_000);
    const a = await store.read("A.md");
    saver.open(store, a);
    folder.holdWrites();
    saver.change(edit(a.document, "Eins."));
    const first = saver.flush();
    await tick();
    const second = saver.flush(edit(a.document, "Zwei."));
    folder.releaseWrites();
    await Promise.all([first, second]);
    expect(errors).toEqual([]);
    expect(folder.writes).toHaveLength(2);
    expect(folder.files["A.md"]!.data).toContain("Zwei.");
  });

  test("the debounce saves after the quiet period", async () => {
    const folder = slowFolder({ "A.md": { data: "# A\n", modified: 1 } });
    const store = createFolderStore(folder.plugin, "Vault");
    const saver = new NoteSaver({}, 5);
    const a = await store.read("A.md");
    saver.open(store, a);
    saver.change(edit(a.document, "Später."));
    await new Promise((resolve) => setTimeout(resolve, 30));
    await saver.flush();
    expect(folder.files["A.md"]!.data).toContain("Später.");
  });

  test("a note changed elsewhere keeps the iPad's edits as a conflict copy with a free name", async () => {
    const folder = slowFolder({
      "Schule/Physik.md": { data: "# Physik\n", modified: 1 },
      "Schule/Physik (iPad-Konflikt).md": { data: "# Alt\n", modified: 1 },
    });
    const store = createFolderStore(folder.plugin, "Vault");
    const conflicts: Array<{ path: string; copy: string | null; current: boolean }> = [];
    const saver = new NoteSaver({ onConflict: (conflict) => conflicts.push(conflict) }, 60_000);
    const loaded = await store.read("Schule/Physik.md");
    saver.open(store, loaded);
    folder.files["Schule/Physik.md"] = { data: "# Physik\n\nVom Mac.\n", modified: 50 };
    saver.change(edit(loaded.document, "Vom iPad."));
    await saver.flush();
    expect(conflicts).toEqual([{ path: "Schule/Physik.md", copy: "Schule/Physik (iPad-Konflikt 2).md", current: true }]);
    expect(folder.files["Schule/Physik.md"]!.data).toContain("Vom Mac.");
    expect(folder.files["Schule/Physik (iPad-Konflikt).md"]!.data).toBe("# Alt\n");
    expect(folder.files["Schule/Physik (iPad-Konflikt 2).md"]!.data).toContain("Vom iPad.");
    // Later edits of the replaced version are not written over the other device's note.
    saver.change(edit(loaded.document, "Noch mehr."));
    await saver.flush();
    expect(folder.files["Schule/Physik.md"]!.data).not.toContain("Noch mehr.");
  });

  test("a note deleted elsewhere is a conflict too", async () => {
    const folder = slowFolder({ "A.md": { data: "# A\n", modified: 1 } });
    const store = createFolderStore(folder.plugin, "Vault");
    const conflicts: Array<{ path: string; copy: string | null }> = [];
    const saver = new NoteSaver({ onConflict: ({ path, copy }) => conflicts.push({ path, copy }) }, 60_000);
    const loaded = await store.read("A.md");
    saver.open(store, loaded);
    delete folder.files["A.md"];
    await saver.flush(edit(loaded.document, "Noch da."));
    expect(conflicts).toEqual([{ path: "A.md", copy: "A (iPad-Konflikt).md" }]);
    expect(folder.files["A.md"]).toBeUndefined();
  });

  test("conflict copy names", () => {
    expect(copyPath("Schule/Physik.md", "iPad-Konflikt", 1)).toBe("Schule/Physik (iPad-Konflikt).md");
    expect(copyPath("Notiz.markdown", "iPad-Konflikt", 3)).toBe("Notiz (iPad-Konflikt 3).markdown");
  });
});
