import { describe, expect, test } from "bun:test";
import { SharedDocumentMirror } from "./shared-document-mirror";
import { hashSharedDocumentMarkdown, type SharedDocumentBinding } from "./shared-document-binding";
import { parseFile, serializeToMarkdown } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";

function hash(markdown: string): string {
  return `hash:${markdown}`;
}

function binding(overrides: Partial<SharedDocumentBinding> = {}): SharedDocumentBinding {
  return {
    schemaVersion: 1,
    workspaceId: "workspace-1",
    documentId: "document-1",
    cloudFilename: "shared.md",
    lastAcknowledgedMarkdownHash: hash("base"),
    lastKnownCloudVersion: 1,
    connectionState: "connected",
    ...overrides,
  };
}

describe("shared document mirror", () => {
  test("writes a remote update once and treats the resulting watcher event as an echo", async () => {
    let localMarkdown = "base";
    const writes: string[] = [];
    const publishes: string[] = [];
    const mirror = new SharedDocumentMirror({
      binding: binding(),
      hashMarkdown: hash,
      file: {
        readMarkdown: async () => localMarkdown,
        writeMarkdown: async (markdown) => { writes.push(markdown); localMarkdown = markdown; },
      },
      publishLocalMarkdown: async (markdown) => { publishes.push(markdown); return { kind: "acknowledged", cloudVersion: 2 }; },
    });

    await expect(mirror.applyRemoteMarkdown("remote", 2)).resolves.toEqual({ kind: "mirrored", cloudVersion: 2 });
    await expect(mirror.handleLocalMarkdown(localMarkdown)).resolves.toEqual({ kind: "echo" });
    expect(writes).toEqual(["remote"]);
    expect(publishes).toEqual([]);
    expect(mirror.getBinding()).toMatchObject({ lastAcknowledgedMarkdownHash: hash("remote"), lastKnownCloudVersion: 2 });
  });

  test("publishes a local update with the acknowledged cloud version", async () => {
    const expectedVersions: number[] = [];
    const mirror = new SharedDocumentMirror({
      binding: binding({ lastKnownCloudVersion: 7 }),
      hashMarkdown: hash,
      file: { readMarkdown: async () => "base", writeMarkdown: async () => undefined },
      publishLocalMarkdown: async (_markdown, expectedVersion) => {
        expectedVersions.push(expectedVersion);
        return { kind: "acknowledged", cloudVersion: 8 };
      },
    });

    await expect(mirror.handleLocalMarkdown("local edit")).resolves.toEqual({ kind: "published", cloudVersion: 8 });
    expect(expectedVersions).toEqual([7]);
    expect(mirror.getBinding()).toMatchObject({ lastAcknowledgedMarkdownHash: hash("local edit"), lastKnownCloudVersion: 8, connectionState: "connected" });
  });

  test("does not overwrite a concurrent local change with a remote update", async () => {
    const writes: string[] = [];
    const mirror = new SharedDocumentMirror({
      binding: binding(),
      hashMarkdown: hash,
      file: { readMarkdown: async () => "local edit", writeMarkdown: async (markdown) => { writes.push(markdown); } },
      publishLocalMarkdown: async () => ({ kind: "acknowledged", cloudVersion: 2 }),
    });

    await expect(mirror.applyRemoteMarkdown("remote edit", 2)).resolves.toEqual({ kind: "conflict" });
    expect(writes).toEqual([]);
    expect(mirror.getBinding().connectionState).toBe("conflict");
  });

  test("does not conflict when a first share only adds BloomMD metadata", async () => {
    const localMarkdown = "---\ntitle: Shared note\n---\n\n# Shared note\n\n## Finding\n\nKeep this content.\n";
    const cloudMarkdown = serializeToMarkdown(parseFile("shared.md", localMarkdown));
    const remoteMarkdown = serializeToMarkdown(yDocToDocument(documentToYDoc(parseFile("shared.md", cloudMarkdown))));
    const mirror = new SharedDocumentMirror({
      binding: binding({ lastAcknowledgedMarkdownHash: hashSharedDocumentMarkdown(cloudMarkdown) }),
      hashMarkdown: hashSharedDocumentMarkdown,
      file: { readMarkdown: async () => localMarkdown, writeMarkdown: async () => undefined },
      publishLocalMarkdown: async () => ({ kind: "acknowledged", cloudVersion: 1 }),
    });

    await expect(mirror.applyRemoteMarkdown(remoteMarkdown, 1)).resolves.toEqual({ kind: "mirrored", cloudVersion: 1 });
    expect(mirror.getBinding().connectionState).toBe("connected");
  });

  test("resolves a conflict only after an explicit choice of the local version", async () => {
    const publishes: string[] = [];
    const mirror = new SharedDocumentMirror({
      binding: binding({ connectionState: "conflict" }),
      hashMarkdown: hash,
      file: { readMarkdown: async () => "local edit", writeMarkdown: async () => undefined },
      publishLocalMarkdown: async (markdown) => {
        publishes.push(markdown);
        return { kind: "acknowledged", cloudVersion: 2 };
      },
    });

    await expect(mirror.resolveConflictUsingLocalMarkdown("local edit")).resolves.toEqual({ kind: "published", cloudVersion: 2 });
    expect(publishes).toEqual(["local edit"]);
    expect(mirror.getBinding()).toMatchObject({ connectionState: "connected", lastAcknowledgedMarkdownHash: hash("local edit"), lastKnownCloudVersion: 2 });
  });

  test("resolves a conflict only after an explicit choice of the cloud version", async () => {
    let localMarkdown = "local edit";
    const mirror = new SharedDocumentMirror({
      binding: binding({ connectionState: "conflict" }),
      hashMarkdown: hash,
      file: { readMarkdown: async () => localMarkdown, writeMarkdown: async (markdown) => { localMarkdown = markdown; } },
      publishLocalMarkdown: async () => ({ kind: "acknowledged", cloudVersion: 2 }),
    });

    await expect(mirror.resolveConflictUsingRemoteMarkdown("cloud edit", 3)).resolves.toEqual({ kind: "mirrored", cloudVersion: 3 });
    expect(localMarkdown).toBe("cloud edit");
    expect(mirror.getBinding()).toMatchObject({ connectionState: "connected", lastAcknowledgedMarkdownHash: hash("cloud edit"), lastKnownCloudVersion: 3 });
  });

  test("marks a revoked binding and prevents later local writes", async () => {
    let publishCalls = 0;
    const mirror = new SharedDocumentMirror({
      binding: binding(),
      hashMarkdown: hash,
      file: { readMarkdown: async () => "base", writeMarkdown: async () => undefined },
      publishLocalMarkdown: async () => { publishCalls += 1; return { kind: "revoked" }; },
    });

    await expect(mirror.handleLocalMarkdown("first edit")).resolves.toEqual({ kind: "revoked" });
    await expect(mirror.handleLocalMarkdown("second edit")).resolves.toEqual({ kind: "revoked" });
    expect(publishCalls).toBe(1);
    expect(mirror.getBinding().connectionState).toBe("revoked");
  });

  test("records an unavailable transport without treating an unchanged file as an echo", async () => {
    const mirror = new SharedDocumentMirror({
      binding: binding(),
      hashMarkdown: hash,
      file: { readMarkdown: async () => "base", writeMarkdown: async () => undefined },
      publishLocalMarkdown: async () => ({ kind: "acknowledged", cloudVersion: 2 }),
    });

    await expect(mirror.markConnectionLost()).resolves.toMatchObject({ connectionState: "offline" });
    await expect(mirror.handleLocalMarkdown("base")).resolves.toEqual({ kind: "echo" });
    await expect(mirror.markConnectionRestored()).resolves.toMatchObject({ connectionState: "connected" });
  });

  test("serializes a local watcher event behind a remote mirror write", async () => {
    let localMarkdown = "base";
    const publishes: string[] = [];
    const mirror = new SharedDocumentMirror({
      binding: binding(),
      hashMarkdown: hash,
      file: {
        readMarkdown: async () => localMarkdown,
        writeMarkdown: async (markdown) => { await Promise.resolve(); localMarkdown = markdown; },
      },
      publishLocalMarkdown: async (markdown) => { publishes.push(markdown); return { kind: "acknowledged", cloudVersion: 3 }; },
    });

    const remote = mirror.applyRemoteMarkdown("remote", 2);
    const watcher = mirror.handleLocalMarkdown("remote");
    await expect(remote).resolves.toEqual({ kind: "mirrored", cloudVersion: 2 });
    await expect(watcher).resolves.toEqual({ kind: "echo" });
    expect(publishes).toEqual([]);
  });
});
