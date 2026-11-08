import { describe, expect, test } from "bun:test";
import { PlatformError } from "@bloommd/ui";
import { createDesktopPlatformAdapter, type DesktopFileRpc } from "./platform-adapter";

const SERIALIZED = {
  filePath: "plan.md",
  frontmatter: { title: "Plan", id: "p1", created: "", updated: "" },
  nodes: { root: { id: "root", title: "Plan", content: "", children: [], parentId: null } },
  rootId: "root",
};

function fakeRpc(overrides: Partial<DesktopFileRpc> = {}) {
  const calls: unknown[][] = [];
  const record = <T,>(name: string, result: T) => async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return result;
  };
  const rpc = {
    listMindmaps: record("list", { files: [{ filename: "plan.md" }] }),
    openMindmap: record("open", SERIALIZED),
    createMindmap: record("create", SERIALIZED),
    saveMindmap: record("save", { success: true }),
    deleteMindmap: record("delete", { success: true }),
    renameMindmap: record("rename", { success: true, newFilePath: "b.md", newFilename: "b.md", version: 2 }),
    fetchLinkPreview: record("preview", { preview: { url: "https://x.test", finalUrl: "https://x.test", title: "X" } }),
    ...overrides,
  } as unknown as DesktopFileRpc;
  return { rpc, calls };
}

describe("desktop platform adapter", () => {
  test("@t79 every file operation is one RPC request to the main process", async () => {
    const { rpc, calls } = fakeRpc();
    const adapter = createDesktopPlatformAdapter(rpc);

    expect((await adapter.files.list()).map((entry) => entry.filename)).toEqual(["plan.md"]);
    expect((await adapter.files.read("plan.md")).nodes.get("root")?.title).toBe("Plan");
    await adapter.files.create("new.md", "# New");
    await adapter.files.write("plan.md", "# Plan");
    expect(await adapter.files.rename("plan.md", "b.md")).toEqual({ filename: "b.md", version: 2 });
    await adapter.files.remove("plan.md");
    expect((await adapter.api.linkPreview("https://x.test")).title).toBe("X");

    expect(calls.map((call) => call[0])).toEqual(["list", "open", "create", "save", "rename", "delete", "preview"]);
    expect(calls[2]).toEqual(["create", "new.md", "# New"]);
    expect(calls[4]).toEqual(["rename", "plan.md", "b.md"]);
  });

  test("@t91 the link preview RPC receives the URL and nothing else", async () => {
    const { rpc, calls } = fakeRpc();
    await createDesktopPlatformAdapter(rpc).api.linkPreview("https://x.test/page");
    expect(calls).toEqual([["preview", "https://x.test/page"]]);
  });

  test("@t79 write passes the cloud version metadata through and returns the new one", async () => {
    const storage = { mode: "database" as const, documentId: "d", workspaceId: "w", version: 3 };
    const { rpc, calls } = fakeRpc({ saveMindmap: (async (...args: unknown[]) => {
      calls.push(["save", ...args]);
      return { success: true, storage: { ...storage, version: 4 } };
    }) as DesktopFileRpc["saveMindmap"] });
    const result = await createDesktopPlatformAdapter(rpc).files.write("plan.md", "# Plan", { storage });
    expect(calls[0]).toEqual(["save", "plan.md", "# Plan", storage]);
    expect(result.storage?.version).toBe(4);
  });

  test("@t79 an unsuccessful save is a PlatformError; a version conflict keeps its code", async () => {
    const conflict = fakeRpc({ saveMindmap: async () => ({ success: false, error: "VERSION_CONFLICT" }) });
    expect(await createDesktopPlatformAdapter(conflict.rpc).files.write("a.md", "#").catch((error: unknown) => error)).toMatchObject({ code: "conflict" });
    const other = fakeRpc({ saveMindmap: async () => ({ success: false, error: "disk full" }) });
    const error = await createDesktopPlatformAdapter(other.rpc).files.write("a.md", "#").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ code: "unavailable", message: "disk full" });
  });

  test("@t79 a failed link preview and a failed RPC request are PlatformErrors", async () => {
    const preview = fakeRpc({ fetchLinkPreview: async () => ({ error: "The URL did not return an HTML page." }) });
    expect(await createDesktopPlatformAdapter(preview.rpc).api.linkPreview("https://x.test").catch((error: unknown) => error)).toMatchObject({ message: "The URL did not return an HTML page." });
    const broken = fakeRpc({ listMindmaps: async () => { throw new Error("RPC request timed out."); } });
    expect(await createDesktopPlatformAdapter(broken.rpc).files.list().catch((error: unknown) => error)).toMatchObject({ code: "unavailable", message: "RPC request timed out." });
  });

  test("@t79 deleting a file the main process could not delete fails", async () => {
    const refused = fakeRpc({ deleteMindmap: async () => ({ success: false }) });
    expect(await createDesktopPlatformAdapter(refused.rpc).files.remove("a.md").catch((error: unknown) => error)).toBeInstanceOf(PlatformError);
  });
});
