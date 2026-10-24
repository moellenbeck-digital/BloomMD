import { expect, test } from "bun:test";
import { parseFile } from "./parser";
import { buildWorkspaceGraph, WorkspaceGraphCache, type WorkspaceFileInput } from "./workspace-graph";
import { buildWorkspaceMindMap, WorkspaceDocumentCache } from "./workspace-document";

function compareWorkspace(files: WorkspaceFileInput[], cache: WorkspaceDocumentCache, parsedDocuments: Map<string, ReturnType<typeof parseFile>>) {
  const cached = buildWorkspaceMindMap(files, { cache, parsedDocuments });
  const fresh = buildWorkspaceMindMap(files, { parsedDocuments });
  expect(cached.nodes).toEqual(fresh.nodes);
  expect(cached.references).toEqual(fresh.references);
  return cached;
}

test("cached graph updates changed content, broken links, ambiguity, renames and deletions", () => {
  const cache = new WorkspaceGraphCache();
  const files = [{ path: "source.md", markdown: "# Source\n[[Target#Heading]]\n" }];
  const check = () => expect(buildWorkspaceGraph(files, cache)).toEqual(buildWorkspaceGraph(files));
  check();
  const links = cache.files.get("source.md")!.links;
  files.push({ path: "a/Target.md", markdown: "# Target\n## Heading\n" });
  check();
  expect(cache.files.get("source.md")!.links).toBe(links);
  files.push({ path: "b/Target.md", markdown: "# Other target\n" });
  check();
  expect(cache.files.get("source.md")!.references[0]!.resolution).toBe("ambiguous");
  files[2]!.path = "b/Renamed.md";
  check();
  expect(cache.files.get("source.md")!.references[0]!.resolution).toBe("resolved");
  files[0]!.markdown = "# Source\n[[Renamed]]\n";
  check();
  expect(cache.files.get("source.md")!.links).not.toBe(links);
  files.pop();
  check();
  expect(cache.files.has("b/Renamed.md")).toBe(false);
  expect(cache.files.get("source.md")!.references[0]!.resolution).toBe("broken");
});

test("workspace reuses unchanged heading contributions and refreshes dependent reference endpoints", () => {
  const cache = new WorkspaceDocumentCache();
  const files = [
    { path: "Source.md", markdown: "# Source\n[[Target#Old]]\n" },
    { path: "Target.md", markdown: "# Target\n## Old\n" },
  ];
  const parsed = new Map(files.map((file) => [file.path, parseFile(file.path, file.markdown)]));
  const first = compareWorkspace(files, cache, parsed);
  const unchanged = cache.files.get("Source.md");
  // A caller may edit a returned graph without poisoning subsequent cached reads.
  first.nodes.get(first.rootId)!.title = "Modified";
  first.nodes.get("file:Source.md")!.children.length = 0;
  const heading = [...first.nodes.values()].find((node) => node.parentId === "file:Target.md")!;
  heading.title = "Modified heading";
  compareWorkspace(files, cache, parsed);
  expect(cache.files.get("Source.md")).toBe(unchanged);
  files[1]!.markdown = "# Target\n## New\n";
  parsed.set("Target.md", parseFile("Target.md", files[1]!.markdown));
  const updated = compareWorkspace(files, cache, parsed);
  expect(cache.files.get("Source.md")).toBe(unchanged);
  expect(updated.references![0]!.targetId).toBe("file:Target.md");
  files.pop();
  parsed.delete("Target.md");
  compareWorkspace(files, cache, parsed);
  expect(cache.files.has("Target.md")).toBe(false);
});
