import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { parseFile } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";

const SAMPLE_MD = `---
title: Mein Projekt
id: "8f3a2b1c"
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T14:30:00Z"
tags:
  - projekt
  - architektur
layout:
  direction: LR
---

# Mein Projekt

Übersicht zum Projekt.

## Architektur

Details zur Architektur mit **fetter Schrift**.

### Frontend

React-basiert.

### Backend

Node.js mit Bun.

## Zeitplan

- Q1: Prototyp
- Q2: Beta
`;

describe("documentToYDoc", () => {
  test("creates Y.Doc with correct meta", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);

    const yMeta = yDoc.getMap("meta");
    expect(yMeta.get("filePath")).toBe("test.md");
    expect(yMeta.get("rootId")).toBe(doc.rootId);

    const fm = yMeta.get("frontmatter") as Record<string, unknown>;
    expect(fm.title).toBe("Mein Projekt");
    expect(fm.id).toBe("8f3a2b1c");
    expect(fm.tags).toEqual(["projekt", "architektur"]);
  });

  test("creates all nodes", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);

    const yNodes = yDoc.getMap("nodes");
    expect(yNodes.size).toBe(5);
  });

  test("stores children as Y.Array", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);

    const yNodes = yDoc.getMap("nodes");
    const root = yNodes.get(doc.rootId) as import("yjs").Map<unknown>;
    const children = root.get("children") as import("yjs").Array<string>;
    expect(children.toArray()).toHaveLength(2);
  });

  test("stores content in separate nodeContents map", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);

    const yNodeContents = yDoc.getMap("nodeContents");
    expect(yNodeContents.size).toBe(5);

    const rootContent = yNodeContents.get(doc.rootId) as import("yjs").Text;
    expect(rootContent.toString()).toContain("Übersicht zum Projekt");
  });
});

describe("yDocToDocument", () => {
  test("reconstructs nodes Map", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    expect(restored.nodes.size).toBe(5);
    expect(restored.rootId).toBe(doc.rootId);
    expect(restored.filePath).toBe("test.md");
  });

  test("restores frontmatter", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    expect(restored.frontmatter.title).toBe("Mein Projekt");
    expect(restored.frontmatter.id).toBe("8f3a2b1c");
    expect(restored.frontmatter.tags).toEqual(["projekt", "architektur"]);
    expect(restored.frontmatter.layout?.direction).toBe("LR");
  });

  test("restores node properties", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    const root = restored.nodes.get(restored.rootId)!;
    expect(root.title).toBe("Mein Projekt");
    expect(root.level).toBe(1);
    expect(root.parentId).toBeNull();
    expect(root.children).toHaveLength(2);
  });

  test("restores content from nodeContents map", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    const root = restored.nodes.get(restored.rootId)!;
    expect(root.content).toContain("Übersicht zum Projekt");

    const archId = root.children[0]!;
    const arch = restored.nodes.get(archId)!;
    expect(arch.content).toContain("fetter Schrift");
  });
});

describe("roundtrip: MindMapDocument → Y.Doc → MindMapDocument", () => {
  test("preserves full tree structure", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    expect(restored.nodes.size).toBe(doc.nodes.size);

    // Compare each node
    for (const [id, origNode] of doc.nodes) {
      const restoredNode = restored.nodes.get(id)!;
      expect(restoredNode).toBeDefined();
      expect(restoredNode.id).toBe(origNode.id);
      expect(restoredNode.parentId).toBe(origNode.parentId);
      expect(restoredNode.level).toBe(origNode.level);
      expect(restoredNode.title).toBe(origNode.title);
      expect(restoredNode.content).toBe(origNode.content);
      expect(restoredNode.children).toEqual(origNode.children);
    }
  });

  test("preserves document with no headings", () => {
    const md = `---
title: Notiz
id: abc123
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

Just some plain text without headings.
`;
    const doc = parseFile("notiz.md", md);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    expect(restored.nodes.size).toBe(1);
    const root = restored.nodes.get(restored.rootId)!;
    expect(root.title).toBe("Notiz");
    expect(root.content).toContain("plain text without headings");
  });

  test("preserves empty content nodes", () => {
    const md = `---
title: Test
id: t1
created: "2026-04-06T10:00:00Z"
updated: "2026-04-06T10:00:00Z"
---

# Root

## Empty Child
`;
    const doc = parseFile("empty.md", md);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    const root = restored.nodes.get(restored.rootId)!;
    const childId = root.children[0]!;
    const child = restored.nodes.get(childId)!;
    expect(child.title).toBe("Empty Child");
    expect(child.content).toBe("");
  });

  test("frontmatter mutation does not affect original", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const yDoc = documentToYDoc(doc);
    const restored = yDocToDocument(yDoc);

    // Mutating restored frontmatter should not affect original
    restored.frontmatter.title = "Changed";
    expect(doc.frontmatter.title).toBe("Mein Projekt");
  });

  test("works with existing Y.Doc", () => {
    const doc = parseFile("test.md", SAMPLE_MD);
    const existingDoc = new Y.Doc();

    const yDoc = documentToYDoc(doc, existingDoc);
    expect(yDoc).toBe(existingDoc);

    const restored = yDocToDocument(yDoc);
    expect(restored.nodes.size).toBe(5);
  });

  test("replaces stale existing Y.Doc content", () => {
    const existingDoc = documentToYDoc(parseFile("first.md", "# First\n\n## Removed"));
    const replacement = parseFile("second.md", "# Second");

    documentToYDoc(replacement, existingDoc);
    const restored = yDocToDocument(existingDoc);

    expect(restored.filePath).toBe("second.md");
    expect(restored.nodes.size).toBe(1);
    expect(restored.nodes.get(restored.rootId)?.title).toBe("Second");
  });

  test("keeps an explicit transaction origin when replacing an existing Y.Doc", () => {
    const existingDoc = documentToYDoc(parseFile("first.md", "# First"));
    const origin = Symbol("local-file-mirror");
    let observedOrigin: unknown;
    existingDoc.on("update", (_update, updateOrigin) => { observedOrigin = updateOrigin; });

    documentToYDoc(parseFile("second.md", "# Second"), existingDoc, origin);

    expect(observedOrigin).toBe(origin);
  });
});
