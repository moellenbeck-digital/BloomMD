import { expect, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import { resolveWorkspaceSourceNode } from "@bloommd/ui/workspace-source";
import { readMobileOverview } from "./workspace-overview";
import type { MobileStore } from "./stores";

function fixture() {
  const reads: string[] = [];
  const contents: Record<string, string> = { "Team/Plan.md": "# Plan\n\n## Gleich\n\nEins\n\n## Gleich\n\nZwei\n", "Elsewhere/Plan.md": "# Other" };
  const store: MobileStore = {
    name: "Vault", kind: "folder",
    list: async () => ({ entries: Object.keys(contents).map((path) => ({ path, title: path, folder: path.split("/")[0]!, local: true })), folders: ["Team", "Team/Leer", "Elsewhere"], unreadable: [] }),
    read: async (path) => { reads.push(path); return { document: parseFile(path, contents[path]!), baseline: contents[path]! }; },
    createFolder: async () => { throw new Error("Unexpected write"); }, save: async () => { throw new Error("Unexpected write"); },
    remove: async () => { throw new Error("Unexpected write"); }, saveCopy: async () => { throw new Error("Unexpected write"); }, pathFor: (name) => name,
  };
  return { store, reads, contents };
}

test("mobile overview reads only the selected tree, keeps empty folders and performs no writes", async () => {
  const { store, reads } = fixture();
  const { document } = await readMobileOverview(store, "Team");
  expect(reads).toEqual(["Team/Plan.md"]);
  expect(document.derived?.writable).toBe(false);
  expect(document.nodes.get(document.rootId)?.title).toBe("Team");
  expect([...document.nodes.values()].filter((node) => node.metadata?.kind === "folder").map((node) => node.metadata?.file)).toEqual(["Team/Leer"]);
  expect(document.nodes.get(document.rootId)?.children).toContain("folder:Team/Leer");
});

test("duplicate section titles resolve to their own content and stale previews fail closed", async () => {
  const { store, contents } = fixture();
  const { document } = await readMobileOverview(store, "Team");
  const heading = [...document.nodes.values()].find((node) => node.title === "Gleich" && node.content.includes("Zwei"))!;
  const target = { file: "Team/Plan.md", heading: { id: heading.id, content: heading.content } };
  const source = (await store.read(target.file)).document;
  expect(source.nodes.get(resolveWorkspaceSourceNode(source, target)!)?.content).toContain("Zwei");
  contents[target.file] = contents[target.file]!.replace("Zwei", "Geändert");
  expect(resolveWorkspaceSourceNode((await store.read(target.file)).document, target)).toBeUndefined();
});

test("single-file access cannot be treated as a writable folder", async () => {
  const { store } = fixture();
  await expect(readMobileOverview({ ...store, kind: "file" }, "")).rejects.toThrow("single file");
});
