import { describe, expect, test } from "bun:test";
import type { BloomFolderPlugin, FolderFile } from "@bloommd/capacitor-folder";
import { parseAppLink } from "./app-links";
import { createFolderStore, folderEntries, StoreConflictError } from "./stores";

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
