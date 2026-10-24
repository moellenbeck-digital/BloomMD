import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { yUpdateContentDiff } from "./yjs-content-sync";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";
import { parseFile } from "./parser";

const SAMPLE_MD = `---
title: Test
id: "abc123"
created: "2026-04-01T00:00:00Z"
updated: "2026-04-01T00:00:00Z"
---

# Test

Root content here.

## Child

Child content.
`;

function createTestDoc() {
  const doc = parseFile("test.md", SAMPLE_MD);
  return documentToYDoc(doc);
}

describe("yUpdateContentDiff", () => {
  test("inserts text at end", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "Root content here. More text.");

    const yContent = yDoc.getMap<Y.Text>("nodeContents").get(rootId);
    expect(yContent?.toString()).toBe("Root content here. More text.");
    yDoc.destroy();
  });

  test("inserts text at beginning", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "NEW Root content here.");

    const yContent = yDoc.getMap<Y.Text>("nodeContents").get(rootId);
    expect(yContent?.toString()).toBe("NEW Root content here.");
    yDoc.destroy();
  });

  test("deletes text", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "Root here.");

    const yContent = yDoc.getMap<Y.Text>("nodeContents").get(rootId);
    expect(yContent?.toString()).toBe("Root here.");
    yDoc.destroy();
  });

  test("replaces text in middle", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "Root REPLACED here.");

    const yContent = yDoc.getMap<Y.Text>("nodeContents").get(rootId);
    expect(yContent?.toString()).toBe("Root REPLACED here.");
    yDoc.destroy();
  });

  test("no-op when content is identical", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    let updateFired = false;
    yDoc.on("update", () => { updateFired = true; });

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "Root content here.");

    expect(updateFired).toBe(false);
    yDoc.destroy();
  });

  test("creates Y.Text if missing", () => {
    const yDoc = new Y.Doc();
    yDoc.getMap("meta").set("rootId", "test");
    yDoc.getMap<Y.Map<unknown>>("nodes");
    yDoc.getMap<Y.Text>("nodeContents");

    yUpdateContentDiff(yDoc, "new-node", "", "Hello World");

    const yContent = yDoc.getMap<Y.Text>("nodeContents").get("new-node");
    expect(yContent?.toString()).toBe("Hello World");
    yDoc.destroy();
  });

  test("concurrent edits merge correctly via Yjs sync", () => {
    // Create two Y.Docs from same source
    const docA = createTestDoc();
    const docB = createTestDoc();
    const rootId = (docA.getMap("meta").get("rootId") as string);
    const original = "Root content here.";

    // Sync initial state
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // User A: insert at end
    yUpdateContentDiff(docA, rootId, original, "Root content here. Added by A.");

    // User B: insert at beginning
    yUpdateContentDiff(docB, rootId, original, "PREFIX Root content here.");

    // Sync both directions
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    // Both should have merged content with both edits
    const contentA = docA.getMap<Y.Text>("nodeContents").get(rootId)?.toString() ?? "";
    const contentB = docB.getMap<Y.Text>("nodeContents").get(rootId)?.toString() ?? "";

    expect(contentA).toBe(contentB);
    expect(contentA).toContain("PREFIX");
    expect(contentA).toContain("Added by A.");

    docA.destroy();
    docB.destroy();
  });

  test("roundtrip: edit → yDocToDocument → content preserved", () => {
    const yDoc = createTestDoc();
    const rootId = (yDoc.getMap("meta").get("rootId") as string);

    yUpdateContentDiff(yDoc, rootId, "Root content here.", "Updated content!");

    const result = yDocToDocument(yDoc);
    const rootNode = result.nodes.get(rootId);
    expect(rootNode?.content).toBe("Updated content!");

    yDoc.destroy();
  });
});
