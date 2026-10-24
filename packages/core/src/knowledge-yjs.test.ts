import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { applyKnowledgeNodesToYDoc } from "./knowledge-yjs";
import { parseFile, serializeToMarkdown } from "./parser";
import { documentToYDoc, yDocToDocument } from "./yjs-bridge";
import { yUpdateContent } from "./yjs-operations";

const source = "# Projekt X <!-- bloommd:id=root01 -->\n\n## Ziel <!-- bloommd:id=ziel01 -->\n\nLaunch.\n\n## Aufgaben <!-- bloommd:id=aufg01 -->\n";

function ydoc() {
  const doc = new Y.Doc();
  documentToYDoc(parseFile("projekt.md", source), doc);
  return doc;
}

describe("applyKnowledgeNodesToYDoc", () => {
  test("adds, updates and connects nodes like the Markdown version", () => {
    const doc = ydoc();
    const change = applyKnowledgeNodesToYDoc(doc, [
      { ref: "t", parent: "aufg01", title: "Website bauen", status: "open", due: "2026-10-20", assignee: "Lea" },
      { id: "ziel01", content: "Im Oktober." },
      { ref: "d", title: "Domain kaufen", decision: "accepted", relations: [{ target: "t", label: "für" }] },
    ]);
    const result = yDocToDocument(doc);
    const task = result.nodes.get(change.ids.t!)!;
    expect(task.parentId).toBe("aufg01");
    expect(task.metadata).toEqual({ kind: "task", status: "open", due: "2026-10-20", assignee: "Lea" });
    expect(result.nodes.get("ziel01")?.content.trim()).toBe("Launch.\n\nIm Oktober.");
    expect(result.nodes.get(change.ids.d!)?.metadata).toEqual({ kind: "decision", decision: "accepted", relations: [{ target: change.ids.t!, label: "für" }] });
    // The live document serializes to Markdown every BloomMD app reads.
    const markdown = serializeToMarkdown(result);
    expect(parseFile("projekt.md", markdown).nodes.get(change.ids.t!)?.metadata?.due).toBe("2026-10-20");
  });

  test("validates everything before touching the live document", () => {
    const doc = ydoc();
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "Gut" }, { ref: "b", parent: "fehlt", title: "Schlecht" }])).toThrow(/Unknown node/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "nope", content: "x" }])).toThrow(/does not exist/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "A", due: "bald" }])).toThrow(/YYYY-MM-DD/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  test("merges with a person editing the same map at the same time", () => {
    const agent = ydoc();
    const person = new Y.Doc();
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    yUpdateContent(person, "ziel01", "Launch im November.");
    const change = applyKnowledgeNodesToYDoc(agent, [{ parent: "aufg01", title: "Texte schreiben" }]);
    Y.applyUpdate(agent, Y.encodeStateAsUpdate(person));
    Y.applyUpdate(person, Y.encodeStateAsUpdate(agent));
    for (const doc of [agent, person]) {
      const result = yDocToDocument(doc);
      expect(result.nodes.get("ziel01")?.content.trim()).toBe("Launch im November.");
      expect(result.nodes.get(change.created[0]!)?.title).toBe("Texte schreiben");
    }
  });

  test("validates content before touching the live document", () => {
    const doc = ydoc();
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ ref: "a", title: "A" }, { id: "ziel01", content: "## Neu\nText" }])).toThrow(/heading lines/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "ziel01", content: "```\noffen" }])).toThrow(/code fence/);
    expect(() => applyKnowledgeNodesToYDoc(doc, [{ id: "ziel01", title: "Ziel\n# X" }])).toThrow(/single line/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });
});
