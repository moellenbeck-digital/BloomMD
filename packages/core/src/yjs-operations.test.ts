import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { parseFile, serializeToMarkdown } from "./parser";
import { HeadingDepthError } from "./types";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";
import {
  yAddNode,
  yDeleteNode,
  yMoveNode,
  yRenameNode,
  yUpdateContent,
  yUpdateFrontmatter,
  yUpdateNodeMetadata,
} from "./yjs-operations";

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

function createTestYDoc() {
  const doc = parseFile("test.md", SAMPLE_MD);
  const yDoc = documentToYDoc(doc);
  return { yDoc, rootId: doc.rootId, originalDoc: doc };
}

describe("yAddNode", () => {
  test("creates a child node", () => {
    const { yDoc, rootId } = createTestYDoc();
    const newId = yAddNode(yDoc, rootId, "Neuer Bereich", "Inhalt");
    const doc = yDocToDocument(yDoc);

    const root = doc.nodes.get(rootId)!;
    expect(root.children).toContain(newId);

    const newNode = doc.nodes.get(newId)!;
    expect(newNode.title).toBe("Neuer Bereich");
    expect(newNode.content).toBe("Inhalt");
    expect(newNode.parentId).toBe(rootId);
    expect(newNode.level).toBe(2);
    expect(newNode.children).toEqual([]);
  });

  test("creates node with empty content by default", () => {
    const { yDoc, rootId } = createTestYDoc();
    const newId = yAddNode(yDoc, rootId, "Leer");
    const doc = yDocToDocument(yDoc);

    const newNode = doc.nodes.get(newId)!;
    expect(newNode.content).toBe("");
  });

  test("throws on invalid parent", () => {
    const { yDoc } = createTestYDoc();
    expect(() => yAddNode(yDoc, "nonexistent", "Test")).toThrow("not found");
  });

  test("sets correct level for deeply nested node", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;

    // Add under Frontend (level 3) → should be level 4
    const newId = yAddNode(yDoc, frontendId, "Sub-Frontend");
    const updated = yDocToDocument(yDoc);
    expect(updated.nodes.get(newId)!.level).toBe(4);
  });
});

describe("yDeleteNode", () => {
  test("removes node and descendants", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;
    const backendId = arch.children[1]!;

    yDeleteNode(yDoc, archId);
    const updated = yDocToDocument(yDoc);

    expect(updated.nodes.has(archId)).toBe(false);
    expect(updated.nodes.has(frontendId)).toBe(false);
    expect(updated.nodes.has(backendId)).toBe(false);
    expect(updated.nodes.size).toBe(2); // Root + Zeitplan
    expect(updated.nodes.get(rootId)!.children).not.toContain(archId);
  });

  test("throws on root node", () => {
    const { yDoc, rootId } = createTestYDoc();
    expect(() => yDeleteNode(yDoc, rootId)).toThrow("Cannot delete root");
  });

  test("removes content from nodeContents", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;

    yDeleteNode(yDoc, archId);
    const yNodeContents = yDoc.getMap("nodeContents");
    expect(yNodeContents.has(archId)).toBe(false);
  });
});

describe("yMoveNode", () => {
  test("reparents and updates levels", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;
    const zeitplanId = root.children[1]!;

    yMoveNode(yDoc, frontendId, zeitplanId);
    const updated = yDocToDocument(yDoc);

    const frontend = updated.nodes.get(frontendId)!;
    expect(frontend.parentId).toBe(zeitplanId);
    expect(frontend.level).toBe(3); // Zeitplan is level 2

    const updatedArch = updated.nodes.get(archId)!;
    expect(updatedArch.children).not.toContain(frontendId);

    const zeitplan = updated.nodes.get(zeitplanId)!;
    expect(zeitplan.children).toContain(frontendId);
  });

  test("updates descendant levels recursively", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;
    const zeitplanId = root.children[1]!;

    // Move Architektur (level 2, has children at level 3) under Zeitplan (level 2)
    // Architektur → level 3, Frontend/Backend → level 4
    yMoveNode(yDoc, archId, zeitplanId);
    const updated = yDocToDocument(yDoc);

    const arch = updated.nodes.get(archId)!;
    expect(arch.level).toBe(3);

    for (const childId of arch.children) {
      expect(updated.nodes.get(childId)!.level).toBe(4);
    }
  });

  test("prevents circular move", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;
    const arch = doc.nodes.get(archId)!;
    const frontendId = arch.children[0]!;

    expect(() => yMoveNode(yDoc, archId, frontendId)).toThrow("own subtree");
  });

  test("throws on root move", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const archId = root.children[0]!;

    expect(() => yMoveNode(yDoc, rootId, archId)).toThrow("Cannot move root");
  });

  test("reorders siblings at an explicit insertion index", () => {
    const { yDoc, rootId } = createTestYDoc();
    const before = yDocToDocument(yDoc).nodes.get(rootId)!;
    const firstId = before.children[0]!;
    const secondId = before.children[1]!;

    yMoveNode(yDoc, secondId, rootId, 0);

    expect(yDocToDocument(yDoc).nodes.get(rootId)!.children).toEqual([secondId, firstId]);
  });
});

describe("yRenameNode", () => {
  test("changes title", () => {
    const { yDoc, rootId } = createTestYDoc();
    yRenameNode(yDoc, rootId, "Neuer Name");
    const doc = yDocToDocument(yDoc);
    expect(doc.nodes.get(rootId)!.title).toBe("Neuer Name");
  });

  test("throws on nonexistent node", () => {
    const { yDoc } = createTestYDoc();
    expect(() => yRenameNode(yDoc, "nonexistent", "Test")).toThrow("not found");
  });
});

describe("yUpdateNodeMetadata", () => {
  test("stores typed resource metadata in the collaborative document", () => {
    const { yDoc, rootId } = createTestYDoc();
    yUpdateNodeMetadata(yDoc, rootId, { kind: "portal", file: "Roadmap.md", targetNodeId: "launch" });
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.metadata).toEqual({ kind: "portal", file: "Roadmap.md", targetNodeId: "launch" });
  });

  test("can reset a typed node to a plain topic", () => {
    const { yDoc, rootId } = createTestYDoc();
    yUpdateNodeMetadata(yDoc, rootId, { kind: "task", status: "done" });
    yUpdateNodeMetadata(yDoc, rootId, undefined);
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.metadata).toBeUndefined();
  });
});

describe("yUpdateContent", () => {
  test("replaces content", () => {
    const { yDoc, rootId } = createTestYDoc();
    yUpdateContent(yDoc, rootId, "New content here");
    const doc = yDocToDocument(yDoc);
    expect(doc.nodes.get(rootId)!.content).toBe("New content here");
  });

  test("clears content when empty string", () => {
    const { yDoc, rootId } = createTestYDoc();
    yUpdateContent(yDoc, rootId, "");
    const doc = yDocToDocument(yDoc);
    expect(doc.nodes.get(rootId)!.content).toBe("");
  });

  test("creates Y.Text if missing", () => {
    const { yDoc, rootId } = createTestYDoc();
    // Remove existing content entry
    yDoc.getMap("nodeContents").delete(rootId);

    yUpdateContent(yDoc, rootId, "Recovered content");
    const doc = yDocToDocument(yDoc);
    expect(doc.nodes.get(rootId)!.content).toBe("Recovered content");
  });
});

describe("yUpdateFrontmatter", () => {
  test("updates a single field", () => {
    const { yDoc } = createTestYDoc();
    yUpdateFrontmatter(yDoc, "title", "Updated Title");
    const doc = yDocToDocument(yDoc);
    expect(doc.frontmatter.title).toBe("Updated Title");
  });

  test("preserves other fields", () => {
    const { yDoc } = createTestYDoc();
    yUpdateFrontmatter(yDoc, "title", "Updated");
    const doc = yDocToDocument(yDoc);
    expect(doc.frontmatter.id).toBe("8f3a2b1c");
    expect(doc.frontmatter.tags).toEqual(["projekt", "architektur"]);
  });

  test("adds new fields", () => {
    const { yDoc } = createTestYDoc();
    yUpdateFrontmatter(yDoc, "tags", ["new-tag"]);
    const doc = yDocToDocument(yDoc);
    expect(doc.frontmatter.tags).toEqual(["new-tag"]);
  });
});

describe("sync: two Y.Docs", () => {
  test("changes propagate between docs", () => {
    const { yDoc: doc1, rootId } = createTestYDoc();

    // Create doc2 by syncing from doc1
    const doc2 = new Y.Doc();
    const state1 = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, state1);

    // Add a node on doc1
    const newId = yAddNode(doc1, rootId, "From Client 1");

    // Propagate to doc2
    const update = Y.encodeStateAsUpdate(
      doc1,
      Y.encodeStateVector(doc2),
    );
    Y.applyUpdate(doc2, update);

    // Verify doc2 has the new node
    const restored = yDocToDocument(doc2);
    expect(restored.nodes.has(newId)).toBe(true);
    expect(restored.nodes.get(newId)!.title).toBe("From Client 1");
  });

  test("concurrent additions to same parent merge", () => {
    const { yDoc: doc1, rootId } = createTestYDoc();

    // Sync doc1 → doc2
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Add on doc1
    const id1 = yAddNode(doc1, rootId, "Node A");

    // Add on doc2
    const id2 = yAddNode(doc2, rootId, "Node B");

    // Cross-sync
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1, Y.encodeStateVector(doc2)));
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1)));

    // Both nodes should exist in both docs
    const r1 = yDocToDocument(doc1);
    const r2 = yDocToDocument(doc2);

    expect(r1.nodes.has(id1)).toBe(true);
    expect(r1.nodes.has(id2)).toBe(true);
    expect(r2.nodes.has(id1)).toBe(true);
    expect(r2.nodes.has(id2)).toBe(true);
  });
});

describe("UndoManager integration", () => {
  test("undo reverts addNode", () => {
    const { yDoc, rootId } = createTestYDoc();
    const originalSize = yDocToDocument(yDoc).nodes.size;

    const undoManager = new Y.UndoManager([
      yDoc.getMap("nodes"),
      yDoc.getMap("nodeContents"),
    ]);

    yAddNode(yDoc, rootId, "Will Be Undone");
    expect(yDocToDocument(yDoc).nodes.size).toBe(originalSize + 1);

    undoManager.undo();
    expect(yDocToDocument(yDoc).nodes.size).toBe(originalSize);
  });

  test("undo reverts rename", () => {
    const { yDoc, rootId } = createTestYDoc();

    const undoManager = new Y.UndoManager([yDoc.getMap("nodes")]);

    yRenameNode(yDoc, rootId, "Changed");
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.title).toBe("Changed");

    undoManager.undo();
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.title).toBe("Mein Projekt");
  });

  test("undo reverts deleteNode", () => {
    const { yDoc, rootId } = createTestYDoc();
    const doc = yDocToDocument(yDoc);
    const root = doc.nodes.get(rootId)!;
    const zeitplanId = root.children[1]!;

    const undoManager = new Y.UndoManager([
      yDoc.getMap("nodes"),
      yDoc.getMap("nodeContents"),
    ]);

    yDeleteNode(yDoc, zeitplanId);
    expect(yDocToDocument(yDoc).nodes.has(zeitplanId)).toBe(false);

    undoManager.undo();
    const restored = yDocToDocument(yDoc);
    expect(restored.nodes.has(zeitplanId)).toBe(true);
    expect(restored.nodes.get(zeitplanId)!.title).toBe("Zeitplan");
  });

  test("redo after undo re-applies change", () => {
    const { yDoc, rootId } = createTestYDoc();

    const undoManager = new Y.UndoManager([
      yDoc.getMap("nodes"),
      yDoc.getMap("nodeContents"),
    ]);

    const newId = yAddNode(yDoc, rootId, "Temp Node");
    undoManager.undo();
    expect(yDocToDocument(yDoc).nodes.has(newId)).toBe(false);

    undoManager.redo();
    expect(yDocToDocument(yDoc).nodes.has(newId)).toBe(true);
  });

  test("undo reverts content update", () => {
    const { yDoc, rootId } = createTestYDoc();
    const originalContent = yDocToDocument(yDoc).nodes.get(rootId)!.content;

    const undoManager = new Y.UndoManager([yDoc.getMap("nodeContents")]);

    yUpdateContent(yDoc, rootId, "New content");
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.content).toBe("New content");

    undoManager.undo();
    expect(yDocToDocument(yDoc).nodes.get(rootId)!.content).toBe(originalContent);
  });
});

describe("heading depth limit", () => {
  const deepDoc = (levels: number) => {
    const doc = parseFile("deep.md", "# Root\n");
    const yDoc = documentToYDoc(doc);
    let parent = doc.rootId;
    for (let i = 2; i <= levels; i += 1) parent = yAddNode(yDoc, parent, `Level ${i}`);
    return { yDoc, deepest: parent };
  };

  test("allows a full six-level chain", () => {
    expect(() => deepDoc(6)).not.toThrow();
  });

  test("refuses a seventh level instead of writing an unparseable heading", () => {
    const { yDoc, deepest } = deepDoc(6);
    expect(() => yAddNode(yDoc, deepest, "Level 7")).toThrow(HeadingDepthError);
  });

  test("survives a save and reload without losing nodes", () => {
    const { yDoc } = deepDoc(6);
    const before = yDocToDocument(yDoc);
    const after = parseFile("deep.md", serializeToMarkdown(before));
    expect(after.nodes.size).toBe(before.nodes.size);
  });

  test("refuses a move that would push a subtree past level six", () => {
    const doc = parseFile("m.md", "# Root\n\n## A\n\n### A1\n\n#### A2\n\n## B\n\n### B1\n\n#### B2\n");
    const yDoc = documentToYDoc(doc);
    const byTitle = (title: string) =>
      [...doc.nodes.values()].find((node) => node.title === title)!.id;
    // A has three levels below Root; nesting it under B2 (level 4) would reach level 7.
    expect(() => yMoveNode(yDoc, byTitle("A"), byTitle("B2"))).toThrow(HeadingDepthError);
  });
});

describe("cycle safety", () => {
  const setup = () => {
    const doc = parseFile("cycle.md", "# Root\n\n## Alpha\n\n### One\n\n## Beta\n");
    const yDoc = documentToYDoc(doc);
    const idOf = (title: string) => [...doc.nodes.values()].find((node) => node.title === title)!.id;
    return { doc, yDoc, idOf };
  };

  test("refuses to move a node into itself", () => {
    // Regression: isDescendant cannot see a self-move, so the node became its own parent and
    // updateLevels recursed until the stack overflowed, leaving the document corrupted.
    const { yDoc, idOf } = setup();
    expect(() => yMoveNode(yDoc, idOf("Alpha"), idOf("Alpha"))).toThrow();
  });

  test("leaves the document intact after a rejected self-move", () => {
    const { yDoc, idOf } = setup();
    const before = yDocToDocument(yDoc);
    try {
      yMoveNode(yDoc, idOf("Alpha"), idOf("Alpha"));
    } catch {
      // expected
    }
    const after = yDocToDocument(yDoc);
    expect(after.nodes.size).toBe(before.nodes.size);
    for (const node of after.nodes.values()) {
      expect(node.level).toBeGreaterThanOrEqual(1);
      expect(node.level).toBeLessThanOrEqual(6);
      expect(node.parentId).not.toBe(node.id);
    }
  });

  test("still refuses a move into its own subtree", () => {
    const { yDoc, idOf } = setup();
    expect(() => yMoveNode(yDoc, idOf("Alpha"), idOf("One"))).toThrow();
  });

  test("survives a serialize and reparse without losing nodes", () => {
    const { yDoc, idOf } = setup();
    yMoveNode(yDoc, idOf("Beta"), idOf("One"));
    const doc = yDocToDocument(yDoc);
    expect(parseFile("cycle.md", serializeToMarkdown(doc)).nodes.size).toBe(doc.nodes.size);
  });
});
