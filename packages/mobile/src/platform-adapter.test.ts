import { describe, expect, test } from "bun:test";
import { parseFile } from "@bloommd/core/browser";
import type { MobileRemoteClient } from "./remote-client";
import type { MobileStore } from "./stores";
import { createMobilePlatformAdapter, mobileFileSource } from "./platform-adapter";

const FRONTMATTER = { title: "Plan", id: "p", created: "", updated: "" };

function fakeStore(): MobileStore {
  return {
    kind: "app",
    name: "app",
    list: async () => ({
      entries: [
        { path: "Schule/plan.md", title: "Plan", folder: "Schule", local: true, frontmatter: FRONTMATTER },
        { path: "cloud-only.md", title: "cloud-only", folder: "", local: false },
      ],
      folders: [],
      unreadable: [],
    }),
    read: async (path) => ({ document: parseFile(path, "# Plan\n"), baseline: "" }),
  } as unknown as MobileStore;
}

describe("mobile platform adapter", () => {
  test("@t79 a local store lists notes with frontmatter and reads through the store", async () => {
    const adapter = createMobilePlatformAdapter(() => mobileFileSource({ remote: null, store: fakeStore() }));
    expect(await adapter.files.list()).toEqual([{ filename: "Schule/plan.md", frontmatter: FRONTMATTER }]);
    expect((await adapter.files.read("Schule/plan.md")).filePath).toBe("Schule/plan.md");
  });

  test("@t79 the signed-in cloud wins over the local store, decided per call", async () => {
    const remote = {
      list: async () => [{ filename: "remote.md", frontmatter: FRONTMATTER }],
      read: async (path: string) => parseFile(path, "# Remote\n"),
    } as unknown as MobileRemoteClient;
    let signedIn = false;
    const adapter = createMobilePlatformAdapter(() => mobileFileSource({ remote: signedIn ? remote : null, store: fakeStore() }));
    expect((await adapter.files.list()).map((entry) => entry.filename)).toEqual(["Schule/plan.md"]);
    signedIn = true;
    expect((await adapter.files.list()).map((entry) => entry.filename)).toEqual(["remote.md"]);
  });

  test("@t79 writing and the link preview fail clearly instead of reaching for /api", async () => {
    const adapter = createMobilePlatformAdapter(() => mobileFileSource({ remote: null, store: fakeStore() }));
    for (const attempt of [
      () => adapter.files.create("a.md", "#"),
      () => adapter.files.write("a.md", "#"),
      () => adapter.files.remove("a.md"),
      () => adapter.files.rename("a.md", "b.md"),
      () => adapter.api.linkPreview("https://example.com"),
    ]) {
      expect(await attempt().catch((error: unknown) => error)).toMatchObject({ code: "unsupported" });
    }
  });
});
