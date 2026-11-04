import { describe, expect, test } from "bun:test";
import { detectSharedFolderActivity, type SharedFolderBoundFile } from "./shared-folder-activity";

const bound = (relativePath: string, hash = `hash-${relativePath}`): SharedFolderBoundFile => ({
  relativePath,
  documentId: `doc-${relativePath}`,
  cloudFilename: relativePath.split("/").join("__"),
  contentHash: hash,
});
const local = (relativePath: string, sizeBytes = 10) => ({ relativePath, sizeBytes });

function detect(options: {
  bound: SharedFolderBoundFile[];
  local: string[];
  known?: string[];
  hashes?: Record<string, string>;
  split?: string[];
}) {
  const reads: string[] = [];
  const entries = detectSharedFolderActivity({
    bound: options.bound,
    knownPaths: new Set(options.known ?? []),
    local: options.local.map((path) => local(path)),
    splitRenames: new Set(options.split ?? []),
    hashOf: async (path) => { reads.push(path); return options.hashes?.[path] ?? null; },
  });
  return entries.then((result) => ({ result, reads }));
}

describe("detectSharedFolderActivity", () => {
  test("reports nothing when the folder matches the published files", async () => {
    const { result, reads } = await detect({ bound: [bound("a.md")], local: ["a.md"], known: ["a.md", "excluded.md"] });
    expect(result).toEqual([]);
    expect(reads).toEqual([]);
  });

  test("reports an unknown local file as new and ignores excluded, blocked and dismissed ones", async () => {
    const { result } = await detect({ bound: [bound("a.md")], local: ["a.md", "new.md", "excluded.md", "dismissed.md"], known: ["a.md", "excluded.md", "dismissed.md"] });
    expect(result).toEqual([{ kind: "new", local: local("new.md") }]);
  });

  test("reports a missing published file as removed and reads no content for it", async () => {
    const { result, reads } = await detect({ bound: [bound("a.md"), bound("b.md")], local: ["a.md"] });
    expect(result).toEqual([{ kind: "removed", file: bound("b.md") }]);
    expect(reads).toEqual([]);
  });

  test("recognises a rename only when exactly one removed and one new file share the content", async () => {
    const { result } = await detect({
      bound: [bound("old.md", "h1")],
      local: ["moved/new.md"],
      hashes: { "moved/new.md": "h1" },
    });
    expect(result).toEqual([{ kind: "renamed", file: bound("old.md", "h1"), to: local("moved/new.md") }]);
  });

  test("a file published without a content fingerprint is never guessed as renamed", async () => {
    const { result } = await detect({ bound: [{ ...bound("old.md"), contentHash: null }], local: ["new.md"], hashes: { "new.md": "hash-old.md" } });
    expect(result.map((entry) => entry.kind)).toEqual(["removed", "new"]);
  });

  test("keeps new plus removed when the content differs or cannot be read", async () => {
    const differs = await detect({ bound: [bound("old.md", "h1")], local: ["new.md"], hashes: { "new.md": "h2" } });
    expect(differs.result.map((entry) => entry.kind)).toEqual(["removed", "new"]);
    const unreadable = await detect({ bound: [bound("old.md", "h1")], local: ["new.md"] });
    expect(unreadable.result.map((entry) => entry.kind)).toEqual(["removed", "new"]);
  });

  test("does not guess when several files share the same content", async () => {
    const twoNew = await detect({ bound: [bound("old.md", "h1")], local: ["x.md", "y.md"], hashes: { "x.md": "h1", "y.md": "h1" } });
    expect(twoNew.result.map((entry) => entry.kind)).toEqual(["removed", "new", "new"]);
    const twoRemoved = await detect({ bound: [bound("a.md", "h1"), bound("b.md", "h1")], local: ["x.md"], hashes: { "x.md": "h1" } });
    expect(twoRemoved.result.map((entry) => entry.kind)).toEqual(["removed", "removed", "new"]);
  });

  test("a rename the person split stays a new file plus a removed one", async () => {
    const { result, reads } = await detect({ bound: [bound("old.md", "h1")], local: ["new.md"], hashes: { "new.md": "h1" }, split: ["new.md"] });
    expect(result.map((entry) => entry.kind)).toEqual(["removed", "new"]);
    expect(reads).toEqual([]);
  });

  test("orders entries deterministically by path", async () => {
    const { result } = await detect({ bound: [bound("z.md"), bound("m.md")], local: ["b.md", "a.md"] });
    expect(result.map((entry) => entry.kind === "new" ? entry.local.relativePath : entry.file.relativePath)).toEqual(["m.md", "z.md", "a.md", "b.md"]);
  });
});
