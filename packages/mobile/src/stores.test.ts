import { describe, expect, test } from "bun:test";
import type { BloomFolderPlugin, FolderFile } from "@bloommd/capacitor-folder";
import { parseFile } from "@bloommd/core/browser";
import { parseAppLink } from "./app-links";
import { openFileUrl } from "./opened-file";
import { createFileStore, createFolderStore, folderEntries, safePath, StoreConflictError, UnsafePathError, type MobileStore } from "./stores";

function fakeFolder(files: Record<string, { data: string; modified: number }>) {
  const writes: Array<{ path: string; data: string }> = [];
  const plugin = {
    list: async () => ({ files: Object.entries(files).map(([path, file]): FolderFile => ({ path, size: file.data.length, modified: file.modified, local: true })) }),
    read: async ({ path }: { path: string }) => ({ ...files[path]! }),
    write: async ({ path, data, expectedModified }: { path: string; data: string; expectedModified?: number }) => {
      if (expectedModified !== undefined && files[path] && files[path]!.modified !== expectedModified) throw Object.assign(new Error("The file changed on another device."), { code: "CONFLICT" });
      const modified = (files[path]?.modified ?? 0) + 1000;
      files[path] = { data, modified };
      writes.push({ path, data });
      return { modified };
    },
    remove: async () => undefined,
  } as unknown as BloomFolderPlugin;
  return { plugin, writes, files };
}

const note = "# Physik\n\nEinleitung.\n\n## Thermodynamik\n\nWärme.\n";

describe("folder store", () => {
  test("lists notes with their folder and skips Obsidian's own folders", () => {
    const entries = folderEntries([
      { path: "Schule/Physik.md", size: 1, modified: 1, local: true },
      { path: ".obsidian/workspace.md", size: 1, modified: 1, local: true },
      { path: "Heimsuchung.md", size: 1, modified: 1, local: false },
    ]);
    expect(entries).toEqual([
      { path: "Heimsuchung.md", title: "Heimsuchung", folder: "", local: false },
      { path: "Schule/Physik.md", title: "Physik", folder: "Schule", local: true },
    ]);
  });

  test("opening a note never writes it", async () => {
    const { plugin, writes } = fakeFolder({ "Schule/Physik.md": { data: note, modified: 1 } });
    const store = createFolderStore(plugin, "Obsidian Vault");
    const loaded = await store.read("Schule/Physik.md");
    expect(await store.save(loaded, loaded.document)).toBeNull();
    expect(writes).toEqual([]);
  });

  test("saves real edits in place and detects edits from another device", async () => {
    const { plugin, writes, files } = fakeFolder({ "Schule/Physik.md": { data: note, modified: 1 } });
    const store = createFolderStore(plugin, "Obsidian Vault");
    const loaded = await store.read("Schule/Physik.md");
    const edited = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    const root = edited.nodes.get(edited.rootId)!;
    edited.nodes.set(edited.rootId, { ...root, content: "Neu geschrieben." });
    const next = await store.save(loaded, edited);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe("Schule/Physik.md");
    expect(writes[0]!.data).toContain("Neu geschrieben.");
    // Obsidian on the Mac changes the note meanwhile.
    files["Schule/Physik.md"] = { data: `${note}\nVom Mac.\n`, modified: 99_999 };
    const again = { ...edited, nodes: new Map(edited.nodes) };
    again.nodes.set(edited.rootId, { ...root, content: "Zweite Änderung." });
    await expect(store.save(next!, again)).rejects.toBeInstanceOf(StoreConflictError);
  });
});

describe("app links", () => {
  test("open a note of the folder at a node", () => {
    expect(parseAppLink("bloommd://open?path=Schule%2FPhysik.md&node=abc123")).toEqual({ kind: "open", path: "Schule/Physik.md", node: "abc123" });
    expect(parseAppLink("bloommd://open?path=Notiz.md")).toEqual({ kind: "open", path: "Notiz.md", node: null });
    expect(parseAppLink("bloommd://open?path=Notiz.md&node=%3Cx%3E")).toEqual({ kind: "open", path: "Notiz.md", node: null });
  });

  test("refuse paths that leave the folder or are not notes", () => {
    expect(parseAppLink("bloommd://open?path=..%2Fsecret.md")).toBeNull();
    expect(parseAppLink("bloommd://open?path=bild.png")).toBeNull();
    expect(parseAppLink("https://example.com/open?path=a.md")).toBeNull();
    expect(parseAppLink("bloommd://selftest")).toEqual({ kind: "selftest" });
  });
});

describe("handwriting files", () => {
  test("follow Obsidian's attachment folder setting", async () => {
    const { attachmentFolder } = await import("./ink-attachments");
    expect(attachmentFolder(undefined, "Schule/Physik.md")).toBe("");
    expect(attachmentFolder("/", "Schule/Physik.md")).toBe("");
    expect(attachmentFolder("./", "Schule/Physik.md")).toBe("Schule");
    expect(attachmentFolder("./Bilder", "Schule/Physik.md")).toBe("Schule/Bilder");
    expect(attachmentFolder("Anhänge", "Schule/Physik.md")).toBe("Anhänge");
  });

  test("use the plugin's naming and never overwrite another drawing", async () => {
    const { freeInkName } = await import("./ink-attachments");
    expect(freeInkName("Physik", new Set())).toBe("Physik ink.svg");
    expect(freeInkName("Physik", new Set(["physik ink.svg", "physik ink 1.svg"]))).toBe("Physik ink 2.svg");
  });

  test("a new drawing lands in the attachment folder and an existing one is found by name", async () => {
    const { folderInkAttachments } = await import("./ink-attachments");
    const files: Record<string, string> = {
      ".obsidian/app.json": JSON.stringify({ attachmentFolderPath: "Anhänge" }),
      "Anhänge/Physik ink.svg": "<svg>alt</svg>",
    };
    const plugin = {
      list: async ({ extensions }: { extensions: string[] }) => ({ files: Object.keys(files).filter((path) => extensions.some((ext) => path.endsWith(`.${ext}`))).map((path) => ({ path, size: 1, modified: 1, local: true })) }),
      read: async ({ path }: { path: string }) => { if (!(path in files)) throw new Error("missing"); return { data: files[path]!, modified: 1 }; },
      write: async ({ path, data }: { path: string; data: string }) => { files[path] = data; return { modified: 2 }; },
    } as unknown as BloomFolderPlugin;
    const attachments = folderInkAttachments(plugin);
    expect(await attachments.read("Physik ink.svg", "Schule/Physik.md")).toBe("<svg>alt</svg>");
    const name = await attachments.write(null, "<svg>neu</svg>", "Schule/Physik.md");
    expect(name).toBe("Physik ink 1.svg");
    expect(files["Anhänge/Physik ink 1.svg"]).toBe("<svg>neu</svg>");
    await attachments.write("Physik ink.svg", "<svg>bearbeitet</svg>", "Schule/Physik.md");
    expect(files["Anhänge/Physik ink.svg"]).toBe("<svg>bearbeitet</svg>");
  });
});

describe("handwriting files changed elsewhere", () => {
  function vault(files: Record<string, { data: string; modified: number }>, hidden: string[] = []) {
    const plugin = {
      list: async ({ extensions }: { extensions: string[] }) => ({ files: Object.keys(files).filter((path) => extensions.some((ext) => path.endsWith(`.${ext}`))).map((path) => ({ path, size: 1, modified: files[path]!.modified, local: true })) }),
      read: async ({ path }: { path: string }) => { if (!(path in files)) throw new Error("missing"); return { ...files[path]! }; },
      write: async ({ path, data, expectedModified, exclusive }: { path: string; data: string; expectedModified?: number; exclusive?: boolean }) => {
        // `hidden`: taken names the listing does not show yet (e.g. created meanwhile elsewhere).
        if (exclusive && (files[path] || hidden.includes(path))) throw Object.assign(new Error("exists"), { code: "EXISTS" });
        if (expectedModified !== undefined && (!files[path] || files[path]!.modified !== expectedModified)) throw Object.assign(new Error("changed"), { code: "CONFLICT" });
        const modified = (files[path]?.modified ?? 0) + 1;
        files[path] = { data, modified };
        return { modified };
      },
    } as unknown as BloomFolderPlugin;
    return plugin;
  }

  test("an edited drawing changed on another device meanwhile is saved as a new drawing", async () => {
    const { folderInkAttachments } = await import("./ink-attachments");
    const files = { "Physik ink.svg": { data: "<svg>alt</svg>", modified: 1 } };
    const attachments = folderInkAttachments(vault(files));
    await attachments.read("Physik ink.svg", "Physik.md");
    expect(await attachments.write("Physik ink.svg", "<svg>eins</svg>", "Physik.md")).toBe("Physik ink.svg");
    files["Physik ink.svg"] = { data: "<svg>vom Mac</svg>", modified: 50 };
    expect(await attachments.write("Physik ink.svg", "<svg>zwei</svg>", "Physik.md")).toBe("Physik ink 1.svg");
    expect(files["Physik ink.svg"].data).toBe("<svg>vom Mac</svg>");
    expect((files as Record<string, { data: string }>)["Physik ink 1.svg"]!.data).toBe("<svg>zwei</svg>");
  });

  test("a new drawing takes the next free name when its name was taken meanwhile", async () => {
    const { folderInkAttachments } = await import("./ink-attachments");
    const files: Record<string, { data: string; modified: number }> = {};
    const attachments = folderInkAttachments(vault(files, ["Physik ink.svg"]));
    expect(await attachments.write(null, "<svg>neu</svg>", "Physik.md")).toBe("Physik ink 1.svg");
    expect(files["Physik ink 1.svg"]!.data).toBe("<svg>neu</svg>");
  });
});

describe("folder store: paths stay inside the folder", () => {
  const bad = ["../secret.md", "Schule/../../secret.md", "Schule/..", "/etc/passwd.md", "C:/Windows/x.md", "./Notiz.md", "Schule/./Notiz.md", "Schule//Notiz.md", "Schule/", "", "Notiz\u0000.md"];

  function spy() {
    const calls: string[] = [];
    const plugin = {
      list: async () => ({ files: [] }),
      read: async ({ path }: { path: string }) => { calls.push(`read ${path}`); return { data: note, modified: 1 }; },
      write: async ({ path }: { path: string }) => { calls.push(`write ${path}`); return { modified: 1 }; },
      remove: async ({ path }: { path: string }) => { calls.push(`remove ${path}`); },
    } as unknown as BloomFolderPlugin;
    return { plugin, calls };
  }

  test("reading, removing and creating a path with traversal is rejected before the plugin is called", async () => {
    const { plugin, calls } = spy();
    const store = createFolderStore(plugin, "Vault");
    for (const path of bad) {
      await expect(store.read(path)).rejects.toBeInstanceOf(UnsafePathError);
      await expect(store.remove(path)).rejects.toBeInstanceOf(UnsafePathError);
    }
    expect(calls).toEqual([]);
  });

  test("saving a note whose path leaves the folder writes nothing", async () => {
    const { plugin, calls } = spy();
    const store = createFolderStore(plugin, "Vault");
    for (const path of ["../Escape.md", "/Escape.md", "a/../../Escape.md"]) {
      const document = parseFile(path, "# Escape\n");
      await expect(store.save({ document, baseline: "" }, document)).rejects.toMatchObject({ code: "BAD_PATH" });
      await expect(store.saveCopy(document, "iPad-Konflikt")).rejects.toBeInstanceOf(UnsafePathError);
    }
    expect(calls).toEqual([]);
  });

  test("pathFor puts a new note in the folder shown and refuses a folder that leaves the vault", () => {
    const store = createFolderStore(spy().plugin, "Vault");
    expect(store.pathFor("Neu.md")).toBe("Neu.md");
    expect(store.pathFor("Neu.md", "")).toBe("Neu.md");
    expect(store.pathFor("Neu.md", "Uni/Physik")).toBe("Uni/Physik/Neu.md");
    expect(store.pathFor("Neu.md", "Uni/Physik/")).toBe("Uni/Physik/Neu.md");
    expect(() => store.pathFor("Neu.md", "..")).toThrow(UnsafePathError);
    expect(() => store.pathFor("Neu.md", "../..")).toThrow(UnsafePathError);
    expect(() => store.pathFor("Neu.md", "/abs")).toThrow(UnsafePathError);
    expect(() => store.pathFor("../Neu.md", "Uni")).toThrow(UnsafePathError);
  });

  test("a new note in a subfolder is written to exactly that subfolder", async () => {
    const { plugin, files } = fakeFolder({ "Uni/Physik/Alt.md": { data: note, modified: 1 } });
    const store = createFolderStore(plugin, "Vault");
    const path = store.pathFor("Neu.md", "Uni/Physik");
    const document = parseFile(path, "# Neu\n");
    await store.save({ document, baseline: "" }, document);
    expect(Object.keys(files).sort()).toEqual(["Uni/Physik/Alt.md", "Uni/Physik/Neu.md"]);
  });

  test("ordinary nested paths and names with spaces, umlauts and dots are fine", () => {
    for (const path of ["Notiz.md", "Schule/Physik.md", "Uni/Physik/Optik/Linsen.md", "Über uns/Größe & Form.md", "a.b/c.d.md", "Ordner mit  Leerzeichen/x y.md"]) expect(safePath(path)).toBe(path);
  });
});

describe("single file opened from the Files app", () => {
  function fakeSingle(initial: string, modified = 1) {
    const state = { data: initial, modified, writes: [] as string[], deletes: 0 };
    const plugin = {
      readFile: async ({ token }: { token: string }) => {
        if (token !== "t1") throw Object.assign(new Error("The file is no longer open."), { code: "NO_FILE" });
        return { data: state.data, modified: state.modified };
      },
      writeFile: async ({ token, data, expectedModified }: { token: string; data: string; expectedModified?: number }) => {
        if (token !== "t1") throw Object.assign(new Error("The file is no longer open."), { code: "NO_FILE" });
        if (expectedModified !== undefined && state.modified !== expectedModified) throw Object.assign(new Error("The file changed on another device."), { code: "CONFLICT" });
        state.data = data;
        state.modified += 1000;
        state.writes.push(data);
        return { modified: state.modified };
      },
      remove: async () => { state.deletes += 1; },
    } as unknown as BloomFolderPlugin;
    return { plugin, state };
  }
  const file = { token: "t1", name: "Physik.md" };

  test("lists the file as the only note", async () => {
    const store = createFileStore(fakeSingle(note).plugin, file);
    expect(store.kind).toBe("file");
    expect(await store.list()).toEqual({ entries: [{ path: "Physik.md", title: "Physik", folder: "", local: true }], unreadable: [] });
  });

  test("opening never writes; a real edit replaces the original file and nothing else", async () => {
    const { plugin, state } = fakeSingle(note);
    const store = createFileStore(plugin, file);
    const loaded = await store.read("Physik.md");
    expect(await store.save(loaded, loaded.document)).toBeNull();
    expect(state.writes).toEqual([]);
    const edited = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    const root = edited.nodes.get(edited.rootId)!;
    edited.nodes.set(edited.rootId, { ...root, content: "Direkt in der Originaldatei." });
    const next = await store.save(loaded, edited);
    expect(next?.modified).toBe(1001);
    expect(state.writes).toHaveLength(1);
    expect(state.data).toContain("Direkt in der Originaldatei.");
  });

  test("an edit from another device is detected, the file is not overwritten", async () => {
    const { plugin, state } = fakeSingle(note);
    const store = createFileStore(plugin, file);
    const loaded = await store.read("Physik.md");
    state.data = `${note}\nVom Mac.\n`;
    state.modified = 99_999;
    const edited = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    edited.nodes.set(edited.rootId, { ...edited.nodes.get(edited.rootId)!, content: "Vom iPad." });
    await expect(store.save(loaded, edited)).rejects.toBeInstanceOf(StoreConflictError);
    expect(state.data).toContain("Vom Mac.");
    expect(state.data).not.toContain("Vom iPad.");
  });

  test("the iPad's version of a conflict goes to the copy store, never next to the file", async () => {
    const { plugin } = fakeSingle(note);
    const copies: string[] = [];
    const copyTo = { saveCopy: async (document, label) => { copies.push(`${document.filePath} ${label}`); return "Physik (iPad-Konflikt).md"; } } as MobileStore;
    const store = createFileStore(plugin, file, copyTo);
    const document = parseFile("Physik.md", note);
    expect(await store.saveCopy(document, "iPad-Konflikt")).toBe("Physik (iPad-Konflikt).md");
    expect(copies).toEqual(["Physik.md iPad-Konflikt"]);
  });

  test("other paths are refused, the file cannot be deleted, a lost token fails clearly", async () => {
    const { plugin, state } = fakeSingle(note);
    const store = createFileStore(plugin, file);
    await expect(store.read("Anderes.md")).rejects.toBeInstanceOf(UnsafePathError);
    await expect(store.read("../Physik.md")).rejects.toBeInstanceOf(UnsafePathError);
    const stranger = parseFile("Anderes.md", "# Anderes\n");
    await expect(store.save({ document: stranger, baseline: "" }, stranger)).rejects.toBeInstanceOf(UnsafePathError);
    await expect(store.remove("Physik.md")).rejects.toThrow();
    expect(state.writes).toEqual([]);
    expect(state.deletes).toBe(0);
    await expect(createFileStore(plugin, { token: "old", name: "Physik.md" }).read("Physik.md")).rejects.toMatchObject({ code: "NO_FILE" });
  });
});

describe("opening a file URL from the Files app", () => {
  function fakePlugin(opened: { token: string; name: string; folderPath: string | null }, folderName: string | null = "Vault") {
    const calls: string[] = [];
    const plugin = {
      openFile: async ({ url }: { url: string }) => { calls.push(url); return opened; },
      current: async () => ({ name: folderName }),
      list: async () => ({ files: [] }),
    } as unknown as BloomFolderPlugin;
    return { plugin, calls };
  }
  const app = createFolderStore(fakeFolder({}).plugin, "Vault");

  test("a file inside the open folder is a note of that folder, in the store already open", async () => {
    const { plugin, calls } = fakePlugin({ token: "t", name: "Physik.md", folderPath: "Uni/Physik.md" });
    const opened = await openFileUrl(plugin, "file:///private/var/Uni/Physik.md", app);
    expect(calls).toEqual(["file:///private/var/Uni/Physik.md"]);
    expect(opened.store).toBe(app);
    expect(opened.path).toBe("Uni/Physik.md");
  });

  test("a file inside the folder, while another store is shown, opens through a folder store", async () => {
    const { plugin } = fakePlugin({ token: "t", name: "Physik.md", folderPath: "Uni/Physik.md" });
    const opened = await openFileUrl(plugin, "file:///x/Uni/Physik.md", createFileStore(plugin, { token: "old", name: "Alt.md" }));
    expect(opened.store.kind).toBe("folder");
    expect(opened.store.name).toBe("Vault");
    expect(opened.path).toBe("Uni/Physik.md");
  });

  test("a file elsewhere is opened as a single file under its own name", async () => {
    const { plugin } = fakePlugin({ token: "t", name: "Extern.md", folderPath: null });
    const opened = await openFileUrl(plugin, "file:///private/var/mobile/Mobile%20Documents/Extern.md", app);
    expect(opened.store.kind).toBe("file");
    expect(opened.store.name).toBe("Extern.md");
    expect(opened.path).toBe("Extern.md");
  });

  test("a file in Obsidian's own or a hidden folder is not a note of the folder", async () => {
    for (const folderPath of [".obsidian/workspace.md", ".trash/Alt.md", "Uni/.versteckt/Geheim.md", "node_modules/x/README.md"]) {
      const { plugin } = fakePlugin({ token: "t", name: folderPath.split("/").pop()!, folderPath });
      const opened = await openFileUrl(plugin, "file:///x.md", app);
      expect(opened.store.kind).toBe("file");
    }
  });

  test("a path from the plugin that leaves the folder is refused", async () => {
    const { plugin } = fakePlugin({ token: "t", name: "x.md", folderPath: "../x.md" });
    await expect(openFileUrl(plugin, "file:///x.md", app)).rejects.toBeInstanceOf(UnsafePathError);
  });
});
