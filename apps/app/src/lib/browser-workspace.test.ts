import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BrowserWorkspace } from "./browser-workspace";

/**
 * Minimal stand-ins for the File System Access API.
 *
 * Bun has no DOM, so the handles are modelled directly. That is enough: what these tests care about
 * is which permissions get asked for and whether anything is sent over the network — neither needs
 * a real browser.
 */
function fileHandle(name: string, contents: string, permission: "granted" | "prompt" | "denied" = "granted") {
  return {
    kind: "file" as const,
    name,
    getFile: async () => ({ text: async () => contents }),
    queryPermission: async () => permission,
    requestPermission: async () => permission,
    createWritable: async () => ({
      written: [] as string[],
      async write(value: string) {
        this.written.push(value);
      },
      async close() {},
      async abort() {},
    }),
  };
}

function directoryHandle(
  name: string,
  entries: Array<[string, ReturnType<typeof fileHandle>]>,
  permission: { read: "granted" | "denied"; readwrite: "granted" | "denied" } = { read: "granted", readwrite: "granted" },
) {
  // Records what was created, so a test can assert the shape of the directory tree.
  const created: string[] = [];
  const children = new Map<string, ReturnType<typeof directoryHandle>>();

  const handle = {
    kind: "directory" as const,
    name,
    created,
    entries: async function* () {
      for (const entry of entries) yield entry;
    },
    async getDirectoryHandle(segment: string, options?: { create?: boolean }) {
      if (!children.has(segment)) {
        if (!options?.create) throw new Error(`No such directory: ${segment}`);
        created.push(segment);
        children.set(segment, directoryHandle(segment, [], permission));
      }
      return children.get(segment)!;
    },
    async getFileHandle(fileName: string, options?: { create?: boolean }) {
      if (!options?.create) throw new Error(`No such file: ${fileName}`);
      created.push(fileName);
      return fileHandle(fileName, "");
    },
    queryPermission: async (options?: { mode?: string }) =>
      options?.mode === "readwrite" ? permission.readwrite : permission.read,
    requestPermission: async (options?: { mode?: string }) =>
      options?.mode === "readwrite" ? permission.readwrite : permission.read,
  };
  return handle;
}

const originalFetch = globalThis.fetch;
let networkCalls: string[] = [];

beforeEach(() => {
  networkCalls = [];
  globalThis.fetch = (async (input: unknown) => {
    networkCalls.push(String(input));
    throw new Error("No network call is allowed here.");
  }) as unknown as typeof fetch;

  const objectUrls: string[] = [];
  (globalThis as { URL: typeof URL }).URL.createObjectURL = () => {
    const url = `blob:mock/${objectUrls.length}`;
    objectUrls.push(url);
    return url;
  };
  (globalThis as { URL: typeof URL }).URL.revokeObjectURL = () => {};
  (globalThis as { window?: unknown }).window = { open: () => null, setTimeout: () => 0 };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("permission state", () => {
  test("reports read-write when the folder was granted write access", async () => {
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    expect(await workspace.permissionState()).toBe("readwrite");
  });

  test("reports read-only when only read was granted", async () => {
    // The first failed save is a poor moment to learn the folder is read-only.
    const root = directoryHandle("vault", [], { read: "granted", readwrite: "denied" });
    const workspace = new BrowserWorkspace(root as never);
    expect(await workspace.permissionState()).toBe("read");
  });

  test("reports denied when neither mode was granted", async () => {
    const root = directoryHandle("vault", [], { read: "denied", readwrite: "denied" });
    const workspace = new BrowserWorkspace(root as never);
    expect(await workspace.permissionState()).toBe("denied");
  });

  test("refuses to refresh when read access was denied", async () => {
    const root = directoryHandle("vault", [], { read: "denied", readwrite: "denied" });
    const workspace = new BrowserWorkspace(root as never);
    await expect(workspace.refresh()).rejects.toThrow(/denied/i);
  });
});

describe("local handoff stays local", () => {
  test("opening an attachment performs no network request", async () => {
    const pdf = fileHandle("paper.pdf", "%PDF-1.4");
    const root = directoryHandle("vault", [
      ["note.md", fileHandle("note.md", "# Note")],
      ["paper.pdf", pdf],
    ]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();

    await workspace.openResource("paper.pdf");

    // The bytes must never leave the machine — that is the entire promise of local handoff.
    expect(networkCalls).toEqual([]);
  });

  test("a local attachment can provide a preview object URL without a network request", async () => {
    const image = fileHandle("diagram.png", "PNG");
    const root = directoryHandle("vault", [
      ["note.md", fileHandle("note.md", "# Note")],
      ["diagram.png", image],
    ]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();

    expect(await workspace.resourceObjectUrl("diagram.png")).toBe("blob:mock/0");
    expect(networkCalls).toEqual([]);
  });

  test("preview URLs refuse files outside the workspace", async () => {
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await expect(workspace.resourceObjectUrl("../../etc/passwd")).rejects.toThrow(/not part of this workspace/);
  });

  test("reading a Markdown file performs no network request", async () => {
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    expect(await workspace.read("note.md")).toBe("# Note");
    expect(networkCalls).toEqual([]);
  });

  test("a file outside the workspace cannot be opened", async () => {
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await expect(workspace.openResource("../../etc/passwd")).rejects.toThrow(/not part of this workspace/);
  });
});

describe("write access", () => {
  test("a write is refused when permission is denied", async () => {
    const denied = fileHandle("note.md", "# Note", "denied");
    const root = directoryHandle("vault", [["note.md", denied]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await expect(workspace.write("note.md", "# Changed")).rejects.toThrow(/denied/i);
  });

  test("writing a file that is not part of the workspace is refused", async () => {
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await expect(workspace.write("elsewhere.md", "# Nope")).rejects.toThrow(/not part of this workspace/);
  });
});

describe("creating folders and files", () => {
  test("creates a nested folder", async () => {
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    expect(await workspace.createFolder("Buch/Teil-1")).toBe("Buch/Teil-1");
    expect(root.created).toContain("Buch");
  });

  test("refuses a traversing folder path", async () => {
    // The File System Access API would happily accept `..` as a literal directory name.
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    await expect(workspace.createFolder("../escape")).rejects.toThrow(/traverse|Folder/i);
  });

  test("refuses an absolute folder path", async () => {
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    await expect(workspace.createFolder("/etc")).rejects.toThrow();
  });

  test("refuses to create anything without write permission", async () => {
    const root = directoryHandle("vault", [], { read: "granted", readwrite: "denied" });
    const workspace = new BrowserWorkspace(root as never);
    await expect(workspace.createFolder("Neu")).rejects.toThrow(/Schreibzugriff/);
  });

  test("creates a file and appends the extension", async () => {
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    expect(await workspace.createFile("Notiz", "# Notiz\n")).toBe("Notiz.md");
  });

  test("creates the folders on the way to a nested file", async () => {
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    expect(await workspace.createFile("Buch/Teil-1/Kapitel", "# K\n")).toBe("Buch/Teil-1/Kapitel.md");
    expect(root.created).toContain("Buch");
  });

  test("refuses to overwrite an existing file", async () => {
    // The browser has no trash: a "new file" that silently replaces one loses work for good.
    const root = directoryHandle("vault", [["note.md", fileHandle("note.md", "# Note")]]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await expect(workspace.createFile("note.md", "# Neu\n")).rejects.toThrow(/gibt es bereits/);
  });

  test("a created file is immediately part of the workspace", async () => {
    const root = directoryHandle("vault", []);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await workspace.createFile("Neu.md", "# Neu\n");
    expect(await workspace.read("Neu.md")).toBe("");
  });

  test("folders() derives the folder list from the files present", async () => {
    const root = directoryHandle("vault", [
      ["a.md", fileHandle("a.md", "# A")],
    ]);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    await workspace.createFile("Buch/Teil-1/k.md", "# K\n");
    expect(workspace.folders()).toEqual(["Buch", "Buch/Teil-1"]);
  });
});

describe("readTemplates", () => {
  const vorlagen = () =>
    directoryHandle("Vorlagen", [
      ["Wochenplan.md", fileHandle("Wochenplan.md", "# {{title}}\n{{date}}\n")],
      ["Brief.md", fileHandle("Brief.md", "# {{title}}\n{{name}}\n")],
      ["notizen.txt", fileHandle("notizen.txt", "ignored")],
    ]);

  test("reads the .md files directly inside Vorlagen at the workspace root, sorted", async () => {
    const archive = directoryHandle("Archiv", [["Alt.md", fileHandle("Alt.md", "# old")]]);
    const root = directoryHandle("vault", [
      ["Normal.md", fileHandle("Normal.md", "# Normal")],
      ["Vorlagen", vorlagen()],
      ["Uni", directoryHandle("Uni", [["Vorlagen", archive]] as never)],
    ] as never);
    const workspace = new BrowserWorkspace(root as never);
    await workspace.refresh();
    expect(await workspace.readTemplates()).toEqual([
      { path: "Vorlagen/Brief.md", content: "# {{title}}\n{{name}}\n" },
      { path: "Vorlagen/Wochenplan.md", content: "# {{title}}\n{{date}}\n" },
    ]);
  });

  test("does not search sub-folders of Vorlagen", async () => {
    const nested = directoryHandle("Vorlagen", [
      ["Top.md", fileHandle("Top.md", "# Top")],
      ["Archiv", directoryHandle("Archiv", [["Alt.md", fileHandle("Alt.md", "# old")]])],
    ] as never);
    const workspace = new BrowserWorkspace(directoryHandle("vault", [["Vorlagen", nested]] as never) as never);
    await workspace.refresh();
    expect((await workspace.readTemplates()).map((template) => template.path)).toEqual(["Vorlagen/Top.md"]);
  });

  test("a workspace without the folder has no templates and raises no error", async () => {
    const workspace = new BrowserWorkspace(directoryHandle("vault", [["Normal.md", fileHandle("Normal.md", "# N")]]) as never);
    await workspace.refresh();
    expect(await workspace.readTemplates()).toEqual([]);
  });
});
