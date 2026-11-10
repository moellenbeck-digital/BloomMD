import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";

/** The app folder on a device, in memory: like the real one it needs a folder to exist before a file goes into it. */
const files = new Map<string, string>();
const dirs = new Set<string>();
const calls: string[] = [];

const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));
const missing = (path: string) => new Error(`${path} does not exist`);

const filesystem = {
  async mkdir({ path, recursive }: { path: string; recursive?: boolean }) {
    calls.push(`mkdir ${path}`);
    if (files.has(path)) throw new Error(`${path} is a file`);
    if (!recursive && !dirs.has(parentOf(path))) throw missing(parentOf(path));
    for (let current = path; current; current = parentOf(current)) dirs.add(current);
  },
  async readdir({ path }: { path: string }) {
    calls.push(`readdir ${path}`);
    if (!dirs.has(path)) throw missing(path);
    const child = (candidate: string) => parentOf(candidate) === path && candidate !== path;
    const name = (candidate: string) => candidate.slice(path.length + 1);
    return {
      files: [
        ...[...dirs].filter(child).map((candidate) => ({ name: name(candidate), type: "directory", size: 0 })),
        ...[...files.keys()].filter(child).map((candidate) => ({ name: name(candidate), type: "file", size: 1 })),
      ],
    };
  },
  async readFile({ path }: { path: string }) {
    calls.push(`readFile ${path}`);
    if (!files.has(path)) throw missing(path);
    return { data: files.get(path)! };
  },
  async writeFile({ path, data }: { path: string; data: string }) {
    calls.push(`writeFile ${path}`);
    if (!dirs.has(parentOf(path))) throw missing(parentOf(path));
    files.set(path, data);
  },
  async stat({ path }: { path: string }) {
    if (files.has(path)) return { type: "file" };
    if (dirs.has(path)) return { type: "directory" };
    throw missing(path);
  },
  async copy({ from, to }: { from: string; to: string }) {
    if (!files.has(from)) throw missing(from);
    files.set(to, files.get(from)!);
  },
  async deleteFile({ path }: { path: string }) {
    calls.push(`deleteFile ${path}`);
    if (!files.delete(path)) throw missing(path);
  },
  async rename({ from, to }: { from: string; to: string }) {
    if (!files.has(from)) throw missing(from);
    files.set(to, files.get(from)!);
    files.delete(from);
  },
};

mock.module("@capacitor/filesystem", () => ({
  Filesystem: filesystem,
  Encoding: { UTF8: "utf8" },
  Directory: { Documents: "DOCUMENTS", Data: "DATA", Cache: "CACHE" },
}));

const { createAppStore, SkippedFolderError } = await import("./stores");

const note = (title: string) => `---\ntitle: ${JSON.stringify(title)}\nid: ${title.toLowerCase().replace(/\W/g, "")}\n---\n\n# ${title}\n`;

function put(path: string, data = "x") {
  for (let current = parentOf(path); current; current = parentOf(current)) dirs.add(current);
  files.set(path, data);
}

beforeEach(() => {
  files.clear();
  dirs.clear();
  calls.length = 0;
  dirs.add("bloommd");
});

const bad = ["../secret.md", "Schule/../../secret.md", "Schule/..", "/etc/passwd.md", "C:/Windows/x.md", "./Notiz.md", "Schule/./Notiz.md", "", "Notiz\u0000.md", "Schule/\u0007x.md"];

describe("app store: folders", () => {
  test("lists notes in subfolders at any depth, empty folders too, and leaves out interrupted saves and hidden folders", async () => {
    put("bloommd/Heimsuchung.md", note("Heimsuchung"));
    put("bloommd/Uni/Physik.md", note("Physik"));
    put("bloommd/Uni/Physik/Optik/Linsen.md", note("Linsen"));
    put("bloommd/Uni/Physik.md.tmp", "halb");
    put("bloommd/Uni/Physik.md.bak", "alt");
    put("bloommd/Über uns/Größe & Form.md", note("Größe & Form"));
    put("bloommd/Uni/bild.png");
    put("bloommd/.obsidian/workspace.md", note("intern"));
    put("bloommd/node_modules/x/readme.md", note("dep"));
    dirs.add("bloommd/Leer");
    dirs.add("bloommd/Uni/Leer & Co");

    const { entries, folders, unreadable } = await createAppStore().list();
    expect(entries.map((entry) => [entry.path, entry.folder, entry.title]).sort()).toEqual([
      ["Heimsuchung.md", "", "Heimsuchung"],
      ["Uni/Physik.md", "Uni", "Physik"],
      ["Uni/Physik/Optik/Linsen.md", "Uni/Physik/Optik", "Linsen"],
      ["Über uns/Größe & Form.md", "Über uns", "Größe & Form"],
    ].sort());
    expect(folders).toEqual(["Leer", "Über uns", "Uni", "Uni/Leer & Co", "Uni/Physik", "Uni/Physik/Optik"]);
    expect(unreadable).toEqual([]);
  });

  test("an unreadable note is reported with its path and does not stop the listing", async () => {
    put("bloommd/Uni/Gut.md", note("Gut"));
    put("bloommd/Uni/Kaputt.md", note("Kaputt"));
    const original = filesystem.readFile;
    filesystem.readFile = async (options) => {
      if (options.path.endsWith("Kaputt.md")) throw new Error("unreadable");
      return original(options);
    };
    try {
      const { entries, unreadable } = await createAppStore().list();
      expect(entries.map((entry) => entry.path)).toEqual(["Uni/Gut.md"]);
      expect(unreadable).toEqual(["Uni/Kaputt.md"]);
    } finally {
      filesystem.readFile = original;
    }
  });

  test("creating a folder creates exactly that folder, nested, with no file in it", async () => {
    const store = createAppStore();
    expect(await store.createFolder("Uni/Physik/Optik")).toBe("Uni/Physik/Optik");
    expect(dirs.has("bloommd/Uni/Physik/Optik")).toBe(true);
    expect(files.size).toBe(0);
    // Again: no error, nothing changes.
    expect(await store.createFolder("Uni/Physik")).toBe("Uni/Physik");
    expect((await store.list()).folders).toEqual(["Uni", "Uni/Physik", "Uni/Physik/Optik"]);
  });

  test("creating a folder over a file, a hidden folder or a path with traversal is refused", async () => {
    put("bloommd/Notiz");
    const store = createAppStore();
    await expect(store.createFolder("Notiz")).rejects.toThrow();
    await expect(store.createFolder(".obsidian")).rejects.toBeInstanceOf(SkippedFolderError);
    await expect(store.createFolder("Uni/node_modules")).rejects.toBeInstanceOf(SkippedFolderError);
    calls.length = 0;
    for (const path of ["..", "../Draussen", "Uni/../../Draussen", "/abs", "C:/Windows", "Uni/./x", "", "A\u0000B"]) await expect(store.createFolder(path)).rejects.toThrow();
    expect(calls.filter((call) => call.startsWith("mkdir") && call !== "mkdir bloommd")).toEqual([]);
    expect(dirs.has("bloommd/Draussen")).toBe(false);
  });
});

describe("app store: notes in folders", () => {
  test("a note is written, read and deleted at its path in the subfolder", async () => {
    const store = createAppStore();
    const path = store.pathFor("Linsen.md", "Uni/Physik/Optik");
    expect(path).toBe("Uni/Physik/Optik/Linsen.md");
    const document = parseFile(path, note("Linsen"));
    await store.save({ document, baseline: "" }, document);
    expect(files.has("bloommd/Uni/Physik/Optik/Linsen.md")).toBe(true);
    expect([...files.keys()].filter((file) => !file.startsWith("bloommd/Uni/Physik/Optik/"))).toEqual([]);

    const loaded = await store.read(path);
    expect(loaded.document.filePath).toBe(path);
    expect(loaded.document.frontmatter.title).toBe("Linsen");

    await store.remove(path);
    expect(files.size).toBe(0);
    expect(dirs.has("bloommd/Uni/Physik/Optik")).toBe(true);
  });

  test("saving over a note keeps temporary file and backup in the note's folder", async () => {
    const store = createAppStore();
    const path = "Uni/Physik.md";
    const document = parseFile(path, note("Physik"));
    await store.save({ document, baseline: "" }, document);
    const edited = parseFile(path, `${note("Physik")}\nNeuer Text.\n`);
    await store.save({ document, baseline: "" }, edited);

    expect(files.get("bloommd/Uni/Physik.md")).toContain("Neuer Text.");
    expect(files.get("bloommd/Uni/Physik.md.bak")).not.toContain("Neuer Text.");
    expect(files.has("bloommd/Uni/Physik.md.tmp")).toBe(false);
    expect([...files.keys()].filter((file) => !file.startsWith("bloommd/Uni/"))).toEqual([]);
    // The leftovers of a save are no notes.
    expect((await store.list()).entries.map((entry) => entry.path)).toEqual(["Uni/Physik.md"]);
  });

  test("a failed replace restores the note in its folder and removes the temporary file", async () => {
    put("bloommd/Uni/Physik.md", note("Physik"));
    const original = filesystem.rename;
    filesystem.rename = async () => { throw new Error("disk full"); };
    try {
      const store = createAppStore();
      const edited = parseFile("Uni/Physik.md", `${note("Physik")}\nNeuer Text.\n`);
      await expect(store.save({ document: parseFile("Uni/Physik.md", note("Physik")), baseline: "" }, edited)).rejects.toThrow("disk full");
    } finally {
      filesystem.rename = original;
    }
    expect(files.get("bloommd/Uni/Physik.md")).toBe(note("Physik"));
    expect(files.has("bloommd/Uni/Physik.md.tmp")).toBe(false);
  });

  test("reading, deleting and saving a path that leaves the app folder is refused before any file is touched", async () => {
    const store = createAppStore();
    for (const path of bad) {
      calls.length = 0;
      await expect(store.read(path)).rejects.toThrow();
      await expect(store.remove(path)).rejects.toThrow();
      const document = parseFile("Notiz.md", note("Notiz"));
      await expect(store.save({ document: { ...document, filePath: path }, baseline: "x" }, { ...document, filePath: path })).rejects.toThrow();
      expect(calls.filter((call) => /^(readFile|writeFile|deleteFile)/.test(call))).toEqual([]);
    }
    expect(files.size).toBe(0);
  });

  test("pathFor refuses a folder or a name that leaves the app folder", () => {
    const store = createAppStore();
    expect(store.pathFor("Neu.md")).toBe("Neu.md");
    expect(store.pathFor("Neu.md", "")).toBe("Neu.md");
    expect(store.pathFor("Neu.md", "Uni/Physik/")).toBe("Uni/Physik/Neu.md");
    expect(store.pathFor("Neu", "Über uns/Größe")).toBe("Über uns/Größe/Neu.md");
    expect(() => store.pathFor("Neu.md", "..")).toThrow();
    expect(() => store.pathFor("Neu.md", "../..")).toThrow();
    expect(() => store.pathFor("Neu.md", "/abs")).toThrow();
    expect(() => store.pathFor("../Neu.md", "Uni")).toThrow();
  });

  test("a conflict copy lands next to its note and only names in that folder count as taken", async () => {
    put("bloommd/A/Physik.md", note("Physik"));
    put("bloommd/A/Physik (iPad-Konflikt).md", note("Physik"));
    put("bloommd/B/Physik.md", note("Physik"));
    const store = createAppStore();

    const copyInA = await store.saveCopy(parseFile("A/Physik.md", note("Physik")), "iPad-Konflikt");
    expect(copyInA).toBe("A/Physik (iPad-Konflikt 2).md");
    // "A/Physik (iPad-Konflikt).md" exists, "B/Physik (iPad-Konflikt).md" does not: the first free name there is the first one.
    const copyInB = await store.saveCopy(parseFile("B/Physik.md", note("Physik")), "iPad-Konflikt");
    expect(copyInB).toBe("B/Physik (iPad-Konflikt).md");
    const copyAtTop = await store.saveCopy(parseFile("Physik.md", note("Physik")), "iPad-Konflikt");
    expect(copyAtTop).toBe("Physik (iPad-Konflikt).md");
    expect(files.has("bloommd/A/Physik (iPad-Konflikt 2).md")).toBe(true);
    expect(files.has("bloommd/B/Physik (iPad-Konflikt).md")).toBe(true);
    // The copy is a note of its own: its own id.
    expect(parseFile(copyInB, files.get("bloommd/B/Physik (iPad-Konflikt).md")!).frontmatter.id).not.toBe("physik");
  });
});
